import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "../shared/types.js";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zk-playit-test-"));
const binary = path.join(temp, "mock-playit");
await fs.writeFile(binary, '#!/bin/sh\necho "https://playit.gg/claim/Example123"\nexec sleep 60\n', { mode: 0o700 });
process.env.DATA_DIR = temp;
process.env.ZK_MODE = "docker";
process.env.ZK_REMOTE_ONLY = "false";
process.env.SESSION_SECRET = "playit-tests-not-a-real-secret-1234567890";
process.env.PLAYIT_BINARY = binary;
const playit = await import("../server/playit.js");
const { db } = await import("../server/db.js");
const server = { id: "zk-playittest", kind: "minecraft", nodeId: "node-local", templateId: "paper", port: 25566 } as Server;

test("local Playit lifecycle starts, exposes only claim URL, stops and resets", async () => {
  try {
    assert.equal(playit.playitStatus(server).running, false);
    await playit.startPlayit(server);
    for (let i = 0; i < 40 && !playit.playitStatus(server).claimUrl; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(playit.playitStatus(server).claimUrl, "https://playit.gg/claim/Example123");
    assert.equal(playit.playitStatus(server).localPort, 25566);
    await assert.rejects(playit.startPlayit(server), /already running/);
    await playit.resetPlayit(server);
    assert.equal(playit.playitStatus(server).running, false);
    process.env.PLAYIT_BINARY = path.join(temp, 'missing');
    assert.equal(playit.playitStatus(server).configured, false);
    await assert.rejects(playit.startPlayit(server), /Install the official Playit agent/);
    const broken = path.join(temp, 'broken-playit');
    await fs.writeFile(broken, '#!/bin/sh\nexit 7\n', { mode: 0o700 });
    process.env.PLAYIT_BINARY = broken;
    await playit.startPlayit(server);
    for (let i = 0; i < 40 && !playit.playitStatus(server).lastError; i++) await new Promise(r => setTimeout(r, 25));
    assert.match(playit.playitStatus(server).lastError || '', /exit 7/);
  } finally {
    await playit.stopPlayit(server);
    db.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
