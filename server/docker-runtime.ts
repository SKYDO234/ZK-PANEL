import Docker from "dockerode";
import fs from "node:fs/promises";
import { existsSync, createWriteStream, createReadStream } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import type { Server, Ziyn, Metrics, Status } from "../shared/types.js";
import { config, assert } from "./config.js";
import * as files from "./files.js";
import { runtimeImage } from "../shared/minecraft-runtime.js";

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
  const image = runtimeImage(t, s.environment);
  assert(
    config.imageAllowlist.includes(image),
    `The required image ${image} is not approved by the hosting administrator.`,
  );
  const root = files.workspace(s.id);
  await fs.mkdir(root, { recursive: true });
  if (config.mode === "docker" && process.getuid?.() === 0) {
    const uid = t.id === "website" ? 101 : 1000;
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
  const stream = await d.pull(image, {});
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
  if (s.kind === "minecraft" && s.templateId !== "velocity" && s.templateId !== "bedrock") {
    env.EULA = s.environment.EULA || "FALSE";
    env.MEMORY = Math.floor(s.memory * 0.75) + "M";
    env.ENABLE_RCON = "true";
    env.RCON_PASSWORD =
      s.environment.RCON_PASSWORD || randomBytes(24).toString("hex");
    env.ONLINE_MODE = env.ONLINE_MODE || "true";
  }
  if (s.templateId === "bedrock") {
    env.EULA = s.environment.EULA || "FALSE";
    // The panel assigns a UDP allocation for Bedrock; recent images default to NetherNet/TCP.
    env.TRANSPORT = "raknet";
  }
  const mount =
    s.kind === "minecraft"
      ? "/data"
      : t.id === "website"
        ? "/usr/share/nginx/html"
        : t.id === "redis"
          ? "/data"
          : "/home/container";
  const portKey = `${t.port}/${t.protocol}`;
  const c = await d.createContainer({
    name,
    Image: image,
    Hostname: s.id.slice(0, 12),
    User: t.id === "website" ? "101:101" : "1000:1000",
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
        `${path.join(config.workspaceHostPath, s.id)}:${mount}:${t.id === "website" ? "ro" : "rw"}`,
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
      : info.State.Dead || info.State.OOMKilled || (info.State.ExitCode !== 0 && info.State.StartedAt !== "0001-01-01T00:00:00Z")
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
export function dockerCpuPercent(stats: any): number {
  if (stats.precpu_stats?.cpu_usage?.total_usage == null || stats.precpu_stats?.system_cpu_usage == null) return 0;
  const cpu = Number(stats.cpu_stats?.cpu_usage?.total_usage || 0) - Number(stats.precpu_stats?.cpu_usage?.total_usage || 0);
  const system = Number(stats.cpu_stats?.system_cpu_usage || 0) - Number(stats.precpu_stats?.system_cpu_usage || 0);
  const cores = Number(stats.cpu_stats?.online_cpus || stats.cpu_stats?.cpu_usage?.percpu_usage?.length || 0);
  if (cpu <= 0 || system <= 0 || cores <= 0) return 0;
  return Math.round((cpu / system) * cores * 1000) / 10;
}
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
  const cpu = dockerCpuPercent(st);
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
    cpu,
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
// Docker's `since` is second-granularity; retain the full nanosecond timestamp
// and the occurrence count so multiple lines in one timestamp are not lost.
type Cursor = { timestamp: string; count: number };
const cursors = new Map<string, Cursor>();
export function selectLogLines(text: string, cursor?: Cursor): { lines: string[]; cursor?: Cursor } {
  let latest = cursor;
  let repeated = 0;
  let group = "";
  const lines: string[] = [];
  for (const line of text.split("\n").filter(Boolean)) {
    const match = line.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s(.*)$/);
    if (!match) { lines.push(line); continue; }
    const stamp = match[1].includes(".")
      ? match[1].replace(/\.(\d+)Z$/, (_, digits: string) => "." + digits.padEnd(9, "0") + "Z")
      : match[1].replace(/Z$/, ".000000000Z");
    if (stamp !== group) { group = stamp; repeated = 0; }
    repeated++;
    if (cursor && (stamp < cursor.timestamp || (stamp === cursor.timestamp && repeated <= cursor.count))) continue;
    lines.push(match[2]);
    if (!latest || stamp > latest.timestamp) latest = { timestamp: stamp, count: repeated };
    else if (stamp === latest.timestamp) latest = { timestamp: stamp, count: repeated };
  }
  return { lines, cursor: latest };
}
export async function readLogs(s: Server): Promise<string[]> {
  const cursor = cursors.get(s.id);
  const since = cursor ? Math.max(0, Math.floor(Date.parse(cursor.timestamp) / 1000) - 1) : 0;
  const buffer = (await docker().getContainer(containerName(s.id)).logs({
    stdout: true, stderr: true, tail: cursor ? 10000 : 500, since, timestamps: true,
  })) as unknown as Buffer;
  let text = buffer.toString("utf8");
  if (buffer.length > 8 && buffer[1] === 0 && buffer[2] === 0 && buffer[3] === 0) {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on("data", (chunk: Buffer) => chunks.push(chunk));
    const input = Readable.from([buffer]);
    dockerClient().modem.demuxStream(input as any, out, out);
    await new Promise<void>((resolve, reject) => { input.on("end", resolve); input.on("error", reject); });
    text = Buffer.concat(chunks).toString("utf8");
  }
  const result = selectLogLines(text, cursor);
  if (result.cursor) cursors.set(s.id, result.cursor);
  return result.lines;
}
export async function command(s: Server, line: string) {
  assert(line.length <= 2000, "Command is too long.");
  const c = docker().getContainer(containerName(s.id));
  if (s.kind === "minecraft" && !["velocity", "bedrock"].includes(s.templateId)) {
    const commandLine = line.trim().replace(/^\//, "");
    assert(commandLine.length > 0, "Enter a Minecraft command.");
    const exec = await c.exec({
      Cmd: ["rcon-cli", commandLine],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true });
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on("data", (chunk: Buffer) => chunks.push(chunk));
    c.modem.demuxStream(stream, out, out);
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const output = Buffer.concat(chunks).toString("utf8").trim();
    const result = await exec.inspect();
    if (result.ExitCode !== 0) throw new Error(output || `RCON command failed (exit ${result.ExitCode}). Is Minecraft ready?`);
    return output || "Command sent.";
  }
  const stream = await c.attach({ stream: true, stdin: true, hijack: true });
  stream.write(line + "\n");
  await new Promise((r) => setTimeout(r, 100));
  stream.end();
  return "Command sent to container stdin.";
}
