import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-command-agent-'));
const dockerSocket = path.join(root, 'docker.sock');
const token = 'test-node-token-at-least-32-characters-long';
const port = 28000 + Math.floor(Math.random() * 3000);
await fs.writeFile(path.join(root, 'agent-registry.json'), JSON.stringify(['zk-minecraft']));
let command = '';
let commandReceived!: () => void;
const received = new Promise<void>(resolve => { commandReceived = resolve; });
const daemon = http.createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ State: { Running: true }, Config: { OpenStdin: true } }));
});
daemon.on('upgrade', (_req, socket, head) => {
  const collect = (chunk: Buffer) => { command += chunk.toString(); if (command.includes('\n')) commandReceived(); };
  if (head.length) collect(head);
  socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');
  socket.on('data', collect);
  socket.on('end', () => socket.end());
});
await new Promise<void>(resolve => daemon.listen(dockerSocket, resolve));
const agent = spawn(process.execPath, ['--import', 'tsx', 'agent/index.ts'], {
  env: { ...process.env, DATA_DIR: root, DOCKER_SOCKET: dockerSocket, ZK_MODE: 'docker', ZK_REMOTE_ONLY: 'false', NODE_TOKEN: token, SESSION_SECRET: 'node-test-secret-longer-than-thirty-two-bytes', AGENT_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const url = `http://127.0.0.1:${port}/servers/zk-minecraft/command`;
const body = JSON.stringify({ command: '/say hello', kind: 'minecraft', templateId: 'paper' });
test('remote node forwards Minecraft commands to the same console transport', async () => {
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 401) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'agent did not start');
    const denied = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(denied.status, 401);
    const result = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
    assert.equal(result.status, 200, await result.clone().text());
    await Promise.race([received, new Promise((_, reject) => setTimeout(() => reject(new Error('No command received')), 3000))]);
    assert.equal(command, 'say hello\n');
  } finally {
    agent.kill('SIGTERM');
    await Promise.race([once(agent, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    if (agent.exitCode === null) agent.kill('SIGKILL');
    await new Promise<void>((resolve, reject) => daemon.close(err => err ? reject(err) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});
