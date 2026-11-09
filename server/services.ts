import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { config, assert, HttpError } from "./config.js";
import { panelSettings } from "./panel-settings.js";
import { plans, templateEnvironment } from "./catalog.js";
import {
  uid,
  now,
  transaction,
  getServers,
  getServer,
  saveServer,
  getUser,
  nodes,
  templates,
  debit,
  credit,
  invoices,
  log,
  backups,
  getPolicy,
  savePolicy,
  plugins,
  addLog,
  setting,
} from "./db.js";
import * as runtime from "./runtime.js";
import * as playit from "./playit.js";
import * as files from "./files.js";
import type {
  Server,
  User,
  PowerAction,
  Backup,
  Plugin,
  PluginSearchResult,
} from "../shared/types.js";

export const deploymentSchema = z.object({
  name: z.string().trim().min(2).max(48),
  description: z.string().max(180).default(""),
  templateId: z.string().max(80),
  nodeId: z.string().max(80),
  planId: z.string().max(30),
  environment: z.record(z.string(), z.string().max(4000)).default({}),
  version: z
    .string()
    .regex(/^[a-zA-Z0-9._-]{1,32}$/)
    .optional(),
});
export function accessible(id: string, user: User): Server {
  const s = getServer(id);
  assert(s, "Deployment not found.", 404);
  assert(
    s.ownerId === user.id || user.role === "admin",
    "You do not have access to this deployment.",
    403,
  );
  return s;
}
export function validateVariables(
  t: NonNullable<ReturnType<typeof templates.get>>,
  values: Record<string, string>,
) {
  const env = templateEnvironment(t);
  if (t.kind === "minecraft" && t.id !== "velocity")
    assert(
      values.EULA === "TRUE",
      "Accept the Minecraft EULA before saving startup settings.",
    );
  for (const v of t.variables) {
    const value = values[v.key] ?? v.default;
    assert(!v.required || value.trim().length > 0, `${v.label} is required.`);
    if (v.options)
      assert(
        v.options.includes(value),
        `${v.label} must be one of: ${v.options.join(", ")}.`,
      );
    if (v.rules) {
      assert(v.rules.length < 250, "Invalid template validation rule.");
      let regex: RegExp;
      try {
        regex = new RegExp(v.rules);
      } catch {
        throw new HttpError(400, "Invalid template validation rule.");
      }
      assert(regex.test(value), `${v.label} has an invalid value.`);
    }
    env[v.key] = value;
  }
  for (const [key, value] of Object.entries(values)) {
    assert(
      /^[A-Z_][A-Z0-9_]{0,63}$/.test(key),
      "Environment keys must use uppercase letters, numbers, and underscores.",
    );
    assert(
      t.variables.some((v) => v.key === key) ||
        ![
          "LD_PRELOAD",
          "DYLD_INSERT_LIBRARIES",
          "NODE_OPTIONS",
          "PYTHONPATH",
          "PATH",
          "SERVER_PORT",
          "PORT",
          "SERVER_MEMORY",
          "MEMORY",
          "HOME",
          "RCON_PASSWORD",
          "ENABLE_RCON",
        ].includes(key),
      "This environment key is reserved.",
    );
    env[key] = value;
  }
  return env;
}
export async function createDeployment(
  user: User,
  input: z.infer<typeof deploymentSchema>,
) {
  const t = templates.get(input.templateId);
  assert(t?.enabled, "Choose an enabled ZIYN template.");
  const plan = plans.find((p) => p.id === input.planId);
  assert(plan, "Choose a valid resource plan.");
  const node = nodes.get(input.nodeId);
  assert(
    node && !node.maintenance && node.status === "online",
    "Choose an available node.",
  );
  const environment = validateVariables(t, input.environment);
  if (input.version) environment.VERSION = input.version;
  assert(
    t.kind !== "minecraft" ||
      environment.EULA === "TRUE" ||
      t.id === "velocity",
    "Accept the Minecraft EULA before deploying.",
  );
  const id = uid("zk-");
  const created = transaction(() => {
    assert(
      getServers(user.id).length < panelSettings().maxServers,
      "Deployment limit reached. Contact your administrator.",
    );
    const reserved = getServers().filter(
      (s) => s.nodeId === node.id && !["error"].includes(s.status),
    );
    assert(
      reserved.reduce((a, s) => a + s.memory, 0) + plan.memory <= node.memory,
      "This node does not have enough available memory.",
    );
    assert(
      reserved.reduce((a, s) => a + s.disk, 0) + plan.disk <= node.disk,
      "This node does not have enough available disk.",
    );
    const used = new Set(reserved.map((s) => s.port));
    let port = Math.max(t.port, 20000);
    while (used.has(port)) port++;
    assert(port < 60000, "No free allocations on this node.");
    const invoice = debit(
      user.id,
      plan.price,
      `${plan.name} plan · ${input.name} · 30 days`,
      id,
    );
    const s: Server = {
      id,
      ownerId: user.id,
      name: input.name,
      description: input.description,
      kind: t.kind,
      templateId: t.id,
      software: t.name,
      version:
        environment.VERSION ||
        (t.id === "node" ? "22" : t.id === "python" ? "3.12" : t.version),
      nodeId: node.id,
      planId: plan.id,
      memory: plan.memory,
      cpu: plan.cpu,
      disk: plan.disk,
      port,
      address:
        node.id === "node-local"
          ? "127.0.0.1"
          : new URL(node.endpoint || "https://127.0.0.1").hostname,
      status: "installing",
      environment,
      monthlyCost: plan.price,
      createdAt: now(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      favorite: false,
    };
    saveServer(s);
    savePolicy({
      ...getPolicy(id),
      budget: Math.ceil((plan.price / 100) * 1.2),
    });
    log(
      user.id,
      "deployment.created",
      `${s.name} is being provisioned on ${node.region}`,
      "info",
      id,
    );
    return s;
  });
  busy.add(id);
  // Do not hold an HTTP request open while an image is pulled. Installation is observable.
  void (async () => {
    try {
      await files.initializeFiles(id, created.kind, created.name, created.templateId);
      const containerId = await runtime.provision(created);
      const latest = getServer(id);
      if (!latest) return;
      latest.containerId = containerId;
      latest.status = "running";
      saveServer(latest);
      setting("desired-state:" + id, "running");
      log(
        user.id,
        "deployment.ready",
        `${created.name} is ready`,
        "success",
        id,
      );
    } catch (e: any) {
      const latest = getServer(id);
      if (!latest) return;
      latest.status = "error";
      latest.error = String(e.message).slice(0, 500);
      saveServer(latest);
      transaction(() => {
        if (!setting("refund:" + id)) {
          credit(
            user.id,
            plan.price,
            `Refund · failed deployment ${created.name}`,
            "refund",
          );
          setting("refund:" + id, now());
        }
      });
      addLog(id, "Installation failed: " + latest.error, "error");
      log(
        user.id,
        "deployment.failed",
        `${created.name}: ${latest.error}. Your payment was refunded.`,
        "error",
        id,
      );
    } finally {
      busy.delete(id);
    }
  })();
  return created;
}
const busy = new Set<string>();
export async function changePower(
  user: User,
  id: string,
  action: PowerAction,
  reason = "Manual power action",
) {
  const s = accessible(id, user);
  assert(!busy.has(id), "Another power action is already in progress.", 409);
  assert(
    !["installing", "suspended"].includes(s.status),
    "This deployment cannot accept power actions yet.",
    409,
  );
  if (action === "start" || action === "restart")
    assert(
      new Date(s.expiresAt) > new Date(),
      "Renew this deployment before starting it.",
    );
  busy.add(id);
  try {
    if (
      action === "restart" &&
      s.kind === "minecraft" &&
      s.status === "running" &&
      config.mode === "docker"
    ) {
      try {
        await runtime.command(s, "save-all flush");
      } catch {}
    }
    s.status =
      action === "start" || action === "restart" ? "starting" : "stopping";
    saveServer(s);
    await runtime.power(s, action);
    s.status =
      action === "start" || action === "restart" ? "running" : "offline";
    s.error = undefined;
    saveServer(s);
    setting("desired-state:" + id, s.status);
    log(user.id, "server." + action, `${s.name}: ${reason}`, "info", id);
    return s;
  } catch (e) {
    const latest = getServer(id)!;
    latest.status = await runtime.status(latest);
    if (latest.status === "installing") latest.status = "error";
    latest.error = e instanceof Error ? e.message : "Power action failed";
    saveServer(latest);
    throw e;
  } finally {
    busy.delete(id);
  }
}
export async function deleteDeployment(user: User, id: string) {
  const s = accessible(id, user);
  assert(!busy.has(id), "Wait for the current power action to finish.", 409);
  busy.add(id);
  try {
    if (config.mode === "docker" && !config.remoteOnly && !nodes.get(s.nodeId)?.endpoint && s.kind === "minecraft") await playit.resetPlayit(s);
    await runtime.remove(s);
    for (const b of backups.all(id))
      await fs.rm(path.join(config.dataDir, "backups", b.id + ".tar.gz"), {
        force: true,
      });
    await fs.rm(files.workspace(id), { recursive: true, force: true });
    transaction(() => {
      database.prepare("DELETE FROM servers WHERE id=?").run(id);
      log(
        user.id,
        "deployment.deleted",
        `${s.name} was deleted. Prepaid time is non-refundable.`,
        "warning",
        id,
      );
    });
  } finally {
    busy.delete(id);
  }
}
import { db as database } from "./db.js";
export async function createBackup(
  user: User,
  id: string,
  name: string,
  automatic = false,
) {
  const s = accessible(id, user);
  const existing = backups.all(id);
  assert(
    existing.length < 5,
    "Backup limit reached (5). Delete an older backup first.",
  );
  assert(
    !existing.some((b) => b.status === "creating"),
    "A backup is already in progress.",
    409,
  );
  const b: Backup = {
    id: uid("bak_"),
    serverId: id,
    name: name.trim().slice(0, 70) || "Manual backup",
    size: 0,
    checksum: "",
    createdAt: now(),
    status: "creating",
  };
  backups.save(b);
  const dest = path.join(config.dataDir, "backups", b.id + ".tar.gz");
  try {
    if (
      config.mode === "docker" &&
      s.kind === "minecraft" &&
      s.status === "running"
    ) {
      await runtime.command(s, "save-off");
      await runtime.command(s, "save-all flush");
    }
    try {
      await runtime.archive(s, dest);
    } finally {
      if (
        config.mode === "docker" &&
        s.kind === "minecraft" &&
        s.status === "running"
      )
        try {
          await runtime.command(s, "save-on");
        } catch {}
    }
    const hash = createHash("sha256");
    let bytes = 0;
    await pipeline(
      createReadStream(dest),
      new Transform({
        transform(chunk, _enc, cb) {
          bytes += chunk.length;
          if (bytes > 500 * 1024 * 1024)
            cb(new Error("Backup exceeds the 500 MB download limit."));
          else cb(null, chunk);
        },
      }),
      async function* (source) {
        for await (const chunk of source) hash.update(chunk);
      },
    );
    b.size = bytes;
    b.checksum = hash.digest("hex");
    b.status = "ready";
    backups.save(b);
    log(
      user.id,
      "backup.completed",
      `${automatic ? "Autopilot backup" : "Backup"} completed for ${s.name}`,
      "success",
      id,
    );
    return b;
  } catch (e) {
    await fs.rm(dest, { force: true });
    b.status = "error";
    backups.save(b);
    throw e;
  }
}
export async function restoreBackup(user: User, id: string, backupId: string) {
  const s = accessible(id, user);
  const b = backups.get(backupId);
  assert(
    b && b.serverId === id && b.status === "ready",
    "Backup not found.",
    404,
  );
  assert(!busy.has(id), "Wait for the current power action to finish.", 409);
  busy.add(id);
  try {
    await runtime.restore(
      s,
      path.join(config.dataDir, "backups", b.id + ".tar.gz"),
    );
    log(
      user.id,
      "backup.restored",
      `${s.name} restored from ${b.name}`,
      "success",
      id,
    );
  } finally {
    busy.delete(id);
  }
}
export async function removeBackup(user: User, id: string, backupId: string) {
  accessible(id, user);
  const b = backups.get(backupId);
  assert(b && b.serverId === id, "Backup not found.", 404);
  await fs.rm(path.join(config.dataDir, "backups", b.id + ".tar.gz"), {
    force: true,
  });
  backups.delete(backupId);
}
export function downloadBackup(id: string, backupId: string) {
  const b = backups.get(backupId);
  assert(
    b && b.serverId === id && b.status === "ready",
    "Backup not found.",
    404,
  );
  return {
    stream: createReadStream(
      path.join(config.dataDir, "backups", b.id + ".tar.gz"),
    ),
    size: b.size,
    name: b.id + ".tar.gz",
  };
}
export function renew(user: User, id: string) {
  const s = accessible(id, user);
  return transaction(() => {
    const invoice = debit(
      user.id,
      s.monthlyCost,
      `Renewal · ${s.name} · 30 days`,
      id,
    );
    const base = Math.max(Date.now(), new Date(s.expiresAt).getTime());
    s.expiresAt = new Date(base + 30 * 86400000).toISOString();
    if (s.status === "suspended") s.status = "offline";
    saveServer(s);
    log(
      user.id,
      "deployment.renewed",
      `${s.name} renewed for 30 days`,
      "success",
      id,
    );
    return { server: s, invoice };
  });
}

const pluginCatalog: PluginSearchResult[] = [
  {
    project_id: "luckperms",
    title: "LuckPerms",
    description:
      "A permissions plugin for Minecraft servers. Give every player the right experience.",
    downloads: 12500000,
    author: "Luck",
    versions: ["1.21.4", "1.21.1", "1.20.6"],
  },
  {
    project_id: "essentialsx",
    title: "EssentialsX",
    description:
      "The essential toolkit: homes, warps, economy, and everyday server management.",
    downloads: 9200000,
    author: "EssentialsX Team",
    versions: ["1.21.4", "1.21.1", "1.20.6"],
  },
  {
    project_id: "worldedit",
    title: "WorldEdit",
    description:
      "Build bigger. A powerful in-game map editor for your Minecraft world.",
    downloads: 8400000,
    author: "EngineHub",
    versions: ["1.21.4", "1.21.1", "1.20.6"],
  },
  {
    project_id: "viaversion",
    title: "ViaVersion",
    description: "Allow newer Minecraft clients to connect to your server.",
    downloads: 7300000,
    author: "ViaVersion",
    versions: ["1.21.4", "1.21.1", "1.20.6"],
  },
  {
    project_id: "coreprotect",
    title: "CoreProtect",
    description:
      "Block logging and anti-griefing. Roll back damage without losing progress.",
    downloads: 4100000,
    author: "Intelli",
    versions: ["1.21.4", "1.21.1", "1.20.6"],
  },
  {
    project_id: "bluemap",
    title: "BlueMap",
    description:
      "A live 3D map of your Minecraft world, right in your browser.",
    downloads: 2800000,
    author: "Blue",
    versions: ["1.21.4", "1.21.1", "1.20.6"],
  },
];
export async function searchPlugins(query: string, version: string) {
  if (config.mode === "demo")
    return pluginCatalog.filter((p) =>
      (p.title + " " + p.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const facets = encodeURIComponent(
    JSON.stringify([
      ["project_type:mod"],
      [
        "categories:fabric",
        "categories:forge",
        "categories:paper",
        "categories:purpur",
        "categories:bukkit",
      ],
      ["versions:" + version],
    ]),
  );
  const r = await fetch(
    `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=12&facets=${facets}`,
    {
      headers: { "User-Agent": "ZK-PANEL/0.1 (hosting panel)" },
      signal: AbortSignal.timeout(10000),
    },
  );
  assert(r.ok, "Plugin catalog is temporarily unavailable.", 502);
  const data = (await r.json()) as any;
  return data.hits.map((p: any) => ({
    project_id: p.project_id,
    title: p.title,
    description: p.description,
    downloads: p.downloads,
    author: p.author,
    icon_url: p.icon_url,
    versions: p.versions,
  }));
}
async function safeDownload(url: string, maxBytes = 100 * 1024 * 1024) {
  let current = new URL(url);
  for (let i = 0; i < 4; i++) {
    assert(
      current.protocol === "https:" &&
        ["cdn.modrinth.com", "api.modrinth.com"].includes(current.hostname) &&
        !current.username &&
        !current.password,
      "Plugin download origin is not trusted.",
    );
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      headers: { "User-Agent": "ZK-PANEL/0.1" },
    });
    if (response.status >= 300 && response.status < 400) {
      assert(response.headers.get("location"), "Invalid download redirect.");
      current = new URL(response.headers.get("location")!, current);
      continue;
    }
    assert(response.ok && response.body, "Plugin download failed.");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      assert(size <= maxBytes, "Plugin file is too large.");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new HttpError(502, "Too many plugin download redirects.");
}
export async function installPlugin(user: User, id: string, projectId: string) {
  const s = accessible(id, user);
  assert(
    s.kind === "minecraft" && s.templateId !== "velocity",
    "Plugins require a Minecraft server, not a proxy.",
  );
  assert(
    !plugins.all(id).some((p) => p.projectId === projectId),
    "This plugin is already installed.",
  );
  assert(plugins.all(id).length < 50, "Plugin limit reached.");
  const loaders: Record<string, string> = {
    paper: "paper",
    purpur: "purpur",
    spigot: "bukkit",
    fabric: "fabric",
    forge: "forge",
    neoforge: "neoforge",
  };
  const loader = loaders[s.templateId];
  assert(
    loader,
    "This server software does not support the plugin catalog. Use mods for Fabric or Forge.",
  );
  let name = "",
    filename = "",
    version = "",
    description = "",
    buffer: Buffer,
    checksum = "";
  if (config.mode === "demo") {
    const p = pluginCatalog.find((p) => p.project_id === projectId);
    assert(p, "Demo plugin not found.", 404);
    name = p.title;
    filename = p.title.replace(/\s/g, "") + "-" + s.version + ".demo.json";
    version = s.version;
    description = p.description;
    buffer = Buffer.from(
      JSON.stringify(
        {
          demo: true,
          name,
          projectId,
          version,
          notice:
            "Demo metadata only; not an executable plugin. Connect Docker for real Modrinth installation.",
        },
        null,
        2,
      ),
    );
  } else {
    const r = await fetch(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}&game_versions=${encodeURIComponent(JSON.stringify([s.version]))}`,
      {
        headers: { "User-Agent": "ZK-PANEL/0.1" },
        signal: AbortSignal.timeout(10000),
      },
    );
    assert(r.ok, "Could not check plugin compatibility.", 502);
    const versions = (await r.json()) as any[];
    const v = versions[0];
    assert(
      v,
      "No compatible plugin build was found for this loader and Minecraft version.",
    );
    const file = v.files.find((f: any) => f.primary) || v.files[0];
    assert(file, "No downloadable plugin file.");
    buffer = await safeDownload(file.url);
    checksum = createHash("sha512").update(buffer).digest("hex");
    assert(
      checksum === file.hashes.sha512,
      "Plugin checksum verification failed.",
    );
    const project = (await (
      await fetch(
        `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}`,
        { headers: { "User-Agent": "ZK-PANEL/0.1" } },
      )
    ).json()) as any;
    name = project.title;
    description = project.description;
    filename = path.basename(file.filename);
    assert(filename.endsWith(".jar"), "Only JAR plugin files are supported.");
    version = v.version_number;
  }
  if (config.mode === "demo") {
    await runtime.write(s, "plugins/" + filename, buffer.toString("utf8"));
  } else if (nodes.get(s.nodeId)?.endpoint) {
    const r = await fetch(
      nodes.get(s.nodeId)!.endpoint +
        `/servers/${s.id}/files/upload?path=${encodeURIComponent("plugins/" + filename)}&disk=${s.disk}`,
      {
        method: "POST",
        body: new Uint8Array(buffer),
        headers: {
          Authorization: "Bearer " + runtime.nodeToken(s.nodeId),
          "Content-Type": "application/octet-stream",
        },
      },
    );
    assert(r.ok, "Could not save plugin to the node.", 502);
  } else {
    const target = await files.safePath(s.id, "plugins/" + filename);
    await fs.writeFile(target, buffer);
  }
  const p: Plugin = {
    id: uid("plg_"),
    serverId: id,
    projectId,
    name,
    description,
    version,
    filename,
    size: buffer.length,
    installedAt: now(),
    demo: config.mode === "demo",
  };
  plugins.save(p);
  log(
    user.id,
    "plugin.installed",
    `${name} added to ${s.name}${p.demo ? " (demo metadata)" : ""}`,
    "success",
    id,
  );
  return p;
}
export async function removePlugin(user: User, id: string, pluginId: string) {
  const s = accessible(id, user);
  const p = plugins.get(pluginId);
  assert(p && p.serverId === id, "Plugin not found.", 404);
  await runtime.deleteFile(s, "plugins/" + p.filename);
  plugins.delete(pluginId);
  log(
    user.id,
    "plugin.removed",
    `${p.name} removed from ${s.name}`,
    "info",
    id,
  );
}

// A panel restart can interrupt an in-flight provision/power request. Reconcile
// persisted transient states instead of leaving a deployment permanently stuck.
export async function reconcileDeployments() {
  for (const s of getServers()) {
    if (s.status === "installing") {
      s.status = "error";
      s.error =
        "Provisioning was interrupted by a panel restart. The initial charge was refunded; review and recreate this deployment.";
      saveServer(s);
      transaction(() => {
        if (!setting("refund:" + s.id)) {
          credit(
            s.ownerId,
            s.monthlyCost,
            `Refund · interrupted deployment ${s.name}`,
            "refund",
          );
          setting("refund:" + s.id, now());
        }
      });
      log(s.ownerId, "deployment.interrupted", s.error, "warning", s.id);
    } else if (
      config.mode === "docker" &&
      (s.status === "starting" || s.status === "stopping")
    ) {
      s.status = await runtime.status(s);
      if (s.status === "installing") s.status = "error";
      saveServer(s);
    }
  }
}
