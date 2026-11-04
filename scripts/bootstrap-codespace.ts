import "dotenv/config";
import { config } from "../server/config.js";

// Real-runtime Codespaces bootstrap. Explicit, idempotent, and never silently
// converts an existing production database or resets a password.
const enabled = process.env.ZK_CODESPACES_BOOTSTRAP === "true" &&
  (process.env.CODESPACES === "true" || process.env.ZK_ALLOW_LOCAL_CODESPACES_BOOTSTRAP === "true");
if (!enabled || config.mode !== "docker" || config.remoteOnly) {
  throw new Error("Codespaces bootstrap requires local Docker mode, ZK_CODESPACES_BOOTSTRAP=true, and a Codespace (or explicit local testing override).");
}
const { db, credit, getUser } = await import("../server/db.js");
const { createUser } = await import("../server/auth.js");
try {
  let row = db.prepare("SELECT id,role FROM users WHERE username=?").get("admin") as any;
  if (row) {
    if (row.role !== "admin") throw new Error("Existing 'admin' account is not an administrator; refusing to modify it.");
    console.log("Codespace administrator already exists; password was not changed.");
  } else {
    if (db.prepare("SELECT id FROM users WHERE email=?").get("admin@zk.local")) throw new Error("admin@zk.local already exists without the admin username; refusing to overwrite it.");
    const user = await createUser("Administrator", "admin@zk.local", "admin123", "admin", "admin");
    row = { id: user.id };
    credit(user.id, 1000000, "Codespace initial hosting credit · internal wallet grant", "admin");
    console.log("Created Codespace administrator: admin / admin123");
  }
  console.log("WARNING: change this password before sharing access. Keep forwarded ports private.");
  console.log("Wallet balance:", (getUser(row.id)!.balance / 100).toFixed(2), "INR internal credit");
} finally { db.close(); }
