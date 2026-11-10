import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-files-'));
process.env.DATA_DIR = root;
process.env.ZK_MODE = 'demo';
const files = await import('../server/files.js');
test('safe workspace paths reject traversal, absolute paths and null bytes', async () => {
  for (const p of ['../secret', '../../.env', '/etc/passwd', 'a\0b'])
    await assert.rejects(files.safePath('test-server', p));
  assert.equal(
    await files.safePath('test-server', 'plugins/test.jar'),
    path.join(root, 'workspaces', 'test-server', 'plugins', 'test.jar'),
  );
});
test('write, list, read, rename, download and delete round trip', async () => {
  await files.writeFile('test-server', 'config.txt', 'hello world', 1);
  assert.equal(await files.readFile('test-server', 'config.txt'), 'hello world');
  assert.equal((await files.listFiles('test-server'))[0].name, 'config.txt');
  await files.renameFile('test-server', 'config.txt', 'renamed.txt');
  assert.equal(await files.readFile('test-server', 'renamed.txt'), 'hello world');
  const d = await files.downloadFile('test-server', 'renamed.txt');
  const chunks = [];
  for await (const c of d.stream) chunks.push(c);
  await new Promise<void>((resolve) => d.stream.closed ? resolve() : d.stream.once('close', resolve));
  assert.equal(d.stream.closed, true);
  assert.equal(Buffer.concat(chunks).toString(), 'hello world');
  await files.deleteFile('test-server', 'renamed.txt');
  assert.equal((await files.listFiles('test-server')).length, 0);
});
test('symbolic links cannot escape workspace', async () => {
  await fs.symlink('/etc/passwd', path.join(files.workspace('test-server'), 'link'));
  await assert.rejects(files.readFile('test-server', 'link'), /Symbolic links/);
  assert.ok(!(await files.listFiles('test-server')).some((f) => f.name === 'link'));
});
test('workspace root cannot be deleted', async () =>
  assert.rejects(files.deleteFile('test-server', ''), /root/));
test('real backups restore files and reject traversal archives', async () => {
  await files.writeFile('test-server', 'world.txt', 'saved world', 1);
  const archive = path.join(root, 'backup.tar.gz');
  await files.archiveWorkspace('test-server', archive);
  await files.writeFile('test-server', 'world.txt', 'changed world', 1);
  await files.restoreWorkspace('test-server', archive);
  assert.equal(await files.readFile('test-server', 'world.txt'), 'saved world');
  const tar = await import('tar');
  const bad = path.join(root, 'bad.tar.gz');
  const staging = path.join(root, 'bad');
  await fs.mkdir(staging);
  await fs.writeFile(path.join(staging, 'safe.txt'), 'safe');
  await tar.create(
    {
      gzip: true,
      file: bad,
      cwd: staging,
      portable: true,
      onWriteEntry: (entry: import('tar').WriteEntry) => {
        if (entry.path === 'safe.txt') entry.path = '../escape.txt';
      },
    },
    ['safe.txt'],
  );
  await assert.rejects(files.restoreWorkspace('test-server', bad), /unsafe path/);
  assert.equal(await files.readFile('test-server', 'world.txt'), 'saved world');
});
test.after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test('upload quotas and restore expansion quotas are enforced', async () => {
  const { Readable } = await import('node:stream');
  const oversized = 2 * 1024 * 1024;
  await assert.rejects(
    files.uploadFile('quota-server', 'large.bin', Readable.from(Buffer.alloc(oversized)), 1, oversized),
    /quota/,
  );
  await files.writeFile('quota-server', 'small.txt', 'saved', 1);
  const archive = path.join(root, 'quota.tar.gz');
  await files.archiveWorkspace('quota-server', archive);
  await assert.rejects(files.restoreWorkspace('quota-server', archive, 0.000001), /quota/);
  assert.equal(await files.readFile('quota-server', 'small.txt'), 'saved');
});

test('Node website workspace contains a runnable starter application', async () => {
  await files.initializeFiles('node-website', 'website', 'Test Site', 'node-web');
  const pkg = JSON.parse(await files.readFile('node-website', 'package.json'));
  assert.equal(pkg.scripts.start, 'node index.js');
  assert.match(await files.readFile('node-website', 'index.js'), /process\.env\.PORT/);
  assert.match(await files.readFile('node-website', 'index.html'), /Test Site/);
  assert.equal((await fs.stat(path.join(files.workspace('node-website'), 'index.html'))).mode & 0o777, 0o644);
});

test('Minecraft EULA is written only with explicit acceptance and existing files are repaired', async () => {
  await files.initializeFiles('eula-accepted', 'minecraft', 'test', 'paper', true);
  assert.match(await files.readFile('eula-accepted', 'eula.txt'), /^eula=true$/m);
  await files.initializeFiles('eula-declined', 'minecraft', 'test', 'paper', false);
  const before = await files.readFile('eula-declined', 'eula.txt');
  await files.ensureAcceptedEula('eula-declined', false, 20);
  assert.equal(await files.readFile('eula-declined', 'eula.txt'), before);
  assert.match(before, /^eula=false$/m);
  await files.writeFile('eula-declined', 'eula.txt', '# Keep my comment\r\neula=false\r\nother=value\r\neula: false\r\n', 20);
  await files.ensureAcceptedEula('eula-declined', true, 20);
  assert.equal(await files.readFile('eula-declined', 'eula.txt'), '# Keep my comment\r\neula=true\r\nother=value\r\neula=true\r\n');
  await files.ensureAcceptedEula('eula-declined', true, 20);
  assert.equal(await files.readFile('eula-declined', 'eula.txt'), '# Keep my comment\r\neula=true\r\nother=value\r\neula=true\r\n');
  await fs.rm(path.join(files.workspace('eula-declined'), 'eula.txt'));
  await fs.symlink('/etc/passwd', path.join(files.workspace('eula-declined'), 'eula.txt'));
  await assert.rejects(files.ensureAcceptedEula('eula-declined', true, 20), /Symbolic links/);
});

test('repeated initialization preserves existing Minecraft, bot and website files', async () => {
  for (const entry of [
    { id: 'retry-minecraft', kind: 'minecraft', template: 'paper', file: 'server.properties', content: 'motd=My world\n' },
    { id: 'retry-bot', kind: 'bot', template: 'node', file: 'index.js', content: 'console.log("custom bot")\n' },
    { id: 'retry-web', kind: 'website', template: 'node-web', file: 'index.html', content: '<h1>My site</h1>' },
  ]) {
    await files.initializeFiles(entry.id, entry.kind, 'Original', entry.template, true);
    await files.writeFile(entry.id, entry.file, entry.content, 20);
    await files.initializeFiles(entry.id, entry.kind, 'New name', entry.template, true);
    assert.equal(await files.readFile(entry.id, entry.file), entry.content);
  }
});

test('initialization never follows an existing file or directory symlink', async () => {
  const id = 'retry-symlink';
  await fs.mkdir(files.workspace(id), { recursive: true });
  const outside = path.join(root, 'outside.txt');
  await fs.writeFile(outside, 'keep me');
  await fs.symlink(outside, path.join(files.workspace(id), 'index.html'));
  await files.initializeFiles(id, 'website', 'Site', 'website');
  assert.equal(await fs.readFile(outside, 'utf8'), 'keep me');
  await fs.symlink(root, path.join(files.workspace(id), 'plugins'));
  await assert.rejects(files.initializeFiles(id, 'minecraft', 'test', 'paper', true));
  assert.equal(await fs.readFile(outside, 'utf8'), 'keep me');
});
