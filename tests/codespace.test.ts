import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-codespace-'));
const port = 39000 + Math.floor(Math.random() * 3000);
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  DATA_DIR: dir,
  ZK_MODE: 'demo',
  ZK_DEMO_AUTO_LOGIN: 'false',
  ZK_DEV_BOOTSTRAP: 'true',
  ZK_ALLOW_LOCAL_DEV_BOOTSTRAP: 'true',
  PORT: String(port),
  PUBLIC_URL: base,
  COOKIE_SECURE: 'false',
};
let child: ChildProcess;
function bootstrap(overrides: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/bootstrap-dev-admin.ts'],
    {
      env: { ...env, ...overrides },
      encoding: 'utf8',
    },
  );
}
test.before(async () => {
  const result = bootstrap();
  assert.equal(result.status, 0, result.stderr);
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/healthz')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
});
test.after(async () => {
  if (child?.pid) {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await fs.rm(dir, { recursive: true, force: true });
});
async function login(email: string, password: string) {
  return fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ZK-Request': '1' },
    body: JSON.stringify({ email, password }),
  });
}
test('development admin can sign in with username or local email; wrong password fails', async () => {
  const config = await (await fetch(base + '/api/config')).json();
  assert.equal(config.autoDemo, false);
  assert.equal(config.devBootstrap, true);
  assert.equal(
    (
      await fetch(base + '/api/auth/demo', {
        method: 'POST',
        headers: { 'X-ZK-Request': '1' },
      })
    ).status,
    403,
  );
  const response = await login('admin', 'admin123');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.username, 'admin');
  assert.equal((await login('admin@zk.local', 'admin123')).status, 200);
  assert.equal((await login('admin', 'wrong')).status, 401);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const workspace = await (
    await fetch(base + '/api/bootstrap', { headers: { Cookie: cookie } })
  ).json();
  assert.equal(workspace.user.username, 'admin');
});
test('repeated bootstrap is idempotent and production mode refuses the shortcut', async () => {
  assert.equal(bootstrap().status, 0);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(dir, 'zk.sqlite'));
  assert.equal(
    db.prepare("SELECT count(*) n FROM users WHERE username='admin'").get()!.n,
    1,
  );
  db.close();
  assert.notEqual(
    bootstrap({
      ZK_MODE: 'docker',
      SESSION_SECRET: 'test-only-production-secret-123456789',
    }).status,
    0,
  );
  assert.notEqual(
    bootstrap({ ZK_ALLOW_LOCAL_DEV_BOOTSTRAP: 'false', CODESPACES: 'false' })
      .status,
    0,
  );
});
