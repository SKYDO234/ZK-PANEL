import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ShieldCheck,
  HardDrive,
  Moon,
  Wallet,
  ArrowUpRight,
  Check,
  Activity,
  ChevronRight,
} from "lucide-react";
import { useStore } from "../lib/store";
import {
  PageHeader,
  Panel,
  ServerIcon,
  StatusBadge,
  Badge,
  EmptyState,
} from "../components/ui";
import PolicyEditor from "../components/PolicyEditor";
export default function AutopilotPage() {
  const { data } = useStore();
  const [selected, setSelected] = useState(data!.servers[0]?.id || "");
  const server = data!.servers.find((s) => s.id === selected);
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="A LITTLE PEACE OF MIND. INCLUDED."
        title="Meet your co-pilot."
        description="You bring the ideas. Autopilot looks after the everyday."
      >
        <Badge tone="green">
          <Sparkles size={13} />
          ONLY ON ZK
        </Badge>
      </PageHeader>
      <div className="autopilot-hero">
        <div>
          <span className="hero-eyebrow">
            <span />
            YOUR INFRASTRUCTURE HAS BACKUP
          </span>
          <h2>
            Go build.
            <br />
            <span>We've got this.</span>
          </h2>
          <p>
            Smart recovery, timely backups, and quieter idle hours.
            <br />
            Four thoughtful safety nets. One less thing on your mind.
          </p>
        </div>
        <div className="autopilot-hero-orbit">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <span className="orbit-center">
            <Sparkles size={46} />
          </span>
          <span className="orbit-item one">
            <ShieldCheck size={24} />
          </span>
          <span className="orbit-item two">
            <HardDrive size={23} />
          </span>
          <span className="orbit-item three">
            <Moon size={23} />
          </span>
          <span className="orbit-item four">
            <Wallet size={23} />
          </span>
        </div>
      </div>
      <div className="autopilot-feature-strip">
        {[
          {
            icon: ShieldCheck,
            title: "Bounce back, automatically",
            text: "Guardrailed crash recovery",
          },
          {
            icon: HardDrive,
            title: "Keep your world safe",
            text: "Scheduled workspace snapshots",
          },
          {
            icon: Moon,
            title: "Rest when things are quiet",
            text: "CPU & player-aware idle sleep",
          },
          {
            icon: Wallet,
            title: "Stay in the know",
            text: "Monthly spending alerts",
          },
        ].map((f) => (
          <div key={f.title}>
            <f.icon size={22} />
            <strong>{f.title}</strong>
            <span>{f.text}</span>
          </div>
        ))}
      </div>
      {server ? (
        <>
          <div className="section-label-row">
            <h2>Make it work your way</h2>
            <div className="autopilot-server-select">
              <ServerIcon server={server} size="small" />
              <select
                aria-label="Select deployment for Autopilot"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data!.servers.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <StatusBadge status={server.status} />
            </div>
          </div>
          <PolicyEditor server={server} key={server.id} />
        </>
      ) : (
        <Panel>
          <EmptyState
            title="Your co-pilot is ready when you are"
            description="Create a deployment to set up its Autopilot policy."
          >
            <Link to="/servers/new" className="btn btn-primary">
              Create deployment <ArrowUpRight size={16} />
            </Link>
          </EmptyState>
        </Panel>
      )}
    </div>
  );
}
