import { useState } from 'react';
import type { Server } from '../../shared/types';
import { api } from '../lib/api';
import { Button, Panel, PanelHeading } from './ui';

type Result = { record: { name: string; type: string; content: string }; port: number; created: boolean };
export default function Subdomain({ server }: { server: Server }) {
  const [hostname, setHostname] = useState(''), [target, setTarget] = useState(''), [result, setResult] = useState<Result | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(provider: 'manual' | 'cloudflare') {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api<Result>(`/servers/${server.id}/subdomain`, { body: { hostname, target, provider } })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Panel className="form-panel"><PanelHeading title="Subdomain DNS" subtitle="Add a DNS-only record for a public node IP." />
    <p className="muted">Enter a domain you control and the public IP that reaches this deployment. Codespaces web URLs and Playit addresses are not direct node IPs.</p>
    <label>Subdomain<input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="play.example.com" /></label>
    <label>Public node IP<input value={target} onChange={e => setTarget(e.target.value)} placeholder="203.0.113.10" /></label>
    <div className="playit-actions"><Button variant="secondary" disabled={busy} onClick={() => void submit('manual')}>Show manual record</Button><Button disabled={busy} onClick={() => void submit('cloudflare')}>Create in Cloudflare</Button></div>
    {error && <div className="inline-alert error" role="alert">{error}</div>}
    {result && <div className="inline-alert info" role="status">{result.created ? 'Cloudflare accepted the record' : 'Create this DNS record at your provider'}: {result.record.type} {result.record.name} → {result.record.content}. Use port {result.port} when connecting.</div>}
    <p className="muted">DNS does not open ports, create a Playit tunnel, route websites, or provide HTTPS. Open the node firewall; websites also need a reverse proxy and TLS. Minecraft clients generally need the port appended.</p>
  </Panel>;
}
