import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";
import { api, ApiError } from "./api";
import type { Bootstrap, Server, PowerAction } from "../../shared/types";
type Toast = { id: number; text: string; type: "success" | "error" | "info" };
interface Store {
  data: Bootstrap | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  refreshUser: () => Promise<void>;
  toast: (text: string, type?: Toast["type"]) => void;
  power: (server: Server, action: PowerAction) => Promise<boolean>;
  toasts: Toast[];
  dismiss: (id: number) => void;
  setData: React.Dispatch<React.SetStateAction<Bootstrap | null>>;
  logout: () => Promise<void>;
}
const Context = createContext<Store>(null!);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );
  const toast = useCallback(
    (text: string, type: Toast["type"] = "success") => {
      const id = ++nextId.current;
      setToasts((t) => [...t.slice(-3), { id, text, type }]);
      timers.current.push(setTimeout(() => dismiss(id), 5500));
    },
    [dismiss],
  );
  const refresh = useCallback(async () => {
    const d = await api<Bootstrap>("/bootstrap");
    setData(d);
    setError("");
  }, []);
  const refreshUser = useCallback(async () => {
    await refresh();
  }, [refresh]);
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        let config = { mode: "demo", autoDemo: true };
        try {
          config = await api("/config");
        } catch {}
        let d: Bootstrap;
        try {
          d = await api<Bootstrap>("/bootstrap");
        } catch (e) {
          if (
            e instanceof ApiError &&
            e.status === 401 &&
            config.mode === "demo" && config.autoDemo
          ) {
            await api("/auth/demo", { body: {} });
            d = await api<Bootstrap>("/bootstrap");
          } else throw e;
        }
        if (active) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not connect to ZK PANEL.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 4000);
    return () => {
      active = false;
      clearInterval(timer);
      timers.current.forEach(clearTimeout);
    };
  }, [refresh]);
  const power = useCallback(
    async (server: Server, action: PowerAction) => {
      const previous = server.status;
      setData((d) =>
        d
          ? {
              ...d,
              servers: d.servers.map((s) =>
                s.id === server.id
                  ? {
                      ...s,
                      status:
                        action === "start" || action === "restart"
                          ? "starting"
                          : "stopping",
                    }
                  : s,
              ),
            }
          : d,
      );
      try {
        const result = await api<Server>("/servers/" + server.id + "/power", {
          body: { action },
        });
        setData((d) =>
          d
            ? {
                ...d,
                servers: d.servers.map((s) =>
                  s.id === server.id ? result : s,
                ),
              }
            : d,
        );
        toast(
          `${server.name} ${action === "stop" ? "stopped" : action === "kill" ? "force stopped" : action === "restart" ? "restarted" : "started"}.`,
        );
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Power action failed.", "error");
        setData((d) =>
          d
            ? {
                ...d,
                servers: d.servers.map((s) =>
                  s.id === server.id ? { ...s, status: previous } : s,
                ),
              }
            : d,
        );
        return false;
      }
    },
    [toast],
  );
  const logout = async () => {
    await api("/auth/logout", { body: {} });
    setData(null);
  };
  return (
    <Context.Provider
      value={{
        data,
        loading,
        error,
        refresh,
        refreshUser,
        toast,
        power,
        toasts,
        dismiss,
        setData,
        logout,
      }}
    >
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast ${t.type}`} key={t.id}>
            {t.type === "success" ? (
              <CheckCircle2 size={19} />
            ) : t.type === "error" ? (
              <AlertCircle size={19} />
            ) : (
              <Info size={19} />
            )}
            <span>{t.text}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
export function useResource<T>(path: string | undefined, initial?: T) {
  const [data, setData] = useState<T | undefined>(initial),
    [loading, setLoading] = useState(!!path),
    [error, setError] = useState("");
  const { data: boot } = useStore();
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload, boot?.user.id]);
  return { data, setData, loading, error, reload };
}
