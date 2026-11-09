import {
  getServers,
  getServer,
  saveServer,
  getUser,
  getPolicy,
  savePolicy,
  schedules,
  backups,
  log,
  now,
  setting,
} from "./db.js";
import * as runtime from "./runtime.js";
import { changePower, createBackup } from "./services.js";
import { config } from "./config.js";
const failures = new Map<string, { count: number; last: number }>();
const healthySince = new Map<string, number>();
const idle = new Map<string, number>();
const backupFailures = new Map<string, number>();
let running = false;
export async function tick() {
  if (running) return;
  running = true;
  try {
    for (const s of getServers()) {
      if (s.status !== "running") healthySince.delete(s.id);
      const owner = getUser(s.ownerId);
      if (!owner) continue;
      const user = { ...owner, role: "user" as const };
      if (s.status === "suspended" && new Date(s.expiresAt) > new Date()) {
        s.status = "offline";
        saveServer(s);
      }
      if (
        new Date(s.expiresAt) < new Date() &&
        !["suspended", "installing", "error"].includes(s.status)
      ) {
        try {
          if (s.status === "running")
            await changePower(user, s.id, "stop", "Prepaid term expired");
          const latest = getServer(s.id)!;
          latest.status = "suspended";
          saveServer(latest);
          log(
            s.ownerId,
            "deployment.expired",
            `${s.name} suspended. Renew to start it again.`,
            "warning",
            s.id,
          );
        } catch {
          continue;
        }
      }
      if (owner.suspended && s.status === "running") {
        try {
          await changePower(user, s.id, "stop", "Account suspended");
          const latest = getServer(s.id)!;
          latest.status = "suspended";
          saveServer(latest);
        } catch {}
        continue;
      }
      const p = getPolicy(s.id);
      if (p.budgetAlert && s.monthlyCost / 100 >= p.budget) {
        const month = new Date().toISOString().slice(0, 7);
        const key = "budget-alert:" + s.id + ":" + month;
        if (!setting(key)) {
          setting(key, now());
          log(
            s.ownerId,
            "budget.threshold",
            `${s.name} has reached your monthly spending threshold of ₹${p.budget}. No extra charge was made.`,
            "warning",
            s.id,
          );
        }
      }
      if (s.status === "running" && config.mode === "docker") {
        try {
          const actual = await runtime.status(s);
          if (actual === "offline" || actual === "error") {
            healthySince.delete(s.id);
            // Capture the final crash output before recovery replaces the container.
            await runtime.syncLogs(s);
            if (setting("desired-state:" + s.id) === "offline") {
              const latest = getServer(s.id)!;
              latest.status = "offline";
              saveServer(latest);
              continue;
            }
            if (p.recovery) {
              const f = failures.get(s.id) || { count: 0, last: 0 };
              if (Date.now() - f.last > 3600000) f.count = 0;
              if (f.count < 3) {
                f.count++;
                f.last = Date.now();
                failures.set(s.id, f);
                const latest = getServer(s.id)!;
                latest.status = "offline";
                saveServer(latest);
                await changePower(
                  user,
                  s.id,
                  "start",
                  `Autopilot recovery attempt ${f.count}/3`,
                );
                p.lastAction = now();
                savePolicy(p);
                log(
                  s.ownerId,
                  "autopilot.recovered",
                  `${s.name} exited unexpectedly. Recovery attempt ${f.count}/3.`,
                  "warning",
                  s.id,
                );
              } else if (f.count === 3) {
                f.count++;
                failures.set(s.id, f);
                const latest = getServer(s.id)!;
                latest.status = "error";
                latest.error =
                  "Autopilot paused after 3 failed recovery attempts.";
                saveServer(latest);
                log(
                  s.ownerId,
                  "autopilot.paused",
                  `${s.name} needs attention. Automatic restarts paused.`,
                  "error",
                  s.id,
                );
              }
            } else {
              const latest = getServer(s.id)!;
              latest.status = actual;
              saveServer(latest);
            }
          } else {
            const since = healthySince.get(s.id) ?? Date.now();
            healthySince.set(s.id, since);
            // A briefly running process is not proof that a crash loop has recovered.
            if (Date.now() - since >= 5 * 60_000) failures.delete(s.id);
            if (p.idleSleep) {
              const stats = await runtime.metrics(s);
              const inactive =
                stats.cpu < 2 && (!stats.players || stats.players === 0);
              if (inactive) {
                const since = idle.get(s.id) || Date.now();
                idle.set(s.id, since);
                if (Date.now() - since > p.idleMinutes * 60000) {
                  await changePower(
                    user,
                    s.id,
                    "stop",
                    `Autopilot idle sleep after ${p.idleMinutes} minutes`,
                  );
                  idle.delete(s.id);
                  p.lastAction = now();
                  savePolicy(p);
                }
              } else idle.delete(s.id);
            }
          }
        } catch (e) {
          log(
            s.ownerId,
            "autopilot.error",
            `${s.name}: ${e instanceof Error ? e.message : "Health check failed"}`,
            "warning",
            s.id,
          );
        }
      }
      if (
        p.backup &&
        s.status !== "installing" &&
        (backupFailures.get(s.id) || 0) < Date.now() &&
        !backups.all(s.id).some((b) => b.status === "creating")
      ) {
        const latest = backups.all(s.id).find((b) => b.status === "ready");
        if (
          !latest ||
          Date.now() - new Date(latest.createdAt).getTime() >
            p.backupInterval * 60000
        ) {
          try {
            await createBackup(
              user,
              s.id,
              "Autopilot · " + new Date().toLocaleDateString("en-GB"),
              true,
            );
            backupFailures.delete(s.id);
            p.lastAction = now();
            savePolicy(p);
          } catch (e) {
            backupFailures.set(s.id, Date.now() + 15 * 60000);
            log(
              s.ownerId,
              "backup.failed",
              `${s.name}: ${e instanceof Error ? e.message : "Backup failed"}`,
              "warning",
              s.id,
            );
          }
        }
      }
    }
    for (const task of schedules.all()) {
      if (!task.enabled || new Date(task.nextRun) > new Date()) continue;
      const s = getServer(task.serverId);
      if (!s) continue;
      const owner = getUser(s.ownerId);
      if (!owner || owner.suspended) continue;
      const user = { ...owner, role: "user" as const };
      task.nextRun = new Date(Date.now() + task.interval * 60000).toISOString();
      task.lastRun = now();
      schedules.save(task);
      try {
        if (task.action === "backup")
          await createBackup(user, s.id, task.name, true);
        else if (task.action === "command")
          await runtime.command(s, task.command);
        else if (
          (task.action === "start" && s.status === "offline") ||
          (task.action === "stop" && s.status === "running") ||
          (task.action === "restart" &&
            ["running", "offline"].includes(s.status))
        )
          await changePower(
            user,
            s.id,
            task.action,
            "Scheduled task: " + task.name,
          );
        task.lastResult = "Success";
        log(
          s.ownerId,
          "schedule.executed",
          `${task.name} completed for ${s.name}`,
          "success",
          s.id,
        );
      } catch (e) {
        task.lastResult = e instanceof Error ? e.message : "Task failed";
        log(
          s.ownerId,
          "schedule.failed",
          `${task.name}: ${task.lastResult}`,
          "warning",
          s.id,
        );
      }
      schedules.save(task);
    }
  } finally {
    running = false;
  }
}
let timer: ReturnType<typeof setInterval> | undefined;
export function startAutopilot() {
  if (timer) return;
  timer = setInterval(() => void tick(), 15000);
  timer.unref();
}
export function stopAutopilot() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
