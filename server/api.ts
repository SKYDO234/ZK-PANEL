import {
  Router,
  raw,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { config, assert, HttpError } from "./config.js";
import { plans } from "./catalog.js";
import { panelSettings } from "./panel-settings.js";
import { minecraftVersions } from "./minecraft-versions.js";
import { parseZiynDocument } from "../shared/ziyn.js";
import {
  db,
  uid,
  now,
  hash,
  getUser,
  userByDiscord,
  getServers,
  getServer,
  saveServer,
  templates,
  nodes,
  activities,
  invoices,
  credit,
  debit,
  transaction,
  log,
  backups,
  schedules,
  getPolicy,
  savePolicy,
  plugins,
  setting,
  encrypt,
  decrypt,
} from "./db.js";
import {
  authenticate,
  admin,
  csrf,
  createSession,
  destroySession,
  sessionUser,
  verifyPassword,
  createUser,
  hashPassword,
} from "./auth.js";
import {
  accessible,
  deploymentSchema,
  createDeployment,
  changePower,
  deleteDeployment,
  createBackup,
  restoreBackup,
  removeBackup,
  downloadBackup,
  renew,
  searchPlugins,
  installPlugin,
  removePlugin,
  validateVariables,
} from "./services.js";
import * as runtime from "./runtime.js";
import * as playit from "./playit.js";
import { dockerClient } from "./docker-runtime.js";
import type {
  User,
  Server,
  Schedule,
  NodeInfo,
  PowerAction,
} from "../shared/types.js";

export const api = Router();
const user = (res: Response) => res.locals.user as User;
const id = (req: Request) => String(req.params.id);
export function publicServer(s: Server): Server {
  return {
    ...s,
    environment: Object.fromEntries(
      Object.entries(s.environment).map(([k, v]) => [
        k,
        /TOKEN|PASSWORD|SECRET|API_KEY/.test(k) ? "" : v,
      ]),
    ),
  };
}
api.get("/config", (_req, res) =>
  res.json({
    mode: config.mode,
    autoDemo: config.autoDemo,
    devBootstrap: config.devBootstrap,
    registration: panelSettings().registration,
    version: "0.1.0",
    stripe: !!process.env.STRIPE_SECRET_KEY,
    discord: !!process.env.DISCORD_BOT_TOKEN,
    discordAppId: process.env.DISCORD_APPLICATION_ID,
  }),
);
api.post(
  "/auth/demo",
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  (_req, res) => {
    assert(
      config.autoDemo,
      "Automatic demo access is disabled for this workspace.",
      403,
    );
    createSession("demo-user", res);
    res.json({ user: getUser("demo-user") });
  },
);
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many sign-in attempts. Please try again in 15 minutes.",
  },
});
api.post("/auth/login", authLimit, async (req, res) => {
  const body = z
    .object({
      email: z.string().trim().min(1).max(254),
      password: z.string().min(1).max(128),
    })
    .parse(req.body);
  const row = db
    .prepare("SELECT id,password FROM users WHERE email=? OR username=?")
    .get(body.email.toLowerCase(), body.email.toLowerCase()) as any;
  const valid = await verifyPassword(
    body.password,
    row?.password || "00000000000000000000000000000000:" + "0".repeat(128),
  );
  assert(row && valid, "Username/email or password is incorrect.", 401);
  const u = getUser(row.id)!;
  assert(!u.suspended, "Account suspended. Contact support.", 403);
  createSession(u.id, res);
  log(u.id, "account.signin", "Signed in to ZK PANEL", "info");
  res.json({ user: u });
});
api.post("/auth/register", authLimit, async (req, res) => {
  assert(
    panelSettings().registration,
    "Registration is disabled. Ask your administrator for an account.",
    403,
  );
  const b = z
    .object({
      name: z.string().trim().min(2).max(60),
      email: z.string().email().max(254),
      password: z
        .string()
        .min(12, "Use at least 12 characters for your password.")
        .max(128),
    })
    .parse(req.body);
  assert(
    !db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(b.email.toLowerCase()),
    "An account with that email already exists.",
    409,
  );
  const u = await createUser(b.name, b.email, b.password);
  createSession(u.id, res);
  log(u.id, "account.created", "Welcome to ZK PANEL", "success");
  res.status(201).json({ user: u });
});
api.post("/auth/logout", (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});
api.use(authenticate, csrf);
api.get("/bootstrap", (req, res) => {
  const u = user(res);
  res.json({
    user: u,
    mode: config.mode,
    version: "0.1.0",
    currency: "INR",
    plans,
    nodes: nodes.all(),
    servers: getServers(u.role === "admin" ? undefined : u.id).map(
      publicServer,
    ),
    activity: activities(u.id, 30),
    invoices: invoices.all(u.id),
    integrations: {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      discord: !!process.env.DISCORD_BOT_TOKEN,
      discordAppId: process.env.DISCORD_APPLICATION_ID,
      registration: panelSettings().registration,
    },
  });
});
api.get("/activity", (req, res) => res.json(activities(user(res).id, 100)));
api.patch("/account", async (req, res) => {
  const b = z
    .object({
      name: z.string().trim().min(2).max(60),
      email: z.string().email().max(254),
      currentPassword: z.string().max(128).optional(),
      password: z.string().min(12).max(128).optional(),
    })
    .parse(req.body);
  const u = user(res);
  const row = db
    .prepare("SELECT password FROM users WHERE id=?")
    .get(u.id) as any;
  if (b.password) {
    assert(
      b.currentPassword &&
        (await verifyPassword(b.currentPassword, row.password)),
      "Current password is incorrect.",
      403,
    );
  }
  const exists = db
    .prepare("SELECT id FROM users WHERE email=? AND id<>?")
    .get(b.email.toLowerCase(), u.id);
  assert(!exists, "Email already in use.", 409);
  db.prepare("UPDATE users SET name=?,email=?,password=? WHERE id=?").run(
    b.name,
    b.email.toLowerCase(),
    b.password ? await hashPassword(b.password) : row.password,
    u.id,
  );
  if (b.password) {
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
    createSession(u.id, res);
  }
  log(u.id, "account.updated", "Account settings updated", "success");
  res.json({ user: getUser(u.id) });
});
api.get("/keys", (req, res) =>
  res.json(
    db
      .prepare(
        'SELECT id,name,prefix,created_at as "createdAt" FROM api_keys WHERE user_id=?',
      )
      .all(user(res).id),
  ),
);
api.post("/keys", (req, res) => {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(40) })
    .parse(req.body);
  const key = "zk_" + randomBytes(32).toString("hex");
  const kid = uid("key_");
  db.prepare(
    "INSERT INTO api_keys(id,user_id,hash,name,prefix,created_at) VALUES(?,?,?,?,?,?)",
  ).run(kid, user(res).id, hash(key), name, key.slice(0, 11), now());
  log(user(res).id, "key.created", `API key “${name}” created`, "warning");
  res.status(201).json({ id: kid, key, name });
});
api.delete("/keys/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM api_keys WHERE id=? AND user_id=?")
    .run(id(req), user(res).id);
  assert(result.changes, "API key not found.", 404);
  res.json({ ok: true });
});
api.get("/templates", (_req, res) => res.json(templates.all()));
api.get("/minecraft/versions/:software", async (req, res) => {
  res.json({ versions: await minecraftVersions(String(req.params.software)) });
});
api.get("/plans", (_req, res) => res.json(plans));
api.get("/servers", (req, res) =>
  res.json(
    getServers(user(res).role === "admin" ? undefined : user(res).id).map(
      publicServer,
    ),
  ),
);
api.post("/servers", async (req, res) => {
  const input = deploymentSchema.parse(req.body);
  res.status(201).json(publicServer(await createDeployment(user(res), input)));
});
api.get("/servers/:id", (req, res) =>
  res.json(publicServer(accessible(id(req), user(res)))),
);
api.patch("/servers/:id", (req, res) => {
  const s = accessible(id(req), user(res));
  const b = z
    .object({
      name: z.string().trim().min(2).max(48).optional(),
      description: z.string().max(180).optional(),
      favorite: z.boolean().optional(),
    })
    .parse(req.body);
  Object.assign(s, b);
  saveServer(s);
  res.json(publicServer(s));
});
api.delete("/servers/:id", async (req, res) => {
  const body = z.object({ confirmation: z.string() }).parse(req.body);
  assert(
    body.confirmation === getServer(id(req))?.name,
    "Type the deployment name to confirm deletion.",
  );
  await deleteDeployment(user(res), id(req));
  res.json({ ok: true });
});
api.post("/servers/:id/power", async (req, res) => {
  const { action } = z
    .object({ action: z.enum(["start", "stop", "restart", "kill"]) })
    .parse(req.body);
  res.json(publicServer(await changePower(user(res), id(req), action)));
});
api.post("/servers/:id/renew", (req, res) => {
  const result = renew(user(res), id(req));
  res.json({ server: publicServer(result.server), invoice: result.invoice });
});
api.get("/servers/:id/startup", (req, res) => {
  const s = accessible(id(req), user(res));
  res.json({
    environment: s.environment,
    template: templates.get(s.templateId),
  });
});
api.put("/servers/:id/startup", (req, res) => {
  const s = accessible(id(req), user(res));
  assert(
    !["running", "starting", "installing"].includes(s.status),
    "Stop the deployment before changing startup variables.",
  );
  const b = z
    .object({ environment: z.record(z.string(), z.string().max(4000)) })
    .parse(req.body);
  const t = templates.get(s.templateId)!;
  const values = { ...s.environment, ...b.environment };
  for (const v of t.variables)
    if (v.secret && !b.environment[v.key])
      values[v.key] = s.environment[v.key] || "";
  s.environment = validateVariables(t, values);
  if (values.VERSION) s.version = values.VERSION;
  saveServer(s);
  log(
    user(res).id,
    "startup.updated",
    `Startup variables updated for ${s.name}`,
    "info",
    s.id,
  );
  res.json(publicServer(s));
});
api.get("/servers/:id/stats", async (req, res) => {
  const s = accessible(id(req), user(res));
  res.json(await runtime.metrics(s));
});
// Playit agents can expose node-local services, so only administrators may manage them.
async function playitAction(s: Server, action: "status" | "start" | "stop" | "reset") {
  if (nodes.get(s.nodeId)?.endpoint) {
    return runtime.remote(s, `/servers/${s.id}/playit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, server: { id: s.id, kind: s.kind, templateId: s.templateId, port: s.port } }),
    });
  }
  assert(!config.remoteOnly, "Local Playit is disabled in remote-only mode.", 403);
  if (action === "start") await playit.startPlayit(s);
  else if (action === "stop") await playit.stopPlayit(s);
  else if (action === "reset") await playit.resetPlayit(s);
  return playit.playitStatus(s);
}
api.get("/servers/:id/playit", async (req, res) => {
  assert(user(res).role === "admin", "Administrator access required.", 403);
  const s = accessible(id(req), user(res));
  assert(s.kind === "minecraft", "Playit is available for Minecraft deployments only.");
  res.json(await playitAction(s, "status"));
});
api.post("/servers/:id/playit/:action", async (req, res) => {
  assert(user(res).role === "admin", "Administrator access required.", 403);
  const s = accessible(id(req), user(res));
  assert(s.kind === "minecraft", "Playit is available for Minecraft deployments only.");
  const action = z.enum(["start", "stop", "reset"]).parse(req.params.action);
  const result = await playitAction(s, action);
  log(user(res).id, "playit." + action, `${s.name}: Playit ${action}`, "warning", s.id);
  res.json(result);
});
api.get("/servers/:id/console", async (req, res) => {
  const s = accessible(id(req), user(res));
  res.json(await runtime.logs(s));
});
api.post("/servers/:id/command", async (req, res) => {
  const { command } = z
    .object({ command: z.string().trim().min(1).max(2000) })
    .parse(req.body);
  const s = accessible(id(req), user(res));
  res.json({ output: await runtime.command(s, command) });
});
api.get("/servers/:id/events", async (req, res) => {
  const s = accessible(id(req), user(res));
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  let closed = false;
  req.on("close", () => {
    closed = true;
  });
  let last = "";
  const send = async () => {
    if (closed) return;
    try {
      const current = getServer(s.id);
      if (!current) {
        res.write("event: deleted\ndata: {}\n\n");
        res.end();
        return;
      }
      const lines = await runtime.logs(current);
      const payload = JSON.stringify({ lines, status: current.status });
      if (payload !== last) {
        res.write("data: " + payload + "\n\n");
        last = payload;
      }
    } catch {
      if (!closed) res.write("event: unavailable\ndata: {}\n\n");
    }
  };
  await send();
  const timer = setInterval(() => void send(), 2500);
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(timer);
    clearInterval(heartbeat);
  });
});
api.get("/servers/:id/files", async (req, res) =>
  res.json(
    await runtime.list(
      accessible(id(req), user(res)),
      String(req.query.dir || ""),
    ),
  ),
);
api.get("/servers/:id/files/read", async (req, res) =>
  res.json({
    content: await runtime.read(
      accessible(id(req), user(res)),
      String(req.query.path || ""),
    ),
  }),
);
api.put("/servers/:id/files/write", async (req, res) => {
  const b = z
    .object({
      path: z.string().max(500),
      content: z.string().max(2 * 1024 * 1024),
    })
    .parse(req.body);
  await runtime.write(accessible(id(req), user(res)), b.path, b.content);
  res.json({ ok: true });
});
api.post("/servers/:id/files/mkdir", async (req, res) => {
  const b = z.object({ path: z.string().max(500) }).parse(req.body);
  await runtime.mkdir(accessible(id(req), user(res)), b.path);
  res.json({ ok: true });
});
api.post("/servers/:id/files/rename", async (req, res) => {
  const b = z
    .object({ from: z.string().max(500), to: z.string().max(500) })
    .parse(req.body);
  await runtime.rename(accessible(id(req), user(res)), b.from, b.to);
  res.json({ ok: true });
});
api.delete("/servers/:id/files", async (req, res) => {
  await runtime.deleteFile(
    accessible(id(req), user(res)),
    String(req.query.path || ""),
  );
  res.json({ ok: true });
});
api.get("/servers/:id/files/download", async (req, res) => {
  const result = await runtime.download(
    accessible(id(req), user(res)),
    String(req.query.path || ""),
  );
  res.attachment(result.name);
  if (result.size) res.set("Content-Length", String(result.size));
  result.stream.pipe(res);
});
api.post(
  "/servers/:id/files/upload",
  raw({ type: "application/octet-stream", limit: "100mb" }),
  async (req, res) => {
    assert(
      Buffer.isBuffer(req.body),
      "Send a binary file with Content-Type: application/octet-stream.",
    );
    await runtime.upload(
      accessible(id(req), user(res)),
      String(req.query.path || ""),
      req.body,
    );
    res.json({ ok: true });
  },
);
api.get("/servers/:id/backups", (req, res) => {
  accessible(id(req), user(res));
  res.json(backups.all(id(req)));
});
api.post("/servers/:id/backups", async (req, res) => {
  const b = z
    .object({ name: z.string().max(70).default("Manual backup") })
    .parse(req.body);
  res.status(201).json(await createBackup(user(res), id(req), b.name));
});
api.post("/servers/:id/backups/:backupId/restore", async (req, res) => {
  await restoreBackup(user(res), id(req), String(req.params.backupId));
  res.json({ ok: true });
});
api.delete("/servers/:id/backups/:backupId", async (req, res) => {
  await removeBackup(user(res), id(req), String(req.params.backupId));
  res.json({ ok: true });
});
api.get("/servers/:id/backups/:backupId/download", (req, res) => {
  accessible(id(req), user(res));
  const b = downloadBackup(id(req), String(req.params.backupId));
  res.attachment(b.name);
  res.type("application/gzip").set("Content-Length", String(b.size));
  b.stream.pipe(res);
});
api.get("/servers/:id/schedules", (req, res) => {
  accessible(id(req), user(res));
  res.json(schedules.all(id(req)));
});
api.post("/servers/:id/schedules", (req, res) => {
  accessible(id(req), user(res));
  assert(schedules.all(id(req)).length < 20, "Schedule limit reached.");
  const b = z
    .object({
      name: z.string().trim().min(2).max(60),
      action: z.enum(["restart", "start", "stop", "backup", "command"]),
      interval: z.number().int().min(5).max(10080),
      command: z.string().max(2000).default(""),
      enabled: z.boolean().default(true),
    })
    .parse(req.body);
  assert(
    b.action !== "command" || b.command.trim(),
    "Enter a command for this task.",
  );
  const s: Schedule = {
    ...b,
    id: uid("sch_"),
    serverId: id(req),
    nextRun: new Date(Date.now() + b.interval * 60000).toISOString(),
  };
  schedules.save(s);
  log(
    user(res).id,
    "schedule.created",
    `${s.name} scheduled every ${s.interval} minutes`,
    "info",
    s.id,
  );
  res.status(201).json(s);
});
api.patch("/servers/:id/schedules/:scheduleId", (req, res) => {
  accessible(id(req), user(res));
  const s = schedules.get(String(req.params.scheduleId));
  assert(s && s.serverId === id(req), "Schedule not found.", 404);
  const b = z
    .object({
      enabled: z.boolean().optional(),
      name: z.string().min(2).max(60).optional(),
      interval: z.number().int().min(5).max(10080).optional(),
    })
    .parse(req.body);
  Object.assign(s, b);
  if (b.interval)
    s.nextRun = new Date(Date.now() + b.interval * 60000).toISOString();
  schedules.save(s);
  res.json(s);
});
api.delete("/servers/:id/schedules/:scheduleId", (req, res) => {
  accessible(id(req), user(res));
  const s = schedules.get(String(req.params.scheduleId));
  assert(s && s.serverId === id(req), "Schedule not found.", 404);
  schedules.delete(s.id);
  res.json({ ok: true });
});
api.get("/servers/:id/autopilot", (req, res) => {
  accessible(id(req), user(res));
  res.json(getPolicy(id(req)));
});
api.put("/servers/:id/autopilot", (req, res) => {
  accessible(id(req), user(res));
  const b = z
    .object({
      recovery: z.boolean(),
      backup: z.boolean(),
      backupInterval: z.number().int().min(60).max(10080),
      idleSleep: z.boolean(),
      idleMinutes: z.number().int().min(5).max(1440),
      budgetAlert: z.boolean(),
      budget: z.number().min(1).max(100000),
    })
    .parse(req.body);
  const p = {
    ...b,
    serverId: id(req),
    lastAction: getPolicy(id(req)).lastAction,
  };
  savePolicy(p);
  log(
    user(res).id,
    "autopilot.updated",
    `Autopilot policy updated for ${getServer(id(req))!.name}`,
    "success",
    id(req),
  );
  res.json(p);
});
api.get("/servers/:id/plugins", async (req, res) => {
  accessible(id(req), user(res));
  res.json({
    installed: plugins.all(id(req)),
    results: await searchPlugins(
      String(req.query.query || ""),
      String(req.query.version || "1.21.4"),
    ),
  });
});
api.post("/servers/:id/plugins", async (req, res) => {
  const b = z
    .object({ projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) })
    .parse(req.body);
  res.status(201).json(await installPlugin(user(res), id(req), b.projectId));
});
api.delete("/servers/:id/plugins/:pluginId", async (req, res) => {
  await removePlugin(user(res), id(req), String(req.params.pluginId));
  res.json({ ok: true });
});
api.get("/billing", (req, res) =>
  res.json({
    balance: getUser(user(res).id)!.balance,
    invoices: invoices.all(user(res).id),
    plans,
  }),
);
api.post("/billing/demo-credit", (req, res) => {
  assert(
    config.mode === "demo",
    "Demo credits are disabled in production.",
    403,
  );
  const { amount } = z
    .object({
      amount: z
        .number()
        .int()
        .refine(
          (v) => [10000, 50000, 100000, 250000].includes(v),
          "Choose a listed amount.",
        ),
    })
    .parse(req.body);
  const i = credit(
    user(res).id,
    amount,
    "Demo wallet top-up · no real payment",
    "demo",
  );
  log(
    user(res).id,
    "billing.credit",
    "Demo funds added to your wallet",
    "success",
  );
  res.json({ invoice: i, balance: getUser(user(res).id)!.balance });
});
api.post("/billing/checkout", async (req, res) => {
  assert(
    process.env.STRIPE_SECRET_KEY && config.mode === "docker",
    "Stripe is not configured. Use the demo wallet in this preview.",
    503,
  );
  const { amount } = z
    .object({
      amount: z
        .number()
        .int()
        .refine((v) => [10000, 50000, 100000, 250000].includes(v)),
    })
    .parse(req.body);
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const invoiceId = uid("INV-");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "inr",
          product_data: { name: "ZK PANEL hosting credit" },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    client_reference_id: user(res).id,
    metadata: { invoiceId, userId: user(res).id },
    success_url: config.publicUrl + "/billing?checkout=" + invoiceId,
    cancel_url: config.publicUrl + "/billing?cancelled=1",
  });
  invoices.save({
    id: invoiceId,
    userId: user(res).id,
    description: "Hosting wallet top-up",
    amount,
    type: "credit",
    status: "pending",
    provider: "stripe",
    createdAt: now(),
  });
  setting("stripe-session:" + invoiceId, session.id);
  res.json({ url: session.url });
});
api.get("/billing/invoices/:invoiceId", (req, res) => {
  const i = invoices.get(id(req));
  assert(i && i.userId === user(res).id, "Invoice not found.", 404);
  res.json(i);
});
api.get("/billing/invoices/:invoiceId/receipt", (req, res) => {
  const i = invoices.get(id(req));
  assert(
    i && (i.userId === user(res).id || user(res).role === "admin"),
    "Invoice not found.",
    404,
  );
  const escape = (s: string) =>
    s.replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
    );
  res
    .type("html")
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><title>ZK receipt ${escape(i.id)}</title><style>body{font:16px system-ui;max-width:700px;margin:70px auto;color:#20271c}h1{color:#527c2d}td,th{padding:16px;text-align:left;border-bottom:1px solid #ddd}small{color:#777}</style></head><body><h1>ZK PANEL</h1><h2>Hosting wallet receipt</h2><p>${escape(i.id)}</p><p>${escape(i.createdAt)}</p><table width="100%"><tr><th>Description</th><th>Amount</th></tr><tr><td>${escape(i.description)}</td><td>₹${(i.amount / 100).toFixed(2)}</td></tr></table><p>Status: ${escape(i.status)} · ${escape(i.provider)} · ${escape(i.type)}</p><small>Wallet credit receipt, not a tax invoice. Hosting charges are deducted from your prepaid wallet. Provider: configure your legal business details before issuing tax invoices.</small><script>window.print()</script></body></html>`,
    );
});
api.post("/discord/link-code", (req, res) => {
  assert(
    process.env.DISCORD_BOT_TOKEN,
    "The Discord bot is not configured yet.",
    503,
  );
  db.prepare("DELETE FROM link_codes WHERE user_id=?").run(user(res).id);
  const code = randomBytes(6).toString("hex").toUpperCase();
  db.prepare("INSERT INTO link_codes(code,user_id,expires) VALUES(?,?,?)").run(
    hash(code),
    user(res).id,
    Date.now() + 10 * 60000,
  );
  res.json({ code, expiresIn: 600 });
});
api.delete("/discord/link", (req, res) => {
  db.prepare("UPDATE users SET discord_id=NULL WHERE id=?").run(user(res).id);
  log(
    user(res).id,
    "discord.unlinked",
    "Discord account disconnected",
    "warning",
  );
  res.json({ ok: true });
});
api.use("/admin", admin);
api.get("/admin/settings", (_req, res) => res.json({ ...panelSettings(), mode: config.mode, remoteOnly: config.remoteOnly, publicUrl: config.publicUrl }));
api.put("/admin/settings", (req, res) => {
  const b = z.object({ registration: z.boolean(), maxServers: z.number().int().min(1).max(1000) }).strict().parse(req.body);
  transaction(() => {
    setting("panel:registration", String(b.registration));
    setting("panel:max-servers", String(b.maxServers));
    log(user(res).id, "panel.settings.updated", "Panel registration and deployment limits updated", "warning");
  });
  res.json(panelSettings());
});
api.get("/admin/overview", (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const users = (db.prepare("SELECT id FROM users").all() as any[]).map((r) =>
    getUser(r.id),
  );
  res.json({
    users,
    servers: getServers().map(publicServer),
    nodes: nodes.all(),
    invoices: invoices.all(),
    revenue: invoices
      .all()
      .filter(
        (i) =>
          i.type === "credit" &&
          i.status === "paid" &&
          !["demo", "refund", "admin"].includes(i.provider),
      )
      .reduce((a, i) => a + i.amount, 0),
  });
});
api.patch("/admin/users/:userId", (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const b = z
    .object({
      suspended: z.boolean().optional(),
      role: z.enum(["admin", "user"]).optional(),
      credit: z.number().int().min(100).max(10000000).optional(),
      reason: z.string().max(200).optional(),
    })
    .parse(req.body);
  const target = getUser(String(req.params.userId));
  assert(target, "User not found.", 404);
  assert(
    target.id !== user(res).id,
    "You cannot change your own admin role or suspension.",
  );
  transaction(() => {
    if (b.suspended !== undefined)
      db.prepare("UPDATE users SET suspended=? WHERE id=?").run(
        Number(b.suspended),
        target.id,
      );
    if (b.role)
      db.prepare("UPDATE users SET role=? WHERE id=?").run(b.role, target.id);
    if (b.credit) {
      assert(b.reason, "A ledger adjustment reason is required.");
      credit(target.id, b.credit, "Admin adjustment: " + b.reason, "admin");
    }
    log(
      user(res).id,
      "admin.user.updated",
      `${target.email}: ${JSON.stringify(b)}`,
      "warning",
    );
  });
  res.json(getUser(target.id));
});
api.post("/admin/nodes", async (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const b = z
    .object({
      name: z.string().trim().min(2).max(60),
      region: z.string().trim().min(2).max(50),
      country: z.string().length(2),
      endpoint: z
        .string()
        .url()
        .refine(
          (v) => v.startsWith("https://") || config.mode === "demo",
          "Agent URLs must use HTTPS.",
        ),
      token: z.string().min(32).max(256),
      memory: z.number().int().min(1024).max(1048576),
      disk: z.number().int().min(10240).max(10485760),
      cpu: z.number().int().min(100).max(12800),
    })
    .parse(req.body);
  const { token, ...details } = b;
  const n: NodeInfo = {
    id: uid("node-"),
    ...details,
    country: b.country.toUpperCase(),
    status: "offline",
    usedMemory: 0,
    usedDisk: 0,
    usedCpu: 0,
    latency: 0,
    maintenance: false,
  };
  const start = Date.now();
  try {
    const r = await fetch(b.endpoint + "/health", {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(7000),
    });
    assert(r.ok, "Agent did not accept the node token.", 502);
    n.status = "online";
    n.latency = Date.now() - start;
  } catch (e) {
    throw new HttpError(
      502,
      "Could not verify this agent. Check its URL, TLS certificate and NODE_TOKEN.",
    );
  }
  nodes.save(n);
  setting("node-token:" + n.id, encrypt(token));
  log(user(res).id, "node.created", `${n.name} connected`, "success");
  res.status(201).json({ node: n });
});
api.post("/nodes/:id/check", async (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const n = nodes.get(id(req));
  assert(n, "Node not found.", 404);
  const start = Date.now();
  try {
    if (config.mode === "demo") {
      n.status = n.maintenance ? "maintenance" : "online";
    } else if (n.endpoint) {
      const r = await fetch(n.endpoint + "/health", {
        headers: { Authorization: "Bearer " + runtime.nodeToken(n.id) },
        signal: AbortSignal.timeout(7000),
      });
      assert(r.ok, "Agent health check failed.");
      const data = (await r.json()) as any;
      n.memory = Math.min(n.memory, Math.floor(data.memory));
      n.cpu = Math.min(n.cpu, data.cpu);
      n.status = n.maintenance ? "maintenance" : "online";
      n.latency = Date.now() - start;
    } else {
      const info = await dockerClient().info();
      n.memory = Math.floor(info.MemTotal / 1048576);
      n.cpu = info.NCPU * 100;
      n.status = n.maintenance ? "maintenance" : "online";
      n.latency = Date.now() - start;
    }
    const reserved = getServers().filter((s) => s.nodeId === n.id);
    n.usedMemory = reserved.reduce((a, s) => a + s.memory, 0);
    n.usedDisk = reserved.reduce((a, s) => a + s.disk, 0);
    n.usedCpu = reserved.reduce((a, s) => a + s.cpu, 0);
    nodes.save(n);
    res.json(n);
  } catch (e) {
    n.status = "offline";
    nodes.save(n);
    throw new HttpError(
      502,
      "Node is unreachable. Deployments were not changed.",
    );
  }
});
api.patch("/admin/nodes/:id", (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const n = nodes.get(id(req));
  assert(n, "Node not found.", 404);
  const b = z.object({ maintenance: z.boolean() }).parse(req.body);
  n.maintenance = b.maintenance;
  n.status = b.maintenance ? "maintenance" : n.status;
  nodes.save(n);
  res.json(n);
});
api.post("/admin/templates/import", (req, res) => {
  const b = z.object({ json: z.string().max(1024 * 1024) }).parse(req.body);
  let input: unknown;
  try {
    input = JSON.parse(b.json);
  } catch {
    throw new HttpError(400, "The file is not valid JSON.");
  }
  let parsed;
  try {
    parsed = parseZiynDocument(input);
  } catch (e) {
    throw new HttpError(
      400,
      e instanceof Error ? e.message : "Invalid template.",
    );
  }
  assert(!templates.get(parsed.id), "Template ID already exists.", 409);
  templates.save(parsed);
  log(
    user(res).id,
    "ziyn.imported",
    `${parsed.name} imported for administrator review`,
    "warning",
  );
  res.status(201).json(parsed);
});
api.patch("/admin/templates/:id", (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const t = templates.get(id(req));
  assert(t, "Template not found.", 404);
  const b = z.object({ enabled: z.boolean() }).parse(req.body);
  if (b.enabled)
    assert(
      config.mode === "demo" || config.imageAllowlist.includes(t.image),
      "Add this image to IMAGE_ALLOWLIST after reviewing its security first.",
    );
  t.enabled = b.enabled;
  templates.save(t);
  res.json(t);
});
api.get("/admin/templates/:id/export", (req, res) => {
  if (user(res).role !== "admin")
    throw new HttpError(403, "Administrator access required.");
  const t = templates.get(id(req));
  assert(t, "Template not found.", 404);
  res
    .attachment(t.id + ".ziyn.json")
    .json({ meta: { version: "ZIYN_v1", exported_at: now() }, ...t });
});

// Express 4 does not forward rejected async handlers automatically. Normalize
// every route handler here so validation/runtime errors reach the error boundary.
for (const layer of (api as any).stack) {
  if (!layer.route) continue;
  for (const routeLayer of layer.route.stack) {
    const handler = routeLayer.handle;
    routeLayer.handle = (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = handler(req, res, next);
        if (result && typeof result.catch === "function") result.catch(next);
        return result;
      } catch (error) {
        next(error);
      }
    };
  }
}
