import fs from "node:fs/promises";
import {
  createReadStream,
  createWriteStream,
  constants as fsConstants,
} from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import * as tar from "tar";
import { config, assert } from "./config.js";
import type { FileEntry } from "../shared/types.js";
export const workspace = (id: string) =>
  path.join(config.dataDir, "workspaces", id);
export async function safePath(id: string, relative = ""): Promise<string> {
  assert(
    !relative.includes("\0") &&
      !relative.includes("\\") &&
      !path.isAbsolute(relative),
    "Invalid file path.",
  );
  const root = workspace(id);
  const dest = path.resolve(root, relative);
  assert(
    dest === root || dest.startsWith(root + path.sep),
    "Path is outside this deployment.",
    403,
  );
  await fs.mkdir(root, { recursive: true });
  let current = root;
  for (const part of path
    .relative(root, dest)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      assert(
        !("isSymbolicLink" in stat && stat.isSymbolicLink()),
        "Symbolic links are not allowed.",
        403,
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return dest;
}
// Hold each parent directory open with O_NOFOLLOW. A workload cannot swap a
// checked directory for a symlink between validation and the final file open.
export async function openSafe(
  id: string,
  relative: string,
  flags: number,
): Promise<import("node:fs/promises").FileHandle> {
  assert(
    !relative.includes("\0") &&
      !relative.includes("\\") &&
      !path.isAbsolute(relative),
    "Invalid file path.",
    403,
  );
  const parts = relative.split("/").filter(Boolean);
  assert(
    parts.length > 0 && parts.every((p) => p !== "." && p !== ".."),
    "Invalid file path.",
    403,
  );
  await fs.mkdir(workspace(id), { recursive: true });
  const handles: import("node:fs/promises").FileHandle[] = [];
  try {
    let dir = await fs.open(
      workspace(id),
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    handles.push(dir);
    for (const part of parts.slice(0, -1)) {
      const next = await fs.open(
        "/proc/self/fd/" + dir.fd + "/" + part,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
      );
      handles.push(next);
      dir = next;
    }
    return await fs.open(
      "/proc/self/fd/" + dir.fd + "/" + parts.at(-1),
      flags | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (e: any) {
    if (["ELOOP", "ENOTDIR"].includes(e.code))
      throw new Error("Symbolic links are not allowed.");
    throw e;
  } finally {
    for (const h of handles) await h.close();
  }
}
const workspaceLocks = new Map<string, Promise<void>>();
async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = workspaceLocks.get(id) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  workspaceLocks.set(id, current);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (workspaceLocks.get(id) === current) workspaceLocks.delete(id);
  }
}
async function parentDirectory(id: string, relative: string, create = false) {
  assert(
    !relative.includes("\0") &&
      !relative.includes("\\") &&
      !path.isAbsolute(relative),
    "Invalid file path.",
    403,
  );
  const parts = relative.split("/").filter(Boolean);
  assert(
    parts.length && parts.every((p) => p !== "." && p !== ".."),
    "Invalid file path.",
    403,
  );
  await fs.mkdir(workspace(id), { recursive: true });
  const handles: import("node:fs/promises").FileHandle[] = [];
  try {
    let dir = await fs.open(
      workspace(id),
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    handles.push(dir);
    for (const part of parts.slice(0, -1)) {
      let next;
      try {
        next = await fs.open(
          "/proc/self/fd/" + dir.fd + "/" + part,
          fsConstants.O_RDONLY |
            fsConstants.O_DIRECTORY |
            fsConstants.O_NOFOLLOW,
        );
      } catch (e: any) {
        if (e.code === "ENOENT" && create) {
          await fs.mkdir("/proc/self/fd/" + dir.fd + "/" + part, 0o755);
          next = await fs.open(
            "/proc/self/fd/" + dir.fd + "/" + part,
            fsConstants.O_RDONLY |
              fsConstants.O_DIRECTORY |
              fsConstants.O_NOFOLLOW,
          );
        } else throw e;
      }
      handles.push(next);
      dir = next;
    }
    const anchored = await fs.open(
      "/proc/self/fd/" + dir.fd,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY,
    );
    return {
      dir: path.join("/proc/self/fd", String(anchored.fd)),
      name: parts.at(-1)!,
      close: () => anchored.close(),
    };
  } finally {
    for (const h of handles) await h.close();
  }
}
export async function usage(id: string): Promise<number> {
  let total = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) total += (await fs.stat(p)).size;
    }
  }
  await walk(workspace(id));
  return total;
}
export async function initializeFiles(id: string, kind: string, name: string) {
  const root = workspace(id);
  await fs.mkdir(root, { recursive: true });
  if (kind === "website") {
    await fs.writeFile(
      path.join(root, "index.html"),
      `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${name.replace(/[<>&"]/g, "")}</title><style>body{font-family:system-ui;background:#111610;color:#f4f6f0;display:grid;place-items:center;min-height:90vh;margin:0}main{max-width:650px;padding:40px}h1{font-size:64px;letter-spacing:-3px}span{color:#bcf36b}p{color:#a5afa0;line-height:1.7}</style></head><body><main><small>POWERED BY ZK PANEL</small><h1>Hello, <span>world.</span></h1><p>This is your new corner of the internet. Upload your website files using the ZK file manager to make it yours.</p></main></body></html>`,
    );
  } else if (kind === "bot") {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify(
        {
          name: "zk-bot",
          version: "1.0.0",
          private: true,
          scripts: { start: "node index.js" },
          dependencies: {},
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(root, "index.js"),
      '// Upload your bot code and add its dependencies in package.json.\nconsole.log("Your ZK workspace is ready. Deploy your bot to get started.");\nsetInterval(() => {}, 60000);\n',
    );
    await fs.writeFile(
      path.join(root, "main.py"),
      'import time\nprint("Your ZK Python workspace is ready. Upload your bot code.", flush=True)\nwhile True:\n    time.sleep(60)\n',
    );
    await fs.writeFile(
      path.join(root, "requirements.txt"),
      "# Add your Python dependencies here\n",
    );
  } else if (kind === "minecraft") {
    await fs.mkdir(path.join(root, "plugins"), { recursive: true });
    await fs.mkdir(path.join(root, "world"), { recursive: true });
    await fs.writeFile(
      path.join(root, "server.properties"),
      "# Managed by ZK PANEL. Stop the server before editing.\nmotd=A new world, powered by ZK.\nmax-players=20\ndifficulty=normal\ngamemode=survival\n",
    );
    await fs.writeFile(
      path.join(root, "eula.txt"),
      "# Accept the Minecraft EULA in Startup settings before production deployment.\neula=false\n",
    );
  } else {
    await fs.writeFile(
      path.join(root, "README.txt"),
      `Welcome to ${name}\nUpload files with the file manager. Your persistent directory is mounted inside this container.\n`,
    );
  }
}
export async function listFiles(
  id: string,
  relative = "",
): Promise<FileEntry[]> {
  const dir = await safePath(id, relative);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    const s = await fs.lstat(p);
    if (s.isSymbolicLink()) continue;
    result.push({
      name: e.name,
      path: path.relative(workspace(id), p).split(path.sep).join("/"),
      directory: e.isDirectory(),
      size: s.size,
      modifiedAt: s.mtime.toISOString(),
    });
  }
  return result.sort(
    (a, b) =>
      Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
  );
}
export async function readFile(id: string, relative: string) {
  const handle = await openSafe(id, relative, fsConstants.O_RDONLY);
  try {
    const stat = await handle.stat();
    assert(stat.isFile(), "Select a file to edit.");
    assert(
      stat.size <= 2 * 1024 * 1024,
      "This file is larger than the 2 MB editor limit.",
    );
    const buffer = await handle.readFile();
    assert(
      !buffer.includes(0),
      "Binary files cannot be opened in the text editor.",
    );
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}
export async function writeFile(
  id: string,
  relative: string,
  content: string,
  disk: number,
) {
  return locked(id, async () => {
    assert(
      Buffer.byteLength(content) <= 2 * 1024 * 1024,
      "The editor supports files up to 2 MB.",
    );
    const parent = await parentDirectory(id, relative, true);
    await parent.close();
    const handle = await openSafe(
      id,
      relative,
      fsConstants.O_RDWR | fsConstants.O_CREAT,
    );
    try {
      const stat = await handle.stat();
      assert(stat.isFile(), "Cannot overwrite a directory.");
      assert(
        (await usage(id)) - stat.size + Buffer.byteLength(content) <=
          disk * 1024 * 1024,
        "Deployment disk quota exceeded.",
      );
      await handle.truncate(0);
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
  });
}
export async function makeDirectory(id: string, relative: string) {
  return locked(id, async () => {
    const p = await parentDirectory(id, relative);
    try {
      await fs.mkdir(path.join(p.dir, p.name));
    } finally {
      await p.close();
    }
  });
}
export async function deleteFile(id: string, relative: string) {
  return locked(id, async () => {
    assert(
      relative !== "" && relative !== ".",
      "The workspace root cannot be deleted.",
    );
    const p = await parentDirectory(id, relative);
    try {
      await fs.rm(path.join(p.dir, p.name), { recursive: true, force: false });
    } finally {
      await p.close();
    }
  });
}
export async function renameFile(id: string, from: string, to: string) {
  return locked(id, async () => {
    assert(from && to && from !== ".", "The workspace root cannot be renamed.");
    const a = await parentDirectory(id, from),
      b = await parentDirectory(id, to);
    try {
      await fs.access(path.join(a.dir, a.name));
      try {
        await fs.lstat(path.join(b.dir, b.name));
        throw new Error("Destination already exists.");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      await fs.rename(path.join(a.dir, a.name), path.join(b.dir, b.name));
    } finally {
      await a.close();
      await b.close();
    }
  });
}
export async function downloadFile(id: string, relative: string) {
  const handle = await openSafe(id, relative, fsConstants.O_RDONLY);
  const stat = await handle.stat();
  if (!stat.isFile()) {
    await handle.close();
    throw new Error("Only files can be downloaded.");
  }
  const stream = createReadStream("", { fd: handle.fd, autoClose: false });
  stream.on("close", () => void handle.close());
  return { stream, size: stat.size, name: path.basename(relative) };
}
export async function uploadFile(
  id: string,
  relative: string,
  req: Readable,
  disk: number,
  length: number,
) {
  return locked(id, async () => {
    assert(
      length >= 0 && length <= 100 * 1024 * 1024,
      "Upload limit is 100 MB per file.",
    );
    const baseUsage = await usage(id);
    assert(
      baseUsage + length <= disk * 1024 * 1024,
      "Deployment disk quota exceeded.",
    );
    const parent = await parentDirectory(id, relative, true);
    const temp = path.join(
      path.dirname(relative),
      ".zk-upload-" + randomUUID(),
    );
    let handle: import("node:fs/promises").FileHandle | undefined;
    let written = 0;
    try {
      handle = await openSafe(
        id,
        temp,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      );
      for await (const chunk of req) {
        written += chunk.length;
        assert(
          written <= 100 * 1024 * 1024 &&
            baseUsage + written <= disk * 1024 * 1024,
          "Upload exceeds file or disk quota.",
        );
        await handle!.write(chunk);
      }
      await handle!.sync();
      await handle!.close();
      const target = await openSafe(
        id,
        relative,
        fsConstants.O_WRONLY | fsConstants.O_CREAT,
      );
      await target.close();
      await fs.rename(
        path.join(parent.dir, path.basename(temp)),
        path.join(parent.dir, parent.name),
      );
    } catch (e) {
      await handle?.close().catch(() => {});
      await fs.rm(path.join(parent.dir, path.basename(temp)), { force: true });
      throw e;
    } finally {
      await parent.close();
    }
    return { size: written };
  });
}

export async function archiveWorkspace(id: string, destination: string) {
  await fs.mkdir(workspace(id), { recursive: true });
  await tar.create(
    {
      gzip: true,
      file: destination,
      cwd: workspace(id),
      portable: true,
      noMtime: false,
      filter: (p, stat) => !("isSymbolicLink" in stat && stat.isSymbolicLink()),
    },
    ["."],
  );
}
export async function restoreWorkspace(
  id: string,
  source: string,
  maxMb = 2048,
  uid = 1000,
) {
  return locked(id, async () => {
    const staging = workspace(id) + ".restore-" + randomUUID();
    await fs.mkdir(staging);
    let size = 0;
    try {
      const entries: tar.ReadEntry[] = [];
      await tar.list({
        file: source,
        onReadEntry: (entry) => {
          entries.push(entry);
        },
      });
      for (const entry of entries) {
        const p = entry.path;
        assert(
          !path.isAbsolute(p) && !p.split("/").includes(".."),
          "Archive contains an unsafe path.",
        );
        assert(
          ["Directory", "File"].includes(entry.type),
          "Archive links and special files are not allowed.",
        );
        size += entry.size;
        assert(
          size <= maxMb * 1024 * 1024,
          "Expanded archive exceeds this deployment disk quota.",
        );
      }
      await tar.extract({
        file: source,
        cwd: staging,
        noChmod: true,
        filter: (p) => {
          const resolved = path.resolve(staging, p);
          return (
            resolved === staging || resolved.startsWith(staging + path.sep)
          );
        },
      });
      if (config.mode === "docker" && process.getuid?.() === 0) {
        async function own(dir: string) {
          await fs.chown(dir, uid, uid);
          for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) await own(p);
            else if (entry.isFile()) await fs.chown(p, uid, uid);
          }
        }
        await own(staging);
      }
      const previous = workspace(id) + ".old-" + randomUUID();
      await fs.rename(workspace(id), previous);
      try {
        await fs.rename(staging, workspace(id));
      } catch (e) {
        await fs.rename(previous, workspace(id));
        throw e;
      }
      await fs.rm(previous, { recursive: true, force: true });
    } catch (e) {
      await fs.rm(staging, { recursive: true, force: true });
      throw e;
    }
  });
}
