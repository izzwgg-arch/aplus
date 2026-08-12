import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../lib/api";

// ─── Section metadata ─────────────────────────────────────────────────────────
const SECTION_META = {
  files:             { label: "Files",             emptyTitle: "No files uploaded yet",                        emptyHint: "Drag and drop files here, or click to upload" },
  bba:               { label: "BBA",               emptyTitle: "No Brain Balance Assessment files yet",         emptyHint: "Upload BBA documents, assessments, intake forms, and evaluations" },
  bbr:               { label: "BBR",               emptyTitle: "No Brain Balance Report files yet",             emptyHint: "Upload daily reports, session logs, progress docs, and tracking exports" },
  ctr:               { label: "CTR",               emptyTitle: "No Client Treatment Report files yet",          emptyHint: "Upload treatment plans, summaries, progress reports, and care coordination docs" },
  supplements:       { label: "Supplements",       emptyTitle: "No supplement files yet",                       emptyHint: "Upload supplement protocols, schedules, clinician notes, and prescriptions" },
  registration_form: { label: "Registration Form", emptyTitle: "No registration form files yet",                emptyHint: "Upload intake forms, signed consents, registration documents, and onboarding paperwork" },
  assessments:       { label: "Assessments",       emptyTitle: "No assessment files yet",                       emptyHint: "Upload assessment documents, evaluation reports, scoring sheets, and clinical notes" },
};

