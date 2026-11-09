import { useEffect, useRef, useState } from "react";
import {
  Terminal,
  ChevronRight,
  Download,
  Trash2,
  ArrowDown,
  Pause,
  Play,
  Wifi,
  Search,
  CircleHelp,
} from "lucide-react";
import type { ConsoleLine, Server } from "../../shared/types";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { cleanConsoleText } from "../lib/console-text";
import { Panel, Badge, Button } from "./ui";
export default function Console({ server }: { server: Server }) {
  const { data, toast } = useStore();
  const [lines, setLines] = useState<ConsoleLine[]>([]),
    [command, setCommand] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [autoScroll, setAutoScroll] = useState(true),
    [filter, setFilter] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [historyIndex, setHistoryIndex] = useState(-1),
    [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const outputRef = useRef<HTMLDivElement>(null),
    historyRef = useRef<string[]>([]);
  useEffect(() => {
    let source: EventSource | undefined;
    let active = true;
    let receivedEvent = false;
    setLines([]);
    setHiddenIds(new Set());
    api<ConsoleLine[]>("/servers/" + server.id + "/console")
      .then((l) => {
        if (active && !receivedEvent) setLines(l);
      })
      .catch((e) => toast(e.message, "error"));
    source = new EventSource(
      "/api/servers/" +
        server.id +
        "/events",
      { withCredentials: true },
    );
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("unavailable", () => setConnected(false));
    source.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (Array.isArray(payload.lines)) {
          receivedEvent = true;
          setConnected(true);
          setLines(payload.lines);
        }
      } catch {}
    };
    return () => {
      active = false;
      source?.close();
    };
  }, [server.id]);
  useEffect(() => {
    if (autoScroll && outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines.length, autoScroll]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    setBusy(true);
    const value = command.trim();
    const next = [value, ...historyRef.current].slice(0, 30);
    historyRef.current = next;
    setHistory(next);
    setHistoryIndex(-1);
    try {
      await api("/servers/" + server.id + "/command", {
        body: { command: value },
      });
      setCommand("");

    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const visible = lines.filter((l) =>
    !hiddenIds.has(l.id) && (cleanConsoleText(l.message) + " " + l.level).toLowerCase().includes(filter.toLowerCase()),
  );
  const exportLogs = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          lines.filter((line) => !hiddenIds.has(line.id))
            .map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${cleanConsoleText(l.message)}`)
            .join("\n"),
        ],
        { type: "text/plain" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = server.id + "-console.log";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Panel className="console-panel">
      <div className="console-toolbar">
        <div>
          <Terminal size={17} />
          <strong>Live console</strong>
          <Badge tone={connected ? "green" : "neutral"} dot>
            {connected ? "Live updates" : "Reconnecting"}
          </Badge>
        </div>
        <div>
          <button
            className={`icon-button ${!autoScroll ? "selected" : ""}`}
            title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
            aria-label={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            className="icon-button"
            title="Download console logs"
            aria-label="Download console logs"
            onClick={exportLogs}
          >
            <Download size={16} />
          </button>
          <button
            className="icon-button"
            title="Clear console view"
            aria-label="Clear console view"
            onClick={() => setHiddenIds(new Set(lines.map((line) => line.id)))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="console-filter">
        <Search size={13} />
        <input
          placeholder="Filter console output..."
          aria-label="Filter console output"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span>{visible.length} lines</span>
        {data!.mode === "demo" && <Badge tone="amber">SIMULATED OUTPUT</Badge>}
      </div>
      <div
        className="console-output"
        ref={outputRef}
        role="log"
        aria-label="Server console output"
        aria-live="polite"
      >
        <div className="console-welcome">
          <span>ZK</span> Server console
          <small>
            {server.name} · {server.software} ·{" "}
            {data!.mode === "demo" ? "Demo runtime" : "Docker runtime"}
          </small>
        </div>
        {visible.map((line, i) => (
          <div className={`console-line ${line.level}`} key={line.id + "-" + i}>
            <time>{new Date(line.time).toLocaleTimeString("en-GB")}</time>
            <span className="console-level">
              {line.level === "command"
                ? "YOU"
                : line.level === "warn"
                  ? "WARN"
                  : line.level === "error"
                    ? "ERROR"
                    : "INFO"}
            </span>
            <span>{cleanConsoleText(line.message)}</span>
          </div>
        ))}
        {!visible.length && (
          <div className="console-empty">
            {filter
              ? "No lines match your filter."
              : "Waiting for server output. Check the deployment status if no output appears."}
          </div>
        )}
      </div>
      <form className="console-input" onSubmit={send}>
        <ChevronRight size={18} />
        <input
          aria-label="Console command"
          placeholder={
            server.status === "running"
              ? "Type a command… try “help”"
              : "Start your deployment to send commands"
          }
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={server.status !== "running"}
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const idx = Math.min(historyIndex + 1, history.length - 1);
              if (idx >= 0) {
                setHistoryIndex(idx);
                setCommand(history[idx]);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const idx = Math.max(-1, historyIndex - 1);
              setHistoryIndex(idx);
              setCommand(idx === -1 ? "" : history[idx]);
            }
          }}
        />
        <Button
          type="submit"
          loading={busy}
          disabled={!command.trim() || server.status !== "running"}
        >
          Send <ChevronRight size={14} />
        </Button>
      </form>
      <div className="console-footnote">
        <span>
          <Wifi size={12} />
          {data!.mode === "demo"
            ? "Commands are simulated in this preview."
            : server.templateId === "alpine" ? "Alpine uses apk, not apt or pkg. This unprivileged container cannot install system packages; use an approved prebuilt image." : "Commands are sent to your isolated container."}
        </span>
        <span>↑ ↓ Command history</span>
      </div>
    </Panel>
  );
}
