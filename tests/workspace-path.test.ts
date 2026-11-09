import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-node-path-'));
process.env.DATA_DIR = path.join(root, 'agent-data');
process.env.WORKSPACE_PATH = path.join(root, 'mounted-workspaces');
process.env.WORKSPACE_HOST_PATH = path.join(root, 'host-workspaces');
process.env.ZK_MODE = 'demo';
const files = await import('../server/files.js');
test('agent workspace operations use the configured mount path', async () => {
  try {
    await files.initializeFiles('zk-example', 'minecraft', 'test', 'paper', true);
    const actual = await fs.readFile(path.join(root, 'mounted-workspaces', 'zk-example', 'eula.txt'), 'utf8');
    assert.match(actual, /^eula=true$/m);
    await assert.rejects(fs.access(path.join(root, 'agent-data', 'workspaces', 'zk-example', 'eula.txt')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
