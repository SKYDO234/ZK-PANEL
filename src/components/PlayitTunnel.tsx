import { useEffect, useState } from "react";
import { ExternalLink, Play, RotateCcw, Square } from "lucide-react";
import type { Server } from "../../shared/types";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { Button, Panel, PanelHeading } from "./ui";

type Status = { running: boolean; claimUrl: string | null; localPort: number; protocol: string; configured: boolean };
export default function PlayitTunnel({ server }: { server: Server }) {
  const { toast } = useStore();
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => api<Status>(`/servers/${server.id}/playit`).then(data => { if (active) { setStatus(data); setError(""); } }).catch(e => { if (active) setError(e.message); });
    void load(); const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [server.id]);
  async function action(name: "start" | "stop" | "reset") {
    if (name === "reset" && !confirm("Stop this agent and delete its local Playit credential? You must claim it again.")) return;
    setBusy(true);
    try { setStatus(await api<Status>(`/servers/${server.id}/playit/${name}`, { body: {} })); toast(`Playit ${name} requested.`); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return <Panel className="form-panel playit-panel">
    <PanelHeading title="Playit tunnel" subtitle="Expose this Minecraft allocation without relying on a web-only Codespaces port." />
    {error ? <div className="inline-alert error" role="alert">{error}</div> : <>
      <p className="muted">Agent: <strong>{status?.running ? "Running" : "Stopped"}</strong>. Claim the agent, then create a tunnel in Playit to <strong>127.0.0.1:{server.port}</strong> using <strong>{status?.protocol?.toUpperCase() || "TCP"}</strong>. Use the public address shown in Playit to join.</p>
      {status && !status.configured && <div className="inline-alert info">Install a trusted Playit agent on the panel host and set PLAYIT_BINARY to its absolute path, then restart the panel. See the README.</div>}
      {status?.claimUrl && <p><a className="text-link" href={status.claimUrl} target="_blank" rel="noreferrer">Claim this agent <ExternalLink size={14} /></a></p>}
      <div className="playit-actions"><Button disabled={!status || status.running || !status.configured} loading={busy} onClick={() => void action("start")}><Play size={15}/> Start agent</Button><Button variant="secondary" disabled={!status?.running || busy} onClick={() => void action("stop")}><Square size={14}/> Stop</Button><Button variant="secondary" disabled={!status || busy} onClick={() => void action("reset")}><RotateCcw size={14}/> Reset</Button></div>
      <p className="muted">Administrators only. A Playit agent can expose host-local services. Stopping the panel stops its agent; restart it here after panel restart.</p>
    </>}
  </Panel>;
}
