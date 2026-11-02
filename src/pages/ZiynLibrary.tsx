import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Layers3,
  ArrowUpRight,
  Upload,
  Download,
  Check,
  ShieldCheck,
  Box,
  FileJson,
  Sparkles,
} from "lucide-react";
import type { Ziyn } from "../../shared/types";
import { KIND_LABELS } from "../../shared/types";
import { useStore, useResource } from "../lib/store";
import { api, download } from "../lib/api";
import {
  PageHeader,
  Panel,
  Button,
  Badge,
  ServerIcon,
  Loading,
  ErrorState,
  Modal,
  Field,
  EmptyState,
} from "../components/ui";
export default function ZiynLibrary() {
  const { data, toast } = useStore();
  const {
    data: templates,
    loading,
    error,
    reload,
  } = useResource<Ziyn[]>("/templates");
  const [kind, setKind] = useState("all"),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<Ziyn | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [json, setJson] = useState(""),
    [busy, setBusy] = useState(false),
    [importError, setImportError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const list = templates?.filter(
    (t) =>
      (kind === "all" || t.kind === kind) &&
      (t.name + " " + t.description + " " + t.tags.join(" "))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="GOOD IDEAS START WITH A GREAT FOUNDATION"
        title="The ZIYN library"
        description="Ready-to-run templates. Endlessly yours to customize."
      >
        <Badge tone="green">
          <Layers3 size={13} />
          EGGS, EVOLVED.
        </Badge>
        {data!.user.role === "admin" && (
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload size={15} />
            Import ZIYN
          </Button>
        )}
      </PageHeader>
      <div className="library-banner">
        <div className="library-banner-icon">
          <Layers3 size={34} />
        </div>
        <div>
          <h2>Less setup. More possibility.</h2>
          <p>
            ZIYN bundles the runtime, startup settings, and tools your next
            deployment needs.
            <br />
            Pick your foundation. We'll take care of the groundwork.
          </p>
        </div>
        <div className="library-banner-features">
          <span>
            <Check size={14} />
            Ready-to-run runtimes
          </span>
          <span>
            <Check size={14} />
            Built-in best practices
          </span>
          <span>
            <Check size={14} />
            Yours to customize
          </span>
        </div>
      </div>
      <div className="filter-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder="Find your next ZIYN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted">{list?.length || 0} templates to explore</span>
      </div>
      <div className="category-tabs">
        <button
          className={kind === "all" ? "active" : ""}
          onClick={() => setKind("all")}
        >
          All ZIYNs
        </button>
        {Object.entries(KIND_LABELS).map(([k, l]) => (
          <button
            key={k}
            className={kind === k ? "active" : ""}
            onClick={() => setKind(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : (
        <div className="library-grid">
          {list?.map((t) => (
            <Panel
              className={`library-card ${!t.enabled ? "disabled-template" : ""}`}
              key={t.id}
            >
              <div className="library-card-top">
                <ServerIcon template={t} size="large" />
                <Badge tone={t.id === "paper" ? "green" : "neutral"}>
                  {t.id === "paper"
                    ? "COMMUNITY FAVORITE"
                    : KIND_LABELS[t.kind]}
                </Badge>
              </div>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="template-tags">
                {t.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="library-card-footer">
                <button onClick={() => setDetail(t)}>
                  View ZIYN <ArrowUpRight size={14} />
                </button>
                <Link
                  to={"/servers/new?ziyn=" + t.id}
                  className={`btn btn-small ${t.id === "paper" ? "btn-primary" : "btn-secondary"}`}
                  aria-disabled={!t.enabled}
                  onClick={(e) => {
                    if (!t.enabled) {
                      e.preventDefault();
                      toast(
                        "An administrator must enable this ZIYN first.",
                        "info",
                      );
                    }
                  }}
                >
                  Deploy <ArrowUpRight size={14} />
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
      {!list?.length && !loading && (
        <EmptyState
          title="No ZIYNs found"
          description="Try a different search, or import your own template."
        />
      )}
      <div className="library-bottom">
        <ShieldCheck size={18} />
        <p>
          Admin-reviewed images. No untrusted installation scripts. Your
          infrastructure stays in your control.
        </p>
      </div>
      {detail && (
        <Modal
          title={detail.name}
          description={KIND_LABELS[detail.kind] + " · ZIYN v" + detail.version}
          onClose={() => setDetail(null)}
        >
          <div className="template-detail-head">
            <ServerIcon template={detail} size="large" />
            <p>{detail.description}</p>
          </div>
          <div className="detail-features">
            {detail.features.map((f) => (
              <span key={f}>
                <Check size={15} />
                {f}
              </span>
            ))}
          </div>
          <dl className="detail-dl">
            <div>
              <dt>Maintained by</dt>
              <dd>{detail.author}</dd>
            </div>
            <div>
              <dt>Runtime image</dt>
              <dd className="mono">{detail.image}</dd>
            </div>
            <div>
              <dt>Default port</dt>
              <dd>
                {detail.port} / {detail.protocol.toUpperCase()}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{detail.source}</dd>
            </div>
          </dl>
          {data!.user.role === "admin" && (
            <div className="template-admin-actions">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await api("/admin/templates/" + detail.id, {
                      method: "PATCH",
                      body: { enabled: !detail.enabled },
                    });
                    toast(
                      detail.enabled
                        ? "Template disabled."
                        : "Template enabled.",
                    );
                    setDetail(null);
                    await reload();
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                {detail.enabled ? "Disable template" : "Enable template"}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  download(
                    "/admin/templates/" + detail.id + "/export",
                    detail.id + ".ziyn.json",
                  )
                }
              >
                <Download size={15} />
                Export
              </Button>
            </div>
          )}
          <Link
            to={"/servers/new?ziyn=" + detail.id}
            className="btn btn-primary full-width"
            onClick={() => setDetail(null)}
          >
            Make it yours <ArrowUpRight size={16} />
          </Link>
        </Modal>
      )}
      {importOpen && (
        <Modal
          title="Bring your own ZIYN"
          description="Import ZIYN_v1 JSON or a legacy PTDL_v1/v2 template. Imports are disabled until reviewed."
          onClose={() => setImportOpen(false)}
          wide
        >
          <input
            type="file"
            accept=".json,application/json"
            ref={file}
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setJson(await f.text());
            }}
          />
          <Button variant="secondary" onClick={() => file.current?.click()}>
            <FileJson size={17} />
            Choose a JSON file
          </Button>
          <Field label="Template JSON">
            <textarea
              className="code-editor"
              rows={12}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder={'{ "meta": { "version": "ZIYN_v1" }, ... }'}
            />
          </Field>
          {importError && (
            <div className="inline-alert error">{importError}</div>
          )}
          <div className="inline-note">
            <ShieldCheck size={17} />
            <span>
              Legacy install scripts are never executed automatically. Review
              the runtime image, startup command, and variables before enabling
              an imported template.
            </span>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!json}
              onClick={async () => {
                setBusy(true);
                setImportError("");
                try {
                  const t = await api<Ziyn>("/admin/templates/import", {
                    body: { json },
                  });
                  toast(
                    `${t.name} imported. Review its settings before enabling.`,
                  );
                  setImportOpen(false);
                  setJson("");
                  await reload();
                  setDetail(t);
                } catch (e) {
                  setImportError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Upload size={16} />
              Import for review
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
