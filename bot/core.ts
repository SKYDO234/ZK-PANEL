import {
  db,
  hash,
  getUser,
  userByDiscord,
  getServers,
  getServer,
  now,
  transaction,
  log,
} from "../server/db.js";
import { accessible, changePower, createBackup } from "../server/services.js";
import * as runtime from "../server/runtime.js";
import { config, assert } from "../server/config.js";
import { gb } from "./format.js";
import type { User, PowerAction } from "../shared/types.js";

export function linkedUser(discordId: string): User {
  const u = userByDiscord(discordId);
  assert(
    u,
    "Link your panel account first. Open Discord bot in ZK PANEL to get a code, then use /zk link.",
  );
  assert(!u.suspended, "Your panel account is suspended.");
  return { ...u, role: "user" };
}
export function ownServer(discordId: string, serverId: string) {
  const u = linkedUser(discordId);
  return accessible(serverId, u);
}
export function linkAccount(discordId: string, code: string) {
  const normalized = code.trim().toUpperCase();
  assert(
    /^[A-F0-9]{12}$/.test(normalized),
    "Enter the 12-character code from your panel.",
  );
  return transaction(() => {
    const row = db
      .prepare("SELECT user_id FROM link_codes WHERE code=? AND expires>?")
      .get(hash(normalized), Date.now()) as any;
    assert(
      row,
      "This code is invalid or expired. Generate a new code in ZK PANEL.",
    );
    const previous = userByDiscord(discordId);
    assert(
      !previous || previous.id === row.user_id,
      "This Discord account is already linked. Unlink it from the panel first.",
    );
    const target = getUser(row.user_id);
    assert(target && !target.suspended, "This panel account is unavailable.");
    db.prepare("UPDATE users SET discord_id=? WHERE id=?").run(
      discordId,
      target.id,
    );
    db.prepare("DELETE FROM link_codes WHERE code=?").run(hash(normalized));
    log(
      target.id,
      "discord.linked",
      "Discord account linked to ZK Companion",
      "success",
    );
    return target.name;
  });
}
export async function execute(
  discordId: string,
  action: string,
  serverId?: string,
  command?: string,
): Promise<string> {
  const u = linkedUser(discordId);
  if (action === "list") {
    const servers = getServers(u.id);
    if (!servers.length)
      return "Your workspace is empty. Create your first deployment in ZK PANEL.";
    return servers
      .slice(0, 20)
      .map(
        (s) =>
          `${s.status === "running" ? "🟢" : "⚪"} **${s.name.replace(/[\n*_[\]]/g, "")}**\n${s.software} · ${s.status} · ${gb(s.memory)} GB RAM\nID: \`${s.id}\``,
      )
      .join("\n\n")
      .slice(0, 1900);
  }
  assert(serverId, "Choose one of your deployments.");
  const s = ownServer(discordId, serverId);
  if (action === "status") {
    const m = await runtime.metrics(s);
    return `**${s.name.replace(/[\n*_[\]]/g, "")}**\nState: ${s.status}\nCPU: ${m.cpu.toFixed(1)}%\nMemory: ${gb(m.memory)} / ${gb(s.memory)} GB\nUptime: ${Math.floor(m.uptime / 3600)}h ${Math.floor((m.uptime % 3600) / 60)}m\nRegion: ${s.nodeId}\nID: \`${s.id}\`${config.mode === "demo" ? "\n-# Demo compute · simulated metrics" : ""}`;
  }
  if (["start", "stop", "restart"].includes(action)) {
    await changePower(
      u,
      s.id,
      action as PowerAction,
      "Discord command by " + discordId,
    );
    return `**${s.name}** · ${action === "restart" ? "restarted" : action === "stop" ? "stopped" : "started"}.\nYour request was verified against your panel ownership.${config.mode === "demo" ? "\n-# Demo action · no real compute" : ""}`;
  }
  if (action === "backup") {
    const b = await createBackup(
      u,
      s.id,
      "Discord backup · " + new Date().toISOString().slice(0, 16),
    );
    return `Backup created for **${s.name}**.\n${(b.size / 1048576).toFixed(2)} MB · SHA-256 verified\nID: \`${b.id}\``;
  }
  if (action === "command") {
    const cmd = command?.trim();
    assert(cmd, "Enter a server command.");
    assert(
      s.status === "running",
      "Start this deployment before sending commands.",
    );
    const output = await runtime.command(s, cmd);
    return `Command sent to **${s.name}**.\n\`\`\`\n${output.replace(/```/g, "ʼʼʼ").slice(0, 1400)}\n\`\`\`${config.mode === "demo" ? "\n-# Demo command · simulated output" : ""}`;
  }
  throw new Error("Unknown action.");
}
export function choices(discordId: string) {
  const u = userByDiscord(discordId);
  return u && !u.suspended
    ? getServers(u.id)
        .slice(0, 25)
        .map((s) => ({
          name: s.name.slice(0, 90) + " · " + s.status,
          value: s.id,
        }))
    : [];
}
