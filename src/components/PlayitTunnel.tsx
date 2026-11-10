import { useEffect, useState } from "react";
import { ExternalLink, Play, RotateCcw, Square } from "lucide-react";
import type { Server } from "../../shared/types";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { Button, Panel, PanelHeading } from "./ui";

type Status = { running: boolean; claimUrl: string | null; localPort: number; protocol: string; configured: boolean; lastError?: string | null; events?: string[] };
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
      {status?.lastError && <div className="inline-alert error" role="alert">{status.lastError}</div>}
      {status && !status.configured && <div className="inline-alert info">Install a trusted JTG-compatible Playit agent on the deployment node and set PLAYIT_BINARY to its absolute path, then restart that node service. Newer Playit releases use a different CLI; see the README.</div>}
      {status?.claimUrl && <p><a className="text-link" href={status.claimUrl} target="_blank" rel="noreferrer">Claim this agent <ExternalLink size={14} /></a></p>}
      <div className="playit-actions"><Button disabled={!status || status.running || !status.configured} loading={busy} onClick={() => void action("start")}><Play size={15}/> Start agent</Button><Button variant="secondary" disabled={!status?.running || busy} onClick={() => void action("stop")}><Square size={14}/> Stop</Button><Button variant="secondary" disabled={!status || busy} onClick={() => void action("reset")}><RotateCcw size={14}/> Reset</Button></div>
      <div className="playit-progress" aria-label="Playit setup progress" role="log">
        <strong>Setup progress</strong>
        {status?.events?.length ? status.events.map((line, index) => <div key={index}>{line}</div>) : <div className="muted">Start the agent to see setup progress here.</div>}
      </div>
      <p className="muted">Process running does not confirm that a public tunnel is online. Finish setup and check your address in Playit.</p>
      <p className="muted">Administrators only. A Playit agent can expose node-local services. Restart it here after the panel or node agent restarts.</p>
    </>}
  </Panel>;
}
