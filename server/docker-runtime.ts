import Docker from "dockerode";
import fs from "node:fs/promises";
import { existsSync, createWriteStream, createReadStream } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import type { Server, Ziyn, Metrics, Status } from "../shared/types.js";
import { config, assert } from "./config.js";
import * as files from "./files.js";

export function dockerClient() {
  return new Docker({ socketPath: config.dockerSocket, timeout: 15000 });
}
const docker = () => dockerClient();
const containerName = (id: string) => "zk-" + id.replace(/[^a-zA-Z0-9_-]/g, "");
export async function health() {
  const d = docker();
  const info = await d.info();
  const version = await d.version();
  return {
    status: "online",
    memory: Math.floor(info.MemTotal / 1048576),
    cpu: (info.NCPU || 1) * 100,
    disk: 512000,
    latency: 0,
    version: version.Version,
    containers: info.ContainersRunning,
  };
}
export async function provision(s: Server, t: Ziyn) {
  assert(
    config.imageAllowlist.includes(t.image),
    "This image is not approved by the hosting administrator.",
  );
  const root = files.workspace(s.id);
  await fs.mkdir(root, { recursive: true });
  if (config.mode === "docker" && process.getuid?.() === 0) {
    const uid = s.kind === "website" ? 101 : 1000;
    async function own(dir: string) {
      await fs.chown(dir, uid, uid);
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await own(p);
        else if (entry.isFile()) await fs.chown(p, uid, uid);
      }
    }
    await own(root);
  }
  const d = docker();
  const name = containerName(s.id);
  try {
    const old = d.getContainer(name);
    const info = await old.inspect();
    if (info.State.Running) await old.stop({ t: 20 });
    await old.remove();
  } catch (e: any) {
    if (e.statusCode !== 404) throw e;
  }
  const stream = await d.pull(t.image, {});
  await new Promise<void>((resolve, reject) =>
    d.modem.followProgress(stream, (err: any) =>
      err ? reject(err) : resolve(),
    ),
  );
  const env: Record<string, string> = {
    ...s.environment,
    SERVER_PORT: String(t.port),
    PORT: String(t.port),
    SERVER_MEMORY: String(s.memory),
    HOME: "/home/container",
  };
  if (s.kind === "minecraft") {
    env.EULA = s.environment.EULA || "FALSE";
    env.MEMORY = Math.floor(s.memory * 0.75) + "M";
    env.ENABLE_RCON = "true";
    env.RCON_PASSWORD =
      s.environment.RCON_PASSWORD || randomBytes(24).toString("hex");
    env.ONLINE_MODE = env.ONLINE_MODE || "true";
  }
  const mount =
    s.kind === "minecraft"
      ? "/data"
      : s.kind === "website"
        ? "/usr/share/nginx/html"
        : t.id === "redis"
          ? "/data"
          : "/home/container";
  const portKey = `${t.port}/${t.protocol}`;
  const c = await d.createContainer({
    name,
    Image: t.image,
    Hostname: s.id.slice(0, 12),
    User: s.kind === "website" ? "101:101" : "1000:1000",
    WorkingDir: mount,
    Cmd: t.command.length ? t.command : undefined,
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    OpenStdin: true,
    StdinOnce: false,
    Tty: true,
    Labels: { "zk.panel": "true", "zk.server": s.id, "zk.owner": s.ownerId },
    ExposedPorts: { [portKey]: {} },
    HostConfig: {
      Binds: [
        `${path.join(config.workspaceHostPath, s.id)}:${mount}:${s.kind === "website" ? "ro" : "rw"}`,
      ],
      PortBindings: {
        [portKey]: [{ HostIp: "0.0.0.0", HostPort: String(s.port) }],
      },
      Memory: s.memory * 1048576,
      MemorySwap: s.memory * 1048576,
      NanoCpus: s.cpu * 10000000,
      PidsLimit: 256,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: false,
      NetworkMode: "bridge",
      RestartPolicy: { Name: "no" },
      LogConfig: {
        Type: "json-file",
        Config: { "max-size": "10m", "max-file": "3" },
      },
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=268435456" },
    },
  });
  await c.start();
  return c.id;
}
export async function state(s: Server): Promise<Status> {
  try {
    const info = await docker().getContainer(containerName(s.id)).inspect();
    return info.State.Running
      ? "running"
      : info.State.Dead || info.State.OOMKilled
        ? "error"
        : "offline";
  } catch (e: any) {
    if (e.statusCode === 404) return "installing";
    throw e;
  }
}
export async function power(
  s: Server,
  action: "start" | "stop" | "restart" | "kill",
) {
  const c = docker().getContainer(containerName(s.id));
  if (action === "start") await c.start();
  else if (action === "stop") await c.stop({ t: 20 });
  else if (action === "kill") await c.kill({ signal: "SIGKILL" });
  else await c.restart({ t: 20 });
}
export async function remove(s: Server) {
  try {
    await docker()
      .getContainer(containerName(s.id))
      .remove({ force: true, v: true });
  } catch (e: any) {
    if (e.statusCode !== 404) throw e;
  }
}
const previous = new Map<string, { cpu: number; time: number }>();
export async function stats(s: Server): Promise<Omit<Metrics, "history">> {
  const c = docker().getContainer(containerName(s.id));
  const info = await c.inspect();
  if (!info.State.Running)
    return {
      cpu: 0,
      memory: 0,
      disk: Math.round((await files.usage(s.id)) / 1048576),
      networkIn: 0,
      networkOut: 0,
      uptime: 0,
    };
  const st = (await c.stats({ stream: false })) as any;
  const total = st.cpu_stats?.cpu_usage?.total_usage || 0,
    prev = previous.get(s.id);
  previous.set(s.id, { cpu: total, time: Date.now() });
  const delta = prev ? (Math.max(0, total - prev.cpu) / 1e9) * 100 : 0;
  const memory = Math.max(
    0,
    (st.memory_stats?.usage || 0) -
      (st.memory_stats?.stats?.inactive_file || 0),
  );
  let networkIn = 0,
    networkOut = 0;
  for (const net of Object.values(st.networks || {}) as any[]) {
    networkIn += net.rx_bytes || 0;
    networkOut += net.tx_bytes || 0;
  }
  return {
    cpu: Math.round(delta * 10) / 10,
    memory: Math.round(memory / 1048576),
    disk: Math.round((await files.usage(s.id)) / 1048576),
    networkIn: Math.round(networkIn / 1048576),
    networkOut: Math.round(networkOut / 1048576),
    uptime: Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(info.State.StartedAt).getTime()) / 1000,
      ),
    ),
  };
}
const cursors = new Map<string, number>();
export async function readLogs(s: Server): Promise<string[]> {
  const buffer = (await docker()
    .getContainer(containerName(s.id))
    .logs({
      stdout: true,
      stderr: true,
      tail: cursors.has(s.id) ? 100 : 80,
      since: cursors.get(s.id) || 0,
      timestamps: true,
    })) as unknown as Buffer;
  let text = buffer.toString("utf8");
  if (
    buffer.length > 8 &&
    buffer[0] !== 0x5b &&
    buffer[1] === 0 &&
    buffer[2] === 0
  ) {
    const out = new PassThrough();
    dockerClient().modem.demuxStream(Readable.from([buffer]) as any, out, out);
    text = out.read()?.toString("utf8") || "";
  }
  const lines = text.trim().split("\n").filter(Boolean);
  let max = cursors.get(s.id) || 0;
  const result: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d{4}-\d\d-\d\dT[\d:.]+)Z?\s?(.*)$/);
    if (match) {
      const seconds = new Date(match[1] + "Z").getTime() / 1000;
      if (seconds <= max) continue;
      max = seconds;
      result.push(match[2]);
    } else result.push(line);
  }
  if (max) cursors.set(s.id, max);
  return result;
}
export async function command(s: Server, line: string) {
  assert(line.length <= 2000, "Command is too long.");
  const c = docker().getContainer(containerName(s.id));
  if (s.kind === "minecraft" && s.templateId !== "velocity") {
    const exec = await c.exec({
      Cmd: ["rcon-cli", line],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true });
    const out = new PassThrough();
    c.modem.demuxStream(stream, out, out);
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return out.read()?.toString("utf8") || "Command sent.";
  }
  const stream = await c.attach({ stream: true, stdin: true, hijack: true });
  stream.write(line + "\n");
  await new Promise((r) => setTimeout(r, 100));
  stream.end();
  return "Command sent to container stdin.";
}
