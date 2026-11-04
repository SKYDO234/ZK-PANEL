import 'dotenv/config';
import { config } from '../server/config.js';
import { db } from '../server/db.js';
import { createUser } from '../server/auth.js';

// This shortcut is intentionally unavailable in Docker/production mode.
// It never resets an existing account's password on a repeated install.
if (!config.devBootstrap) {
  db.close();
  throw new Error(
    'Development bootstrap requires demo mode, ZK_DEV_BOOTSTRAP=true, and a Codespace (or ZK_ALLOW_LOCAL_DEV_BOOTSTRAP=true for local testing).',
  );
}
try {
  const existing = db
    .prepare('SELECT id,role FROM users WHERE username=?')
    .get('admin') as any;
  if (existing) {
    if (existing.role !== 'admin')
      throw new Error(
        "The existing 'admin' account is not an administrator; refusing to modify it.",
      );
    console.log(
      'Development administrator already exists; password was not changed.',
    );
  } else {
    if (
      db.prepare('SELECT id FROM users WHERE email=?').get('admin@zk.local')
    ) {
      throw new Error(
        'admin@zk.local already exists without the admin username; refusing to overwrite it.',
      );
    }
    await createUser(
      'Administrator',
      'admin@zk.local',
      'admin123',
      'admin',
      'admin',
    );
    console.log('Created development administrator: admin / admin123');
    console.log(
      'WARNING: change this password before sharing the port. Do not use in production.',
    );
  }
} finally {
  db.close();
}
