import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Search,
  ShieldCheck,
  Download,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowUpRight,
} from "lucide-react";
import { useStore } from "../lib/store";
import { ago, date } from "../lib/api";
import { PageHeader, Panel, Button, Badge, EmptyState } from "../components/ui";
export default function ActivityPage() {
  const { data } = useStore();
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const list = data!.activity.filter(
    (a) =>
      (filter === "all" || a.severity === filter) &&
      (a.detail + " " + a.action).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="EVERY ACTION HAS A STORY"
        title="Workspace activity"
        description="A clear trail of what's happening across your infrastructure."
      >
        <Badge tone="green">
          <ShieldCheck size={13} />
          AUDIT TRAIL
        </Badge>
      </PageHeader>
      <div className="filter-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder="Search activity..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter activity severity"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All events</option>
          <option value="success">Successful actions</option>
          <option value="info">Information</option>
          <option value="warning">Warnings</option>
          <option value="error">Errors</option>
        </select>
        <Button
          variant="secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(list, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "zk-activity.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={15} />
          Export log
        </Button>
      </div>
      <Panel className="activity-page-panel">
        {list.length ? (
          list.map((a) => (
            <div className="activity-full-row" key={a.id}>
              <span className={`activity-icon ${a.severity}`}>
                {a.severity === "success" ? (
                  <CheckCircle2 size={19} />
                ) : a.severity === "warning" || a.severity === "error" ? (
                  <AlertTriangle size={19} />
                ) : (
                  <Activity size={19} />
                )}
              </span>
              <div>
                <strong>{a.detail}</strong>
                <span>
                  {a.action.replaceAll(".", " ")}
                  <i />
                  {date(a.createdAt)} at{" "}
                  {new Date(a.createdAt).toLocaleTimeString("en-GB")}
                </span>
              </div>
              <time>{ago(a.createdAt)}</time>
              {a.serverId && data!.servers.some((s) => s.id === a.serverId) && (
                <Link
                  className="icon-button"
                  to={"/servers/" + a.serverId}
                  aria-label="Open related deployment"
                >
                  <ArrowUpRight size={17} />
                </Link>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            title="Nothing here just yet"
            description="Your next deployment, backup, or configuration change will appear here."
            icon={<Activity size={28} />}
          />
        )}
      </Panel>
    </div>
  );
}
