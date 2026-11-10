import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { Server } from '../shared/types.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-docker-command-'));
process.env.DATA_DIR = root;
process.env.DOCKER_SOCKET = path.join(root, 'docker.sock');
process.env.ZK_MODE = 'demo';
const runtime = await import('../server/docker-runtime.js');

test('Docker socket attaches once and writes only the Minecraft command to stdin', async () => {
  let received = '';
  let attachCount = 0;
  let query = '';
  let receivedDone!: () => void;
  const gotInput = new Promise<void>(resolve => { receivedDone = resolve; });
  const daemon = http.createServer((req, res) => {
    assert.equal(req.url, '/containers/zk-zk-minecraft/json');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ State: { Running: true }, Config: { OpenStdin: true } }));
  });
  daemon.on('upgrade', (req, socket, head) => {
    attachCount++;
    query = req.url || '';
    assert.equal(req.headers['content-length'], '0');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');
    const collect = (chunk: Buffer) => { received += chunk.toString(); if (received.includes('\n')) receivedDone(); };
    if (head.length) collect(head);
    socket.on('data', collect);
    socket.on('end', () => socket.end());
  });
  await new Promise<void>(resolve => daemon.listen(process.env.DOCKER_SOCKET!, resolve));
  try {
    const output = await runtime.command({ id: 'zk-minecraft', kind: 'minecraft', templateId: 'paper' } as Server, '/list');
    await Promise.race([gotInput, new Promise((_, reject) => setTimeout(() => reject(new Error('no command received')), 3000))]);
    assert.equal(received, 'list\n');
    assert.equal(attachCount, 1);
    assert.match(query, /stdin=1/);
    assert.match(output, /sent to the server console/);
  } finally {
    await new Promise<void>((resolve, reject) => daemon.close(err => err ? reject(err) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});
