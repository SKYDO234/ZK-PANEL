import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { config } from "./config.js";
import { catalog, plans, templateEnvironment } from "./catalog.js";
import type {
  User,
  Server,
  NodeInfo,
  Activity,
  Invoice,
  Backup,
  Schedule,
  Autopilot,
  Ziyn,
  Plugin,
  ConsoleLine,
} from "../shared/types.js";

export const db = new DatabaseSync(path.join(config.dataDir, "zk.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0), suspended INTEGER NOT NULL DEFAULT 0, discord_id TEXT UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), node_id TEXT NOT NULL REFERENCES nodes(id), port INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, server_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS backups(id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS autopilot(server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs(server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(server_id,seq));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS link_codes(code TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id); CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id); CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
`);
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_node_port ON servers(node_id,port) WHERE port>0",
);

export const uid = (prefix = "") =>
  prefix + randomUUID().replaceAll("-", "").slice(0, 16);
export const now = () => new Date().toISOString();
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const encryptionKey = createHash("sha256")
  .update(config.secret + ":secrets")
  .digest();
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    enc.toString("hex"),
  ].join(".");
}
export function decrypt(text: string) {
  const [iv, tag, data] = text.split(".");
  const d = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(iv, "hex"),
  );
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    d.update(Buffer.from(data, "hex")),
    d.final(),
  ]).toString("utf8");
}
let inTransaction = false;
export function transaction<T>(fn: () => T): T {
  if (inTransaction) return fn();
  inTransaction = true;
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    inTransaction = false;
  }
}
export function setting(key: string, value?: string) {
  if (value !== undefined)
    db.prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(key, value);
  return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as any)
    ?.value as string | undefined;
}
function all<T>(table: string): T[] {
  return (db.prepare(`SELECT data FROM ${table}`).all() as any[]).map((r) =>
    JSON.parse(r.data),
  );
}
function one<T>(table: string, id: string): T | undefined {
  const row = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as any;
  return row ? JSON.parse(row.data) : undefined;
}
function save(table: string, id: string, data: any) {
  if (["backups", "schedules", "plugins"].includes(table))
    db.prepare(
      `INSERT INTO ${table}(id,server_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    ).run(id, data.serverId, JSON.stringify(data));
  else if (table === "invoices")
    db.prepare(
      "INSERT INTO invoices(id,user_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(id, data.userId, JSON.stringify(data));
  else if (table === "activity")
    db.prepare(
      "INSERT INTO activity(id,user_id,server_id,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(id, data.userId, data.serverId || null, JSON.stringify(data));
  else
    db.prepare(
      `INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    ).run(id, JSON.stringify(data));
}
export function getUser(id: string): User | undefined {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id) as any;
  return u
    ? {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        balance: u.balance,
        suspended: !!u.suspended,
        discordId: u.discord_id || undefined,
        createdAt: u.created_at,
      }
    : undefined;
}
export function userByDiscord(id: string) {
  const row = db
    .prepare("SELECT id FROM users WHERE discord_id=?")
    .get(id) as any;
  return row ? getUser(row.id) : undefined;
}
export const templates = {
  all: () => all<Ziyn>("templates"),
  get: (id: string) => one<Ziyn>("templates", id),
  save: (t: Ziyn) => save("templates", t.id, t),
};
export const nodes = {
  all: () => all<NodeInfo>("nodes"),
  get: (id: string) => one<NodeInfo>("nodes", id),
  save: (n: NodeInfo) => save("nodes", n.id, n),
};
function decodeServer(s: Server): Server {
  return {
    ...s,
    environment: Object.fromEntries(
      Object.entries(s.environment).map(([k, v]) => [
        k,
        v.startsWith("enc:v1:") ? decrypt(v.slice(7)) : v,
      ]),
    ),
  };
}
export function getServers(userId?: string): Server[] {
  const rows = userId
    ? db.prepare("SELECT data FROM servers WHERE owner_id=?").all(userId)
    : db.prepare("SELECT data FROM servers").all();
  return (rows as any[]).map((r) => decodeServer(JSON.parse(r.data)));
}
export function getServer(id: string): Server | undefined {
  const row = db.prepare("SELECT data FROM servers WHERE id=?").get(id) as any;
  return row ? decodeServer(JSON.parse(row.data)) : undefined;
}
export function saveServer(s: Server, ownerId = s.ownerId, nodeId = s.nodeId) {
  s = {
    ...s,
    environment: Object.fromEntries(
      Object.entries(s.environment).map(([k, v]) => [
        k,
        /TOKEN|PASSWORD|SECRET|API_KEY/.test(k) && !v.startsWith("enc:v1:")
          ? "enc:v1:" + encrypt(v)
          : v,
      ]),
    ),
  };
  db.prepare(
    "INSERT INTO servers(id,owner_id,node_id,port,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(s.id, ownerId, nodeId, s.port, JSON.stringify(s));
}
export const invoices = {
  all: (userId?: string) =>
    all<Invoice>("invoices")
      .filter((i) => !userId || i.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string) => one<Invoice>("invoices", id),
  save: (i: Invoice) => save("invoices", i.id, i),
};
export function log(
  userId: string,
  action: string,
  detail: string,
  severity: Activity["severity"] = "info",
  serverId?: string,
): Activity {
  const a = {
    id: uid("act_"),
    userId,
    serverId,
    action,
    detail,
    severity,
    createdAt: now(),
  };
  save("activity", a.id, a);
  return a;
}
export function activities(userId?: string, limit = 50) {
  return all<Activity>("activity")
    .filter((a) => !userId || a.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
export const backups = {
  all: (serverId: string) =>
    all<Backup>("backups")
      .filter((b) => b.serverId === serverId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string) => one<Backup>("backups", id),
  save: (b: Backup) => save("backups", b.id, b),
  delete: (id: string) => db.prepare("DELETE FROM backups WHERE id=?").run(id),
};
export const schedules = {
  all: (serverId?: string) =>
    all<Schedule>("schedules").filter(
      (s) => !serverId || s.serverId === serverId,
    ),
  get: (id: string) => one<Schedule>("schedules", id),
  save: (s: Schedule) => save("schedules", s.id, s),
  delete: (id: string) =>
    db.prepare("DELETE FROM schedules WHERE id=?").run(id),
};
export function getPolicy(serverId: string): Autopilot {
  const row = db
    .prepare("SELECT data FROM autopilot WHERE server_id=?")
    .get(serverId) as any;
  return row
    ? JSON.parse(row.data)
    : {
        serverId,
        recovery: true,
        backup: true,
        backupInterval: 1440,
        idleSleep: false,
        idleMinutes: 30,
        budgetAlert: true,
        budget: 1000,
      };
}
export function savePolicy(p: Autopilot) {
  db.prepare(
    "INSERT INTO autopilot(server_id,data) VALUES(?,?) ON CONFLICT(server_id) DO UPDATE SET data=excluded.data",
  ).run(p.serverId, JSON.stringify(p));
}
export const plugins = {
  all: (serverId: string) =>
    all<Plugin>("plugins").filter((p) => p.serverId === serverId),
  save: (p: Plugin) => save("plugins", p.id, p),
  get: (id: string) => one<Plugin>("plugins", id),
  delete: (id: string) => db.prepare("DELETE FROM plugins WHERE id=?").run(id),
};
export function addLog(
  serverId: string,
  message: string,
  level: ConsoleLine["level"] = "info",
) {
  db.prepare("INSERT INTO logs(server_id,seq,data) VALUES(?,?,?)").run(
    serverId,
    Date.now() * 100 + Math.floor(Math.random() * 100),
    JSON.stringify({ id: uid(), time: now(), level, message }),
  );
  db.prepare(
    "DELETE FROM logs WHERE server_id=? AND seq NOT IN (SELECT seq FROM logs WHERE server_id=? ORDER BY seq DESC LIMIT 500)",
  ).run(serverId, serverId);
}
export function getLogs(serverId: string) {
  return (
    db
      .prepare(
        "SELECT data FROM logs WHERE server_id=? ORDER BY seq ASC LIMIT 500",
      )
      .all(serverId) as any[]
  ).map((r) => JSON.parse(r.data));
}
export function debit(
  userId: string,
  amount: number,
  description: string,
  serverId?: string,
  provider = "wallet",
) {
  return transaction(() => {
    const u = getUser(userId);
    if (!u || u.balance < amount)
      throw new Error("Insufficient wallet balance. Add funds to continue.");
    db.prepare(
      "UPDATE users SET balance=balance-? WHERE id=? AND balance>=?",
    ).run(amount, userId, amount);
    const i: Invoice = {
      id: uid("INV-"),
      userId,
      description,
      amount,
      type: "debit",
      status: "paid",
      provider,
      serverId,
      createdAt: now(),
    };
    invoices.save(i);
    return i;
  });
}
export function credit(
  userId: string,
  amount: number,
  description: string,
  provider = "wallet",
) {
  return transaction(() => {
    db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(
      amount,
      userId,
    );
    const i: Invoice = {
      id: uid("INV-"),
      userId,
      description,
      amount,
      type: "credit",
      status: "paid",
      provider,
      createdAt: now(),
    };
    invoices.save(i);
    return i;
  });
}

export function seed() {
  for (const t of catalog)
    if (!templates.get(t.id))
      templates.save({
        ...t,
        enabled:
          config.mode === "demo" || config.imageAllowlist.includes(t.image),
      });
  if (config.mode === "docker") return;
  if (getUser("demo-user")) return;
  const time = now();
  db.prepare(
    "INSERT INTO users(id,email,name,password,role,balance,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    "demo-user",
    "alex@zk.demo",
    "Alex Morgan",
    "!disabled",
    "admin",
    0,
    time,
  );
  const demoNodes: NodeInfo[] = [
    {
      id: "node-mumbai",
      name: "Mumbai · Node 01",
      region: "Mumbai",
      country: "IN",
      endpoint: "",
      status: "online",
      memory: 65536,
      disk: 512000,
      cpu: 1600,
      usedMemory: 21504,
      usedDisk: 128000,
      usedCpu: 340,
      latency: 12,
      maintenance: false,
    },
    {
      id: "node-singapore",
      name: "Singapore · Node 02",
      region: "Singapore",
      country: "SG",
      endpoint: "",
      status: "online",
      memory: 65536,
      disk: 512000,
      cpu: 1600,
      usedMemory: 12288,
      usedDisk: 76800,
      usedCpu: 220,
      latency: 48,
      maintenance: false,
    },
    {
      id: "node-frankfurt",
      name: "Frankfurt · Node 03",
      region: "Frankfurt",
      country: "DE",
      endpoint: "",
      status: "online",
      memory: 32768,
      disk: 256000,
      cpu: 800,
      usedMemory: 4096,
      usedDisk: 20480,
      usedCpu: 85,
      latency: 118,
      maintenance: false,
    },
  ];
  demoNodes.forEach(nodes.save);
  const specs: [
    string,
    string,
    Server["kind"],
    string,
    string,
    string,
    Server["status"],
    string,
  ][] = [
    [
      "survival-smp",
      "Survival SMP",
      "minecraft",
      "paper",
      "1.21.4",
      "orbit",
      "running",
      "node-mumbai",
    ],
    [
      "skyblock",
      "SkyBlock Universe",
      "minecraft",
      "purpur",
      "1.21.4",
      "boost",
      "running",
      "node-mumbai",
    ],
    [
      "velocity-proxy",
      "Velocity Network",
      "minecraft",
      "velocity",
      "3.4",
      "sprout",
      "running",
      "node-singapore",
    ],
    [
      "discord-bot",
      "Community Bot",
      "bot",
      "node",
      "22",
      "sprout",
      "running",
      "node-singapore",
    ],
    [
      "portfolio",
      "My Portfolio",
      "website",
      "website",
      "1.27",
      "sprout",
      "running",
      "node-frankfurt",
    ],
    [
      "rust-world",
      "Rust · The Outpost",
      "game",
      "rust-game",
      "latest",
      "orbit",
      "offline",
      "node-singapore",
    ],
  ];
  let port = 25565;
  for (const [
    id,
    name,
    kind,
    templateId,
    version,
    planId,
    status,
    nodeId,
  ] of specs) {
    const t = templates.get(templateId)!;
    const plan = plans.find((p) => p.id === planId)!;
    const environment = templateEnvironment(t);
    if (t.id === "velocity") environment.TYPE = "VELOCITY";
    const s: Server = {
      id,
      ownerId: "demo-user",
      name,
      description:
        kind === "minecraft"
          ? "A place for your next adventure."
          : `${name}, powered by ZK.`,
      kind,
      templateId,
      software: t.name,
      version,
      nodeId,
      planId,
      memory: plan.memory,
      cpu: plan.cpu,
      disk: plan.disk,
      port: port++,
      address: "127.0.0.1",
      status,
      environment,
      monthlyCost: plan.price,
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 18 * 86400000).toISOString(),
      favorite: ["survival-smp", "discord-bot"].includes(id),
    };
    saveServer(s);
    savePolicy(getPolicy(id));
    addLog(
      id,
      "[ZK] Demo container initialized. No real compute is being used.",
      "info",
    );
    if (status === "running") {
      addLog(
        id,
        `[ZK] Starting ${t.name} ${version} on allocated port ${s.port}`,
      );
      addLog(id, "[ZK] Environment validated. Persistent storage mounted.");
      addLog(
        id,
        t.kind === "minecraft"
          ? '[Server thread/INFO]: Done (3.214s)! For help, type "help"'
          : "[ZK] Application is ready and accepting connections.",
        "info",
      );
      addLog(
        id,
        "[Autopilot] Crash recovery and scheduled backups are enabled.",
        "info",
      );
    }
  }
  credit("demo-user", 500000, "Welcome credit · demo funds", "demo");
  debit(
    "demo-user",
    255000,
    "Monthly hosting · 6 demo deployments",
    "survival-smp",
    "demo",
  );
  log(
    "demo-user",
    "backup.completed",
    "Nightly backup completed for Survival SMP",
    "success",
    "survival-smp",
  );
  log(
    "demo-user",
    "server.started",
    "Community Bot is online",
    "success",
    "discord-bot",
  );
  log(
    "demo-user",
    "autopilot.enabled",
    "Autopilot is watching over your deployments",
    "success",
  );
  log(
    "demo-user",
    "deployment.created",
    "My Portfolio deployed to Frankfurt",
    "info",
    "portfolio",
  );
  setting("seeded", "true");
}
seed();
