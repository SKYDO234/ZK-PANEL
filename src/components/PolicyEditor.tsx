import { useEffect, useState } from "react";
import {
  ShieldCheck,
  HardDrive,
  Moon,
  Wallet,
  Sparkles,
  Save,
  Check,
  Info,
  ArrowUpRight,
} from "lucide-react";
import type { Server, Autopilot } from "../../shared/types";
import { useResource, useStore } from "../lib/store";
import { api, money, ago } from "../lib/api";
import {
  Panel,
  PanelHeading,
  Toggle,
  Field,
  Button,
  Badge,
  Loading,
  ErrorState,
} from "./ui";
export default function PolicyEditor({
  server,
  compact = false,
}: {
  server: Server;
  compact?: boolean;
}) {
  const { toast, data: boot } = useStore();
  const {
    data: p,
    loading,
    error,
    reload,
  } = useResource<Autopilot>("/servers/" + server.id + "/autopilot");
  const [policy, setPolicy] = useState<Autopilot | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (p) setPolicy(p);
  }, [p]);
  if (loading || !policy)
    return loading ? (
      <Loading />
    ) : (
      <ErrorState message={error} retry={reload} />
    );
  const update = (key: keyof Autopilot, value: any) =>
    setPolicy({ ...policy, [key]: value });
  const save = async () => {
    setBusy(true);
    try {
      await api("/servers/" + server.id + "/autopilot", {
        method: "PUT",
        body: policy,
      });
      toast("Autopilot is up to date.");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="policy-layout">
      <Panel className="policy-panel">
        <PanelHeading
          title="Your always-on co-pilot"
          subtitle="A safety net that works around the clock."
        >
          <Badge tone="green">
            <Sparkles size={12} />
            ZK ORIGINAL
          </Badge>
        </PanelHeading>
        <div className="policy-row">
          <span className="policy-icon green">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h3>Smart crash recovery</h3>
            <p>
              Restart unexpectedly stopped containers. Up to 3 attempts per
              hour, with a safe pause if the problem persists.
            </p>
            <Badge tone="green">GUARDRAILS INCLUDED</Badge>
          </div>
          <Toggle
            label="Smart crash recovery"
            checked={policy.recovery}
            onChange={(v) => update("recovery", v)}
          />
        </div>
        <div className="policy-row">
          <span className="policy-icon blue">
            <HardDrive size={22} />
          </span>
          <div>
            <h3>Automatic backups</h3>
            <p>
              A fresh snapshot of your workspace, on your schedule. Your five
              most recent backup slots are managed manually.
            </p>
            <Field label="Backup frequency">
              <select
                value={policy.backupInterval}
                onChange={(e) =>
                  update("backupInterval", Number(e.target.value))
                }
              >
                <option value={60}>Every hour</option>
                <option value={360}>Every 6 hours</option>
                <option value={720}>Every 12 hours</option>
                <option value={1440}>Every day</option>
                <option value="10080">Every week</option>
              </select>
            </Field>
          </div>
          <Toggle
            label="Automatic backups"
            checked={policy.backup}
            onChange={(v) => update("backup", v)}
          />
        </div>
        <div className="policy-row">
          <span className="policy-icon purple">
            <Moon size={22} />
          </span>
          <div>
            <h3>Idle sleep</h3>
            <p>
              Stop quiet deployments when CPU is below 2% and no Minecraft
              players are online. Manual start wakes them up.
            </p>
            <Field label="Quiet period before sleep">
              <select
                value={policy.idleMinutes}
                onChange={(e) => update("idleMinutes", Number(e.target.value))}
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={1440}>24 hours</option>
              </select>
            </Field>
          </div>
          <Toggle
            label="Idle sleep"
            checked={policy.idleSleep}
            onChange={(v) => update("idleSleep", v)}
          />
        </div>
        <div className="policy-row">
          <span className="policy-icon amber">
            <Wallet size={22} />
          </span>
          <div>
            <h3>Spending guardrail</h3>
            <p>
              Get an activity alert when this deployment's monthly allocation
              crosses your threshold. We never add surprise charges.
            </p>
            <Field label="Monthly alert threshold (INR)">
              <input
                type="number"
                min={1}
                max={100000}
                value={policy.budget}
                onChange={(e) => update("budget", Number(e.target.value))}
              />
            </Field>
          </div>
          <Toggle
            label="Spending alerts"
            checked={policy.budgetAlert}
            onChange={(v) => update("budgetAlert", v)}
          />
        </div>
        <div className="policy-footer">
          <span>
            {policy.lastAction
              ? "Last action " + ago(policy.lastAction)
              : "Ready to look after your deployment."}
          </span>
          <Button loading={busy} onClick={save}>
            <Save size={15} />
            Save policy
          </Button>
        </div>
      </Panel>
      {!compact && (
        <aside>
          <Panel className="policy-explainer">
            <span className="autopilot-symbol">
              <Sparkles size={27} />
            </span>
            <h2>
              More creating.
              <br />
              Less checking.
            </h2>
            <p>
              Autopilot brings your safety nets together, so you can focus on
              what you're building.
            </p>
            <div>
              <Check size={15} />
              <span>Per-deployment control</span>
            </div>
            <div>
              <Check size={15} />
              <span>Every action in your activity log</span>
            </div>
            <div>
              <Check size={15} />
              <span>No automatic wallet charges</span>
            </div>
            <div>
              <Check size={15} />
              <span>Included with every plan</span>
            </div>
          </Panel>
          <div className="inline-note">
            <Info size={17} />
            <span>
              {boot?.mode === "demo"
                ? "Recovery and idle detection require Docker mode. Backups and scheduled tasks work in this demo."
                : "Idle sleep does not automatically wake on incoming traffic. Start the deployment from the panel or Discord."}
            </span>
          </div>
        </aside>
      )}
    </div>
  );
}
