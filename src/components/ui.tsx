import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";
import {
  Box,
  Bot,
  Globe2,
  Gamepad2,
  Network,
  Database,
  Terminal,
  X,
  LoaderCircle,
  ArrowUpRight,
  Check,
  AlertCircle,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Server, Status, Ziyn } from "../../shared/types";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        ZK
        <span />
      </span>
      {!small && (
        <span className="brand-name">
          ZK<span>PANEL</span>
        </span>
      )}
    </div>
  );
}
export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`btn btn-${variant} ${className}`}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  const labels: Record<Status, string> = {
    running: "Running",
    offline: "Offline",
    starting: "Starting",
    stopping: "Stopping",
    installing: "Installing",
    error: "Needs attention",
    suspended: "Suspended",
  };
  return (
    <Badge
      tone={
        status === "running"
          ? "green"
          : status === "error"
            ? "red"
            : status === "installing" ||
                status === "starting" ||
                status === "stopping"
              ? "amber"
              : "neutral"
      }
      dot
    >
      {labels[status]}
    </Badge>
  );
}
export function ServerIcon({
  server,
  template,
  size = "normal",
}: {
  server?: Pick<Server, "kind" | "templateId">;
  template?: Ziyn;
  size?: "normal" | "large" | "small";
}) {
  const kind = server?.kind || template?.kind || "container";
  const id = server?.templateId || template?.id;
  const color =
    template?.color ||
    (kind === "minecraft"
      ? "#a9d584"
      : kind === "bot"
        ? "#b7a0ed"
        : kind === "website"
          ? "#8dbde5"
          : kind === "game"
            ? "#e5ac82"
            : "#9cb5cd");
  const Icon =
    id === "velocity"
      ? Network
      : id === "redis"
        ? Database
        : kind === "bot"
          ? Bot
          : kind === "website"
            ? Globe2
            : kind === "game"
              ? Gamepad2
              : kind === "container"
                ? Box
                : Box;
  return (
    <span
      className={`server-icon ${size} ${kind} ${id === "paper" || id === "vanilla" ? "grass-icon" : ""}`}
      style={{ "--icon-color": color } as React.CSSProperties}
    >
      {kind === "minecraft" && !["velocity"].includes(id || "") ? (
        <span className="minecraft-cube">
          <i />
          <b />
          <em />
        </span>
      ) : (
        <Icon
          size={size === "large" ? 28 : size === "small" ? 17 : 22}
          strokeWidth={1.6}
        />
      )}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function Panel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={`panel ${className}`}>
      {children}
    </section>
  );
}
export function PanelHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
  icon,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <Inbox size={28} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Loading({
  text = "Getting everything ready…",
}: {
  text?: string;
}) {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={24} />
      <span>{text}</span>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state">
      <AlertCircle size={22} />
      <p>{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = ref.current?.querySelector<HTMLElement>(
      "input,select,textarea,button",
    );
    first?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span>{checked && <Check size={11} />}</span>
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
  required = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
export function Progress({
  value,
  tone = "green",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <div className={`progress ${tone}`}>
      <span style={{ width: Math.min(100, Math.max(0, value)) + "%" }} />
    </div>
  );
}
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
