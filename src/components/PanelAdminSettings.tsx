import { useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useResource, useStore } from "../lib/store";
import { Button, ErrorState, Field, Loading, Panel, PanelHeading } from "./ui";

type Settings = { registration: boolean; maxServers: number; mode: string; remoteOnly: boolean; publicUrl: string };
export default function PanelAdminSettings() {
  const { data, loading, error, reload } = useResource<Settings>("/admin/settings");
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Settings unavailable"} retry={reload} />;
  return <div className="admin-settings-layout">
    <Panel><PanelHeading title="Access & deployment limits" subtitle="Changes apply immediately to new registrations and deployments."><ShieldCheck size={20}/></PanelHeading>
      <form className="admin-settings-form" key={`${data.registration}-${data.maxServers}`} onSubmit={async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
        try { await api("/admin/settings", { method: "PUT", body: { registration: form.get("registration") === "true", maxServers: Number(form.get("maxServers")) } }); toast("Panel settings saved."); await reload(); }
        catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
      }}>
        <Field label="Public registration" hint="Allow new users to create accounts. Disabled is recommended for private Codespaces."><select name="registration" defaultValue={String(data.registration)}><option value="false">Disabled</option><option value="true">Enabled</option></select></Field>
        <Field label="Deployment limit per user" hint="Applies to new deployments; existing deployments are not removed."><input type="number" name="maxServers" min="1" max="1000" defaultValue={data.maxServers} required /></Field>
        <Button type="submit" loading={busy}><Save size={15}/> Save settings</Button>
      </form>
    </Panel>
    <Panel><PanelHeading title="Runtime & security" subtitle="Configured by the host environment; these values cannot be changed here."/><div className="admin-settings-form"><p>Runtime: <strong>{data.mode}</strong></p><p>Node mode: <strong>{data.remoteOnly ? "Remote only" : "Local Docker allowed"}</strong></p><p>Public URL: <strong>{data.publicUrl}</strong></p><p className="muted">For secrets, image approvals and Docker socket access, use the host configuration and production guide. Never expose the socket publicly.</p></div></Panel>
  </div>;
}
