import { useState } from "react";
import PanelAdminSettings from "../components/PanelAdminSettings";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Users,
  Server,
  Wallet,
  Network,
  Search,
  Plus,
  ArrowUpRight,
  Settings2,
  MoreHorizontal,
  UserCog,
  Layers3,
} from "lucide-react";
import { useStore, useResource } from "../lib/store";
import { api, money, date } from "../lib/api";
import type { User } from "../../shared/types";
import {
  PageHeader,
  Panel,
  PanelHeading,
  Button,
  Badge,
  Modal,
  Field,
  Loading,
  ErrorState,
  EmptyState,
} from "../components/ui";
export default function Admin() {
  const { data, toast, refresh } = useStore();
  const {
    data: overview,
    loading,
    error,
    reload,
  } = useResource<any>("/admin/overview");
  const [tab, setTab] = useState("users"),
    [query, setQuery] = useState(""),
    [edit, setEdit] = useState<User | null>(null),
    [busy, setBusy] = useState(false);
  if (data!.user.role !== "admin")
    return (
      <EmptyState
        title="A little beyond your workspace"
        description="This area is reserved for panel administrators."
      >
        <Link className="btn btn-primary" to="/">
          Back to overview
        </Link>
      </EmptyState>
    );
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="THE BIG PICTURE"
        title="Panel administration"
        description="Your people, your infrastructure, your business."
      >
        <Badge tone="green">
          <ShieldCheck size={13} />
          ADMINISTRATOR
        </Badge>
      </PageHeader>
      <div className="admin-stat-grid">
        {[
          {
            label: "Registered users",
            value: overview?.users.length || 0,
            icon: Users,
          },
          {
            label: "Total deployments",
            value: overview?.servers.length || 0,
            icon: Server,
          },
          {
            label: "Connected nodes",
            value: overview?.nodes.length || 0,
            icon: Network,
          },
          {
            label: "Verified payments",
            value: money(overview?.revenue || 0),
            icon: Wallet,
          },
        ].map((s) => (
          <Panel key={s.label}>
            <s.icon size={21} />
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </Panel>
        ))}
      </div>
      <div className="category-tabs">
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          <Users size={15} />
          Users
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings2 size={15} /> Settings</button>
        <button
          className={tab === "tools" ? "active" : ""}
          onClick={() => setTab("tools")}
        >
          <Settings2 size={15} />
          Panel tools
        </button>
      </div>
      {tab === "users" ? (
        <Panel>
          <PanelHeading title="The people behind the projects">
            <div className="search-input small">
              <Search size={16} />
              <input
                placeholder="Search users..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </PanelHeading>
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error} retry={reload} />
          ) : (
            <div className="table-scroll">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Wallet</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overview?.users
                    .filter((u: User) =>
                      (u.name + " " + u.email)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((u: User) => (
                      <tr key={u.id}>
                        <td>
                          <div className="admin-user">
                            <span className="user-avatar small">
                              {u.name
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <div>
                              <strong>{u.name}</strong>
                              <span>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge
                            tone={u.role === "admin" ? "purple" : "neutral"}
                          >
                            {u.role}
                          </Badge>
                        </td>
                        <td>{money(u.balance)}</td>
                        <td>
                          <Badge tone={u.suspended ? "red" : "green"} dot>
                            {u.suspended ? "Suspended" : "Active"}
                          </Badge>
                        </td>
                        <td>{date(u.createdAt)}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => setEdit(u)}
                          >
                            <UserCog size={14} />
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : tab === "settings" ? (
        <PanelAdminSettings />
      ) : (
        <div className="admin-tools-grid">
          {[
            {
              icon: Network,
              title: "Nodes & capacity",
              text: "Connect Docker agents, check health, and manage allocations.",
              to: "/nodes",
            },
            {
              icon: Layers3,
              title: "ZIYN governance",
              text: "Import, review, enable, and export deployment templates.",
              to: "/ziyn",
            },
            {
              icon: Wallet,
              title: "Financial ledger",
              text: "Review your account transactions and payment receipts.",
              to: "/billing",
            },
            {
              icon: ShieldCheck,
              title: "API & account security",
              text: "Manage your credentials, keys, and workspace access.",
              to: "/settings?tab=api",
            },
          ].map((t) => (
            <Panel key={t.title}>
              <t.icon size={28} />
              <h2>{t.title}</h2>
              <p>{t.text}</p>
              <Link to={t.to} className="text-link">
                Open tool <ArrowUpRight size={15} />
              </Link>
            </Panel>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          title={"Manage " + edit.name}
          description={edit.email}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const credit = Number(f.get("credit") || 0);
                await api("/admin/users/" + edit.id, {
                  method: "PATCH",
                  body: {
                    role: f.get("role"),
                    suspended: f.get("suspended") === "true",
                    ...(credit
                      ? {
                          credit: Math.round(credit * 100),
                          reason: f.get("reason"),
                        }
                      : {}),
                  },
                });
                toast("User updated. Ledger adjustments are audited.");
                setEdit(null);
                await reload();
                await refresh();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Role">
              <select
                name="role"
                defaultValue={edit.role}
                disabled={edit.id === data!.user.id}
              >
                <option value="user">Member</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
            <Field label="Account status">
              <select
                name="suspended"
                defaultValue={String(edit.suspended)}
                disabled={edit.id === data!.user.id}
              >
                <option value="false">Active</option>
                <option value="true">Suspended</option>
              </select>
            </Field>
            <Field
              label="Manual wallet credit (INR)"
              hint="Optional. Adds prepaid credit, not a recorded customer payment."
            >
              <input
                type="number"
                name="credit"
                min={1}
                max={100000}
                step="0.01"
                placeholder="0.00"
              />
            </Field>
            <Field
              label="Adjustment reason"
              hint="Required when adding credit."
            >
              <input
                name="reason"
                maxLength={200}
                placeholder="Support credit, promotional grant…"
              />
            </Field>
            {edit.id === data!.user.id && (
              <div className="inline-note">
                You cannot suspend or demote your own account.
              </div>
            )}
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save user
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
