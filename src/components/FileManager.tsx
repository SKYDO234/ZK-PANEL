import { useEffect, useState, useRef } from "react";
import {
  Folder,
  FileText,
  FileCode2,
  Upload,
  FolderPlus,
  FilePlus2,
  ChevronRight,
  Download,
  Pencil,
  Trash2,
  ArrowLeft,
  Save,
  HardDrive,
  Search,
  Home,
  X,
  MoreHorizontal,
} from "lucide-react";
import type { Server, FileEntry } from "../../shared/types";
import { useStore } from "../lib/store";
import { api, size, ago, download } from "../lib/api";
import {
  Panel,
  Button,
  Modal,
  Field,
  Loading,
  ErrorState,
  EmptyState,
} from "./ui";
export default function FileManager({ server }: { server: Server }) {
  const { toast } = useStore();
  const [dir, setDir] = useState(""),
    [files, setFiles] = useState<FileEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<{
      path: string;
      content: string;
      original: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState<"file" | "folder" | null>(null),
    [newName, setNewName] = useState(""),
    [confirm, setConfirm] = useState<FileEntry | null>(null),
    [rename, setRename] = useState<FileEntry | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = async () => {
    setLoading(true);
    try {
      setFiles(
        await api(
          "/servers/" + server.id + "/files?dir=" + encodeURIComponent(dir),
        ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [dir, server.id]);
  const join = (name: string) => (dir ? dir + "/" + name : name);
  const open = async (f: FileEntry) => {
    if (f.directory) {
      setDir(f.path);
      return;
    }
    try {
      const content = await api<{ content: string }>(
        "/servers/" +
          server.id +
          "/files/read?path=" +
          encodeURIComponent(f.path),
      );
      setEditor({
        path: f.path,
        content: content.content,
        original: content.content,
      });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const save = async () => {
    if (!editor) return;
    setBusy(true);
    try {
      await api("/servers/" + server.id + "/files/write", {
        method: "PUT",
        body: { path: editor.path, content: editor.content },
      });
      setEditor({ ...editor, original: editor.content });
      toast("File saved.");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const upload = async (list: FileList | null) => {
    if (!list) return;
    setBusy(true);
    let count = 0;
    try {
      for (const f of Array.from(list)) {
        if (f.size > 100 * 1024 * 1024)
          throw new Error(f.name + " exceeds the 100 MB file limit.");
        await api(
          "/servers/" +
            server.id +
            "/files/upload?path=" +
            encodeURIComponent(join(f.name)),
          { method: "POST", body: await f.arrayBuffer() },
        );
        count++;
      }
      toast(`${count} file${count === 1 ? "" : "s"} uploaded.`);
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <Panel
        className="file-manager"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) void upload(e.dataTransfer.files);
        }}
      >
        <div className="file-toolbar">
          <div className="file-breadcrumb">
            <button aria-label="Workspace root" onClick={() => setDir("")}>
              <Home size={16} />
            </button>
            <span>/</span>
            <button onClick={() => setDir("")}>container</button>
            {dir
              .split("/")
              .filter(Boolean)
              .map((part, i, a) => (
                <span className="file-crumb" key={i}>
                  <ChevronRight size={13} />
                  <button onClick={() => setDir(a.slice(0, i + 1).join("/"))}>
                    {part}
                  </button>
                </span>
              ))}
          </div>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setCreate("folder");
                setNewName("");
              }}
            >
              <FolderPlus size={15} />
              <span>New folder</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreate("file");
                setNewName("");
              }}
            >
              <FilePlus2 size={15} />
              <span>New file</span>
            </Button>
            <Button loading={busy} onClick={() => input.current?.click()}>
              <Upload size={15} />
              Upload
            </Button>
            <input
              hidden
              ref={input}
              type="file"
              multiple
              onChange={(e) => void upload(e.target.files)}
            />
          </div>
        </div>
        <div className="file-search">
          <Search size={15} />
          <input
            placeholder="Search this folder..."
            aria-label="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{files.length} items</span>
        </div>
        {loading ? (
          <Loading text="Opening your files…" />
        ) : error ? (
          <ErrorState message={error} retry={load} />
        ) : (
          <div className="table-scroll">
            <table className="files-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Last modified</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dir && (
                  <tr>
                    <td>
                      <button
                        className="file-name"
                        onClick={() =>
                          setDir(dir.split("/").slice(0, -1).join("/"))
                        }
                      >
                        <ArrowLeft size={17} />
                        Parent directory
                      </button>
                    </td>
                    <td />
                    <td />
                    <td />
                  </tr>
                )}
                {files
                  .filter((f) =>
                    f.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((f) => (
                    <tr key={f.path}>
                      <td>
                        <button
                          className={`file-name ${f.directory ? "folder" : ""}`}
                          onClick={() => void open(f)}
                        >
                          {f.directory ? (
                            <Folder size={19} />
                          ) : f.name.endsWith(".js") ||
                            f.name.endsWith(".json") ||
                            f.name.endsWith(".html") ? (
                            <FileCode2 size={18} />
                          ) : (
                            <FileText size={18} />
                          )}
                          <span>{f.name}</span>
                        </button>
                      </td>
                      <td>{f.directory ? "—" : size(f.size)}</td>
                      <td>{ago(f.modifiedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            title="Rename"
                            aria-label={"Rename " + f.name}
                            onClick={() => {
                              setRename(f);
                              setNewName(f.name);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          {!f.directory && (
                            <button
                              className="icon-button"
                              title="Download"
                              aria-label={"Download " + f.name}
                              onClick={() =>
                                download(
                                  "/servers/" +
                                    server.id +
                                    "/files/download?path=" +
                                    encodeURIComponent(f.path),
                                  f.name,
                                ).catch((e) => toast(e.message, "error"))
                              }
                            >
                              <Download size={15} />
                            </button>
                          )}
                          <button
                            className="icon-button danger-hover"
                            title="Delete"
                            aria-label={"Delete " + f.name}
                            onClick={() => setConfirm(f)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!files.length && (
              <EmptyState
                title="Room for something great."
                description="Upload files or create a new file to get started."
                icon={<Folder size={28} />}
              />
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            <HardDrive size={13} />
            Persistent workspace · {server.disk / 1024} GB quota
          </span>
          <span>Drop files here to upload</span>
        </div>
      </Panel>
      {editor && (
        <Modal
          title={editor.path.split("/").pop() || "Edit file"}
          description={
            editor.path +
            (editor.content !== editor.original ? " · Unsaved changes" : "")
          }
          onClose={() => {
            if (
              editor.content === editor.original ||
              window.confirm("Discard your unsaved changes?")
            )
              setEditor(null);
          }}
          wide
        >
          <textarea
            className="code-editor large"
            spellCheck={false}
            value={editor.content}
            onChange={(e) => setEditor({ ...editor, content: e.target.value })}
            aria-label="File content"
          />
          <div className="modal-actions">
            <span className="muted">
              {size(new Blob([editor.content]).size)} · UTF-8
            </span>
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Close
            </Button>
            <Button
              onClick={save}
              loading={busy}
              disabled={editor.content === editor.original}
            >
              <Save size={15} />
              Save changes
            </Button>
          </div>
        </Modal>
      )}
      {(create || rename) && (
        <Modal
          title={
            rename
              ? "Rename item"
              : create === "folder"
                ? "Create a folder"
                : "Create a file"
          }
          description={dir ? "/" + dir : "Your deployment workspace"}
          onClose={() => {
            setCreate(null);
            setRename(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                if (rename)
                  await api("/servers/" + server.id + "/files/rename", {
                    body: { from: rename.path, to: join(newName) },
                  });
                else if (create === "folder")
                  await api("/servers/" + server.id + "/files/mkdir", {
                    body: { path: join(newName) },
                  });
                else
                  await api("/servers/" + server.id + "/files/write", {
                    method: "PUT",
                    body: { path: join(newName), content: "" },
                  });
                toast(
                  rename
                    ? "Item renamed."
                    : create === "folder"
                      ? "Folder created."
                      : "File created.",
                );
                setCreate(null);
                setRename(null);
                await load();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Name" required>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder={create === "folder" ? "assets" : "index.html"}
                maxLength={150}
              />
            </Field>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreate(null);
                  setRename(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {rename ? "Rename" : "Create"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={"Delete " + confirm.name + "?"}
          description="This permanently removes the file or folder and everything inside it. This cannot be undone."
          onClose={() => setConfirm(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(
                    "/servers/" +
                      server.id +
                      "/files?path=" +
                      encodeURIComponent(confirm.path),
                    { method: "DELETE" },
                  );
                  setConfirm(null);
                  toast("Item deleted.");
                  await load();
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} />
              Delete permanently
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
