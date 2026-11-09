import MinecraftVersionInput from "../components/MinecraftVersionInput";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Box,
  Cpu,
  MemoryStick,
  HardDrive,
  Globe2,
  ShieldCheck,
  Sparkles,
  Rocket,
  Info,
  Wallet,
  Search,
  AlertCircle,
} from "lucide-react";
import { useStore, useResource } from "../lib/store";
import { api, money, gb } from "../lib/api";
import type { Ziyn, Server } from "../../shared/types";
import { KIND_LABELS } from "../../shared/types";
import {
  PageHeader,
  Panel,
  Badge,
  Button,
  ServerIcon,
  Field,
  Loading,
  ErrorState,
} from "../components/ui";
export default function CreateDeployment() {
  const { data, refresh, toast } = useStore();
  const [params] = useSearchParams();
  const [step, setStep] = useState(params.get("ziyn") ? 1 : 0),
    [kind, setKind] = useState("minecraft"),
    [selected, setSelected] = useState(params.get("ziyn") || ""),
    [query, setQuery] = useState("");
  const [nodeId, setNodeId] = useState(
      data!.nodes.find((n) => n.status === "online")?.id || "",
    ),
    [planId, setPlanId] = useState("boost"),
    [name, setName] = useState(""),
    [env, setEnv] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const {
    data: templates,
    loading,
    error: loadError,
    reload,
  } = useResource<Ziyn[]>("/templates");
  const t = templates?.find((t) => t.id === selected);
  const plan = data!.plans.find((p) => p.id === planId)!;
  const node = data!.nodes.find((n) => n.id === nodeId);
  const choose = (t: Ziyn) => {
    setSelected(t.id);
    setKind(t.kind);
    setEnv(Object.fromEntries(t.variables.map((v) => [v.key, v.default])));
    setName("");
    setStep(1);
    setError("");
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const s = await api<Server>("/servers", {
        body: {
          name,
          templateId: selected,
          nodeId,
          planId,
          environment: env,
          description: "",
        },
      });
      await refresh();
      toast(
        data!.mode === "demo"
          ? "Your demo deployment is on its way."
          : "Deployment created. Installing the selected image.",
      );
      navigate("/servers/" + s.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-enter create-page">
      <PageHeader
        eyebrow="MAKE ROOM FOR YOUR NEXT IDEA"
        title="Let's build something."
        description="Pick a ZIYN, give it a home, and make it yours."
      >
        <Link to="/servers" className="btn btn-secondary">
          <ArrowLeft size={15} />
          Back to deployments
        </Link>
      </PageHeader>
      <div className="wizard-steps">
        {["Choose a ZIYN", "Make it yours", "Ready for launch"].map(
          (label, i) => (
            <button
              key={label}
              className={`${step === i ? "current" : ""} ${step > i ? "complete" : ""}`}
              disabled={i > step}
              onClick={() => {
                setStep(i);
                setError("");
              }}
            >
              <span>
                {step > i ? (
                  <Check size={15} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              {label}
              {i < 2 && <ChevronRight size={16} />}
            </button>
          ),
        )}
      </div>
      {step === 0 && (
        <>
          <div className="create-kind-grid">
            {Object.entries(KIND_LABELS).map(([key, label]) => (
              <button
                className={kind === key ? "selected" : ""}
                key={key}
                onClick={() => setKind(key)}
              >
                <ServerIcon
                  server={{
                    kind: key as any,
                    templateId:
                      key === "minecraft"
                        ? "paper"
                        : key === "bot"
                          ? "node"
                          : key === "website"
                            ? "website"
                            : key === "game"
                              ? "rust-game"
                              : "alpine",
                  }}
                  size="large"
                />
                <strong>{label}</strong>
                <span>
                  {key === "minecraft"
                    ? "Your world, your rules"
                    : key === "game"
                      ? "Play without limits"
                      : key === "container"
                        ? "A space for anything"
                        : key === "website"
                          ? "Go live in minutes"
                          : "Always there for you"}
                </span>
                {kind === key && (
                  <i>
                    <Check size={12} />
                  </i>
                )}
              </button>
            ))}
          </div>
          <div className="section-label-row">
            <h2>Start with a great foundation</h2>
            <div className="search-input small">
              <Search size={16} />
              <input
                placeholder="Find a ZIYN..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {loading ? (
            <Loading />
          ) : loadError ? (
            <ErrorState message={loadError} retry={reload} />
          ) : (
            <div className="ziyn-choice-grid">
              {templates
                ?.filter(
                  (t) =>
                    t.kind === kind &&
                    t.enabled &&
                    (t.name + " " + t.description)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((t) => (
                  <button
                    className={`ziyn-choice ${selected === t.id ? "selected" : ""}`}
                    key={t.id}
                    onClick={() => choose(t)}
                  >
                    <ServerIcon template={t} />
                    <div>
                      <h3>
                        {t.name}
                        {t.id === "paper" && (
                          <Badge tone="green">POPULAR</Badge>
                        )}
                      </h3>
                      <p>{t.description}</p>
                      <span>{t.tags.slice(0, 2).join(" · ")}</span>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                ))}
            </div>
          )}
          <div className="inline-note">
            <Info size={16} />
            <span>
              ZIYN is ZK's own deployment-template system. Every template
              includes persistent storage, a live console, and Autopilot.
            </span>
          </div>
        </>
      )}
      {step === 1 && t && (
        <div className="configure-layout">
          <div className="configure-main">
            <Panel className="form-panel">
              <div className="selected-ziyn">
                <ServerIcon template={t} size="large" />
                <div>
                  <span className="eyebrow">YOUR FOUNDATION</span>
                  <h2>{t.name}</h2>
                  <p>{t.description}</p>
                </div>
                <button className="text-link" onClick={() => setStep(0)}>
                  Change
                </button>
              </div>
              <Field
                label="Deployment name"
                required
                hint="A name your community will remember. 2–48 characters."
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    t.kind === "minecraft"
                      ? "My awesome SMP"
                      : t.kind === "bot"
                        ? "My community bot"
                        : "My next big thing"
                  }
                  minLength={2}
                  maxLength={48}
                />
              </Field>
              <Field
                label="Node & region"
                required
                hint="Choose a region closest to the people who will use it."
              >
                <select
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                >
                  {data!.nodes.map((n) => (
                    <option
                      key={n.id}
                      value={n.id}
                      disabled={n.status !== "online"}
                    >
                      {n.region} · {n.name}
                      {n.status !== "online" ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-divider" />
              <h3 className="form-section-title">Choose your resources</h3>
              <div className="plan-options">
                {data!.plans.map((p) => (
                  <button
                    key={p.id}
                    className={planId === p.id ? "selected" : ""}
                    onClick={() => setPlanId(p.id)}
                  >
                    <span className="plan-radio">
                      {planId === p.id && <i />}
                    </span>
                    <div>
                      <strong>
                        {p.name}
                        {p.popular && <Badge tone="green">SWEET SPOT</Badge>}
                      </strong>
                      <span>
                        {gb(p.memory)} GB RAM · {p.cpu / 100} vCPU ·{" "}
                        {gb(p.disk)} GB SSD
                      </span>
                    </div>
                    <b>
                      {money(p.price)}
                      <small>/mo</small>
                    </b>
                  </button>
                ))}
              </div>
            </Panel>
            <Panel className="form-panel">
              <h3 className="form-section-title">
                <SettingsIcon />
                Startup settings
              </h3>
              <p className="muted form-description">
                Sensible defaults, with room to make it your own.
              </p>
              <div className="form-two-col">
                {t.variables.map((v) => (
                  <Field
                    key={v.key}
                    label={v.label}
                    hint={v.description}
                    required={v.required}
                  >
                    {v.key === "VERSION" && t.kind === "minecraft" ? (
                      <MinecraftVersionInput software={t.id} value={env[v.key] ?? v.default} onChange={(value) => setEnv({ ...env, [v.key]: value })} />
                    ) : v.options ? (
                      <select
                        value={env[v.key] ?? v.default}
                        onChange={(e) =>
                          setEnv({ ...env, [v.key]: e.target.value })
                        }
                      >
                        {v.options.map((o) => (
                          <option value={o} key={o}>
                            {v.key === "EULA"
                              ? o === "TRUE"
                                ? "Yes, I accept the Minecraft EULA"
                                : "Not accepted"
                              : o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={v.secret ? "password" : "text"}
                        value={env[v.key] ?? v.default}
                        onChange={(e) =>
                          setEnv({ ...env, [v.key]: e.target.value })
                        }
                        placeholder={
                          v.secret ? "Stored encrypted at rest" : v.default
                        }
                        maxLength={4000}
                        autoComplete={v.secret ? "new-password" : "off"}
                      />
                    )}
                  </Field>
                ))}
              </div>
              {t.kind === "minecraft" && t.id !== "velocity" && (
                <div className="inline-note">
                  <ShieldCheck size={17} />
                  <span>
                    Server JARs are installed automatically by the server image.
                    By accepting the{" "}
                    <a
                      href="https://www.minecraft.net/eula"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Minecraft EULA
                    </a>
                    , you confirm you agree to its terms.
                  </span>
                </div>
              )}
              {["rust-game", "valheim"].includes(t.id) && (
                <div className="inline-alert warning">
                  Community game images require administrator review and
                  approval before use in Docker mode. Demo mode is fully
                  interactive.
                </div>
              )}
            </Panel>
          </div>
          <aside className="launch-summary">
            <Panel className="summary-panel">
              <span className="eyebrow">LOOKING GOOD</span>
              <h2>Your next big thing</h2>
              <div className="summary-template">
                <ServerIcon template={t} />
                <div>
                  <strong>{name || t.name}</strong>
                  <span>{node?.region || "Choose a node"}</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Memory</dt>
                  <dd>{gb(plan.memory)} GB</dd>
                </div>
                <div>
                  <dt>CPU allocation</dt>
                  <dd>{plan.cpu / 100} vCPU</dd>
                </div>
                <div>
                  <dt>SSD storage</dt>
                  <dd>{gb(plan.disk)} GB</dd>
                </div>
                <div>
                  <dt>Billing cycle</dt>
                  <dd>30 days</dd>
                </div>
                <div>
                  <dt>Autopilot</dt>
                  <dd className="green-text">
                    Included <Check size={13} />
                  </dd>
                </div>
              </dl>
              <div className="summary-total">
                <span>Due today</span>
                <strong>{money(plan.price)}</strong>
              </div>
              <p>Prepaid from your wallet. No surprise charges.</p>
              <Button
                onClick={() => {
                  if (name.trim().length < 2) {
                    setError(
                      "Give your deployment a name with at least 2 characters.",
                    );
                    return;
                  }
                  if (
                    t.kind === "minecraft" &&
                    t.id !== "velocity" &&
                    env.EULA !== "TRUE"
                  ) {
                    setError(
                      "Please accept the Minecraft EULA in startup settings.",
                    );
                    return;
                  }
                  setError("");
                  setStep(2);
                }}
                disabled={!nodeId}
              >
                Review deployment <ArrowRight size={16} />
              </Button>
              <div className="wallet-note">
                <Wallet size={14} />
                Wallet balance: {money(data!.user.balance)}
              </div>
            </Panel>
            <div className="summary-trust">
              <ShieldCheck size={18} />
              <p>
                Your files stay yours.
                <br />
                <span>Isolated compute. Persistent storage.</span>
              </p>
            </div>
          </aside>
        </div>
      )}
      {step === 2 && t && (
        <div className="review-layout">
          <Panel className="review-panel">
            <span className="review-icon">
              <Rocket size={32} />
            </span>
            <Badge tone="green">ALL SYSTEMS GO</Badge>
            <h2>
              Ready to meet your new {t.kind === "minecraft" ? "world" : t.kind}
              ?
            </h2>
            <p>
              Here's what we're setting up for you. One click, and it's on its
              way.
            </p>
            <div className="review-details">
              <div>
                <span>Deployment</span>
                <strong>{name}</strong>
              </div>
              <div>
                <span>ZIYN template</span>
                <strong>{t.name}</strong>
              </div>
              <div>
                <span>Region</span>
                <strong>{node?.region}</strong>
              </div>
              <div>
                <span>Resources</span>
                <strong>
                  {gb(plan.memory)} GB RAM · {plan.cpu / 100} vCPU ·{" "}
                  {gb(plan.disk)} GB SSD
                </strong>
              </div>
              <div>
                <span>30-day hosting</span>
                <strong>{money(plan.price)}</strong>
              </div>
            </div>
            {data!.mode === "demo" && (
              <div className="inline-note">
                <Info size={17} />
                <span>
                  This preview uses demo compute and demo wallet funds. No real
                  server is provisioned and no money is charged.
                </span>
              </div>
            )}
            {data!.user.balance < plan.price && (
              <div className="inline-alert warning">
                You need {money(plan.price - data!.user.balance)} more in your
                wallet. <Link to="/billing">Add funds</Link> before launching.
              </div>
            )}
            <div className="review-actions">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={15} />
                Keep editing
              </Button>
              <Button
                onClick={submit}
                loading={busy}
                disabled={data!.user.balance < plan.price}
              >
                <Rocket size={17} />
                Launch deployment
              </Button>
            </div>
          </Panel>
        </div>
      )}
      {error && (
        <div className="inline-alert error wizard-error">
          <AlertCircle size={17} />
          {error}
        </div>
      )}
    </div>
  );
}
function SettingsIcon() {
  return <Cpu size={18} />;
}