// ─── Human-readable file size ─────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── File type icon SVG ───────────────────────────────────────────────────────
function FileIcon({ mimeType, isFolder, size = 20 }) {
  const s = { width: size, height: size, flexShrink: 0 };
  if (isFolder)
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"
          fill="#f59e0b" stroke="#d97706" strokeWidth="1.2" />
      </svg>
    );
  const m = mimeType || "";
  if (m.startsWith("image/"))
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.2"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="#2563eb"/>
        <path d="M3 15l5-5 3.5 3.5 3-3L21 17H3z" fill="#93c5fd"/>
      </svg>
    );
  if (m === "application/pdf")
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.2"/>
        <path d="M17 2l4 4h-4V2z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.2"/>
        <text x="5" y="15" fontSize="5" fill="#dc2626" fontWeight="bold" fontFamily="sans-serif">PDF</text>
      </svg>
    );
  if (m.startsWith("audio/"))
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="#f3e8ff" stroke="#7c3aed" strokeWidth="1.2"/>
        <path d="M17 2l4 4h-4V2z" fill="#ddd6fe" stroke="#7c3aed" strokeWidth="1.2"/>
        <path d="M9 8v8m3-6v4m3-6v8" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  if (m.startsWith("video/"))
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="#fce7f3" stroke="#db2777" strokeWidth="1.2"/>
        <path d="M17 2l4 4h-4V2z" fill="#fbcfe8" stroke="#db2777" strokeWidth="1.2"/>
        <path d="M9 9l6 3-6 3V9z" fill="#db2777"/>
      </svg>
    );
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv") || ["xls","xlsx","csv","ods"].includes(mimeType))
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.2"/>
        <path d="M17 2l4 4h-4V2z" fill="#bbf7d0" stroke="#16a34a" strokeWidth="1.2"/>
        <text x="5" y="15" fontSize="5" fill="#16a34a" fontWeight="bold" fontFamily="sans-serif">XLS</text>
      </svg>
    );
  if (m.includes("word") || m.includes("document") || ["doc","docx","txt","rtf"].includes(mimeType))
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.2"/>
        <path d="M17 2l4 4h-4V2z" fill="#bfdbfe" stroke="#2563eb" strokeWidth="1.2"/>
        <text x="5" y="15" fontSize="5" fill="#2563eb" fontWeight="bold" fontFamily="sans-serif">DOC</text>
      </svg>
    );
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || ["zip","rar","gz","7z"].includes(mimeType))
    return (
      <svg style={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1.2"/>
        <path d="M17 2l4 4h-4V2z" fill="#fde68a" stroke="#d97706" strokeWidth="1.2"/>
        <path d="M10 2v18M12 4h-4m4 4h-4m4 4h-4" stroke="#d97706" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    );
  return (
    <svg style={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="14" height="18" rx="2" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.2"/>
      <path d="M17 2l4 4h-4V2z" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.2"/>
      <path d="M7 10h8M7 13h6M7 16h4" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────────────
function PreviewModal({ item, onClose }) {
  if (!item) return null;
  const m = item.mimeType || "";
  const url = item.url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileIcon mimeType={item.mimeType} isFolder={false} size={22} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 text-sm">{item.name}</p>
              <p className="text-xs text-slate-500">{fmtSize(item.sizeBytes)} · {fmtDate(item.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {url && (
              <a href={`/api/clients/${item.clientId}/files/${item.id}/download`}
                 className="text-sm font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                 download>
                Download
              </a>
            )}
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-lg">
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[calc(90vh-64px)] bg-slate-50">
          {m.startsWith("image/") && url && (
            <div className="flex items-center justify-center p-6">
              <img src={url} alt={item.name} className="max-w-full max-h-[70vh] rounded-xl shadow-md object-contain" />
            </div>
          )}
          {m === "application/pdf" && url && (
            <iframe src={url} title={item.name} className="w-full" style={{ height: "75vh" }} />
          )}
          {m.startsWith("audio/") && url && (
            <div className="flex flex-col items-center gap-4 py-12 px-6">
              <FileIcon mimeType={m} isFolder={false} size={56} />
              <p className="font-medium text-slate-700">{item.name}</p>
              <audio controls src={url} className="w-full max-w-md" />
            </div>
          )}
          {m.startsWith("video/") && url && (
            <div className="flex items-center justify-center bg-black">
              <video controls src={url} className="max-w-full max-h-[70vh]" />
            </div>
          )}
          {(m === "text/plain" || m.includes("json") || m.includes("xml") || m.includes("csv")) && url && (
            <TextPreview url={url} />
          )}
          {!m.startsWith("image/") && m !== "application/pdf" && !m.startsWith("audio/") &&
           !m.startsWith("video/") && !m.includes("text/plain") && !m.includes("json") &&
           !m.includes("xml") && !m.includes("csv") && (
            <div className="flex flex-col items-center gap-4 py-16 px-6">
              <FileIcon mimeType={m} isFolder={false} size={64} />
              <p className="font-semibold text-slate-800 text-lg">{item.name}</p>
              <p className="text-sm text-slate-500">Preview not available for this file type.</p>
              {url && (
                <a href={`/api/clients/${item.clientId}/files/${item.id}/download`}
                   className="btn-primary mt-2" download>
                  Download File
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TextPreview({ url }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    fetch(url).then((r) => r.text()).then(setText).catch(() => setText("Could not load preview."));
  }, [url]);
  return (
    <pre className="p-6 text-xs text-slate-700 font-mono whitespace-pre-wrap overflow-auto max-h-[70vh]">
      {text ?? "Loading…"}
    </pre>
  );
}

// ─── Rename modal ─────────────────────────────────────────────────────────────
function RenameModal({ item, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.select(); }, []);
  function submit(e) { e.preventDefault(); if (name.trim()) onSave(name.trim()); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900 mb-4">Rename {item.type === "FOLDER" ? "folder" : "file"}</h3>
        <form onSubmit={submit} className="space-y-4">
          <input ref={inputRef} className="saas-input w-full" value={name}
            onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Rename</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── New folder modal ─────────────────────────────────────────────────────────
function NewFolderModal({ onSave, onClose }) {
  const [name, setName] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  function submit(e) { e.preventDefault(); if (name.trim()) onSave(name.trim()); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900 mb-4">New Folder</h3>
        <form onSubmit={submit} className="space-y-4">
          <input ref={inputRef} className="saas-input w-full" placeholder="Folder name" value={name}
            onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Move modal ───────────────────────────────────────────────────────────────
function MoveModal({ item, allFolders, sectionLabel, onMove, onClose }) {
  const [destId, setDestId] = useState(null);
  const options = allFolders.filter((f) => f.id !== item.id && f.id !== item.parentId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Move "{item.name}"</h3>
        <p className="text-xs text-slate-500 mb-4">Choose a destination folder</p>
        <div className="max-h-56 overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-2">
          <label className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 ${destId === null ? "bg-indigo-50" : ""}`}>
            <input type="radio" className="accent-indigo-600" checked={destId === null}
              onChange={() => setDestId(null)} />
            <FileIcon isFolder size={18} />
            <span className="text-sm text-slate-700 font-medium">Root ({sectionLabel})</span>
          </label>
          {options.map((f) => (
            <label key={f.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 ${destId === f.id ? "bg-indigo-50" : ""}`}>
              <input type="radio" className="accent-indigo-600" checked={destId === f.id}
                onChange={() => setDestId(f.id)} />
              <FileIcon isFolder size={18} />
              <span className="text-sm text-slate-700">{f.name}</span>
            </label>
          ))}
          {!options.length && <p className="py-4 text-center text-sm text-slate-400">No other folders available</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => onMove(destId)}>Move Here</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ item, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg">⚠</span>
          <div>
            <h3 className="font-semibold text-slate-900">Delete {item.type === "FOLDER" ? "folder" : "file"}?</h3>
            <p className="text-xs text-slate-500">{item.name}</p>
          </div>
        </div>
        {item.type === "FOLDER" && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
            This will also delete all files and subfolders inside it.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button"
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload progress bar ──────────────────────────────────────────────────────
function UploadQueue({ uploads }) {
  if (!uploads.length) return null;
  const active = uploads.filter((u) => u.status !== "done" && u.status !== "error");
  if (!active.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Uploading…</p>
      {active.map((u) => (
        <div key={u.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm truncate text-slate-700 max-w-[70%]">{u.name}</p>
            <span className={`text-xs font-medium ${u.status === "error" ? "text-red-600" : "text-slate-500"}`}>
              {u.status === "error" ? "Failed" : `${u.progress}%`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div className={`h-1.5 rounded-full transition-all ${u.status === "error" ? "bg-red-500" : "bg-indigo-500"}`}
                 style={{ width: `${u.progress}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────
function ContextMenu({ menu, onAction, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (!menu) return null;
  const isFolder = menu.item.type === "FOLDER";
  const actions = [
    ...(!isFolder ? [{ id: "preview", label: "Preview", icon: "🔍" }] : []),
    { id: "open", label: isFolder ? "Open" : "Download", icon: isFolder ? "📂" : "⬇️" },
    { id: "rename", label: "Rename", icon: "✏️" },
    { id: "move", label: "Move", icon: "📋" },
    { id: "delete", label: "Delete", icon: "🗑️", danger: true },
  ];

  const menuStyle = { position: "fixed", top: menu.y, left: menu.x, zIndex: 9999 };
  const vw = window.innerWidth, vh = window.innerHeight;
  if (menu.x + 180 > vw) menuStyle.left = menu.x - 180;
  if (menu.y + actions.length * 40 + 16 > vh) menuStyle.top = menu.y - (actions.length * 40 + 16);

  return (
    <div ref={ref} style={menuStyle}
         className="min-w-[160px] rounded-xl border border-slate-200 bg-white shadow-xl py-1.5 overflow-hidden">
      {actions.map((a) => (
        <button key={a.id}
          onClick={(e) => { e.stopPropagation(); onAction(a.id, menu.item); onClose(); }}
          className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-slate-50 ${a.danger ? "text-red-600 hover:bg-red-50" : "text-slate-700"}`}>
          <span>{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// section        : storage section (use "files" for the unified model)
// initialFolderId: optional folder to start navigation in (used by shortcut tabs)
export default function ClientFilesTab({ clientId, section = "files", initialFolderId = null }) {
  const meta = SECTION_META[section] ?? SECTION_META.files;

  // Navigation — start inside initialFolderId when provided (shortcut tabs)
  const [folderId,    setFolderId]    = useState(initialFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  // Data
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [allFolders, setAllFolders] = useState([]);

  // View controls
  const [view,   setView]   = useState("list");
  const [sort,   setSort]   = useState("name_asc");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Drag-and-drop
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  // Uploads
  const [uploads, setUploads] = useState([]);
  const fileInputRef = useRef(null);

  // Modals
  const [preview,   setPreview]   = useState(null);
  const [renaming,  setRenaming]  = useState(null);
  const [moving,    setMoving]    = useState(null);
  const [deleting,  setDeleting]  = useState(null);
  const [newFolder, setNewFolder] = useState(false);
  const [ctxMenu,   setCtxMenu]   = useState(null);

  // No section-reset effect needed — all tabs use section="files" and the
  // parent uses a key prop to force full remount when switching tabs.

  // ── Load items ──────────────────────────────────────────────────────────────
  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const params = { folderId: folderId || "", sort, filter, section };
      if (search) params.search = search;
      const { data } = await api.get(`/clients/${clientId}/files`, { params });
      setItems(data.items || []);
      setBreadcrumbs(data.breadcrumbs || []);
    } catch {
      setError("Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [clientId, section, folderId, sort, filter, search]);

  const loadFolders = useCallback(async () => {
    try {
      const { data } = await api.get(`/clients/${clientId}/files/folders`, { params: { section } });
      setAllFolders(data || []);
    } catch {}
  }, [clientId, section]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { setSelected(new Set()); }, [folderId, search]);

  // ── Folder navigation ───────────────────────────────────────────────────────
  function openFolder(folder) { setFolderId(folder.id); setSearch(""); }
  function navBreadcrumb(id) { setFolderId(id || null); setSearch(""); }

  // ── Upload helpers ──────────────────────────────────────────────────────────
  async function uploadFiles(files) {
    const list = Array.from(files);
    if (!list.length) return;

    const batch = list.map((f) => ({ id: `${Date.now()}-${Math.random()}`, name: f.name, progress: 0, status: "uploading" }));
    setUploads((prev) => [...prev, ...batch]);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const uid = batch[i].id;
      const formData = new FormData();
      formData.append("files", file);
      formData.append("section", section);
      if (folderId) formData.append("folderId", folderId);
      try {
        await api.post(`/clients/${clientId}/files/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded / (e.total || 1)) * 100);
            setUploads((prev) => prev.map((u) => u.id === uid ? { ...u, progress: pct } : u));
          },
        });
        setUploads((prev) => prev.map((u) => u.id === uid ? { ...u, progress: 100, status: "done" } : u));
      } catch {
        setUploads((prev) => prev.map((u) => u.id === uid ? { ...u, status: "error" } : u));
      }
    }
    await load({ silent: true });
    await loadFolders();
    setTimeout(() => setUploads((prev) => prev.filter((u) => u.status !== "done" && u.status !== "error")), 3000);
  }

  // ── Drag and drop ───────────────────────────────────────────────────────────
  function onDragEnter(e) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setDragOver(true);
  }
  function onDragLeave(e) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }
  function onDragOver(e) { e.preventDefault(); e.stopPropagation(); }
  function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setDragOver(false);
    const files = e.dataTransfer.files;
    if (files?.length) uploadFiles(files);
  }

  // ── Item actions ──────────────────────────────────────────────────────────────
  async function handleAction(action, item) {
    if (action === "open") {
      if (item.type === "FOLDER") openFolder(item);
      else window.open(`/api/clients/${clientId}/files/${item.id}/download`, "_blank");
    }
    if (action === "preview") setPreview({ ...item, clientId });
    if (action === "rename")  setRenaming(item);
    if (action === "move")    { await loadFolders(); setMoving(item); }
    if (action === "delete")  setDeleting(item);
  }

  async function doRename(newName) {
    try {
      await api.patch(`/clients/${clientId}/files/${renaming.id}/rename`, { name: newName });
      setRenaming(null);
      load({ silent: true });
    } catch {}
  }

  async function doMove(destId) {
    try {
      await api.patch(`/clients/${clientId}/files/${moving.id}/move`, { parentId: destId });
      setMoving(null);
      load({ silent: true });
      loadFolders();
    } catch {}
  }

  async function doDelete() {
    try {
      await api.delete(`/clients/${clientId}/files/${deleting.id}`);
      setDeleting(null);
      load({ silent: true });
      loadFolders();
    } catch {}
  }

  async function doCreateFolder(name) {
    try {
      await api.post(`/clients/${clientId}/files/folder`, { name, parentId: folderId || null, section });
      setNewFolder(false);
      load({ silent: true });
      loadFolders();
    } catch {}
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  function toggleSelect(id, e) {
    e?.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(items.length === selected.size ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function bulkDelete() {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} item(s)?`)) return;
    for (const id of selected) {
      try { await api.delete(`/clients/${clientId}/files/${id}`); } catch {}
    }
    setSelected(new Set());
    load({ silent: true });
    loadFolders();
  }

  // ── Filter / sort options ─────────────────────────────────────────────────────
  const filterOpts = [
    { value: "all",         label: "All" },
    { value: "folders",     label: "Folders" },
    { value: "pdf",         label: "PDFs" },
    { value: "image",       label: "Images" },
    { value: "audio",       label: "Audio" },
    { value: "video",       label: "Video" },
    { value: "doc",         label: "Documents" },
    { value: "spreadsheet", label: "Spreadsheets" },
    { value: "archive",     label: "Archives" },
  ];
  const sortOpts = [
    { value: "name_asc",  label: "Name A→Z" },
    { value: "name_desc", label: "Name Z→A" },
    { value: "date_desc", label: "Newest first" },
    { value: "date_asc",  label: "Oldest first" },
    { value: "size_desc", label: "Largest first" },
    { value: "size_asc",  label: "Smallest first" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className={`relative flex flex-col gap-3 min-h-[500px] transition-all ${dragOver ? "ring-2 ring-inset ring-indigo-400" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag-over overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-xl bg-indigo-50/90 border-2 border-dashed border-indigo-400 pointer-events-none">
          <span className="text-5xl mb-3">📂</span>
          <p className="text-lg font-semibold text-indigo-700">Drop files to upload</p>
          <p className="text-sm text-indigo-500 mt-1">
            Release to add to {breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].name : meta.label}
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          <button onClick={() => navBreadcrumb(null)}
            className={`shrink-0 text-sm font-medium transition-colors ${!folderId ? "text-slate-900" : "text-indigo-600 hover:text-indigo-800"}`}>
            {meta.label}
          </button>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400 text-xs">/</span>
              <button
                onClick={() => navBreadcrumb(crumb.id)}
                className={`text-sm font-medium transition-colors ${i === breadcrumbs.length - 1 ? "text-slate-900 cursor-default" : "text-indigo-600 hover:text-indigo-800"}`}>
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {selected.size > 0 && (
            <button onClick={bulkDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
              🗑️ Delete {selected.size}
            </button>
          )}
          <button onClick={() => setNewFolder(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm py-2">
            <span>📁</span> New Folder
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="btn-primary flex items-center gap-1.5 text-sm py-2">
            <span>⬆️</span> Upload Files
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {/* Search + Sort + Filter + View */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            className="saas-input w-full pl-8"
            placeholder={`Search ${meta.label.toLowerCase()} files…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="saas-input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {filterOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="saas-input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          {sortOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          {[["list","☰"],["grid","⊞"]].map(([v, icon]) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`px-3 py-2 text-sm transition-colors ${view === v ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"} border-r border-slate-200 last:border-r-0`}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Upload queue */}
      <UploadQueue uploads={uploads} />

      {/* Content area */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map((n) => (
            <div key={n} className="skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error} <button onClick={() => load()} className="ml-2 underline">Retry</button>
        </div>
      ) : !items.length ? (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-20 px-6 text-center cursor-pointer hover:bg-slate-100 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-5xl mb-4">📂</span>
          <p className="text-lg font-semibold text-slate-800">
            {search
              ? "No files match your search"
              : breadcrumbs.length > 0
                ? `No files in "${breadcrumbs[breadcrumbs.length - 1].name}" yet`
                : meta.emptyTitle}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {search
              ? "Try a different search term"
              : breadcrumbs.length > 0
                ? "Drag and drop files here, or click to upload"
                : meta.emptyHint}
          </p>
          {!search && (
            <div className="mt-5 flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="btn-primary text-sm">Upload Files</button>
              <button onClick={(e) => { e.stopPropagation(); setNewFolder(true); }}
                className="btn-secondary text-sm">New Folder</button>
            </div>
          )}
        </div>
      ) : view === "list" ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <input type="checkbox" className="accent-indigo-600"
              checked={selected.size === items.length && items.length > 0}
              onChange={selectAll} />
            <span>Name</span>
            <span>Size</span>
            <span>Modified</span>
            <span />
          </div>
          {items.map((item) => (
            <div key={item.id}
              onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ item, x: e.clientX, y: e.clientY }); }}
              onDoubleClick={() => item.type === "FOLDER" ? openFolder(item) : setPreview({ ...item, clientId })}
              className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-t border-slate-100 px-4 py-3 transition-colors cursor-pointer hover:bg-slate-50 group ${selected.has(item.id) ? "bg-indigo-50" : ""}`}>
              <input type="checkbox" className="accent-indigo-600"
                checked={selected.has(item.id)}
                onChange={(e) => toggleSelect(item.id, e)}
                onClick={(e) => e.stopPropagation()} />
              <div className="flex items-center gap-2.5 min-w-0">
                <FileIcon mimeType={item.mimeType} isFolder={item.type === "FOLDER"} size={22} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                  {item.type !== "FOLDER" && item.extension && (
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{item.extension}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                {item.type === "FOLDER" ? "—" : fmtSize(item.sizeBytes)}
              </span>
              <span className="text-xs text-slate-500 shrink-0">{fmtDate(item.updatedAt || item.createdAt)}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {item.type !== "FOLDER" && (
                  <button title="Preview" onClick={(e) => { e.stopPropagation(); setPreview({ ...item, clientId }); }}
                    className="rounded p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-sm">
                    🔍
                  </button>
                )}
                <button title="Download / Open" onClick={(e) => { e.stopPropagation(); handleAction("open", item); }}
                  className="rounded p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-sm">
                  {item.type === "FOLDER" ? "📂" : "⬇️"}
                </button>
                <button title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(item); }}
                  className="rounded p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-sm">
                  ✏️
                </button>
                <button title="Delete" onClick={(e) => { e.stopPropagation(); setDeleting(item); }}
                  className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <div key={item.id}
              onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ item, x: e.clientX, y: e.clientY }); }}
              onDoubleClick={() => item.type === "FOLDER" ? openFolder(item) : setPreview({ ...item, clientId })}
              onClick={(e) => toggleSelect(item.id, e)}
              className={`group relative flex flex-col items-center rounded-2xl border p-3 cursor-pointer transition-all hover:shadow-md ${
                selected.has(item.id)
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}>
              <div className={`absolute top-2 left-2 transition-opacity ${selected.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}>
                <input type="checkbox" className="accent-indigo-600" checked={selected.has(item.id)}
                  onChange={() => {}} onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }} />
              </div>
              <div className="mb-2 mt-1">
                <FileIcon mimeType={item.mimeType} isFolder={item.type === "FOLDER"} size={40} />
              </div>
              <p className="text-center text-xs font-medium text-slate-800 break-all line-clamp-2 w-full">{item.name}</p>
              <p className="text-center text-[10px] text-slate-400 mt-0.5">
                {item.type === "FOLDER" ? "Folder" : fmtSize(item.sizeBytes)}
              </p>
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                <button title="Actions"
                  onClick={(e) => { e.stopPropagation(); setCtxMenu({ item, x: e.clientX, y: e.clientY }); }}
                  className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-xs">
                  ⋮
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {preview   && <PreviewModal   item={preview}   onClose={() => setPreview(null)} />}
      {renaming  && <RenameModal    item={renaming}  onSave={doRename}  onClose={() => setRenaming(null)} />}
      {newFolder && <NewFolderModal onSave={doCreateFolder} onClose={() => setNewFolder(false)} />}
      {moving    && <MoveModal item={moving} allFolders={allFolders} sectionLabel={meta.label} onMove={doMove} onClose={() => setMoving(null)} />}
      {deleting  && <DeleteConfirm  item={deleting}  onConfirm={doDelete}  onClose={() => setDeleting(null)} />}
      <ContextMenu menu={ctxMenu} onAction={handleAction} onClose={() => setCtxMenu(null)} />
    </div>
  );
}
