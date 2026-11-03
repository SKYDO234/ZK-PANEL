import "dotenv/config";
import express from "express";
import { timingSafeEqual, createHash } from "node:crypto";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import * as docker from "../server/docker-runtime.js";
import * as files from "../server/files.js";
import { config } from "../server/config.js";
import { z } from "zod";
import { ziynSchema } from "../shared/ziyn.js";
const allocationSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    kind: z.enum(["minecraft", "game", "container", "website", "bot"]),
    name: z.string().max(100),
    memory: z.number().int().min(256).max(1048576),
    cpu: z.number().int().min(10).max(12800),
    disk: z.number().int().min(1024).max(10485760),
    port: z.number().int().min(1024).max(65535),
    environment: z.record(z.string(), z.string().max(4000)),
    templateId: z.string().max(80),
  })
  .passthrough();
const diskQuery = z.coerce.number().int().min(1).max(10485760);
const uidQuery = z.coerce
  .number()
  .int()
  .refine((v) => v === 1000 || v === 101);
const token = process.env.NODE_TOKEN;
if (!token || token.length < 32)
  throw new Error(
    "NODE_TOKEN must be a random secret of at least 32 characters.",
  );
const expected = createHash("sha256").update(token).digest();
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const value = String(req.headers.authorization || "").replace(/^Bearer /, "");
  const actual = createHash("sha256").update(value).digest();
  if (!timingSafeEqual(actual, expected)) {
    res.status(401).json({ error: "Invalid node token." });
    return;
  }
  next();
});
app.use((req, res, next) => {
  if (!/^\/servers\/[a-zA-Z0-9_-]+(\/|$)/.test(req.path)) return next();
  const id = req.path.split("/")[2];
  if (!req.path.endsWith("/provision") && !registered.has(id)) {
    res
      .status(404)
      .json({ error: "Deployment is not registered on this node." });
    return;
  }
  next();
});
app.use(express.json({ limit: "3mb" }));
const registered = new Set<string>();
const busy = new Set<string>();
// Agent state survives restarts. Registration is persisted only after successful provisioning.
const registryPath = path.join(config.dataDir, "agent-registry.json");
try {
  for (const id of JSON.parse(await fs.readFile(registryPath, "utf8")))
    registered.add(id);
} catch {}
async function persist() {
  await fs.writeFile(registryPath, JSON.stringify([...registered]), {
    mode: 0o600,
  });
}
app.get("/health", async (_req, res) => {
  const h = await docker.health();
  const storage = await fs.statfs(config.workspaceHostPath);
  res.json({
    ...h,
    memory: Math.floor(os.totalmem() / 1048576),
    disk: Math.floor(
      (Number(storage.blocks) * Number(storage.bsize)) / 1048576,
    ),
    registered: registered.size,
  });
});
app.post("/servers/:id/provision", async (req, res) => {
  const id = String(req.params.id);
  if (busy.has(id)) {
    res.status(409).json({ error: "Deployment is busy." });
    return;
  }
  busy.add(id);
  try {
    const parsed = z
      .object({ server: allocationSchema, template: ziynSchema })
      .parse(req.body);
    const { server, template } = parsed;
    if (server.id !== id) throw new Error("Server ID mismatch.");
    if (
      !Number.isInteger(server.memory) ||
      server.memory < 256 ||
      server.memory > 1048576 ||
      !Number.isInteger(server.cpu) ||
      server.cpu < 10 ||
      server.cpu > 12800 ||
      !Number.isInteger(server.port) ||
      server.port < 1024 ||
      server.port > 65535
    )
      throw new Error("Invalid resource allocation.");
    await files.initializeFiles(id, server.kind, server.name);
    const containerId = await docker.provision(server as any, template);
    registered.add(id);
    await persist();
    res.json({ containerId });
  } finally {
    busy.delete(id);
  }
});
app.delete("/servers/:id", async (req, res) => {
  await docker.remove({ id: String(req.params.id) } as any);
  registered.delete(String(req.params.id));
  await persist();
  await fs.rm(files.workspace(String(req.params.id)), {
    recursive: true,
    force: true,
  });
  res.json({ ok: true });
});
app.post("/servers/:id/power", async (req, res) => {
  const action = req.body.action;
  if (!["start", "stop", "restart", "kill"].includes(action)) {
    res.status(400).json({ error: "Invalid power action." });
    return;
  }
  if (action === "start" || action === "restart") {
    const { server, template } = z
      .object({ server: allocationSchema, template: ziynSchema })
      .parse(req.body);
    if (server.id !== req.params.id) throw new Error("Deployment ID mismatch.");
    await docker.provision(server as any, template);
  } else await docker.power({ id: String(req.params.id) } as any, action);
  res.json({ ok: true });
});
app.get("/servers/:id/state", async (req, res) =>
  res.json(await docker.state({ id: String(req.params.id) } as any)),
);
app.get("/servers/:id/stats", async (req, res) =>
  res.json(await docker.stats({ id: String(req.params.id) } as any)),
);
app.get("/servers/:id/logs", async (req, res) =>
  res.json({
    lines: await docker.readLogs({ id: String(req.params.id) } as any),
  }),
);
app.post("/servers/:id/command", async (req, res) => {
  const s = {
    id: String(req.params.id),
    kind: req.body.kind,
    templateId: req.body.templateId,
  } as any;
  res.json({ output: await docker.command(s, String(req.body.command)) });
});
app.get("/servers/:id/files", async (req, res) =>
  res.json(
    await files.listFiles(String(req.params.id), String(req.query.dir || "")),
  ),
);
app.get("/servers/:id/files/read", async (req, res) =>
  res.json({
    content: await files.readFile(
      String(req.params.id),
      String(req.query.path || ""),
    ),
  }),
);
app.put("/servers/:id/files/write", async (req, res) => {
  await files.writeFile(
    String(req.params.id),
    String(req.body.path),
    String(req.body.content),
    diskQuery.parse(req.query.disk || 10240),
  );
  res.json({ ok: true });
});
app.post("/servers/:id/files/mkdir", async (req, res) => {
  await files.makeDirectory(String(req.params.id), String(req.body.path));
  res.json({ ok: true });
});
app.post("/servers/:id/files/rename", async (req, res) => {
  await files.renameFile(
    String(req.params.id),
    String(req.body.from),
    String(req.body.to),
  );
  res.json({ ok: true });
});
app.delete("/servers/:id/files", async (req, res) => {
  await files.deleteFile(String(req.params.id), String(req.query.path || ""));
  res.json({ ok: true });
});
app.get("/servers/:id/files/download", async (req, res) => {
  const f = await files.downloadFile(
    String(req.params.id),
    String(req.query.path || ""),
  );
  res.attachment(f.name).set("Content-Length", String(f.size));
  f.stream.pipe(res);
});
app.post(
  "/servers/:id/files/upload",
  express.raw({ type: "application/octet-stream", limit: "100mb" }),
  async (req, res) => {
    res.json(
      await files.uploadFile(
        String(req.params.id),
        String(req.query.path || ""),
        Readable.from(req.body),
        diskQuery.parse(req.query.disk || 10240),
        req.body.length,
      ),
    );
  },
);
app.get("/servers/:id/archive", async (req, res) => {
  const dest = path.join(os.tmpdir(), "zk-" + randomUUID() + ".tar.gz");
  try {
    await files.archiveWorkspace(String(req.params.id), dest);
    const stat = await fs.stat(dest);
    res.type("application/gzip").set("Content-Length", String(stat.size));
    const stream = createReadStream(dest);
    stream.pipe(res);
    res.on("finish", () => void fs.rm(dest, { force: true }));
    res.on("close", () => void fs.rm(dest, { force: true }));
  } catch (e) {
    await fs.rm(dest, { force: true });
    throw e;
  }
});
app.post(
  "/servers/:id/restore",
  express.raw({ type: "application/octet-stream", limit: "500mb" }),
  async (req, res) => {
    const state = await docker.state({ id: String(req.params.id) } as any);
    if (state !== "offline") {
      res.status(409).json({ error: "Stop the deployment before restoring." });
      return;
    }
    const temp = path.join(
      os.tmpdir(),
      "zk-restore-" + randomUUID() + ".tar.gz",
    );
    try {
      await fs.writeFile(temp, req.body);
      await files.restoreWorkspace(
        String(req.params.id),
        temp,
        diskQuery.parse(req.query.disk || 2048),
        uidQuery.parse(req.query.uid || 1000),
      );
      res.json({ ok: true });
    } finally {
      await fs.rm(temp, { force: true });
    }
  },
);
// Forward async failures to Express 4 instead of crashing the node agent.
for (const layer of (app as any)._router.stack) {
  if (!layer.route) continue;
  for (const routeLayer of layer.route.stack) {
    const handler = routeLayer.handle;
    routeLayer.handle = (req: any, res: any, next: any) => {
      try {
        const result = handler(req, res, next);
        if (result?.catch) result.catch(next);
        return result;
      } catch (error) {
        next(error);
      }
    };
  }
}
app.use(
  (
    e: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res
      .status(e.status || 400)
      .json({
        error: e.issues
          ? e.issues
              .map((i: any) => i.path.join(": ") + ": " + i.message)
              .join("; ")
          : e.message || "Agent request failed.",
      }),
);
app.listen(Number(process.env.AGENT_PORT || 8080), "0.0.0.0", () =>
  console.log(
    "ZK node agent listening on port " +
      (process.env.AGENT_PORT || 8080) +
      ". Put this service behind authenticated TLS.",
  ),
);
