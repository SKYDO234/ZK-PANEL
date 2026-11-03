import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "zk-api-"));
const port = 32000 + Math.floor(Math.random() * 12000);
const base = "http://127.0.0.1:" + port;
let child: ChildProcess;
let cookie = "";
let logs = "";
async function request(
  route: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const binary = options.body instanceof ArrayBuffer;
  const r = await fetch(base + "/api" + route, {
    method: options.method || (options.body !== undefined ? "POST" : "GET"),
    headers: {
      "X-ZK-Request": "1",
      ...(options.cookie === undefined
        ? { Cookie: cookie }
        : { Cookie: options.cookie }),
      ...(options.body !== undefined
        ? {
            "Content-Type": binary
              ? "application/octet-stream"
              : "application/json",
          }
        : {}),
      ...options.headers,
    },
    body:
      options.body === undefined
        ? undefined
        : binary
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
  });
  const data = r.headers.get("content-type")?.includes("application/json")
    ? await r.json()
    : await r.text();
  return { status: r.status, data, headers: r.headers };
}
test.before(async () => {
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: root,
      ZK_MODE: "demo",
      PORT: String(port),
      PUBLIC_URL: base,
      COOKIE_SECURE: "false",
      NODE_OPTIONS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (b) => (logs += b.toString()));
  child.stderr?.on("data", (b) => (logs += b.toString()));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + "/healthz");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const auth = await request("/auth/demo", { body: {}, cookie: "" });
  assert.equal(auth.status, 200, JSON.stringify(auth.data));
  cookie = auth.headers.get("set-cookie")!.split(";")[0];
});
test.after(async () => {
  if (process.env.TEST_VERBOSE) console.log("TEST SERVER LOGS:\n" + logs);
  if (child?.pid) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await fs.rm(root, { recursive: true, force: true });
});
test("unauthenticated and cross-origin mutations are rejected", async () => {
  assert.equal((await request("/bootstrap", { cookie: "" })).status, 401);
  assert.equal(
    (
      await request("/billing/demo-credit", {
        body: { amount: 10000 },
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/billing/demo-credit", {
        body: { amount: 10000 },
        headers: { "X-ZK-Request": "0" },
      })
    ).status,
    403,
  );
});
let serverId = "";
test("deployment validates EULA, atomically debits wallet and becomes ready", async () => {
  const before = (await request("/bootstrap")).data.user.balance;
  const input = {
    name: "Integration SMP",
    templateId: "paper",
    planId: "boost",
    nodeId: "node-mumbai",
    environment: { VERSION: "1.21.4", EULA: "FALSE" },
  };
  assert.equal((await request("/servers", { body: input })).status, 400);
  assert.equal((await request("/bootstrap")).data.user.balance, before);
  input.environment.EULA = "TRUE";
  const created = await request("/servers", { body: input });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  serverId = created.data.id;
  assert.equal((await request("/bootstrap")).data.user.balance, before - 34900);
  for (let i = 0; i < 30; i++) {
    const s = await request("/servers/" + serverId);
    if (s.data.status === "running") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal((await request("/servers/" + serverId)).data.status, "running");
});
test("console commands produce actual persisted demo output", async () => {
  assert.equal(
    (
      await request("/servers/" + serverId + "/command", {
        body: { command: "list" },
      })
    ).status,
    200,
  );
  const result = await request("/servers/" + serverId + "/console");
  assert.ok(result.data.some((l: any) => l.message.includes("0 of a max")));
});
test("file write/read/upload and traversal protection", async () => {
  const route = "/servers/" + serverId;
  assert.equal(
    (
      await request(route + "/files/write", {
        method: "PUT",
        body: { path: "test.txt", content: "hello ZK" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(route + "/files/read?path=test.txt")).data.content,
    "hello ZK",
  );
  assert.equal(
    (
      await request(route + "/files/upload?path=upload.bin", {
        body: new TextEncoder().encode("binary").buffer,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(route + "/files/read?path=../../.env")).status,
    403,
  );
});
test("plugin install is explicitly demo metadata and removable", async () => {
  const installed = await request("/servers/" + serverId + "/plugins", {
    body: { projectId: "luckperms" },
  });
  assert.equal(installed.status, 201, JSON.stringify(installed.data));
  assert.equal(installed.data.demo, true);
  assert.match(installed.data.filename, /demo.json$/);
  assert.equal(
    (
      await request("/servers/" + serverId + "/plugins/" + installed.data.id, {
        method: "DELETE",
      })
    ).status,
    200,
  );
});
test("backup, stopped restore and checksum download", async () => {
  const route = "/servers/" + serverId;
  const backup = await request(route + "/backups", {
    body: { name: "Before restore" },
  });
  assert.equal(backup.status, 201, JSON.stringify(backup.data));
  assert.match(backup.data.checksum, /^[a-f0-9]{64}$/);
  assert.equal(
    (await request(route + "/power", { body: { action: "stop" } })).status,
    200,
  );
  await request(route + "/files/write", {
    method: "PUT",
    body: { path: "test.txt", content: "changed" },
  });
  assert.equal(
    (
      await request(route + "/backups/" + backup.data.id + "/restore", {
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(route + "/files/read?path=test.txt")).data.content,
    "hello ZK",
  );
  const download = await fetch(
    base + "/api" + route + "/backups/" + backup.data.id + "/download",
    { headers: { Cookie: cookie } },
  );
  assert.equal(download.status, 200);
  assert.ok((await download.arrayBuffer()).byteLength > 0);
});
test("policies, schedules, API key scope and Discord setup error are usable", async () => {
  const route = "/servers/" + serverId;
  const p = (await request(route + "/autopilot")).data;
  assert.equal(
    (
      await request(route + "/autopilot", {
        method: "PUT",
        body: { ...p, idleSleep: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(route + "/schedules", {
        body: { name: "Daily restart", action: "restart", interval: 1440 },
      })
    ).status,
    201,
  );
  const key = await request("/keys", { body: { name: "Integration key" } });
  assert.equal(key.status, 201);
  const denied = await fetch(base + "/api/admin/overview", {
    headers: { Authorization: "Bearer " + key.data.key },
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (await request("/keys/" + key.data.id, { method: "DELETE" })).status,
    200,
  );
  assert.equal((await request("/discord/link-code", { body: {} })).status, 503);
});
test("ZIYN imports are schema checked and disabled", async () => {
  const legacy = {
    meta: { version: "PTDL_v2" },
    name: "Imported test",
    docker_images: { Node: "node:22-alpine" },
    startup: "node index.js",
    variables: [],
    scripts: { installation: { script: "touch /unsafe" } },
  };
  const result = await request("/admin/templates/import", {
    body: { json: JSON.stringify(legacy) },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.enabled, false);
  assert.ok(!JSON.stringify(result.data).includes("/unsafe"));
});
test("tenant isolation prevents reading or modifying another user deployment", async () => {
  const registration = await request("/auth/register", {
    cookie: "",
    body: {
      name: "Another Member",
      email: "member@example.test",
      password: "a-long-unique-password",
    },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.data));
  const other = registration.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await request("/servers/" + serverId, { cookie: other })).status,
    403,
  );
  assert.equal(
    (
      await request("/servers/" + serverId + "/power", {
        cookie: other,
        body: { action: "start" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/admin/overview", { cookie: other })).status,
    403,
  );
  assert.equal(
    (
      await request("/billing/demo-credit", {
        cookie: other,
        body: { amount: 123 },
      })
    ).status,
    400,
  );
});
test("confirmed deletion removes the deployment", async () => {
  assert.equal(
    (
      await request("/servers/" + serverId, {
        method: "DELETE",
        body: { confirmation: "Integration SMP" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/servers/" + serverId)).status, 404);
});
