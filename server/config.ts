import "dotenv/config";
import path from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export const mode = process.env.ZK_MODE === "docker" ? "docker" : "demo";
export const root = path.resolve(process.env.ZK_PROJECT_ROOT || process.cwd());
export const dataDir = path.resolve(
  process.env.DATA_DIR || path.join(root, "data"),
);
mkdirSync(dataDir, { recursive: true });
mkdirSync(path.join(dataDir, "workspaces"), { recursive: true });
mkdirSync(path.join(dataDir, "backups"), { recursive: true });
let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (mode === "docker")
    throw new Error(
      "SESSION_SECRET is required in Docker mode. See .env.example.",
    );
  const file = path.join(dataDir, ".session-key");
  if (!existsSync(file))
    writeFileSync(file, randomBytes(48).toString("hex"), { mode: 0o600 });
  secret = (await import("node:fs")).readFileSync(file, "utf8");
}
if (mode === "docker" && (!secret || secret.length < 32))
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
export const config = {
  mode,
  autoDemo: mode === "demo" && process.env.ZK_DEMO_AUTO_LOGIN !== "false",
  devBootstrap: mode === "demo" && process.env.ZK_DEV_BOOTSTRAP === "true" && (process.env.CODESPACES === "true" || process.env.ZK_ALLOW_LOCAL_DEV_BOOTSTRAP === "true"),
  root,
  dataDir,
  secret: secret!,
  port: Number(process.env.PORT || 3000),
  publicUrl: (
    process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/$/, ""),
  remoteOnly: process.env.ZK_REMOTE_ONLY === "true",
  secureCookie:
    process.env.COOKIE_SECURE === "true" ||
    (process.env.PUBLIC_URL || "").startsWith("https:"),
  registration: process.env.ALLOW_REGISTRATION === "true" || (mode === "demo" && process.env.ZK_DEV_BOOTSTRAP !== "true"),
  workspaceHostPath: path.resolve(
    process.env.WORKSPACE_HOST_PATH || path.join(dataDir, "workspaces"),
  ),
  dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
  imageAllowlist: (
    process.env.IMAGE_ALLOWLIST ||
    "itzg/minecraft-server:java21,itzg/mc-proxy:java21,node:22-alpine,python:3.12-alpine,nginxinc/nginx-unprivileged:1.27-alpine,alpine:3.22,redis:7.4-alpine"
  ).split(","),
  maxServers: Number(process.env.MAX_SERVERS_PER_USER || 20),
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
