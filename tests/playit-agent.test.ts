import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-playit-node-'));
const binary = path.join(root, 'mock-playit');
await fs.writeFile(binary, '#!/bin/sh\necho https://playit.gg/claim/Agent123\nexec sleep 60\n', { mode: 0o700 });
await fs.writeFile(path.join(root, 'agent-registry.json'), JSON.stringify(['zk-playitnode']));
const port = 28000 + Math.floor(Math.random() * 3000);
const token = 'test-node-token-longer-than-32-characters';
const child = spawn(process.execPath, ['--import', 'tsx', 'agent/index.ts'], {
  env: { ...process.env, DATA_DIR: root, ZK_MODE: 'docker', ZK_REMOTE_ONLY: 'false', SESSION_SECRET: 'node-test-secret-longer-than-thirty-two-bytes', NODE_TOKEN: token, PLAYIT_BINARY: binary, PLAYIT_HOST_NETWORK: 'true', AGENT_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${port}`;
const allocation = { id: 'zk-playitnode', kind: 'minecraft', templateId: 'paper', port: 25565 };
async function request(action: string, auth = true, server = allocation) {
  return fetch(`${base}/servers/zk-playitnode/playit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, server }) });
}
test.before(async () => {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/health')).status === 401) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Node agent did not start');
});
test('remote Playit requires node authentication and controls the configured process', async () => {
  assert.equal((await request('status', false)).status, 401);
  assert.equal((await request('start', true, { ...allocation, id: 'zk-other' })).status, 400);
  assert.equal((await request('start')).status, 200);
  let claim = '';
  for (let i = 0; i < 40 && !claim; i++) {
    claim = (await (await request('status')).json()).claimUrl || '';
    if (!claim) await new Promise(r => setTimeout(r, 25));
  }
  assert.equal(claim, 'https://playit.gg/claim/Agent123');
  assert.equal((await (await request('stop')).json()).running, false);
});
test.after(async () => {
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 2000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
  await fs.rm(root, { recursive: true, force: true });
});
