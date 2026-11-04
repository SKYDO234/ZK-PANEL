#!/usr/bin/env bash
# ZK PANEL development installer for GitHub Codespaces (also usable locally).
# Usage: bash install.sh [--no-start|--start-only]
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
MODE="${1:-install-and-start}"
case "$MODE" in --no-start|--start-only|install-and-start) ;; *) echo "Usage: bash install.sh [--no-start|--start-only]" >&2; exit 2;; esac
trap 'echo "ZK installation failed at line $LINENO. Review the error above; existing data was not deleted." >&2' ERR

start_panel() {
  # Never overwrite an existing environment or reset an existing admin password.
  [[ -f .env.codespace ]] || { echo "Missing .env.codespace; run bash install.sh first." >&2; exit 1; }
  set -a; source .env.codespace; set +a
  export PATH="$ROOT/.tools/node/bin:$PATH"
  mkdir -p data
  if [[ -f data/codespace.pid ]] && kill -0 "$(cat data/codespace.pid)" 2>/dev/null; then
    echo "ZK PANEL is already running (PID $(cat data/codespace.pid))."
    return
  fi
  if [[ "$MODE" == "--start-only" ]]; then
    nohup node dist/server/index.mjs >> data/codespace.log 2>&1 &
    echo $! > data/codespace.pid
    for _ in {1..60}; do
      if curl -fsS "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null 2>&1; then
        echo "ZK PANEL started. Log: data/codespace.log"
        return
      fi
      sleep 1
    done
    echo "Panel did not become healthy; inspect data/codespace.log." >&2
    exit 1
  fi
  exec node dist/server/index.mjs
}
if [[ "$MODE" == "--start-only" ]]; then start_panel; exit 0; fi

echo "Installing ZK PANEL development workspace…"
for tool in curl tar xz sha256sum; do command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }; done
mkdir -p .tools
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' >/dev/null 2>&1; }
if ! node_ok; then
  NODE_VERSION="22.22.3"
  case "$(uname -m)" in x86_64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; *) echo "Unsupported architecture" >&2; exit 1;; esac
  DIST="node-v${NODE_VERSION}-linux-${ARCH}"
  echo "Installing Node.js ${NODE_VERSION} locally (no sudo required)…"
  curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${DIST}.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  grep " ${DIST}.tar.xz$" SHASUMS256.txt | sha256sum --check -
  tar -xJf "${DIST}.tar.xz" -C .tools
  rm -rf .tools/node
  mv ".tools/${DIST}" .tools/node
  rm -f "${DIST}.tar.xz" SHASUMS256.txt
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi
node_ok || { echo "Node.js 22.13+ is required." >&2; exit 1; }
npm ci --no-audit --no-fund

if [[ ! -f .env.codespace ]]; then
  SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("hex"))')"
  if [[ "${CODESPACES:-false}" == "true" && -n "${CODESPACE_NAME:-}" ]]; then
    URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
    SECURE=true
  else
    URL="http://localhost:3000"
    SECURE=false
  fi
  cat > .env.codespace <<EOF
# Development only. Keep the forwarded Codespace port PRIVATE.
ZK_MODE=demo
ZK_DEMO_AUTO_LOGIN=false
ZK_DEV_BOOTSTRAP=true
ZK_ALLOW_LOCAL_DEV_BOOTSTRAP=true
PORT=3000
PUBLIC_URL=${URL}
COOKIE_SECURE=${SECURE}
DATA_DIR=./data
SESSION_SECRET=${SECRET}
ALLOW_REGISTRATION=false
EOF
  chmod 600 .env.codespace
fi
set -a; source .env.codespace; set +a
# Bootstrap is additionally gated by the actual Codespaces environment in code.
npm run build
npm run admin:bootstrap-dev
cat <<'NOTICE'

ZK PANEL is installed.
Development login: admin / admin123
Change this password in Settings before sharing the port.
Keep the Codespace port PRIVATE. This is demo compute, not production hosting.
NOTICE
if [[ "${CODESPACES:-false}" == "true" ]]; then
  gh codespace ports visibility 3000:private -c "$CODESPACE_NAME" >/dev/null 2>&1 || echo "Could not verify port visibility; set port 3000 to Private in the Ports tab."
fi
if [[ "$MODE" == "--no-start" ]]; then
  echo "Start with: bash install.sh --start-only"
else
  start_panel
fi
