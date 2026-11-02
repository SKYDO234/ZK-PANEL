import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Plus,
  Server,
  Cpu,
  MemoryStick,
  Wallet,
  ArrowUpRight as Trend,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  HardDrive,
  Zap,
  Clock3,
  Globe2,
  Activity as ActivityIcon,
  Check,
  Layers3,
  CircleHelp,
  Box,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useStore } from "../lib/store";
import { ago, gb, money } from "../lib/api";
import {
  PageHeader,
  Panel,
  PanelHeading,
  Badge,
  ServerIcon,
  Progress,
  TextLink,
} from "../components/ui";
import ServerTable from "../components/ServerTable";
const spark = (base: number) =>
  Array.from({ length: 15 }, (_, i) => ({
    v: base + Math.sin(i * 1.4) * 5 + i * 0.8,
  }));
export default function Dashboard() {
  const { data } = useStore();
  const [filter, setFilter] = useState("all");
  const d = data!;
  const running = d.servers.filter((s) => s.status === "running");
  const memory = d.servers.reduce((a, s) => a + s.memory, 0);
  const cpu = d.servers.reduce((a, s) => a + s.cpu, 0);
  const filtered = d.servers
    .filter((s) => filter === "all" || s.kind === filter)
    .slice(0, 5);
  const online = d.nodes.filter((n) => n.status === "online");
  return (
    <div className="dashboard page-enter">
      <PageHeader
        title={`Welcome back, ${d.user.name.split(" ")[0]}`}
        description="A little overview. A lot of possibility."
      >
        <span className="dashboard-date">
          <span className="live-dot" />
          {d.mode === "demo" ? "Your demo workspace" : "Your workspace"} is
          ready
        </span>
        <Link className="btn btn-primary" to="/servers/new">
          <Plus size={17} />
          Create deployment
        </Link>
      </PageHeader>
      <section className="hero-card">
        <img
          className="hero-art"
          src="/images/voxel-world.webp"
          alt="A floating voxel world with a glowing green portal"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span />
            YOUR NEXT WORLD STARTS HERE
          </div>
          <h2>
            Big ideas.
            <br />
            Zero limits<span>.</span>
          </h2>
          <p>
            From your first Minecraft world to your next big launch.
            <br className="desktop-break" /> Powerful hosting. Beautifully
            simple.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/servers/new">
              Build something great <ArrowUpRight size={16} />
            </Link>
            <Link to="/ziyn" className="hero-secondary">
              Explore ZIYN <ChevronRight size={15} />
            </Link>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={13} />
            Isolated by design. Built to be yours.
          </div>
        </div>
        <div className="hero-world-tag">
          <span className="live-dot" />
          <span>WORLDS WITHOUT LIMITS</span>
          <Box size={13} />
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          label="Total deployments"
          value={String(d.servers.length).padStart(2, "0")}
          icon={<Server size={18} />}
          color="green"
          detail={
            <>
              <span className="stat-positive">
                <span className="live-dot" />
                {running.length} running
              </span>
              <span>in your workspace</span>
            </>
          }
          chart={spark(16)}
        />
        <Stat
          label="CPU allocation"
          value={String(cpu / 100)}
          unit="cores"
          icon={<Cpu size={18} />}
          color="blue"
          detail={
            <>
              <span className="stat-blue">Ready when you are</span>
              <span>dedicated limits</span>
            </>
          }
          chart={spark(23)}
        />
        <Stat
          label="Memory allocation"
          value={gb(memory)}
          unit="GB"
          icon={<MemoryStick size={18} />}
          color="purple"
          detail={
            <>
              <span className="stat-purple">
                {d.servers.length} deployments
              </span>
              <span>room to grow</span>
            </>
          }
          chart={spark(18)}
        />
        <Link to="/billing" className="stat-link">
          <Stat
            label="Wallet balance"
            value={money(d.user.balance)}
            icon={<Wallet size={18} />}
            color="amber"
            detail={
              <>
                <span className="stat-amber">Manage your wallet</span>
                <ArrowUpRight size={13} />
              </>
            }
            chart={spark(27)}
          />
        </Link>
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <Panel className="deployments-panel">
            <PanelHeading
              title="Your deployments"
              subtitle="Your worlds, apps, and ideas. All in one place."
            >
              <TextLink to="/servers">View all</TextLink>
            </PanelHeading>
            <div className="deployment-tabs">
              {[
                {
                  id: "all",
                  label: "All deployments",
                  count: d.servers.length,
                },
                {
                  id: "minecraft",
                  label: "Minecraft",
                  count: d.servers.filter((s) => s.kind === "minecraft").length,
                },
                {
                  id: "bot",
                  label: "Bots",
                  count: d.servers.filter((s) => s.kind === "bot").length,
                },
                {
                  id: "website",
                  label: "Websites",
                  count: d.servers.filter((s) => s.kind === "website").length,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={filter === tab.id ? "active" : ""}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                  <span>{tab.count}</span>
                </button>
              ))}
            </div>
            <ServerTable servers={filtered} compact />
            <div className="table-footer">
              <span>
                <span className="live-dot" />
                {d.mode === "demo" ? "Live demo state" : "Container state"} ·
                updates automatically
              </span>
              <Link to="/servers/new">
                <Plus size={13} />
                New deployment
              </Link>
            </div>
          </Panel>
          <Panel className="activity-panel">
            <PanelHeading title="Recently in your workspace">
              <TextLink to="/activity">Activity log</TextLink>
            </PanelHeading>
            <div className="recent-activity">
              {d.activity.slice(0, 3).map((a, i) => (
                <Link
                  to={a.serverId ? "/servers/" + a.serverId : "/activity"}
                  className="recent-activity-row"
                  key={a.id}
                >
                  <span className={`activity-icon ${a.severity}`}>
                    {a.action.includes("backup") ? (
                      <HardDrive size={16} />
                    ) : a.action.includes("autopilot") ? (
                      <Sparkles size={16} />
                    ) : a.action.includes("started") ? (
                      <Zap size={16} />
                    ) : (
                      <ActivityIcon size={16} />
                    )}
                  </span>
                  <div>
                    <strong>{a.detail}</strong>
                    <span>
                      {a.action
                        .replaceAll(".", " ")
                        .replace(/^./, (c) => c.toUpperCase())}
                    </span>
                  </div>
                  <time>{ago(a.createdAt)}</time>
                </Link>
              ))}
              {!d.activity.length && (
                <p className="muted empty-small">
                  Your next action will appear here.
                </p>
              )}
            </div>
          </Panel>
        </div>
        <div className="dashboard-secondary">
          <Panel className="autopilot-card">
            <div className="autopilot-card-top">
              <span className="autopilot-symbol">
                <Sparkles size={23} />
              </span>
              <Badge tone="green">YOUR CO-PILOT</Badge>
            </div>
            <h2>
              You create.
              <br />
              We keep it running.
            </h2>
            <p>
              Meet ZK Autopilot. A little peace of mind for everything you host.
            </p>
            <div className="autopilot-features">
              <span>
                <ShieldCheck size={15} />
                Smart crash recovery
                <i>
                  <Check size={12} />
                </i>
              </span>
              <span>
                <HardDrive size={15} />
                Automatic backups
                <i>
                  <Check size={12} />
                </i>
              </span>
              <span>
                <Clock3 size={15} />
                Idle sleep & savings
                <i>
                  <Check size={12} />
                </i>
              </span>
            </div>
            <Link to="/autopilot" className="autopilot-cta">
              Explore Autopilot <ArrowUpRight size={16} />
            </Link>
            <div className="autopilot-glow" />
          </Panel>
          <Panel className="nodes-mini">
            <PanelHeading title="A world of possibilities">
              <Globe2 size={17} className="muted" />
            </PanelHeading>
            <p className="nodes-subtitle">
              {online.length} nodes online. Pick your place.
            </p>
            {d.nodes.slice(0, 3).map((n) => (
              <Link to="/nodes" className="node-mini-row" key={n.id}>
                <span className={`flag flag-${n.country.toLowerCase()}`} />
                <div>
                  <strong>{n.region}</strong>
                  <span>
                    {n.country === "IN"
                      ? "India"
                      : n.country === "SG"
                        ? "Singapore"
                        : "Germany"}
                  </span>
                </div>
                <span className="node-latency">
                  {d.mode === "demo" ? n.latency + " ms" : n.status}
                </span>
                <span
                  className={`live-dot ${n.status !== "online" ? "gray" : ""}`}
                />
              </Link>
            ))}
            <Link to="/nodes" className="nodes-view">
              View all regions <ArrowUpRight size={14} />
            </Link>
          </Panel>
        </div>
      </div>
      <section className="quick-launch">
        <div>
          <span className="quick-icon">
            <Layers3 size={22} />
          </span>
          <div>
            <h3>One panel. Your next anything.</h3>
            <p>Start with a ZIYN. Make it your own.</p>
          </div>
        </div>
        <div className="quick-launch-links">
          {[
            { kind: "minecraft", label: "Minecraft", id: "paper" },
            { kind: "game", label: "Game server", id: "rust-game" },
            { kind: "container", label: "Container", id: "alpine" },
            { kind: "website", label: "Website", id: "website" },
            { kind: "bot", label: "Bot", id: "node" },
          ].map((k) => (
            <Link key={k.kind} to={"/servers/new?ziyn=" + k.id}>
              <ServerIcon
                server={{ kind: k.kind as any, templateId: k.id }}
                size="small"
              />
              {k.label}
              <Plus size={13} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  icon,
  color,
  detail,
  chart,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  color: string;
  detail: React.ReactNode;
  chart: { v: number }[];
}) {
  return (
    <Panel className={`stat-card ${color}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-number">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      <div className="stat-bottom">
        <div>{detail}</div>
        <div className="stat-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <defs>
                <linearGradient
                  id={"spark-" + color}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                dataKey="v"
                type="monotone"
                stroke="currentColor"
                strokeWidth={1.6}
                fill={"url(#spark-" + color + ")"}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  );
}
