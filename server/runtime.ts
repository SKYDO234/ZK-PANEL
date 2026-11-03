import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { config, assert, HttpError } from "./config.js";
import {
  nodes,
  getServer,
  saveServer,
  templates,
  addLog,
  getLogs,
  decrypt,
  setting,
} from "./db.js";
import * as docker from "./docker-runtime.js";
import * as files from "./files.js";
import type {
  Server,
  Status,
  Metrics,
  ConsoleLine,
  FileEntry,
} from "../shared/types.js";
const histories = new Map<string, Metrics["history"]>();
export function nodeToken(id: string) {
  const enc = setting("node-token:" + id);
  return enc ? decrypt(enc) : "";
}
export async function remote<T = any>(
  s: Server,
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const n = nodes.get(s.nodeId);
  assert(n?.endpoint, "Remote node has no agent URL.", 503);
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + nodeToken(n.id));
  const response = await fetch(n.endpoint.replace(/\/$/, "") + route, {
    ...options,
    headers,
    signal: AbortSignal.timeout(route.includes("/provision") ? 600000 : 30000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(502, `Node agent: ${body.slice(0, 300)}`);
  }
  if (response.headers.get("content-type")?.includes("application/json"))
    return response.json();
  return undefined as T;
}
export async function provision(s: Server) {
  const t = templates.get(s.templateId)!;
  if (config.mode === "demo") {
    await new Promise((r) => setTimeout(r, 1600));
    addLog(
      s.id,
      "[ZK DEMO] Deployment initialized. This is a simulated runtime.",
      "info",
    );
    addLog(
      s.id,
      `[ZK DEMO] ${t.name} is ready. Try the console, files, backups, and Autopilot.`,
    );
    return "demo-" + s.id;
  }
  return s.nodeId === "node-local" || !nodes.get(s.nodeId)?.endpoint
    ? docker.provision(s, t)
    : remote(s, "/servers/" + s.id + "/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: s, template: t }),
      });
}
export async function power(
  s: Server,
  action: "start" | "stop" | "restart" | "kill",
) {
  if (config.mode === "demo") {
    if (action === "start" || action === "restart") {
      if (action === "restart")
        addLog(s.id, "[ZK DEMO] Graceful restart requested.");
      addLog(s.id, "[ZK DEMO] Container started. Application ready.");
    } else
      addLog(s.id, "[ZK DEMO] Container stopped. Persistent files are safe.");
    return;
  }
  const n = nodes.get(s.nodeId);
  if (n?.endpoint)
    return remote(s, `/servers/${s.id}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        server: s,
        template: templates.get(s.templateId),
      }),
    });
  if (action === "start" || action === "restart")
    return docker.provision(s, templates.get(s.templateId)!);
  return docker.power(s, action);
}

export async function status(s: Server): Promise<Status> {
  if (config.mode === "demo" || ["installing", "suspended"].includes(s.status))
    return s.status;
  try {
    return nodes.get(s.nodeId)?.endpoint
      ? await remote<Status>(s, `/servers/${s.id}/state`)
      : await docker.state(s);
  } catch {
    return "error";
  }
}
export async function remove(s: Server) {
  if (config.mode === "demo") return;
  if (nodes.get(s.nodeId)?.endpoint)
    return remote(s, `/servers/${s.id}`, { method: "DELETE" });
  return docker.remove(s);
}
export async function command(s: Server, line: string) {
  assert(
    s.status === "running",
    "Start this deployment before sending commands.",
  );
  addLog(s.id, line, "command");
  if (config.mode === "demo") {
    const cmd = line.trim().replace(/^\//, "").toLowerCase();
    let reply =
      "Demo command received. Connect a Docker node to execute real server commands.";
    if (cmd === "help")
      reply =
        "Available demo commands: help, list, say <message>, time set day, weather clear, tps, stop";
    else if (cmd === "list")
      reply = "There are 0 of a max of 20 players online (demo runtime).";
    else if (cmd.startsWith("say "))
      reply = "[Server] " + line.slice(line.toLowerCase().indexOf("say ") + 4);
    else if (cmd === "tps")
      reply = "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0 (simulated)";
    else if (cmd.startsWith("time set"))
      reply = "Set the time to 1000 (simulated).";
    else if (cmd.startsWith("weather"))
      reply = "Changing to clear weather (simulated).";
    else if (cmd === "stop")
      reply = "Use the Stop button to change the demo container state.";
    addLog(s.id, "[ZK DEMO] " + reply);
    return reply;
  }
  const result = nodes.get(s.nodeId)?.endpoint
    ? await remote<{ output: string }>(s, `/servers/${s.id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: line,
          kind: s.kind,
          templateId: s.templateId,
        }),
      })
    : { output: await docker.command(s, line) };
  if (result.output) addLog(s.id, result.output);
  return result.output;
}
export async function syncLogs(s: Server) {
  if (config.mode === "demo" || s.status !== "running") return;
  try {
    const lines = nodes.get(s.nodeId)?.endpoint
      ? (await remote<{ lines: string[] }>(s, `/servers/${s.id}/logs`)).lines
      : await docker.readLogs(s);
    for (const line of lines)
      addLog(
        s.id,
        line,
        /ERROR|Exception/i.test(line)
          ? "error"
          : /WARN/i.test(line)
            ? "warn"
            : "info",
      );
  } catch {}
}
export async function metrics(s: Server): Promise<Metrics> {
  let values: Omit<Metrics, "history">;
  if (config.mode === "demo") {
    const phase = Date.now() / 40000 + s.port;
    const active = s.status === "running";
    values = {
      cpu: active ? Math.round((18 + Math.sin(phase) * 9) * 10) / 10 : 0,
      memory: active
        ? Math.round(s.memory * (0.37 + Math.sin(phase / 2) * 0.025))
        : 0,
      disk: Math.round((await files.usage(s.id)) / 1048576),
      networkIn: active ? 1240 : 0,
      networkOut: active ? 860 : 0,
      uptime: active
        ? 354120 +
          (Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 1000) %
            3600)
        : 0,
      ...(s.kind === "minecraft"
        ? { players: s.templateId === "velocity" ? 0 : 8, maxPlayers: 20 }
        : {}),
    };
  } else {
    values =
      s.status === "running"
        ? nodes.get(s.nodeId)?.endpoint
          ? await remote(s, `/servers/${s.id}/stats`)
          : await docker.stats(s)
        : {
            cpu: 0,
            memory: 0,
            disk: 0,
            networkIn: 0,
            networkOut: 0,
            uptime: 0,
          };
  }
  const history =
    histories.get(s.id) ||
    Array.from({ length: 20 }, (_, i) => ({
      time: new Date(Date.now() - (19 - i) * 5000).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      cpu:
        config.mode === "demo" && s.status === "running"
          ? Math.max(0, values.cpu + Math.sin(i * 1.2) * 8)
          : 0,
      memory:
        config.mode === "demo" && s.status === "running"
          ? Math.round(values.memory * (0.95 + Math.sin(i) * 0.04))
          : 0,
    }));
  history.push({
    time: new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    cpu: values.cpu,
    memory: values.memory,
  });
  if (history.length > 30) history.shift();
  histories.set(s.id, history);
  return { ...values, history };
}
export async function logs(s: Server): Promise<ConsoleLine[]> {
  await syncLogs(s);
  return getLogs(s.id);
}
export async function list(s: Server, dir: string): Promise<FileEntry[]> {
  return nodes.get(s.nodeId)?.endpoint && config.mode === "docker"
    ? remote(s, `/servers/${s.id}/files?dir=${encodeURIComponent(dir)}`)
    : files.listFiles(s.id, dir);
}
export async function read(s: Server, file: string): Promise<string> {
  return nodes.get(s.nodeId)?.endpoint && config.mode === "docker"
    ? (
        await remote<{ content: string }>(
          s,
          `/servers/${s.id}/files/read?path=${encodeURIComponent(file)}`,
        )
      ).content
    : files.readFile(s.id, file);
}
export async function write(s: Server, file: string, content: string) {
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker")
    return remote(s, `/servers/${s.id}/files/write?disk=${s.disk}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, content }),
    });
  return files.writeFile(s.id, file, content, s.disk);
}
export async function mkdir(s: Server, file: string) {
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker")
    return remote(s, `/servers/${s.id}/files/mkdir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file }),
    });
  return files.makeDirectory(s.id, file);
}
export async function deleteFile(s: Server, file: string) {
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker")
    return remote(
      s,
      `/servers/${s.id}/files?path=${encodeURIComponent(file)}`,
      { method: "DELETE" },
    );
  return files.deleteFile(s.id, file);
}
export async function rename(s: Server, from: string, to: string) {
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker")
    return remote(s, `/servers/${s.id}/files/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
  return files.renameFile(s.id, from, to);
}
export async function upload(s: Server, file: string, body: Buffer) {
  assert(body.length <= 100 * 1024 * 1024, "Upload limit is 100 MB.");
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker")
    return remote(
      s,
      `/servers/${s.id}/files/upload?path=${encodeURIComponent(file)}&disk=${s.disk}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(body),
      },
    );
  return files.uploadFile(s.id, file, Readable.from(body), s.disk, body.length);
}
export async function download(
  s: Server,
  file: string,
): Promise<{ stream: Readable; size: number; name: string }> {
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker") {
    const n = nodes.get(s.nodeId)!;
    const response = await fetch(
      n.endpoint +
        `/servers/${s.id}/files/download?path=${encodeURIComponent(file)}`,
      {
        headers: { Authorization: "Bearer " + nodeToken(n.id) },
        signal: AbortSignal.timeout(60000),
      },
    );
    assert(response.ok && response.body, "File could not be downloaded.", 502);
    return {
      stream: Readable.fromWeb(response.body as any),
      size: Number(response.headers.get("content-length") || 0),
      name: path.basename(file),
    };
  }
  return files.downloadFile(s.id, file);
}
export async function archive(s: Server, destination: string) {
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker") {
    const n = nodes.get(s.nodeId)!;
    const response = await fetch(n.endpoint + `/servers/${s.id}/archive`, {
      headers: { Authorization: "Bearer " + nodeToken(n.id) },
      signal: AbortSignal.timeout(300000),
    });
    assert(response.ok && response.body, "Node backup failed.", 502);
    const { pipeline } = await import("node:stream/promises");
    const { createWriteStream } = await import("node:fs");
    await pipeline(
      Readable.fromWeb(response.body as any),
      createWriteStream(destination),
    );
  } else await files.archiveWorkspace(s.id, destination);
}
export async function restore(s: Server, source: string) {
  assert(
    s.status === "offline",
    "Stop the deployment before restoring a backup.",
  );
  if (nodes.get(s.nodeId)?.endpoint && config.mode === "docker") {
    const n = nodes.get(s.nodeId)!;
    const { openAsBlob } = await import("node:fs");
    const blob = await openAsBlob(source);
    const r = await fetch(
      n.endpoint +
        `/servers/${s.id}/restore?disk=${s.disk}&uid=${s.kind === "website" ? 101 : 1000}`,
      {
        method: "POST",
        body: blob,
        headers: {
          Authorization: "Bearer " + nodeToken(n.id),
          "Content-Type": "application/octet-stream",
        },
        signal: AbortSignal.timeout(300000),
      },
    );
    assert(r.ok, "Restore failed: " + (await r.text()).slice(0, 200), 502);
  } else
    await files.restoreWorkspace(
      s.id,
      source,
      s.disk,
      s.kind === "website" ? 101 : 1000,
    );
}
