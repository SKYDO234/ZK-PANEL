import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Server as ServerIconLucide,
  Layers3,
  Sparkles,
  Network,
  CreditCard,
  Activity,
  Settings2,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  BookOpen,
  LifeBuoy,
  Command,
  X,
  Menu,
  LogOut,
  Bot,
  Box,
  Globe2,
  Gamepad2,
  Check,
  ExternalLink,
  CircleHelp,
} from "lucide-react";
import { useStore } from "./lib/store";
import { api, ago } from "./lib/api";
import {
  Logo,
  Button,
  Badge,
  Loading,
  ErrorState,
  Modal,
  ServerIcon,
  Field,
} from "./components/ui";
import Dashboard from "./pages/Dashboard";
import Deployments from "./pages/Deployments";
import CreateDeployment from "./pages/CreateDeployment";
import ServerDetail from "./pages/ServerDetail";
import ZiynLibrary from "./pages/ZiynLibrary";
import AutopilotPage from "./pages/AutopilotPage";
import Billing from "./pages/Billing";
import Nodes from "./pages/Nodes";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import DiscordPage from "./pages/DiscordPage";
import ActivityPage from "./pages/ActivityPage";

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const items = [
    { label: "Overview", path: "/", icon: LayoutDashboard },
    { label: "Deployments", path: "/servers", icon: ServerIconLucide },
    { label: "ZIYN library", path: "/ziyn", icon: Layers3 },
    { label: "Autopilot", path: "/autopilot", icon: Sparkles },
    { label: "Nodes & regions", path: "/nodes", icon: Network },
    { label: "Billing & wallet", path: "/billing", icon: CreditCard },
    { label: "Discord management", path: "/discord", icon: Bot },
    { label: "Account settings", path: "/settings", icon: Settings2 },
    ...(data?.servers.map((s) => ({
      label: s.name,
      path: "/servers/" + s.id,
      icon: Box,
    })) || []),
  ].filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <Modal
      title="Find your next move"
      description="Search deployments, tools, and panel pages."
      onClose={onClose}
    >
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          placeholder="Where would you like to go?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && items[0]) {
              navigate(items[0].path);
              onClose();
            }
          }}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="command-results">
        {items.slice(0, 10).map((i) => (
          <button
            key={i.path}
            onClick={() => {
              navigate(i.path);
              onClose();
            }}
          >
            <i.icon size={18} />
            <span>{i.label}</span>
            <ChevronRight size={16} />
          </button>
        ))}
        {!items.length && (
          <p className="muted empty-search">
            No results for “{query}”. Try a deployment name.
          </p>
        )}
      </div>
    </Modal>
  );
}
function Shell() {
  const { data, logout } = useStore();
  const [search, setSearch] = useState(false),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false),
    [workspace, setWorkspace] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notificationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMobile(false);
    setNotifications(false);
    setWorkspace(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(e.target as Node)
      )
        setNotifications(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  const u = data!.user;
  const primary = [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    {
      to: "/servers",
      label: "Deployments",
      icon: ServerIconLucide,
      count: data!.servers.length,
    },
    { to: "/ziyn", label: "ZIYN library", icon: Layers3, badge: "NEW" },
    { to: "/autopilot", label: "Autopilot", icon: Sparkles },
  ];
  const manage = [
    { to: "/nodes", label: "Nodes & regions", icon: Network },
    { to: "/billing", label: "Billing & wallet", icon: CreditCard },
    { to: "/discord", label: "Discord bot", icon: Bot },
    { to: "/activity", label: "Activity log", icon: Activity },
  ];
  const nav = (items: typeof primary) => (
    <>
      {items.map((item) => (
        <NavLink
          end={item.to === "/"}
          to={item.to}
          key={item.to}
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <item.icon size={18} strokeWidth={1.7} />
          <span>{item.label}</span>
          {"count" in item && <span className="nav-count">{item.count}</span>}
          {"badge" in item && <span className="nav-new">{item.badge}</span>}
        </NavLink>
      ))}
    </>
  );
  const pageTitle = location.pathname.startsWith("/servers/")
    ? "Deployment"
    : location.pathname === "/servers/new"
      ? "Create deployment"
      : [
          ...primary,
          ...manage,
          { to: "/admin", label: "Administration" },
          { to: "/settings", label: "Settings" },
        ].find((n) => n.to === location.pathname)?.label || "Overview";
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link to="/" className="brand-link" aria-label="ZK PANEL home">
          <Logo />
        </Link>
        <div className="workspace-wrap">
          <button
            className="workspace-switch"
            onClick={() => setWorkspace(!workspace)}
          >
            <span className="workspace-avatar">A</span>
            <span>
              <strong>Personal workspace</strong>
              <small>
                {u.role === "admin" ? "Administrator" : "Member"} account
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
          {workspace && (
            <div className="workspace-menu">
              <span className="menu-label">YOUR WORKSPACE</span>
              <button onClick={() => setWorkspace(false)}>
                <span className="workspace-avatar tiny">A</span>Personal
                workspace
                <Check size={15} />
              </button>
              <Link to="/settings">
                <Settings2 size={15} />
                Workspace settings
              </Link>
            </div>
          )}
        </div>
        <div className="nav-group">
          <span className="nav-label">WORKSPACE</span>
          <nav>{nav(primary)}</nav>
        </div>
        <div className="nav-group manage">
          <span className="nav-label">MANAGE</span>
          <nav>{nav(manage)}</nav>
          {u.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <ShieldCheck size={18} />
              <span>Administration</span>
            </NavLink>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <div className="promo-icon">
              <Sparkles size={19} />
              <Badge tone="green">ZK AUTOPILOT</Badge>
            </div>
            <h3>
              A little less managing.
              <br />A lot more creating.
            </h3>
            <p>
              Let your infrastructure
              <br />
              look after itself.
            </p>
            <Link to="/autopilot">
              Meet your co-pilot <ArrowUpRight size={15} />
            </Link>
            <div className="promo-orbit" />
          </div>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Settings2 size={18} />
            <span>Settings</span>
          </NavLink>
          <a
            className="nav-item"
            href="/api/docs"
            onClick={(e) => {
              e.preventDefault();
              navigate("/settings?tab=api");
            }}
          >
            <BookOpen size={18} />
            <span>Documentation</span>
            <ArrowUpRight size={14} />
          </a>
          <div className="sidebar-status">
            <span className="live-dot" />
            <span>
              {data!.mode === "demo" ? "Demo environment" : "Panel connected"}
            </span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-home">Workspace</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setSearch(true)}>
              <Search size={16} />
              <span>Search anything...</span>
              <kbd>
                <Command size={10} /> K
              </kbd>
            </button>
            <div className="topbar-divider" />
            <div className="notifications" ref={notificationRef}>
              <button
                className={`icon-button notification-button ${notifications ? "selected" : ""}`}
                aria-label="Notifications"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                <i />
              </button>
              {notifications && (
                <div className="notification-menu">
                  <div className="notification-title">
                    <strong>What's happening</strong>
                    <Badge tone="green">{data!.activity.length}</Badge>
                  </div>
                  {data!.activity.slice(0, 5).map((a) => (
                    <Link
                      key={a.id}
                      to={a.serverId ? "/servers/" + a.serverId : "/activity"}
                    >
                      <span className={`activity-dot ${a.severity}`} />
                      <div>
                        <p>{a.detail}</p>
                        <small>{ago(a.createdAt)}</small>
                      </div>
                    </Link>
                  ))}
                  {!data!.activity.length && (
                    <p className="muted notification-empty">
                      You're all caught up.
                    </p>
                  )}
                  <Link to="/activity" className="notification-all">
                    View all activity <ArrowUpRight size={14} />
                  </Link>
                </div>
              )}
            </div>
            <Link
              className="user-avatar"
              to="/settings"
              aria-label="Account settings"
            >
              {u.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </Link>
          </div>
        </header>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/servers" element={<Deployments />} />
            <Route path="/servers/new" element={<CreateDeployment />} />
            <Route path="/servers/:id/*" element={<ServerDetail />} />
            <Route path="/ziyn" element={<ZiynLibrary />} />
            <Route path="/autopilot" element={<AutopilotPage />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/discord" element={<DiscordPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <div className="not-found">
                  <h1>Uncharted territory.</h1>
                  <p>This page doesn't exist in your workspace.</p>
                  <Link className="btn btn-primary" to="/">
                    Back to overview
                  </Link>
                </div>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>
              © {new Date().getFullYear()} ZK PANEL <i /> Built for what’s next.
            </span>
            <div>
              <span className="live-dot" />{" "}
              {data!.mode === "demo"
                ? "Demo data · no real compute"
                : "All systems connected"}
              <Link to="/settings?tab=api">
                Need a hand? <ArrowUpRight size={12} />
              </Link>
            </div>
          </footer>
        </main>
      </div>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
    </div>
  );
}
function Auth() {
  const { refreshUser } = useStore();
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [config, setConfig] = useState<any>(null);
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch(() => {});
  }, []);
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Logo />
        <div>
          <Badge tone="green">YOUR NEXT BIG THING STARTS HERE</Badge>
          <h1>
            Your worlds.
            <br />
            Your rules.
            <br />
            <span>Your panel.</span>
          </h1>
          <p>
            Minecraft, games, websites, containers, and bots.
            <br />
            One beautifully simple place to call home.
          </p>
        </div>
        <small>Infrastructure, without the complexity.</small>
      </div>
      <div className="auth-form-wrap">
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              await api("/auth/" + (register ? "register" : "login"), {
                body: Object.fromEntries(form),
              });
              await refreshUser();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sign-in failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">WELCOME TO ZK</span>
          <h2>
            {register ? "Make room for your ideas." : "Good to have you back."}
          </h2>
          <p>
            {register
              ? "Create your account and start building."
              : "Sign in to your workspace."}
          </p>
          {error && <div className="inline-alert error">{error}</div>}
          <>
            {register && (
              <Field label="Your name" required>
                <input
                  name="name"
                  placeholder="Alex Morgan"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Email address" required>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </Field>
            <Field
              label="Password"
              required
              hint={
                register ? "At least 12 characters. Keep it unique." : undefined
              }
            >
              <input
                name="password"
                type="password"
                placeholder="Enter your password"
                required
                minLength={register ? 12 : 1}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
          </>
          <Button type="submit" loading={busy}>
            {register ? "Create account" : "Sign in to ZK"}
            <ArrowUpRight size={17} />
          </Button>
          {config?.registration && (
            <button
              type="button"
              className="auth-toggle"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Already have an account? Sign in"
                : "New to ZK? Create an account"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
export default function App() {
  const { data, loading, error } = useStore();
  if (loading)
    return (
      <div className="boot-screen">
        <Logo />
        <Loading text="Preparing your workspace…" />
        <span className="boot-caption">YOUR INFRASTRUCTURE. IN CONTROL.</span>
      </div>
    );
  if (error && !data)
    return (
      <div className="boot-screen">
        <Logo />
        <ErrorState message={error} retry={() => window.location.reload()} />
      </div>
    );
  if (!data) return <Auth />;
  return <Shell />;
}
