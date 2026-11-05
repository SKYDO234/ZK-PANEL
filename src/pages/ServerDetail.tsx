import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Terminal,
  FolderOpen,
  Puzzle,
  HardDrive,
  Clock3,
  Sparkles,
  Settings2,
  Network,
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Copy,
  Star,
  Cpu,
  MemoryStick,
  Timer,
  Users,
  ExternalLink,
  Globe2,
  ShieldCheck,
  Info,
  Plus,
  Trash2,
  Download,
  RotateCcw,
  Search,
  Check,
  ChevronRight,
  AlertTriangle,
  Save,
  Power,
  Zap,
  CalendarClock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  Server,
  Metrics,
  Backup,
  Schedule,
  Autopilot,
  Plugin,
  PluginSearchResult,
  Ziyn,
} from "../../shared/types";
import { useStore, useResource } from "../lib/store";
import { api, gb, money, size, ago, date, uptime, download } from "../lib/api";
import {
  PageHeader,
  Panel,
  PanelHeading,
  Badge,
  Button,
  ServerIcon,
  StatusBadge,
  Modal,
  Field,
  Loading,
  ErrorState,
  EmptyState,
  Toggle,
  Progress,
} from "../components/ui";
import Console from "../components/Console";
import FileManager from "../components/FileManager";
import PolicyEditor from "../components/PolicyEditor";
import MinecraftProperties from "../components/MinecraftProperties";
const tabs = [
  { id: "", name: "Console", icon: Terminal },
  { id: "files", name: "Files", icon: FolderOpen },
  { id: "plugins", name: "Plugins", icon: Puzzle },
  { id: "properties", name: "Properties", icon: Settings2 },
  { id: "backups", name: "Backups", icon: HardDrive },
  { id: "schedules", name: "Schedules", icon: Clock3 },
  { id: "autopilot", name: "Autopilot", icon: Sparkles },
  { id: "network", name: "Network", icon: Network },
  { id: "settings", name: "Settings", icon: Settings2 },
];
export default function ServerDetail() {
  const { id } = useParams();
  const location = useLocation();
  const tab = location.pathname.split("/")[3] || "";
  const { data, refresh, power, toast } = useStore();
  const server = data!.servers.find((s) => s.id === id);
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null),
    [busy, setBusy] = useState(false),
    [kill, setKill] = useState(false);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = () =>
      api<Metrics>("/servers/" + id + "/stats")
        .then((m) => {
          if (active) setMetrics(m);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, server?.status]);
  if (!server)
    return (
      <EmptyState
        title="This deployment isn't in your workspace"
        description="It may have been deleted, or you may not have access."
      >
        <Link className="btn btn-primary" to="/servers">
          Back to deployments
        </Link>
      </EmptyState>
    );
  const s = server;
  const node = data!.nodes.find((n) => n.id === s.nodeId);
  const act = async (action: "start" | "stop" | "restart" | "kill") => {
    setBusy(true);
    await power(s, action);
    setBusy(false);
    setKill(false);
  };
  return (
    <div className="page-enter server-detail">
      <Link className="back-link" to="/servers">
        <ArrowLeft size={14} />
        All deployments
      </Link>
      <div className="server-detail-heading">
        <ServerIcon server={s} size="large" />
        <div>
          <div className="server-detail-title">
            <h1>{s.name}</h1>
            <button
              className={`icon-button ${s.favorite ? "favorite-star" : ""}`}
              aria-label="Toggle favorite"
              onClick={async () => {
                try {
                  await api("/servers/" + s.id, {
                    method: "PATCH",
                    body: { favorite: !s.favorite },
                  });
                  await refresh();
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }}
            >
              <Star size={18} fill={s.favorite ? "currentColor" : "none"} />
            </button>
            <StatusBadge status={s.status} />
          </div>
          <p>
            {s.software} {s.version}
            <i />
            {node?.region}
            <i />
            <span className="mono">{s.id}</span>
          </p>
        </div>
        <div className="server-power">
          <Button
            variant="secondary"
            disabled={busy || s.status !== "running"}
            onClick={() => void act("restart")}
          >
            <RotateCw size={15} />
            Restart
          </Button>
          {s.status === "running" ? (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void act("stop")}
            >
              <Square size={13} />
              Stop
            </Button>
          ) : (
            <Button
              loading={busy}
              disabled={[
                "starting",
                "stopping",
                "installing",
                "suspended",
              ].includes(s.status)}
              onClick={() => void act("start")}
            >
              <Play size={15} />
              Start
            </Button>
          )}
        </div>
      </div>
      {s.status === "installing" && (
        <div className="inline-alert info">
          <Loading
            text={
              data!.mode === "demo"
                ? "Getting your demo deployment ready…"
                : "Installing your runtime. Image downloads can take a few minutes…"
            }
          />
        </div>
      )}
      {s.error && (
        <div className="inline-alert error">
          <AlertTriangle size={17} />
          {s.error}
          {s.status === "error" && (
            <button className="text-link" onClick={() => navigate("settings")}>
              Review settings
            </button>
          )}
        </div>
      )}
      <div className="server-metrics">
        <div>
          <span>
            <Cpu size={15} />
            CPU usage
          </span>
          <strong>
            {metrics?.cpu.toFixed(1) || "0"}
            <small>%</small>
          </strong>
          <Progress value={metrics?.cpu || 0} />
        </div>
        <div>
          <span>
            <MemoryStick size={15} />
            Memory
          </span>
          <strong>
            {metrics ? gb(metrics.memory) : "0"}
            <small>/ {gb(s.memory)} GB</small>
          </strong>
          <Progress
            value={metrics ? (metrics.memory / s.memory) * 100 : 0}
            tone="purple"
          />
        </div>
        <div>
          <span>
            <HardDrive size={15} />
            Disk usage
          </span>
          <strong>
            {metrics ? gb(metrics.disk) : "0"}
            <small>/ {gb(s.disk)} GB</small>
          </strong>
          <Progress
            value={metrics ? (metrics.disk / s.disk) * 100 : 0}
            tone="blue"
          />
        </div>
        <div>
          <span>
            {s.kind === "minecraft" ? <Users size={15} /> : <Timer size={15} />}{" "}
            {s.kind === "minecraft" ? "Players online" : "Uptime"}
          </span>
          <strong>
            {s.kind === "minecraft" ? (
              <>
                {metrics?.players || 0}
                <small>/ {metrics?.maxPlayers || 20}</small>
              </>
            ) : (
              uptime(metrics?.uptime || 0)
            )}
          </strong>
          <span className="metric-footnote">
            {data!.mode === "demo"
              ? "Simulated demo metrics"
              : "Reported by your node"}
          </span>
        </div>
      </div>
      <nav className="server-tabs">
        {tabs
          .filter((t) => (t.id !== "plugins" && t.id !== "properties") || s.kind === "minecraft")
          .filter((t) => t.id !== "properties" || !/bedrock|velocity/i.test(s.software))
          .map((t) => (
            <Link
              key={t.id}
              className={tab === t.id ? "active" : ""}
              to={"/servers/" + s.id + (t.id ? "/" + t.id : "")}
            >
              <t.icon size={16} />
              {t.name}
              {t.id === "autopilot" && <span className="tab-dot" />}
            </Link>
          ))}
      </nav>
      <div className="server-tab-content">
        {tab === "" ? (
          <>
            <Console server={s} />
            <Panel className="performance-panel">
              <PanelHeading
                title="Resource pulse"
                subtitle={
                  data!.mode === "demo"
                    ? "Sample resource history · demo compute"
                    : "Live resource history · sampled every 5 seconds"
                }
              >
                <Badge tone="green" dot>
                  LIVE
                </Badge>
              </PanelHeading>
              <div className="performance-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={metrics?.history || []}
                    margin={{ left: -25, right: 12, top: 15, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="cpu-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#bcf36b"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor="#bcf36b"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 5"
                      stroke="#292e29"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: "#7d877e" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={60}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#7d877e" }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#202620",
                        border: "1px solid #394333",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#c2c9bf" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      name="CPU %"
                      stroke="#bcf36b"
                      fill="url(#cpu-fill)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </>
        ) : tab === "files" ? (
          <FileManager server={s} />
        ) : tab === "plugins" ? (
          <PluginManager server={s} />
        ) : tab === "properties" && s.kind === "minecraft" && !/bedrock|velocity/i.test(s.software) ? (
          <MinecraftProperties server={s} />
        ) : tab === "backups" ? (
          <Backups server={s} />
        ) : tab === "schedules" ? (
          <Schedules server={s} />
        ) : tab === "autopilot" ? (
          <PolicyEditor server={s} />
        ) : tab === "network" ? (
          <NetworkTab server={s} />
        ) : tab === "settings" ? (
          <ServerSettings server={s} />
        ) : (
          <EmptyState
            title="Page not found"
            description="Choose one of the deployment tools above."
          />
        )}
      </div>
      {s.status === "running" && (
        <div className="danger-inline">
          <span>
            Something stuck? A force stop skips graceful shutdown and can lose
            unsaved data.
          </span>
          <button onClick={() => setKill(true)}>Force stop</button>
        </div>
      )}
      {kill && (
        <Modal
          title="Force stop this deployment?"
          description="This immediately kills the container. Unsaved world data or application state may be lost. Try a normal stop first."
          onClose={() => setKill(false)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setKill(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void act("kill")}
            >
              Force stop
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Backups({ server }: { server: Server }) {
  const { toast } = useStore();
  const {
    data: items,
    loading,
    error,
    reload,
  } = useResource<Backup[]>("/servers/" + server.id + "/backups");
  const [create, setCreate] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [restore, setRestore] = useState<Backup | null>(null);
  return (
    <>
      <Panel>
        <PanelHeading
          title="A safety net for your world"
          subtitle="Backups include your deployment's persistent workspace. Up to 5 snapshots."
        >
          <Button
            onClick={() => {
              setCreate(true);
              setName("Backup · " + new Date().toLocaleDateString("en-GB"));
            }}
          >
            <Plus size={16} />
            Create backup
          </Button>
        </PanelHeading>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : items?.length ? (
          <div className="backup-list">
            {items.map((b) => (
              <div className="backup-row" key={b.id}>
                <span className="backup-icon">
                  <HardDrive size={21} />
                </span>
                <div>
                  <strong>{b.name}</strong>
                  <span>
                    {date(b.createdAt)} · {size(b.size)} ·{" "}
                    {b.status === "ready" ? "SHA-256 verified" : b.status}
                  </span>
                </div>
                <Badge tone={b.status === "ready" ? "green" : "amber"}>
                  {b.status === "ready" ? "Ready" : b.status}
                </Badge>
                <div className="backup-actions">
                  <button
                    className="icon-button"
                    title="Download backup"
                    aria-label={"Download " + b.name}
                    disabled={b.status !== "ready"}
                    onClick={() =>
                      download(
                        "/servers/" +
                          server.id +
                          "/backups/" +
                          b.id +
                          "/download",
                        b.name.replace(/[^a-zA-Z0-9.-]/g, "-") + ".tar.gz",
                      ).catch((e) => toast(e.message, "error"))
                    }
                  >
                    <Download size={17} />
                  </button>
                  <button
                    className="icon-button"
                    title="Restore backup"
                    aria-label={"Restore " + b.name}
                    disabled={
                      b.status !== "ready" || server.status !== "offline"
                    }
                    onClick={() => setRestore(b)}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="icon-button danger-hover"
                    title="Delete backup"
                    aria-label={"Delete " + b.name}
                    onClick={async () => {
                      if (!window.confirm("Permanently delete this backup?"))
                        return;
                      try {
                        await api(
                          "/servers/" + server.id + "/backups/" + b.id,
                          { method: "DELETE" },
                        );
                        toast("Backup deleted.");
                        await reload();
                      } catch (e) {
                        toast((e as Error).message, "error");
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Your future self will thank you."
            description="Create a backup before big changes. Restore it whenever you need a fresh start."
            icon={<HardDrive size={30} />}
          >
            <Button variant="secondary" onClick={() => setCreate(true)}>
              <Plus size={15} />
              Create your first backup
            </Button>
          </EmptyState>
        )}
        <div className="table-footer">
          <span>
            <ShieldCheck size={14} />
            Backups are stored separately from your deployment.
          </span>
          <span>Stop the deployment before restoring.</span>
        </div>
      </Panel>
      {create && (
        <Modal
          title="Save this moment"
          description="Create a compressed snapshot of your deployment's files."
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/servers/" + server.id + "/backups", {
                  body: { name },
                });
                toast("Backup created and verified.");
                setCreate(false);
                await reload();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Backup name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={70}
              />
            </Field>
            <div className="inline-note">
              <Info size={16} />
              Minecraft worlds are flushed before a live backup. Other
              applications should be stopped for an application-consistent
              snapshot.
            </div>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreate(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                <HardDrive size={16} />
                Create backup
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {restore && (
        <Modal
          title="Restore this backup?"
          description="Your current workspace will be replaced with this snapshot. Download a fresh backup first if you want to keep current changes."
          onClose={() => setRestore(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRestore(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(
                    "/servers/" +
                      server.id +
                      "/backups/" +
                      restore.id +
                      "/restore",
                    { body: {} },
                  );
                  toast("Backup restored. Your deployment is ready to start.");
                  setRestore(null);
                  await reload();
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore backup
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Schedules({ server }: { server: Server }) {
  const { toast } = useStore();
  const {
    data: items,
    loading,
    error,
    reload,
  } = useResource<Schedule[]>("/servers/" + server.id + "/schedules");
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Panel>
        <PanelHeading
          title="Put the routine on rails"
          subtitle="Recurring tasks that run even when you're away."
        >
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            New schedule
          </Button>
        </PanelHeading>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : items?.length ? (
          <div className="schedule-list">
            {items.map((s) => (
              <div className="schedule-row" key={s.id}>
                <span className="schedule-icon">
                  <CalendarClock size={22} />
                </span>
                <div>
                  <strong>{s.name}</strong>
                  <span>
                    {s.action} · Every{" "}
                    {s.interval >= 1440
                      ? s.interval / 1440 + " day(s)"
                      : s.interval >= 60
                        ? s.interval / 60 + " hour(s)"
                        : s.interval + " minutes"}
                  </span>
                  {s.lastResult && (
                    <small>
                      Last run: {s.lastResult} ·{" "}
                      {s.lastRun ? ago(s.lastRun) : ""}
                    </small>
                  )}
                </div>
                <div className="schedule-next">
                  <span>Next run</span>
                  <strong>
                    {new Date(s.nextRun).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                </div>
                <Toggle
                  label={"Enable " + s.name}
                  checked={s.enabled}
                  onChange={async (value) => {
                    try {
                      await api(
                        "/servers/" + server.id + "/schedules/" + s.id,
                        { method: "PATCH", body: { enabled: value } },
                      );
                      await reload();
                    } catch (e) {
                      toast((e as Error).message, "error");
                    }
                  }}
                />
                <button
                  className="icon-button danger-hover"
                  aria-label={"Delete " + s.name}
                  onClick={async () => {
                    if (!confirm("Delete this schedule?")) return;
                    await api("/servers/" + server.id + "/schedules/" + s.id, {
                      method: "DELETE",
                    });
                    await reload();
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Make time for the fun part."
            description="Schedule restarts, backups, and commands. Your server takes it from there."
            icon={<Clock3 size={30} />}
          >
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Create a schedule
            </Button>
          </EmptyState>
        )}
      </Panel>
      {open && (
        <Modal
          title="A little help, right on time"
          description="All schedules repeat in UTC. The first run happens after one interval."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await api("/servers/" + server.id + "/schedules", {
                  body: {
                    name: f.get("name"),
                    action: f.get("action"),
                    interval: Number(f.get("interval")),
                    command: f.get("command") || "",
                    enabled: true,
                  },
                });
                toast("Schedule created.");
                setOpen(false);
                await reload();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Task name">
              <input
                name="name"
                placeholder="A fresh start, every morning"
                required
                minLength={2}
                maxLength={60}
              />
            </Field>
            <div className="form-two-col">
              <Field label="Action">
                <select name="action">
                  <option value="restart">Restart deployment</option>
                  <option value="backup">Create backup</option>
                  <option value="start">Start deployment</option>
                  <option value="stop">Stop deployment</option>
                  <option value="command">Send command</option>
                </select>
              </Field>
              <Field label="Repeat every">
                <select name="interval" defaultValue="1440">
                  <option value="5">5 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="360">6 hours</option>
                  <option value="720">12 hours</option>
                  <option value="1440">24 hours</option>
                  <option value="10080">7 days</option>
                </select>
              </Field>
            </div>
            <Field label="Command (only for Send command)">
              <input
                name="command"
                placeholder="say Welcome to the server!"
                maxLength={2000}
              />
            </Field>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button loading={busy} type="submit">
                Create schedule
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function PluginManager({ server }: { server: Server }) {
  const { data, toast } = useStore();
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("discover"),
    [busy, setBusy] = useState("");
  const {
    data: catalog,
    loading,
    error,
    reload,
  } = useResource<{ installed: Plugin[]; results: PluginSearchResult[] }>(
    "/servers/" +
      server.id +
      "/plugins?query=" +
      encodeURIComponent(search) +
      "&version=" +
      encodeURIComponent(server.version),
  );
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 350);
    return () => clearTimeout(t);
  }, [query]);
  const install = async (p: PluginSearchResult) => {
    setBusy(p.project_id);
    try {
      await api("/servers/" + server.id + "/plugins", {
        body: { projectId: p.project_id },
      });
      toast(
        data!.mode === "demo"
          ? "Demo plugin metadata added. Restart to explore the workflow."
          : "Plugin downloaded and checksum verified. Restart to load it.",
      );
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <div className="plugins-banner">
        <span>
          <Puzzle size={27} />
        </span>
        <div>
          <h2>A world with a little more you.</h2>
          <p>
            {data!.mode === "demo"
              ? "Explore plugin management with demo metadata. Production mode downloads verified Modrinth builds."
              : "Compatible plugins from Modrinth, verified with SHA-512 before installation."}
          </p>
        </div>
        <Badge tone="green">{server.software}</Badge>
      </div>
      <div className="filter-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins..."
          />
        </div>
        <div className="segmented">
          <button
            className={tab === "discover" ? "active" : ""}
            onClick={() => setTab("discover")}
          >
            Discover
          </button>
          <button
            className={tab === "installed" ? "active" : ""}
            onClick={() => setTab("installed")}
          >
            Installed <span>{catalog?.installed.length || 0}</span>
          </button>
        </div>
      </div>
      {loading ? (
        <Loading text="Finding your next upgrade…" />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : tab === "discover" ? (
        <div className="plugin-grid">
          {catalog?.results.map((p) => (
            <Panel className="plugin-card" key={p.project_id}>
              <div className="plugin-card-heading">
                <span className="plugin-icon">
                  {p.icon_url ? (
                    <img src={p.icon_url} alt="" />
                  ) : (
                    <Puzzle size={24} />
                  )}
                </span>
                <div>
                  <h3>{p.title}</h3>
                  <span>by {p.author}</span>
                </div>
              </div>
              <p>{p.description}</p>
              <div className="plugin-footer">
                <span>
                  <Download size={13} />
                  {Intl.NumberFormat("en", { notation: "compact" }).format(
                    p.downloads,
                  )}
                </span>
                <Button
                  variant="secondary"
                  loading={busy === p.project_id}
                  disabled={catalog.installed.some(
                    (i) => i.projectId === p.project_id,
                  )}
                  onClick={() => void install(p)}
                >
                  {catalog.installed.some(
                    (i) => i.projectId === p.project_id,
                  ) ? (
                    <>
                      <Check size={14} />
                      Installed
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Install
                    </>
                  )}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          {catalog?.installed.length ? (
            <div className="installed-plugins">
              {catalog.installed.map((p) => (
                <div className="backup-row" key={p.id}>
                  <span className="backup-icon">
                    <Puzzle size={22} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <span>
                      {p.version} · {size(p.size)}
                      {p.demo ? " · Demo metadata" : ""}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!confirm("Remove " + p.name + "?")) return;
                      try {
                        await api(
                          "/servers/" + server.id + "/plugins/" + p.id,
                          { method: "DELETE" },
                        );
                        toast("Plugin removed. Restart to apply.");
                        await reload();
                      } catch (e) {
                        toast((e as Error).message, "error");
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Make it your own."
              description="Discover a plugin and install it with one click."
              icon={<Puzzle size={28} />}
            >
              <Button variant="secondary" onClick={() => setTab("discover")}>
                Explore plugins
              </Button>
            </EmptyState>
          )}
        </Panel>
      )}
      {!loading && tab === "discover" && !catalog?.results.length && (
        <EmptyState
          title="No compatible plugins found"
          description="Try another search or Minecraft version."
        />
      )}
    </>
  );
}
function NetworkTab({ server: s }: { server: Server }) {
  const { data, toast } = useStore();
  const address =
    (data!.nodes.find((n) => n.id === s.nodeId)?.endpoint
      ? new URL(data!.nodes.find((n) => n.id === s.nodeId)!.endpoint).hostname
      : s.address) +
    ":" +
    s.port;
  return (
    <div className="settings-grid">
      <Panel className="form-panel">
        <PanelHeading
          title="A place to connect"
          subtitle="Your deployment's primary allocation."
        />
        <div className="connection-address">
          <Globe2 size={23} />
          <div>
            <span>Server address</span>
            <strong>{address}</strong>
          </div>
          <button
            className="icon-button"
            aria-label="Copy server address"
            onClick={() =>
              navigator.clipboard
                .writeText(address)
                .then(() => toast("Address copied."))
                .catch(() =>
                  toast(
                    "Clipboard unavailable. Select and copy the address.",
                    "info",
                  ),
                )
            }
          >
            <Copy size={18} />
          </button>
        </div>
        <dl className="detail-dl">
          <div>
            <dt>Primary port</dt>
            <dd>{s.port}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{data!.nodes.find((n) => n.id === s.nodeId)?.name}</dd>
          </div>
          <div>
            <dt>Network isolation</dt>
            <dd>Unprivileged bridge network</dd>
          </div>
        </dl>
        {s.kind === "website" && (
          <a
            className="btn btn-secondary"
            href={"http://" + address}
            target="_blank"
            rel="noreferrer"
          >
            Open website <ExternalLink size={15} />
          </a>
        )}
        <div className="inline-note">
          <Info size={16} />
          {data!.mode === "demo"
            ? "Demo addresses are not publicly reachable. Connect a Docker node to expose a real allocation."
            : "Open this port in your node firewall. For a domain, point DNS to the node and configure a TLS reverse proxy."}
        </div>
      </Panel>
      <Panel className="form-panel">
        <PanelHeading
          title="Custom domain ready"
          subtitle="Bring your own corner of the internet."
        />
        <div className="domain-steps">
          <div>
            <span>1</span>
            <p>Point your domain's DNS A record to your node's public IP.</p>
          </div>
          <div>
            <span>2</span>
            <p>
              Configure Caddy or Nginx on your host to proxy the domain to port{" "}
              {s.port}.
            </p>
          </div>
          <div>
            <span>3</span>
            <p>
              Enable HTTPS. Your reverse proxy handles certificates and routing.
            </p>
          </div>
        </div>
        <a
          className="text-link"
          href="https://caddyserver.com/docs/quick-starts/reverse-proxy"
          target="_blank"
          rel="noreferrer"
        >
          Reverse proxy guide <ExternalLink size={14} />
        </a>
      </Panel>
    </div>
  );
}
function ServerSettings({ server: s }: { server: Server }) {
  const { data, refresh, toast } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState(s.name),
    [description, setDescription] = useState(s.description),
    [env, setEnv] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [del, setDel] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const {
    data: startup,
    loading,
    error,
    reload,
  } = useResource<{ environment: Record<string, string>; template: Ziyn }>(
    "/servers/" + s.id + "/startup",
  );
  useEffect(() => {
    if (startup) setEnv(startup.environment);
  }, [startup]);
  const save = async () => {
    setBusy(true);
    try {
      await api("/servers/" + s.id, {
        method: "PATCH",
        body: { name, description },
      });
      toast("Deployment details saved.");
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-grid">
      <div>
        <Panel className="form-panel">
          <PanelHeading title="The little details" />
          <Field label="Deployment name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={48}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={180}
              placeholder="What's this deployment for?"
            />
          </Field>
          <Button loading={busy} onClick={save}>
            <Save size={15} />
            Save changes
          </Button>
        </Panel>
        <Panel className="form-panel">
          <PanelHeading
            title="Your prepaid plan"
            subtitle="No automatic charges. Renew when you're ready."
          />
          <dl className="detail-dl">
            <div>
              <dt>Plan</dt>
              <dd>{data!.plans.find((p) => p.id === s.planId)?.name}</dd>
            </div>
            <div>
              <dt>Resources</dt>
              <dd>
                {gb(s.memory)} GB RAM · {s.cpu / 100} vCPU
              </dd>
            </div>
            <div>
              <dt>Renews through</dt>
              <dd>{date(s.expiresAt)}</dd>
            </div>
            <div>
              <dt>30-day renewal</dt>
              <dd>{money(s.monthlyCost)}</dd>
            </div>
          </dl>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              if (
                !confirm(
                  "Renew for 30 days for " +
                    money(s.monthlyCost) +
                    " from your wallet?",
                )
              )
                return;
              setBusy(true);
              try {
                await api("/servers/" + s.id + "/renew", { body: {} });
                toast("Renewed for 30 more days.");
                await refresh();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Clock3 size={15} />
            Renew for 30 days
          </Button>
        </Panel>
        <Panel className="form-panel danger-panel">
          <PanelHeading
            title="Delete this deployment"
            subtitle="Permanent and irreversible. Your files and backups will be removed."
          />
          <Button variant="danger" onClick={() => setDel(true)}>
            <Trash2 size={15} />
            Delete deployment
          </Button>
        </Panel>
      </div>
      <Panel className="form-panel">
        <PanelHeading
          title="Startup & environment"
          subtitle={
            s.status === "running"
              ? "Stop the deployment to edit startup variables."
              : "Changes apply when the container is recreated or restarted by the runtime."
          }
        />
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/servers/" + s.id + "/startup", {
                  method: "PUT",
                  body: { environment: env },
                });
                toast("Startup settings saved.");
                await refresh();
                await reload();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {startup?.template.variables.map((v) => (
              <Field
                key={v.key}
                label={v.label}
                hint={
                  v.secret
                    ? "Leave blank to keep the existing encrypted value."
                    : v.description
                }
              >
                {v.options ? (
                  <select
                    disabled={s.status === "running"}
                    value={env[v.key] || v.default}
                    onChange={(e) =>
                      setEnv({ ...env, [v.key]: e.target.value })
                    }
                  >
                    {v.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    disabled={s.status === "running"}
                    type={v.secret ? "password" : "text"}
                    value={env[v.key] || ""}
                    onChange={(e) =>
                      setEnv({ ...env, [v.key]: e.target.value })
                    }
                    placeholder={v.secret ? "Unchanged" : "Default"}
                    maxLength={4000}
                  />
                )}
              </Field>
            ))}
            <Button
              type="submit"
              loading={busy}
              disabled={s.status === "running"}
            >
              <Save size={15} />
              Save startup settings
            </Button>
          </form>
        )}
      </Panel>
      {del && (
        <Modal
          title="Say goodbye to this deployment?"
          description="This deletes the container, all files, backups, and schedules. Prepaid time is not refunded. Type the deployment name to confirm."
          onClose={() => setDel(false)}
        >
          <Field label={s.name}>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Type the deployment name"
            />
          </Field>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setDel(false)}>
              Keep deployment
            </Button>
            <Button
              variant="danger"
              disabled={confirmation !== s.name}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/servers/" + s.id, {
                    method: "DELETE",
                    body: { confirmation },
                  });
                  await refresh();
                  toast("Deployment deleted.");
                  navigate("/servers");
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete permanently
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
