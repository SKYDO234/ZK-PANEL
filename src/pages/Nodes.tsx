import { useState } from "react";
import {
  Network,
  Globe2,
  Cpu,
  MemoryStick,
  HardDrive,
  Plus,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  Copy,
  Info,
  Check,
  Server,
  MapPin,
} from "lucide-react";
import type { NodeInfo } from "../../shared/types";
import { useStore } from "../lib/store";
import { api, gb } from "../lib/api";
import {
  PageHeader,
  Panel,
  Button,
  Badge,
  Progress,
  Modal,
  Field,
  EmptyState,
} from "../components/ui";
export default function Nodes() {
  const { data, refresh, toast } = useStore();
  const [add, setAdd] = useState(false),
    [busy, setBusy] = useState(""),
    [created, setCreated] = useState<{ node: NodeInfo } | null>(null);
  const check = async (n: NodeInfo) => {
    setBusy(n.id);
    try {
      await api("/nodes/" + n.id + "/check", { body: {} });
      toast(`${n.region} is responding.`);
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      await refresh();
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="A GOOD HOME FOR YOUR NEXT IDEA"
        title="Nodes & regions"
        description="Your infrastructure, closer to the people who use it."
      >
        {data!.user.role === "admin" && (
          <Button onClick={() => setAdd(true)}>
            <Plus size={16} />
            Connect a node
          </Button>
        )}
      </PageHeader>
      <div className="nodes-overview">
        <div>
          <span className="nodes-overview-icon">
            <Globe2 size={28} />
          </span>
          <div>
            <strong>
              {data!.nodes.filter((n) => n.status === "online").length} regions.
              One connected workspace.
            </strong>
            <p>
              {data!.mode === "demo"
                ? "Explore three sample regions. Connect a Docker node to host for real."
                : "Docker-backed compute with resource limits and isolated workspaces."}
            </p>
          </div>
        </div>
        <Badge tone="green" dot>
          {data!.mode === "demo"
            ? "DEMO INFRASTRUCTURE"
            : "DOCKER INFRASTRUCTURE"}
        </Badge>
      </div>
      <div className="nodes-grid">
        {data!.nodes.map((n) => {
          const count = data!.servers.filter((s) => s.nodeId === n.id).length;
          return (
            <Panel className="node-card" key={n.id}>
              <div className="node-card-head">
                <span
                  className={`flag large flag-${n.country.toLowerCase()}`}
                />
                <Badge
                  dot
                  tone={
                    n.status === "online"
                      ? "green"
                      : n.status === "maintenance"
                        ? "amber"
                        : "red"
                  }
                >
                  {n.status}
                </Badge>
              </div>
              <h2>{n.region}</h2>
              <p>{n.name}</p>
              <div className="node-location">
                <MapPin size={13} />
                {n.country === "IN"
                  ? "India · Asia Pacific"
                  : n.country === "SG"
                    ? "Singapore · Asia Pacific"
                    : n.country === "DE"
                      ? "Germany · Europe"
                      : "Custom region"}
                <span>
                  {data!.mode === "demo"
                    ? n.latency + " ms"
                    : n.endpoint
                      ? "Remote agent"
                      : "Local Docker"}
                </span>
              </div>
              <div className="node-resources">
                <div>
                  <span>
                    <MemoryStick size={14} />
                    Memory allocated
                  </span>
                  <strong>
                    {gb(n.usedMemory)} / {gb(n.memory)} GB
                  </strong>
                  <Progress value={(n.usedMemory / n.memory) * 100} />
                </div>
                <div>
                  <span>
                    <HardDrive size={14} />
                    Storage allocated
                  </span>
                  <strong>
                    {gb(n.usedDisk)} / {gb(n.disk)} GB
                  </strong>
                  <Progress value={(n.usedDisk / n.disk) * 100} tone="blue" />
                </div>
                <div>
                  <span>
                    <Cpu size={14} />
                    CPU allocation
                  </span>
                  <strong>
                    {n.usedCpu / 100} / {n.cpu / 100} cores
                  </strong>
                  <Progress value={(n.usedCpu / n.cpu) * 100} tone="purple" />
                </div>
              </div>
              <div className="node-card-footer">
                <span>
                  <Server size={14} />
                  {count} deployment{count === 1 ? "" : "s"}
                </span>
                {data!.user.role === "admin" && (
                  <button
                    className="icon-button"
                    aria-label={"Check " + n.name}
                    title="Check node health"
                    disabled={busy === n.id}
                    onClick={() => void check(n)}
                  >
                    <RefreshCw
                      size={15}
                      className={busy === n.id ? "spin" : ""}
                    />
                  </button>
                )}
              </div>
              {data!.user.role === "admin" && (
                <button
                  className="node-maintenance"
                  onClick={async () => {
                    try {
                      await api("/admin/nodes/" + n.id, {
                        method: "PATCH",
                        body: { maintenance: !n.maintenance },
                      });
                      toast(
                        n.maintenance
                          ? "Node is accepting new deployments."
                          : "Node in maintenance. Existing deployments stay online.",
                      );
                      await refresh();
                    } catch (e) {
                      toast((e as Error).message, "error");
                    }
                  }}
                >
                  {n.maintenance ? "End maintenance" : "Schedule maintenance"}
                  <ArrowUpRight size={13} />
                </button>
              )}
            </Panel>
          );
        })}
      </div>
      {!data!.nodes.length && (
        <Panel>
          <EmptyState
            title="Your infrastructure starts here"
            description="Connect your first Docker agent to start hosting."
            icon={<Network size={30} />}
          >
            <Button onClick={() => setAdd(true)}>Connect a node</Button>
          </EmptyState>
        </Panel>
      )}
      <div className="node-security-banner">
        <ShieldCheck size={27} />
        <div>
          <h3>Isolation isn't an add-on.</h3>
          <p>
            Non-root containers, dropped capabilities, CPU and memory limits,
            private workspaces, and authenticated node agents. The foundations
            matter.
          </p>
        </div>
      </div>
      {add && (
        <Modal
          title="Give your ideas a new home"
          description="Connect a ZK node agent over HTTPS. Run the agent on a dedicated Docker host, not your everyday machine."
          onClose={() => setAdd(false)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("add");
              const f = new FormData(e.currentTarget);
              try {
                const result = await api<{ node: NodeInfo }>("/admin/nodes", {
                  body: {
                    name: f.get("name"),
                    region: f.get("region"),
                    country: f.get("country"),
                    endpoint: f.get("endpoint"),
                    token: f.get("token"),
                    memory: Number(f.get("memory")),
                    disk: Number(f.get("disk")),
                    cpu: Number(f.get("cpu")),
                  },
                });
                setCreated(result);
                setAdd(false);
                await refresh();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy("");
              }
            }}
          >
            <div className="form-two-col">
              <Field label="Node name" required>
                <input
                  name="name"
                  placeholder="Mumbai · Node 01"
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Region" required>
                <input
                  name="region"
                  placeholder="Mumbai"
                  required
                  minLength={2}
                />
              </Field>
            </div>
            <Field
              label="Agent URL"
              required
              hint="HTTPS is required. Configure the agent's NODE_TOKEN before connecting."
            >
              <input
                name="endpoint"
                type="url"
                placeholder="https://node.example.com:8080"
                required
              />
            </Field>
            <Field
              label="Agent token"
              required
              hint="The NODE_TOKEN already configured on your agent. Encrypted after verification."
            >
              <input
                name="token"
                type="password"
                minLength={32}
                maxLength={256}
                required
                autoComplete="new-password"
                placeholder="Your agent’s private token"
              />
            </Field>
            <Field label="Country code" required>
              <input
                name="country"
                placeholder="IN"
                minLength={2}
                maxLength={2}
                required
              />
            </Field>
            <div className="form-three-col">
              <Field label="Memory (MB)">
                <input
                  name="memory"
                  type="number"
                  defaultValue={8192}
                  min={1024}
                  required
                />
              </Field>
              <Field label="Disk (MB)">
                <input
                  name="disk"
                  type="number"
                  defaultValue={102400}
                  min={10240}
                  required
                />
              </Field>
              <Field label="CPU (100 = 1 core)">
                <input
                  name="cpu"
                  type="number"
                  defaultValue={400}
                  min={100}
                  step={100}
                  required
                />
              </Field>
            </div>
            <details className="setup-details">
              <summary>How do I prepare an agent?</summary>
              <ol>
                <li>
                  Install Docker on a dedicated host and clone this repository.
                </li>
                <li>
                  Generate a secret: <code>openssl rand -hex 32</code>.
                </li>
                <li>
                  Set <code>NODE_TOKEN</code>, <code>SESSION_SECRET</code>,{" "}
                  <code>DATA_DIR</code>, and <code>WORKSPACE_HOST_PATH</code> in
                  the agent environment.
                </li>
                <li>
                  Start with <code>npm run agent</code> behind a TLS reverse
                  proxy.
                </li>
                <li>
                  Paste the HTTPS agent URL and the same NODE_TOKEN above. ZK
                  verifies the agent before saving.
                </li>
              </ol>
            </details>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdd(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy === "add"}>
                <Network size={16} />
                Verify & connect
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {created && (
        <Modal
          title="Your node is connected"
          description="The agent token was verified and encrypted. Your node is ready for new deployments."
          onClose={() => setCreated(null)}
        >
          <div className="inline-note">
            <ShieldCheck size={16} />
            Keep your agent token secret. It grants control of the Docker host.
            Rotate it if exposed.
          </div>
        </Modal>
      )}
    </div>
  );
}
