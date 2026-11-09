import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config, assert } from "./config.js";
import type { Server } from "../shared/types.js";
import { nodes } from "./db.js";

type Agent = { child: ChildProcessWithoutNullStreams; claim: string | null; startedAt: string };
const agents = new Map<string, Agent>();
const locks = new Set<string>();
const agentDir = path.join(config.dataDir, "playit");
function secretFile(server: Server) {
  assert(/^zk-[a-zA-Z0-9_-]+$/.test(server.id), "Invalid deployment ID.");
  return path.join(agentDir, `${server.id}.toml`);
}
function check(server: Server) {
  assert(config.mode === "docker" && !config.remoteOnly && !nodes.get(server.nodeId)?.endpoint, "Playit is supported only for local Docker deployments on this panel host.", 400);
  assert(server.kind === "minecraft", "Playit is available for Minecraft deployments only.");
}
export function playitStatus(server: Server) {
  check(server);
  const agent = agents.get(server.id);
  return { running: !!agent && agent.child.exitCode === null && !agent.child.killed, claimUrl: agent?.claim ?? null, localPort: server.port, protocol: server.templateId === "bedrock" ? "udp" : "tcp", startedAt: agent?.startedAt ?? null, configured: !!process.env.PLAYIT_BINARY };
}
export async function startPlayit(server: Server) {
  check(server);
  assert(!locks.has(server.id), "A tunnel action is already in progress.", 409);
  assert(!agents.has(server.id), "The Playit agent is already running.", 409);
  const binary = process.env.PLAYIT_BINARY;
  assert(binary && path.isAbsolute(binary), "Set PLAYIT_BINARY to an absolute path to a trusted Playit agent executable on the panel host.", 503);
  locks.add(server.id);
  try {
    await fs.mkdir(agentDir, { recursive: true, mode: 0o700 });
    await fs.chmod(agentDir, 0o700);
    const child = spawn(binary, ["-s", "--secret_path", secretFile(server)], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin", HOME: agentDir } });
    const agent: Agent = { child, claim: null, startedAt: new Date().toISOString() };
    agents.set(server.id, agent);
    let buffer = "";
    const scan = (chunk: Buffer) => {
      buffer = (buffer + chunk.toString("utf8")).slice(-4096);
      const match = buffer.match(/https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+/);
      if (match) agent.claim = match[0];
    };
    child.stdout.on("data", scan); child.stderr.on("data", scan);
    child.once("exit", () => { if (agents.get(server.id) === agent) agents.delete(server.id); });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.on("error", () => { if (agents.get(server.id) === agent) agents.delete(server.id); });
    return playitStatus(server);
  } catch (error) { agents.delete(server.id); throw error; }
  finally { locks.delete(server.id); }
}
async function stopAgent(server: Server) {
  const agent = agents.get(server.id);
  if (!agent) return;
  await new Promise<void>((resolve) => {
    if (agent.child.exitCode !== null) return resolve();
    const timer = setTimeout(() => agent.child.kill("SIGKILL"), 5000); timer.unref();
    agent.child.once("exit", () => { clearTimeout(timer); resolve(); });
    agent.child.kill("SIGTERM");
  });
  agents.delete(server.id);
}
export async function stopPlayit(server: Server) {
  check(server);
  assert(!locks.has(server.id), "A tunnel action is already in progress.", 409);
  locks.add(server.id);
  try { await stopAgent(server); } finally { locks.delete(server.id); }
}
export async function resetPlayit(server: Server) {
  check(server);
  assert(!locks.has(server.id), "A tunnel action is already in progress.", 409);
  locks.add(server.id);
  try { await stopAgent(server); await fs.rm(secretFile(server), { force: true }); }
  finally { locks.delete(server.id); }
}
export function stopAllPlayit() { for (const agent of agents.values()) agent.child.kill("SIGTERM"); }
