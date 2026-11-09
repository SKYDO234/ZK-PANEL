import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zk-production-"));
const children: ChildProcess[] = [];
const panelPort = 34000 + Math.floor(Math.random() * 5000),
  agentPort = panelPort + 1;
const token = "agent-test-token-not-a-production-secret-123456";
const env = {
  ...process.env,
  DATA_DIR: dir,
  ZK_MODE: "docker",
  ZK_REMOTE_ONLY: "true",
  SESSION_SECRET: "production-test-secret-not-for-real-use-123456",
  ALLOW_REGISTRATION: "false",
  COOKIE_SECURE: "false",
  NODE_TOKEN: token,
  WORKSPACE_HOST_PATH: path.join(dir, "workspaces"),
};
async function start(file: string, port: number) {
  const child = spawn(process.execPath, ["--import", "tsx", file], {
    env: { ...env, PORT: String(port), AGENT_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let logs = "";
  child.stdout?.on("data", (b) => (logs += b));
  child.stderr?.on("data", (b) => (logs += b));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.status === 200 || r.status === 401) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Startup timed out: " + logs);
}
test.before(async () => {
  await fs.writeFile(path.join(dir, "agent-registry.json"), JSON.stringify(["zk-playittest"]));
  await Promise.all([
    start("server/index.ts", panelPort),
    start("agent/index.ts", agentPort),
  ]);
});
test.after(async () => {
  for (const c of children) {
    c.kill("SIGTERM");
    await Promise.race([
      once(c, "exit"),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    if (c.exitCode === null) c.kill("SIGKILL");
  }
  await fs.rm(dir, { recursive: true, force: true });
});
test("Docker mode never enables demo login, registration or wallet credit", async () => {
  const health = await fetch(`http://127.0.0.1:${panelPort}/healthz`);
  assert.equal((await health.json()).mode, "docker");
  for (const route of [
    "/auth/demo",
    "/auth/register",
    "/billing/demo-credit",
  ]) {
    const r = await fetch(`http://127.0.0.1:${panelPort}/api${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ZK-Request": "1" },
      body: "{}",
    });
    assert.ok([401, 403].includes(r.status), route);
  }
});
test("agent requires its bearer token and validates allocation before Docker access", async () => {
  const base = `http://127.0.0.1:${agentPort}`;
  assert.equal((await fetch(base + "/health")).status, 401);
  const r = await fetch(base + "/servers/test-id/provision", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      server: { id: "test-id", memory: -1 },
      template: {},
    }),
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /memory|Invalid|Required/);
  assert.equal(
    (
      await fetch(base + "/servers/unknown/state", {
        headers: { Authorization: "Bearer " + token },
      })
    ).status,
    404,
  );
  const tunnel = await fetch(base + "/servers/zk-playittest/playit", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status", server: { id: "zk-playittest", kind: "minecraft", templateId: "paper", port: 25565 } }),
  });
  assert.equal(tunnel.status, 503);
  assert.match((await tunnel.json()).error, /host network/);
  assert.equal(children[1].exitCode, null);
});
