import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  MoreHorizontal,
  ArrowUpRight,
  Cpu,
  MemoryStick,
  RotateCw,
  Star,
  Terminal,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { Server } from "../../shared/types";
import { useStore } from "../lib/store";
import { gb } from "../lib/api";
import { ServerIcon, StatusBadge, Button, EmptyState } from "./ui";
export default function ServerTable({
  servers,
  compact = false,
}: {
  servers: Server[];
  compact?: boolean;
}) {
  const { power, data } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!servers.length)
    return (
      <EmptyState
        title="A clean slate. Endless possibilities."
        description="Create your first deployment and make something worth sharing."
        icon={<ServerIcon template={{ kind: "minecraft" } as any} />}
      >
        <Link to="/servers/new" className="btn btn-primary">
          Create a deployment <ArrowUpRight size={16} />
        </Link>
      </EmptyState>
    );
  return (
    <div className="table-scroll">
      <table className={`server-table ${compact ? "compact" : ""}`}>
        <thead>
          <tr>
            <th>Deployment</th>
            <th>Status</th>
            <th>Resources</th>
            {!compact && <th>Node</th>}
            <th className="right">Manage</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.id}>
              <td>
                <Link to={"/servers/" + s.id} className="server-name-cell">
                  <ServerIcon server={s} />
                  <div>
                    <strong>
                      {s.name}
                      {s.favorite && (
                        <Star size={11} className="favorite-star" />
                      )}
                    </strong>
                    <span>
                      {s.software}
                      {s.kind === "minecraft" && s.templateId !== "velocity"
                        ? " · " + s.version
                        : s.kind === "bot"
                          ? " · " +
                            (s.templateId === "python" ? "Python" : "Node.js")
                          : s.kind === "website"
                            ? " · Nginx"
                            : ""}
                    </span>
                  </div>
                </Link>
              </td>
              <td>
                <StatusBadge status={s.status} />
              </td>
              <td>
                <div className="table-resources">
                  <span>
                    <Cpu size={12} />
                    {s.cpu}%
                  </span>
                  <span>
                    <MemoryStick size={12} />
                    {gb(s.memory)} GB
                  </span>
                </div>
              </td>
              {!compact && (
                <td>
                  <span className="node-table">
                    <i
                      className={`flag flag-${data?.nodes.find((n) => n.id === s.nodeId)?.country.toLowerCase()}`}
                    />
                    {data?.nodes.find((n) => n.id === s.nodeId)?.region ||
                      s.nodeId}
                  </span>
                </td>
              )}
              <td>
                <div className="table-actions">
                  <button
                    className={`icon-button power-button ${s.status === "running" ? "stop" : "start"}`}
                    disabled={
                      busy === s.id ||
                      [
                        "installing",
                        "suspended",
                        "starting",
                        "stopping",
                      ].includes(s.status)
                    }
                    aria-label={`${s.status === "running" ? "Stop" : "Start"} ${s.name}`}
                    title={
                      s.status === "running"
                        ? "Stop deployment"
                        : "Start deployment"
                    }
                    onClick={async () => {
                      setBusy(s.id);
                      await power(s, s.status === "running" ? "stop" : "start");
                      setBusy(null);
                    }}
                  >
                    {s.status === "running" ? (
                      <Square size={13} />
                    ) : ["starting", "stopping"].includes(s.status) ? (
                      <RotateCw size={14} className="spin" />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>
                  <Link
                    className="icon-button"
                    to={"/servers/" + s.id}
                    title="Open console"
                    aria-label={`Manage ${s.name}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                  <div className="row-menu-wrap">
                    <button
                      className="icon-button"
                      aria-label={`More options for ${s.name}`}
                      onClick={() => setMenu(menu === s.id ? null : s.id)}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menu === s.id && (
                      <>
                        <div
                          className="menu-click-away"
                          onClick={() => setMenu(null)}
                        />
                        <div className="dropdown row-menu">
                          <Link to={"/servers/" + s.id}>
                            <Terminal size={15} />
                            Open console
                          </Link>
                          <Link to={"/servers/" + s.id + "/files"}>
                            Manage files
                          </Link>
                          <Link to={"/servers/" + s.id + "/settings"}>
                            Deployment settings
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
