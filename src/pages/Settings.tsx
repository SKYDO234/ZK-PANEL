import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  UserRound,
  KeyRound,
  BookOpen,
  ShieldCheck,
  Plus,
  Copy,
  Trash2,
  Check,
  Save,
  LogOut,
  ExternalLink,
  Terminal,
  Server,
  Layers3,
  Bot,
  Wallet,
  Sparkles,
  Info,
  Eye,
  EyeOff,
} from "lucide-react";
import { useStore, useResource } from "../lib/store";
import { api, date } from "../lib/api";
import {
  PageHeader,
  Panel,
  PanelHeading,
  Button,
  Field,
  Badge,
  Modal,
  Loading,
  ErrorState,
  EmptyState,
} from "../components/ui";
export default function Settings() {
  const { data, refresh, toast, logout } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "account";
  const [busy, setBusy] = useState(false),
    [keyName, setKeyName] = useState(""),
    [create, setCreate] = useState(false),
    [created, setCreated] = useState<{ key: string; name: string } | null>(
      null,
    ),
    [show, setShow] = useState(false),
    [docs, setDocs] = useState("start");
  const { data: keys, loading, error, reload } = useResource<any[]>("/keys");
  const u = data!.user;
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="A WORKSPACE THAT FEELS LIKE YOU"
        title="Settings & resources"
        description="Your account, your access, and a little help along the way."
      />
      <div className="category-tabs">
        <button
          className={tab === "account" ? "active" : ""}
          onClick={() => setParams({ tab: "account" })}
        >
          <UserRound size={15} />
          My account
        </button>
        <button
          className={tab === "api" ? "active" : ""}
          onClick={() => setParams({ tab: "api" })}
        >
          <KeyRound size={15} />
          API keys
        </button>
        <button
          className={tab === "docs" ? "active" : ""}
          onClick={() => setParams({ tab: "docs" })}
        >
          <BookOpen size={15} />
          Getting started
        </button>
      </div>
      {tab === "account" ? (
        <div className="settings-grid">
          <Panel className="form-panel">
            <PanelHeading
              title="The person behind the projects"
              subtitle="Keep your account details up to date."
            />
            <div className="account-profile">
              <span className="user-avatar large">
                {u.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <h3>{u.name}</h3>
                <span>
                  {u.role === "admin"
                    ? "Workspace administrator"
                    : "Workspace member"}
                </span>
              </div>
              <Badge tone="green">ACTIVE</Badge>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const f = new FormData(e.currentTarget);
                const password = String(f.get("password") || "");
                try {
                  await api("/account", {
                    method: "PATCH",
                    body: {
                      name: f.get("name"),
                      email: f.get("email"),
                      ...(password
                        ? {
                            password,
                            currentPassword: f.get("currentPassword"),
                          }
                        : {}),
                    },
                  });
                  toast("Account settings saved.");
                  await refresh();
                  (e.target as HTMLFormElement).reset();
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Full name" required>
                <input
                  name="name"
                  defaultValue={u.name}
                  minLength={2}
                  maxLength={60}
                  required
                />
              </Field>
              <Field label="Email address" required>
                <input
                  name="email"
                  type="email"
                  defaultValue={u.email}
                  required
                />
              </Field>
              <div className="form-divider" />
              <h3 className="form-section-title">Change your password</h3>
              <Field label="Current password">
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Required to change your password"
                />
              </Field>
              <Field
                label="New password"
                hint="At least 12 characters. Changing it signs out other sessions."
              >
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Leave blank to keep your password"
                />
              </Field>
              <Button type="submit" loading={busy}>
                <Save size={15} />
                Save account
              </Button>
            </form>
          </Panel>
          <div>
            <Panel className="form-panel">
              <PanelHeading title="Your workspace" />
              <dl className="detail-dl">
                <div>
                  <dt>Environment</dt>
                  <dd>
                    <Badge tone={data!.mode === "demo" ? "amber" : "green"}>
                      {data!.mode === "demo"
                        ? "Interactive demo"
                        : "Docker production"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>Panel version</dt>
                  <dd>0.1.0</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>INR · Indian rupee</dd>
                </div>
                <div>
                  <dt>Member since</dt>
                  <dd>{date(u.createdAt)}</dd>
                </div>
              </dl>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await logout();
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                <LogOut size={15} />
                Sign out
              </Button>
            </Panel>
            <div className="inline-note">
              <ShieldCheck size={18} />
              <span>
                Passwords use salted scrypt hashes. Sessions are HTTP-only. API
                keys are hashed, and deployment secrets are encrypted at rest.
              </span>
            </div>
          </div>
        </div>
      ) : tab === "api" ? (
        <>
          <Panel>
            <PanelHeading
              title="A key to your next integration"
              subtitle="Use personal API keys for scripts and the tools you build."
            >
              <Button onClick={() => setCreate(true)}>
                <Plus size={16} />
                Create API key
              </Button>
            </PanelHeading>
            <div className="inline-note key-note">
              <ShieldCheck size={17} />
              <span>
                Keys have your account's deployment access, but cannot use
                administrator endpoints. Treat them like passwords.
              </span>
            </div>
            {loading ? (
              <Loading />
            ) : error ? (
              <ErrorState message={error} retry={reload} />
            ) : keys?.length ? (
              <div className="api-key-list">
                {keys.map((k) => (
                  <div className="api-key-row" key={k.id}>
                    <span className="backup-icon">
                      <KeyRound size={21} />
                    </span>
                    <div>
                      <strong>{k.name}</strong>
                      <code>{k.prefix}••••••••••••••••</code>
                      <small>Created {date(k.createdAt)}</small>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        if (
                          !confirm(
                            "Revoke " +
                              k.name +
                              "? Integrations using it will stop working.",
                          )
                        )
                          return;
                        try {
                          await api("/keys/" + k.id, { method: "DELETE" });
                          toast("API key revoked.");
                          await reload();
                        } catch (e) {
                          toast((e as Error).message, "error");
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Build something that connects."
                description="Create a key to manage your deployments from scripts and integrations."
                icon={<KeyRound size={28} />}
              >
                <Button variant="secondary" onClick={() => setCreate(true)}>
                  Create your first key
                </Button>
              </EmptyState>
            )}
          </Panel>
          <Panel className="api-example">
            <PanelHeading
              title="Your first request"
              subtitle="Replace the example key with one you create."
            />
            <pre>
              curl {window.location.origin}/api/servers \{"\n"} -H
              "Authorization: Bearer zk_your_private_key"
            </pre>
            <p className="muted">
              Explore <code>GET /api/templates</code>,{" "}
              <code>POST /api/servers</code>, and{" "}
              <code>POST /api/servers/:id/power</code>. All requests are scoped
              to your account.
            </p>
          </Panel>
        </>
      ) : (
        <div className="docs-layout">
          <Panel className="docs-nav">
            {[
              { id: "start", label: "Welcome to ZK", icon: Server },
              { id: "minecraft", label: "Your first world", icon: Layers3 },
              {
                id: "hosting",
                label: "Websites, bots & containers",
                icon: Terminal,
              },
              { id: "autopilot", label: "Meet Autopilot", icon: Sparkles },
              { id: "billing", label: "Wallet & billing", icon: Wallet },
              { id: "discord", label: "Discord companion", icon: Bot },
              {
                id: "production",
                label: "Going to production",
                icon: ShieldCheck,
              },
            ].map((d) => (
              <button
                className={docs === d.id ? "active" : ""}
                key={d.id}
                onClick={() => setDocs(d.id)}
              >
                <d.icon size={17} />
                {d.label}
              </button>
            ))}
          </Panel>
          <Panel className="docs-content">
            <Badge tone="green">THE ZK FIELD GUIDE</Badge>
            {docs === "start" ? (
              <>
                <h2>Your next big thing starts here.</h2>
                <p>
                  ZK PANEL brings Minecraft, games, websites, containers, and
                  bots into one workspace. Every deployment gets its own
                  resources, files, console, backups, and safety nets.
                </p>
                <h3>Three steps to your first launch</h3>
                <ol>
                  <li>
                    Choose a <Link to="/ziyn">ZIYN template</Link> — a
                    ready-to-run foundation for your idea.
                  </li>
                  <li>
                    Pick a region and a resource plan, name your deployment, and
                    review its startup settings.
                  </li>
                  <li>
                    Launch. Follow installation in the console, then make it
                    yours.
                  </li>
                </ol>
                <div className="inline-note">
                  <Info size={17} />
                  {data!.mode === "demo"
                    ? "You are in an interactive demo. Files, backups, accounts, and wallet actions persist, but compute and payments are simulated."
                    : "You are connected to a real Docker-backed panel. Your administrator controls available images and nodes."}
                </div>
              </>
            ) : docs === "minecraft" ? (
              <>
                <h2>A world of your own.</h2>
                <p>
                  Paper is a great place to start for a plugin-powered SMP.
                  Choose Fabric or Forge for mods, Vanilla for the original
                  experience, or Velocity to connect servers.
                </p>
                <h3>Before you launch</h3>
                <ol>
                  <li>
                    Select your server software and a supported Minecraft
                    version.
                  </li>
                  <li>
                    Accept the Minecraft EULA. The runtime downloads the correct
                    server JAR automatically.
                  </li>
                  <li>
                    Allow at least 4 GB RAM for a small Paper server; modpacks
                    often need more.
                  </li>
                  <li>
                    Open the console and wait for the server to finish starting.
                  </li>
                </ol>
                <h3>Make it yours</h3>
                <p>
                  Use Files to edit server.properties and upload worlds.
                  Discover compatible plugins in the Plugins tab. Create a
                  backup before major changes. Restart after adding or removing
                  plugins.
                </p>
                <p>
                  In demo mode, plugin installs create clearly labeled metadata,
                  not executable JARs.
                </p>
              </>
            ) : docs === "hosting" ? (
              <>
                <h2>More than a game server panel.</h2>
                <h3>Websites</h3>
                <p>
                  Choose Static website, then upload index.html and your assets
                  in Files. The Network tab shows your HTTP allocation. Point
                  your own domain to the node and configure a TLS reverse proxy.
                </p>
                <h3>Bots</h3>
                <p>
                  Choose Node.js or Python. Upload your entry file, package.json
                  or requirements.txt, and source files. Set your bot token in
                  Startup settings while stopped, then start the deployment.
                </p>
                <h3>Containers</h3>
                <p>
                  Choose Alpine for a minimal Linux userland or Redis for a
                  persistent cache. Arbitrary host images, privileged
                  containers, host networking, and Docker socket access are not
                  available to users.
                </p>
                <div className="inline-note">
                  <ShieldCheck size={17} />
                  Application dependencies are installed inside your isolated
                  container. Your code never runs on the panel host.
                </div>
              </>
            ) : docs === "autopilot" ? (
              <>
                <h2>A little less managing.</h2>
                <p>
                  Autopilot is your per-deployment safety net. Turn on only what
                  you need.
                </p>
                <h3>Crash recovery</h3>
                <p>
                  Unexpected exits trigger up to 3 restarts per hour. If
                  failures continue, recovery pauses and asks you to
                  investigate.
                </p>
                <h3>Backups & schedules</h3>
                <p>
                  Back up your workspace on a recurring schedule. Keep up to 5
                  snapshots; remove old ones to free slots. Stop a deployment
                  before restoring.
                </p>
                <h3>Idle sleep & spending alerts</h3>
                <p>
                  Stop quiet deployments after a configurable idle period. Start
                  them manually when needed. Set a monthly allocation threshold
                  for activity alerts. Autopilot never adds surprise wallet
                  charges.
                </p>
              </>
            ) : docs === "billing" ? (
              <>
                <h2>Simple, prepaid hosting.</h2>
                <p>
                  Add credit to your wallet, then launch a deployment. Each plan
                  covers 30 days. Renew from deployment settings when you're
                  ready; expired deployments are suspended, not silently billed.
                </p>
                <h3>Real payments</h3>
                <p>
                  Production checkout uses Stripe in INR. Funds are credited
                  only after a signed webhook confirms the payment. Your ledger
                  shows pending, paid, and failed transactions.
                </p>
                <h3>Demo wallet</h3>
                <p>
                  Demo credit has no monetary value and cannot be used in
                  production. Receipts are wallet records, not tax invoices.
                </p>
              </>
            ) : docs === "discord" ? (
              <>
                <h2>Your community is your control room.</h2>
                <p>
                  Run the included ZK Companion bot, link your account with a
                  one-time code, and manage only your own deployments with slash
                  commands.
                </p>
                <p>
                  Use /zk list, status, start, stop, restart, backup, and
                  command. The bot enforces the same ownership rules as the
                  panel.
                </p>
                <Link className="btn btn-primary" to="/discord">
                  Set up the companion <ExternalLink size={15} />
                </Link>
              </>
            ) : (
              <>
                <h2>From preview to production.</h2>
                <p>
                  Production requires Docker, a strong SESSION_SECRET, HTTPS,
                  and an administrator-created account. Demo access and demo
                  payments are disabled in Docker mode.
                </p>
                <ol>
                  <li>
                    Read README.md and docs/PRODUCTION.md in the repository.
                  </li>
                  <li>
                    Use dedicated Docker hosts or authenticated remote ZK
                    agents.
                  </li>
                  <li>Review runtime images and set IMAGE_ALLOWLIST.</li>
                  <li>
                    Configure PUBLIC_URL, secure cookies, Stripe, and Discord
                    secrets.
                  </li>
                  <li>
                    Run npm run admin:create, build the app, and deploy behind
                    TLS.
                  </li>
                  <li>
                    Test restores, node failure handling, and your off-site
                    backup policy before accepting customers.
                  </li>
                </ol>
                <div className="inline-alert warning">
                  This is an early-access implementation, not a audited drop-in
                  replacement for mature hosting platforms. Complete a security
                  and operational review before public hosting.
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
      {create && (
        <Modal
          title="A key to your next idea"
          description="Give this key a name that tells you where it's used."
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const result = await api<{ key: string; name: string }>(
                  "/keys",
                  { body: { name: keyName } },
                );
                setCreated(result);
                setCreate(false);
                setKeyName("");
                await reload();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Key name">
              <input
                required
                minLength={2}
                maxLength={40}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="My deployment script"
              />
            </Field>
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCreate(false)}
              >
                Cancel
              </Button>
              <Button loading={busy} type="submit">
                <KeyRound size={15} />
                Create key
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {created && (
        <Modal
          title="Your key is ready"
          description="Copy it now. This is the only time the full key will be shown."
          onClose={() => setCreated(null)}
        >
          <div className="created-key">
            <code>{created.key}</code>
            <button
              className="icon-button"
              aria-label="Copy API key"
              onClick={() =>
                navigator.clipboard
                  .writeText(created.key)
                  .then(() => toast("API key copied. Store it securely."))
                  .catch(() =>
                    toast("Select the key and copy it manually.", "info"),
                  )
              }
            >
              <Copy size={18} />
            </button>
          </div>
          <div className="inline-note">
            <ShieldCheck size={17} />
            Store it in a secret manager. Never commit it to a public repository
            or put it in browser code.
          </div>
          <Button className="full-width" onClick={() => setCreated(null)}>
            <Check size={16} />
            I've stored it securely
          </Button>
        </Modal>
      )}
    </div>
  );
}
