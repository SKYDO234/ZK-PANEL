import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function shell(code: string, ...args: string[]) {
  return spawnSync('bash', ['-c', `source ./node.sh; ${code}`, 'test', ...args], { encoding: 'utf8' });
}
test('node installer parses and shows help without root or network access', () => {
  assert.equal(spawnSync('bash', ['-n', 'node.sh']).status, 0);
  const help = spawnSync('bash', ['node.sh', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /register the node in ZK PANEL/);
});
test('installer validates hostnames, IPv4 addresses and tokens without shell injection', () => {
  for (const domain of ['node.example.com', 'node-01.example.org']) assert.equal(shell('valid_domain "$1"', domain).status, 0);
  for (const domain of ['127.0.0.1', 'localhost', 'evil.example\nreverse_proxy host', 'x..example.com', '-a.example.com', 'https://example.com', 'example.com;echo']) assert.notEqual(shell('valid_domain "$1"', domain).status, 0);
  for (const ip of ['1.2.3.4', '255.255.255.255']) assert.equal(shell('valid_ipv4 "$1"', ip).status, 0);
  for (const ip of ['999.1.1.1', '1.1.1.1/0', '1.1.1.1\nrespond 200']) assert.notEqual(shell('valid_ipv4 "$1"', ip).status, 0);
  assert.equal(shell('valid_token "$1"', 'a'.repeat(32)).status, 0);
  for (const token of ['short', 'a'.repeat(257), 'a'.repeat(32) + '\nKEY=oops', 'a'.repeat(32) + '$']) assert.notEqual(shell('valid_token "$1"', token).status, 0);
});
test('node environment is private, preserves existing tokens and rejects invalid input', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-node-installer-'));
  try {
    const file = path.join(dir, 'node.env'), token = 'T'.repeat(32), secret = 'S'.repeat(48);
    const write = (t: string, w = '/opt/zk/workspaces') => shell('write_node_env "$1" "$2" "$3" "$4"', file, t, secret, w);
    assert.equal(write(token).status, 0);
    const contents = await fs.readFile(file, 'utf8');
    assert.match(contents, /WORKSPACE_HOST_PATH=\/opt\/zk\/workspaces/);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.notEqual(write('X'.repeat(32)).status, 0);
    assert.equal(await fs.readFile(file, 'utf8'), contents);
    assert.notEqual(write('bad\ntoken').status, 0);
    assert.notEqual(write(token, '/opt/invalid\nPATH=bad').status, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('Caddy config proxies locally and optionally restricts the panel IP', () => {
  const result = shell('write_caddy_config "$1" "$2"', 'node.example.com', '203.0.113.12');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /@blocked not remote_ip 203\.0\.113\.12/);
  assert.match(result.stdout, /reverse_proxy 127\.0\.0\.1:8080/);
  assert.notEqual(shell('write_caddy_config "$1" "$2"', 'evil.com\nrespond 200', '').status, 0);
});
