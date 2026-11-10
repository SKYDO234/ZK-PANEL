#!/usr/bin/env bash
# ZK PANEL dedicated node installer. Ubuntu/Debian with a public DNS name.
# Run: sudo bash node.sh
set -Eeuo pipefail

valid_domain() {
  local value="$1" part
  [[ "$value" =~ ^[a-zA-Z0-9.-]+$ ]] || return 1
  [[ ${#value} -le 253 && "$value" == *.* && "$value" != .* && "$value" != *. && "$value" != *..* ]] || return 1
  IFS='.' read -ra parts <<< "$value"
  for part in "${parts[@]}"; do
    [[ ${#part} -le 63 && "$part" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]] || return 1
  done
  [[ "${parts[-1]}" =~ ^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$ ]]
}
valid_token() { [[ ${#1} -ge 32 && ${#1} -le 256 && "$1" =~ ^[a-zA-Z0-9_-]+$ ]]; }
valid_ipv4() {
  local address="$1" octet
  [[ "$address" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -ra octets <<< "$address"
  for octet in "${octets[@]}"; do (( 10#$octet <= 255 )) || return 1; done
}
write_node_env() {
  local file="$1" token="$2" secret="$3" workspace="$4"
  valid_token "$token" && valid_token "$secret" || return 1
  [[ "$workspace" =~ ^/[a-zA-Z0-9._/-]+$ ]] || return 1
  ( umask 077; set -o noclobber; printf 'NODE_TOKEN=%s\nSESSION_SECRET=%s\nWORKSPACE_HOST_PATH=%s\n' "$token" "$secret" "$workspace" > "$file" )
}
write_caddy_config() {
  local domain="$1" panel_ip="$2"
  valid_domain "$domain" || return 1
  [[ -z "$panel_ip" ]] || valid_ipv4 "$panel_ip" || return 1
  printf '%s {\n' "$domain"
  if [[ -n "$panel_ip" ]]; then printf '    @blocked not remote_ip %s\n    respond @blocked "Forbidden" 403\n' "$panel_ip"; fi
  printf '    reverse_proxy 127.0.0.1:8080\n}\n'
}
usage() {
  cat <<'HELP'
ZK PANEL node installer
Usage: sudo bash node.sh

Installs Docker if needed, starts the ZK node agent and a Caddy HTTPS proxy.
Requires Ubuntu/Debian, a public DNS name pointing to this machine, and ports
80 and 443 available. After installation, register the node in ZK PANEL with
its HTTPS URL and the same token. The node token is root-equivalent: keep it secret.
HELP
}
main() {
  [[ ${1:-} != --help && ${1:-} != -h ]] || { usage; return 0; }
  [[ $# -eq 0 ]] || { usage >&2; return 2; }
  [[ $EUID -eq 0 ]] || { echo 'Run this installer with sudo: sudo bash node.sh' >&2; return 1; }
  [[ -t 0 && -t 1 ]] || { echo 'An interactive terminal is required. Download node.sh and run it with sudo, not through a pipe.' >&2; return 1; }
  trap 'echo "Node setup failed near line $LINENO. Existing configuration and data were not intentionally removed; inspect the error and rerun." >&2' ERR
  umask 077
  echo 'ZK PANEL dedicated node setup'
  echo 'Use a dedicated machine. The node agent has root-equivalent Docker access.'
  [[ -r /etc/os-release ]] || { echo 'Cannot identify this operating system.' >&2; return 1; }
  . /etc/os-release
  [[ "$ID" == ubuntu || "$ID" == debian ]] || { echo 'This installer currently supports Ubuntu and Debian only.' >&2; return 1; }
  [[ -n "${VERSION_CODENAME:-}" ]] || { echo 'Operating system codename is missing.' >&2; return 1; }

  local domain panel_ip token existing_token secret repo=/opt/zk-panel-node config_dir=/etc/zk-panel-node env_file
  env_file="$config_dir/node.env"
  read -r -p 'Node DNS name (for example node.example.com): ' domain
  domain="${domain,,}"
  valid_domain "$domain" || { echo 'Enter a valid public DNS name, not an IP address or URL.' >&2; return 1; }
  read -r -p 'Panel public IPv4 to restrict access (leave blank for any IP): ' panel_ip
  if [[ -n "$panel_ip" ]]; then
    valid_ipv4 "$panel_ip" || { echo 'Enter a single valid IPv4 address, or leave it blank.' >&2; return 1; }
  else
    echo 'WARNING: the agent HTTPS endpoint will be reachable from any IP. Its token grants root-equivalent access.'
    read -r -p 'Continue without IP restriction? Type YES: ' answer
    [[ "$answer" == YES ]] || return 1
  fi
  echo 'The DNS name must already resolve to this machine. Ports 80/443 must be reachable for HTTPS certificates.'
  echo 'Installing prerequisites...'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git openssl iproute2

  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    echo 'Installing Docker Engine and Compose from Docker’s official package repository...'
    install -m 0755 -d /etc/apt/keyrings
    if [[ ! -e /etc/apt/keyrings/docker.asc ]]; then
      curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
    fi
    local architecture
    architecture="$(dpkg --print-architecture)"
    local docker_source
    docker_source="$(printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable' "$architecture" "$ID" "$VERSION_CODENAME")"
    if [[ -e /etc/apt/sources.list.d/zk-docker.list ]]; then
      [[ "$(cat /etc/apt/sources.list.d/zk-docker.list)" == "$docker_source" ]] || { echo 'Existing ZK Docker package source differs; refusing to overwrite it.' >&2; return 1; }
    else
      printf '%s\n' "$docker_source" > /etc/apt/sources.list.d/zk-docker.list
    fi
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  if command -v systemctl >/dev/null && [[ -d /run/systemd/system ]]; then systemctl enable --now docker; fi
  docker info >/dev/null || { echo 'Docker is installed but its daemon is not available.' >&2; return 1; }

  # Do not overwrite an existing checkout or pull over local changes.
  if [[ ! -e "$repo" ]]; then
    git clone --branch main --single-branch https://github.com/SKYDO234/ZK-PANEL.git "$repo"
  elif [[ ! -f "$repo/compose.agent.yaml" || ! -d "$repo/.git" || "$(git -C "$repo" remote get-url origin)" != 'https://github.com/SKYDO234/ZK-PANEL.git' ]]; then
    echo "$repo already exists and is not the expected ZK PANEL checkout; refusing to modify it." >&2; return 1
  else
    echo "Using existing checkout at $repo; it is not automatically updated."
  fi
  [[ ! -L "$config_dir" && ! -L /opt/zk/workspaces ]] || { echo 'Node configuration and workspace paths must not be symbolic links.' >&2; return 1; }
  mkdir -p /opt/zk/workspaces "$config_dir"
  [[ ! -L "$env_file" && ! -L "$config_dir/Caddyfile" && ! -L "$config_dir/domain" ]] || { echo 'Node configuration files must not be symbolic links.' >&2; return 1; }
  chmod 0700 "$config_dir"

  # Only change ports managed by this installer; do not stop another web server.
  local managed_proxy=0 managed_agent=0
  if docker inspect zk-node-https >/dev/null 2>&1; then
    [[ "$(docker inspect -f '{{ index .Config.Labels "zk.node.installer" }}' zk-node-https)" == 'true' ]] || { echo 'Container zk-node-https exists but is not managed by this installer.' >&2; return 1; }
    managed_proxy=1
  fi
  if docker inspect zk-node-agent-1 >/dev/null 2>&1; then
    [[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' zk-node-agent-1)" == "$repo" ]] || { echo 'The zk-node agent container belongs to another installation.' >&2; return 1; }
    managed_agent=1
  fi
  if (( ! managed_proxy )) && ss -H -ltn '( sport = :80 or sport = :443 )' | grep -q .; then
    echo 'Port 80 or 443 is already in use. Configure HTTPS separately or free these ports; no existing service was stopped.' >&2; return 1
  fi
  if (( ! managed_agent )) && ss -H -ltn '( sport = :8080 )' | grep -q .; then
    echo 'Port 8080 is already in use. No existing service was stopped.' >&2; return 1
  fi
  if [[ -f "$config_dir/domain" && "$(cat "$config_dir/domain")" != "$domain" ]]; then
    echo 'This node was configured for a different domain. Refusing to replace the HTTPS configuration.' >&2; return 1
  fi

  echo
  echo 'Enter the node token to use in both this agent and ZK PANEL.'
  echo 'Use at least 32 letters, digits, underscores or hyphens; leave blank to generate one.'
  read -r -s -p 'Node token: ' token; echo
  if [[ -f "$env_file" ]]; then
    existing_token="$(sed -n 's/^NODE_TOKEN=//p' "$env_file")"
    valid_token "$existing_token" || { echo 'Existing node token is invalid; inspect the configuration manually.' >&2; return 1; }
    if [[ -z "$token" ]]; then token="$existing_token"; fi
    [[ "$token" == "$existing_token" ]] || { echo 'The supplied token does not match the existing node configuration. Token rotation must be done separately.' >&2; return 1; }
  else
    [[ -n "$token" ]] || token="$(openssl rand -hex 32)"
    valid_token "$token" || { echo 'Token must contain 32–256 letters, digits, underscores or hyphens.' >&2; return 1; }
    secret="$(openssl rand -hex 48)"
    write_node_env "$env_file" "$token" "$secret" /opt/zk/workspaces
    chmod 0600 "$env_file"
    unset secret
  fi
  printf '%s\n' "$domain" > "$config_dir/domain"
  write_caddy_config "$domain" "$panel_ip" > "$config_dir/Caddyfile"
  chmod 0600 "$config_dir/Caddyfile"
  echo 'Building and starting the node agent...'
  env -u NODE_TOKEN -u SESSION_SECRET -u WORKSPACE_HOST_PATH -u IMAGE_ALLOWLIST docker compose --project-name zk-node --env-file "$env_file" -f "$repo/compose.agent.yaml" up -d --build
  if (( managed_proxy )); then
    docker start zk-node-https >/dev/null
    docker exec zk-node-https caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  else
    docker run -d --name zk-node-https --label zk.node.installer=true --network host --restart unless-stopped \
      -v "$config_dir/Caddyfile:/etc/caddy/Caddyfile:ro" \
      -v zk-node-caddy-data:/data -v zk-node-caddy-config:/config caddy:2 >/dev/null
  fi
  # Send the credential via stdin, not shell history, process arguments or logs.
  local ok=0 attempt
  for attempt in {1..60}; do
    if printf 'header = "Authorization: Bearer %s"\n' "$token" | curl -fsS --noproxy '*' --max-time 3 --config - http://127.0.0.1:8080/health >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  unset token
  [[ "$ok" == 1 ]] || { echo 'Agent health check failed. See: docker compose -f /opt/zk-panel-node/compose.agent.yaml --env-file /etc/zk-panel-node/node.env logs agent' >&2; return 1; }
  echo 'Waiting for a trusted HTTPS certificate (DNS and public ports 80/443 must work)...'
  local http_code tls_ok=0
  for attempt in {1..60}; do
    http_code="$(curl -sS --noproxy '*' --max-time 4 --resolve "$domain:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$domain/health" 2>/dev/null || true)"
    if [[ "$http_code" == 401 || "$http_code" == 403 ]]; then tls_ok=1; break; fi
    sleep 1
  done
  if [[ "$tls_ok" != 1 ]]; then
    echo 'Local agent is running, but HTTPS is not ready. Check DNS, public ports 80/443 and: sudo docker logs zk-node-https' >&2
    echo 'Rerun the installer after fixing the issue; the existing token and data will be preserved.' >&2
    return 1
  fi
  echo
  echo 'Agent is running locally and HTTPS has a trusted certificate. External reachability still depends on your firewall.'
  echo "Agent URL: https://$domain"
  echo 'In ZK PANEL: sign in as admin → Nodes → Add node, enter that URL and the same node token.'
  echo 'The node becomes Online only after the panel can verify its HTTPS endpoint and token.'
  echo "If you generated the token, view it privately on this node: sudo sed -n 's/^NODE_TOKEN=//p' $env_file"
  echo 'Never share the token. Open allocated game ports separately in the host and provider firewalls.'
  echo 'Inspect TLS errors with: sudo docker logs zk-node-https'
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
