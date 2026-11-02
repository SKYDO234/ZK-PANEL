import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Star,
  ArrowUpRight,
  SlidersHorizontal,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api, gb } from "../lib/api";
import { KIND_LABELS } from "../../shared/types";
import {
  PageHeader,
  Panel,
  ServerIcon,
  StatusBadge,
  Button,
  EmptyState,
  Progress,
} from "../components/ui";
import ServerTable from "../components/ServerTable";
export default function Deployments() {
  const { data, refresh, toast } = useStore();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [status, setStatus] = useState("all"),
    [view, setView] = useState("list"),
    [favorites, setFavorites] = useState(false);
  let servers = data!.servers.filter(
    (s) =>
      (s.name + " " + s.software).toLowerCase().includes(query.toLowerCase()) &&
      (kind === "all" || s.kind === kind) &&
      (status === "all" || s.status === status) &&
      (!favorites || s.favorite),
  );
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="YOUR INFRASTRUCTURE"
        title="Deployments"
        description="Every world, app, and idea. Right where you need it."
      >
        <Link to="/servers/new" className="btn btn-primary">
          <Plus size={17} />
          Create deployment
        </Link>
      </PageHeader>
      <div className="filter-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder="Search deployments..."
            aria-label="Search deployments"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="offline">Offline</option>
          <option value="installing">Installing</option>
          <option value="error">Needs attention</option>
        </select>
        <button
          className={`btn btn-secondary favorite-filter ${favorites ? "selected" : ""}`}
          onClick={() => setFavorites(!favorites)}
        >
          <Star size={15} />
          Favorites
        </button>
        <div className="view-switch">
          <button
            aria-label="List view"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
          <button
            aria-label="Grid view"
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={17} />
          </button>
        </div>
      </div>
      <div className="category-tabs">
        <button
          className={kind === "all" ? "active" : ""}
          onClick={() => setKind("all")}
        >
          All deployments <span>{data!.servers.length}</span>
        </button>
        {Object.entries(KIND_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={kind === key ? "active" : ""}
            onClick={() => setKind(key)}
          >
            {label}
            <span>{data!.servers.filter((s) => s.kind === key).length}</span>
          </button>
        ))}
      </div>
      {view === "list" ? (
        <Panel>
          <ServerTable servers={servers} />
        </Panel>
      ) : servers.length ? (
        <div className="server-card-grid">
          {servers.map((s) => (
            <Panel className="deployment-grid-card" key={s.id}>
              <div className="deployment-card-top">
                <ServerIcon server={s} size="large" />
                <button
                  className="icon-button"
                  aria-label={s.favorite ? "Remove favorite" : "Add favorite"}
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
                  <Star
                    size={18}
                    fill={s.favorite ? "currentColor" : "none"}
                    className={s.favorite ? "favorite-star" : ""}
                  />
                </button>
              </div>
              <Link to={"/servers/" + s.id}>
                <h2>{s.name}</h2>
              </Link>
              <p>
                {s.software} · {s.version}
              </p>
              <StatusBadge status={s.status} />
              <div className="grid-resources">
                <span>
                  <Cpu size={15} />
                  {s.cpu}% CPU
                </span>
                <span>
                  <MemoryStick size={15} />
                  {gb(s.memory)} GB RAM
                </span>
              </div>
              <div className="grid-card-footer">
                <span>
                  {data!.nodes.find((n) => n.id === s.nodeId)?.region}
                </span>
                <Link to={"/servers/" + s.id}>
                  Manage <ArrowUpRight size={15} />
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            title="No deployments found"
            description="Try another search or filter, or launch something new."
          >
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setKind("all");
                setStatus("all");
                setFavorites(false);
              }}
            >
              Clear filters
            </Button>
          </EmptyState>
        </Panel>
      )}
      <div className="list-summary">
        Showing {servers.length} of {data!.servers.length} deployments{" "}
        <span>Resource limits are allocated per deployment.</span>
      </div>
    </div>
  );
}
