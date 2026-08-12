import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import useHotkey from "../../hooks/useHotkey";

const PRESET_KEY = "aplus_audit_filters_v1";
const VIEW_CACHE_KEY = "aplus_audit_view_v1";
const SNAPSHOT_KEY = "aplus_audit_snapshots_v1";
const VIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const SNAPSHOT_MAX = 20;

export default function AuditLogsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState([]);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotTag, setSnapshotTag] = useState("");
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotSearch, setSnapshotSearch] = useState("");
  const [snapshotTagFilter, setSnapshotTagFilter] = useState("all");
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [undoPayload, setUndoPayload] = useState(null);
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const undoTimerRef = useRef(null);
  const importFileRef = useRef(null);
  const filterInputRef = useRef(null);
  const limit = 50;

  useHotkey({
    key: "k",
    ctrlOrMeta: true,
    enabled: isAdmin,
    onTrigger: () => filterInputRef.current?.focus()
  });

  const persistViewCache = (payload) => {
    try {
      sessionStorage.setItem(
        VIEW_CACHE_KEY,
        JSON.stringify({
          cachedAt: Date.now(),
          ...payload
        })
      );
    } catch {
      // Ignore browser storage restrictions.
    }
  };

  const restoreViewCache = () => {
    try {
      const raw = sessionStorage.getItem(VIEW_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const age = Date.now() - Number(parsed.cachedAt || 0);
      if (age < 0 || age > VIEW_CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const loadSnapshots = () => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const normalized = Array.isArray(parsed)
        ? parsed.map((s) => ({ ...s, pinned: Boolean(s.pinned), tag: s.tag || "" }))
        : [];
      normalized.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setSnapshots(normalized);
    } catch {
      setSnapshots([]);
    }
  };

  const persistSnapshots = (list) => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list));
    setSnapshots(list);
  };

  const normalizeSnapshot = (snapshot) => ({
    id: snapshot.id || crypto.randomUUID(),
    name: String(snapshot.name || "Untitled snapshot"),
    tag: String(snapshot.tag || "").trim(),
    createdAt: snapshot.createdAt || new Date().toISOString(),
    pinned: Boolean(snapshot.pinned),
    state: {
      filter: String(snapshot.state?.filter || ""),
      startDate: String(snapshot.state?.startDate || ""),
      endDate: String(snapshot.state?.endDate || ""),
      sortBy: String(snapshot.state?.sortBy || "createdAt"),
      sortDir: String(snapshot.state?.sortDir || "desc"),
      offset: Number(snapshot.state?.offset || 0)
    },
    url: String(snapshot.url || "")
  });

  const sortSnapshots = (list) => {
    const next = [...list];
    next.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return next;
  };

  const trimSnapshots = (list) => {
    if (list.length <= SNAPSHOT_MAX) return list;
    const pinned = list.filter((s) => s.pinned);
    const unpinned = list.filter((s) => !s.pinned);
    const roomForUnpinned = Math.max(SNAPSHOT_MAX - pinned.length, 0);
    const trimmedUnpinned = unpinned.slice(0, roomForUnpinned);
    const merged = [...pinned, ...trimmedUnpinned];
    return merged.slice(0, SNAPSHOT_MAX);
  };

  const hydrateFromUrl = () => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const hasAny =
      params.has("action") ||
      params.has("startDate") ||
      params.has("endDate") ||
      params.has("sortBy") ||
      params.has("sortDir") ||
      params.has("offset");
    if (!hasAny) return null;

    const hydrated = {
      filter: params.get("action") || "",
      startDate: params.get("startDate") || "",
      endDate: params.get("endDate") || "",
      sortBy: params.get("sortBy") || "createdAt",
      sortDir: params.get("sortDir") || "desc",
      offset: Number(params.get("offset") || 0)
    };
    return hydrated;
  };

  const syncUrl = (action, start, end, currentOffset, currentSortBy, currentSortDir) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (start) params.set("startDate", start);
    if (end) params.set("endDate", end);
    if (currentSortBy && currentSortBy !== "createdAt") params.set("sortBy", currentSortBy);
    if (currentSortDir && currentSortDir !== "desc") params.set("sortDir", currentSortDir);
    if (currentOffset > 0) params.set("offset", String(currentOffset));
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const buildParams = (action = "", start = "", end = "", nextOffset = 0, nextSortBy = "createdAt", nextSortDir = "desc") => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(nextOffset));
    params.set("sortBy", nextSortBy);
    params.set("sortDir", nextSortDir);
    if (action) params.set("action", action);
    if (start) params.set("startDate", new Date(start).toISOString());
    if (end) params.set("endDate", new Date(end).toISOString());
    return params;
  };

  const load = async (action = "", start = "", end = "", nextOffset = 0, nextSortBy = sortBy, nextSortDir = sortDir) => {
    setIsLoading(true);
    const params = buildParams(action, start, end, nextOffset, nextSortBy, nextSortDir);
    try {
      const { data } = await api.get(`/audit-logs?${params.toString()}`);
      const items = data.items || [];
      const totalCount = data.total || 0;
      const resolvedOffset = data.offset || 0;
      setLogs(items);
      setTotal(totalCount);
      setOffset(resolvedOffset);
      persistViewCache({
        filter: action,
        startDate: start,
        endDate: end,
        sortBy: nextSortBy,
        sortDir: nextSortDir,
        offset: resolvedOffset,
        total: totalCount,
        logs: items
      });
      syncUrl(action, start, end, resolvedOffset, nextSortBy, nextSortDir);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCsv = async () => {
    const params = buildParams(filter, startDate, endDate, 0, sortBy, sortDir);
    params.set("limit", "2000");
    const response = await api.get(`/audit-logs/export.csv?${params.toString()}`, { responseType: "blob" });
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-logs.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const loadPresets = () => {
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      const next = raw ? JSON.parse(raw) : [];
      setPresets(Array.isArray(next) ? next : []);
    } catch {
      setPresets([]);
    }
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const nextPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      filter,
      startDate,
      endDate,
      sortBy,
      sortDir
    };
    const next = [nextPreset, ...presets].slice(0, 10);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName("");
  };

  const applyPreset = (preset) => {
    setFilter(preset.filter || "");
    setStartDate(preset.startDate || "");
    setEndDate(preset.endDate || "");
    setSortBy(preset.sortBy || "createdAt");
    setSortDir(preset.sortDir || "desc");
    load(
      preset.filter || "",
      preset.startDate || "",
      preset.endDate || "",
      0,
      preset.sortBy || "createdAt",
      preset.sortDir || "desc"
    );
  };

  const deletePreset = (id) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };

  const clearViewState = () => {
    try {
      sessionStorage.removeItem(VIEW_CACHE_KEY);
    } catch {
      // ignore
    }
    setFilter("");
    setStartDate("");
    setEndDate("");
    setSortBy("createdAt");
    setSortDir("desc");
    setOffset(0);
    setNotice("View state cleared.");
    load("", "", "", 0, "createdAt", "desc");
  };

  const copyFilterUrl = async () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (filter) params.set("action", filter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (sortBy !== "createdAt") params.set("sortBy", sortBy);
    if (sortDir !== "desc") params.set("sortDir", sortDir);
    if (offset > 0) params.set("offset", String(offset));
    const url = `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Filter URL copied.");
    } catch {
      setNotice("Unable to copy URL in this browser.");
    }
  };

  const buildShareUrl = (state) => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams();
    if (state.filter) params.set("action", state.filter);
    if (state.startDate) params.set("startDate", state.startDate);
    if (state.endDate) params.set("endDate", state.endDate);
    if (state.sortBy && state.sortBy !== "createdAt") params.set("sortBy", state.sortBy);
    if (state.sortDir && state.sortDir !== "desc") params.set("sortDir", state.sortDir);
    if (state.offset > 0) params.set("offset", String(state.offset));
    return `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const saveSnapshot = () => {
    const name = snapshotName.trim();
    if (!name) {
      setNotice("Enter a snapshot name first.");
      return;
    }
    const tag = snapshotTag.trim();
    const state = { filter, startDate, endDate, sortBy, sortDir, offset };
    const snapshot = {
      id: crypto.randomUUID(),
      name,
      tag,
      createdAt: new Date().toISOString(),
      pinned: false,
      state,
      url: buildShareUrl(state)
    };
    const next = trimSnapshots(sortSnapshots([snapshot, ...snapshots]));
    persistSnapshots(next);
    setSnapshotName("");
    setSnapshotTag("");
    setNotice("Snapshot saved.");
  };

  const openSnapshot = (snapshot) => {
    const state = snapshot.state || {};
    setFilter(state.filter || "");
    setStartDate(state.startDate || "");
    setEndDate(state.endDate || "");
    setSortBy(state.sortBy || "createdAt");
    setSortDir(state.sortDir || "desc");
    setOffset(Number(state.offset || 0));
    load(
      state.filter || "",
      state.startDate || "",
      state.endDate || "",
      Number(state.offset || 0),
      state.sortBy || "createdAt",
      state.sortDir || "desc"
    );
  };

  const deleteSnapshot = (id) => {
    const next = snapshots.filter((s) => s.id !== id);
    persistSnapshots(next);
    setSelectedSnapshotIds((prev) => prev.filter((x) => x !== id));
    setNotice("Snapshot removed.");
  };

  const toggleSnapshotPin = (id) => {
    const next = snapshots.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
    persistSnapshots(sortSnapshots(trimSnapshots(next)));
    setNotice("Snapshot updated.");
  };

  const exportSnapshotsJson = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      snapshots
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-snapshots-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNotice("Snapshots exported.");
  };

  const importSnapshotsJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedRaw = Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
      const imported = importedRaw.map(normalizeSnapshot);
      const existingIds = new Set(snapshots.map((s) => s.id));
      const overwriteCount = imported.filter((s) => existingIds.has(s.id)).length;
      const newCount = imported.length - overwriteCount;
      const sampleNames = imported.slice(0, 5).map((s) => s.name);
      setImportPreview({
        fileName: file.name,
        imported,
        overwriteCount,
        newCount,
        sampleNames
      });
    } catch {
      setNotice("Invalid JSON file. Import failed.");
      setImportPreview(null);
    } finally {
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
    }
  };

  const confirmImportSnapshots = () => {
    if (!importPreview?.imported) return;
    const imported = importPreview.imported;
    const existingById = new Map(snapshots.map((s) => [s.id, s]));
    for (const item of imported) {
      existingById.set(item.id, item);
    }
    const merged = Array.from(existingById.values());
    const next = sortSnapshots(trimSnapshots(merged));
    persistSnapshots(next);
    setImportPreview(null);
    setNotice(`Imported ${imported.length} snapshot(s).`);
  };

  const copySnapshotUrl = async (snapshot) => {
    try {
      await navigator.clipboard.writeText(snapshot.url || "");
      setNotice("Snapshot URL copied.");
    } catch {
      setNotice("Unable to copy snapshot URL.");
    }
  };

  const headerActions = useMemo(() => (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" onClick={copyFilterUrl}>
        Copy Filter URL
      </button>
      <button className="btn-secondary" onClick={clearViewState}>
        Clear View State
      </button>
    </div>
  ), [filter, startDate, endDate, sortBy, sortDir, offset]);

  const availableTags = useMemo(() => {
    const tags = new Set();
    snapshots.forEach((s) => {
      const tag = String(s.tag || "").trim();
      if (tag) tags.add(tag);
    });
    return ["all", ...Array.from(tags).sort((a, b) => a.localeCompare(b))];
  }, [snapshots]);

  const visibleSnapshots = useMemo(() => {
    const term = snapshotSearch.trim().toLowerCase();
    return snapshots.filter((snapshot) => {
      const tagMatches = snapshotTagFilter === "all" || String(snapshot.tag || "") === snapshotTagFilter;
      if (!tagMatches) return false;
      if (!term) return true;
      const created = new Date(snapshot.createdAt).toLocaleString().toLowerCase();
      const filterText = [
        snapshot.state?.filter || "",
        snapshot.state?.startDate || "",
        snapshot.state?.endDate || "",
        snapshot.state?.sortBy || "",
        snapshot.state?.sortDir || "",
        snapshot.tag || ""
      ].join(" ").toLowerCase();
      return (
        String(snapshot.name || "").toLowerCase().includes(term) ||
        created.includes(term) ||
        filterText.includes(term)
      );
    });
  }, [snapshots, snapshotSearch, snapshotTagFilter]);

  const visibleIds = useMemo(() => visibleSnapshots.map((s) => s.id), [visibleSnapshots]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSnapshotIds.includes(id));

  const toggleSelectSnapshot = (id) => {
    setSelectedSnapshotIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllVisible = () => {
    setSelectedSnapshotIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  };

  const clearSnapshotSelection = () => {
    setSelectedSnapshotIds([]);
  };

  const bulkDeleteSnapshots = () => {
    if (selectedSnapshotIds.length === 0) return;
    const next = snapshots.filter((s) => !selectedSnapshotIds.includes(s.id));
    const deleted = snapshots.filter((s) => selectedSnapshotIds.includes(s.id));
    persistSnapshots(next);
    setSelectedSnapshotIds([]);
    setUndoPayload({ items: deleted });
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      setUndoPayload(null);
      undoTimerRef.current = null;
    }, 10000);
    setNotice("Selected snapshots deleted. You can undo for 10 seconds.");
  };

  const requestBulkDeleteSnapshots = () => {
    if (selectedSnapshotIds.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const undoBulkDelete = () => {
    if (!undoPayload?.items?.length) return;
    const merged = [...undoPayload.items, ...snapshots];
    persistSnapshots(sortSnapshots(trimSnapshots(merged)));
    setUndoPayload(null);
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setNotice("Bulk delete undone.");
  };

  const bulkSetPinned = (pinned) => {
    if (selectedSnapshotIds.length === 0) return;
    const next = snapshots.map((s) => (
      selectedSnapshotIds.includes(s.id) ? { ...s, pinned } : s
    ));
    persistSnapshots(sortSnapshots(trimSnapshots(next)));
    setNotice(pinned ? "Selected snapshots pinned." : "Selected snapshots unpinned.");
  };

  const bulkCopyUrls = async () => {
    if (selectedSnapshotIds.length === 0) return;
    const lines = snapshots
      .filter((s) => selectedSnapshotIds.includes(s.id))
      .map((s) => `${s.name}: ${s.url}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setNotice("Selected snapshot URLs copied.");
    } catch {
      setNotice("Unable to copy selected URLs.");
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadPresets();
      loadSnapshots();
      const urlHydrated = hydrateFromUrl();
      if (urlHydrated) {
        setFilter(urlHydrated.filter);
        setStartDate(urlHydrated.startDate);
        setEndDate(urlHydrated.endDate);
        setSortBy(urlHydrated.sortBy);
        setSortDir(urlHydrated.sortDir);
        setOffset(urlHydrated.offset);
        load(
          urlHydrated.filter,
          urlHydrated.startDate,
          urlHydrated.endDate,
          urlHydrated.offset,
          urlHydrated.sortBy,
          urlHydrated.sortDir
        );
        return;
      }
      const cached = restoreViewCache();
      if (cached) {
        setFilter(cached.filter || "");
        setStartDate(cached.startDate || "");
        setEndDate(cached.endDate || "");
        setSortBy(cached.sortBy || "createdAt");
        setSortDir(cached.sortDir || "desc");
        if (Array.isArray(cached.logs)) {
          setLogs(cached.logs);
          setTotal(Number(cached.total || 0));
          setOffset(Number(cached.offset || 0));
        }
        load(
          cached.filter || "",
          cached.startDate || "",
          cached.endDate || "",
          Number(cached.offset || 0),
          cached.sortBy || "createdAt",
          cached.sortDir || "desc"
        );
        return;
      }
      load("", "", "", 0, "createdAt", "desc");
    }
  }, [isAdmin]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold mb-2">Audit Logs</h1>
        <p className="text-slate-600">Only ADMIN users can view audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-500">Investigate sensitive actions with filters, snapshots, and exports.</p>
      </div>
      <div className="card">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
        <h1 className="text-xl font-semibold">Audit Explorer</h1>
        <div className="flex flex-wrap gap-2">
          <input
            ref={filterInputRef}
            className="saas-input"
            placeholder="Filter action (e.g. USER_CREATED)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="saas-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            title="Sort field"
          >
            <option value="createdAt">Time</option>
            <option value="action">Action</option>
            <option value="actorEmail">Actor</option>
          </select>
          <select
            className="saas-input"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value)}
            title="Sort direction"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          <input
            className="saas-input"
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            title="Start date"
          />
          <input
            className="saas-input"
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            title="End date"
          />
          <button
            className="btn-primary"
            disabled={isLoading}
            onClick={() => load(filter, startDate, endDate, 0, sortBy, sortDir)}
          >
            {isLoading ? "Loading..." : "Apply"}
          </button>
          <button className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {headerActions}
        {notice && <span className="text-xs text-slate-600">{notice}</span>}
      </div>

      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            className="saas-input"
            placeholder="Investigation snapshot name"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
          />
          <input
            className="saas-input"
            placeholder="Tag (e.g. security)"
            value={snapshotTag}
            onChange={(e) => setSnapshotTag(e.target.value)}
          />
          <button className="btn-secondary" onClick={saveSnapshot}>
            Save Snapshot
          </button>
          <input
            className="saas-input"
            placeholder="Search snapshots"
            value={snapshotSearch}
            onChange={(e) => setSnapshotSearch(e.target.value)}
          />
          <button className="btn-secondary" onClick={exportSnapshotsJson}>
            Export JSON
          </button>
          <button className="btn-secondary" onClick={() => importFileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={importSnapshotsJson}
          />
          <select
            className="saas-input"
            value={snapshotTagFilter}
            onChange={(e) => setSnapshotTagFilter(e.target.value)}
          >
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag === "all" ? "All tags" : tag}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button className="btn-secondary py-1 text-xs" onClick={toggleSelectAllVisible}>
            {allVisibleSelected ? "Unselect visible" : "Select visible"}
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={clearSnapshotSelection}>
            Clear selection
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={() => bulkSetPinned(true)}>
            Pin selected
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={() => bulkSetPinned(false)}>
            Unpin selected
          </button>
          <button className="btn-secondary py-1 text-xs" onClick={bulkCopyUrls}>
            Copy selected URLs
          </button>
          <button className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50" onClick={requestBulkDeleteSnapshots}>
            Delete selected
          </button>
          <span className="text-xs text-slate-500">Selected: {selectedSnapshotIds.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          {snapshots.length === 0 && <span className="text-xs text-slate-500">No saved snapshots.</span>}
          {snapshots.length > 0 && visibleSnapshots.length === 0 && (
            <span className="text-xs text-slate-500">No snapshots match your search.</span>
          )}
          {visibleSnapshots.map((snapshot) => (
            <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <label className="inline-flex items-center gap-1 mr-2">
                  <input
                    type="checkbox"
                    checked={selectedSnapshotIds.includes(snapshot.id)}
                    onChange={() => toggleSelectSnapshot(snapshot.id)}
                  />
                </label>
                <p className="text-sm font-medium">
                  {snapshot.name} {snapshot.pinned ? <span className="text-amber-600">★</span> : null}
                </p>
                {snapshot.tag ? (
                  <button
                    className="text-xs text-primary-600 hover:underline"
                    onClick={() => setSnapshotTagFilter(snapshot.tag)}
                  >
                    #{snapshot.tag}
                  </button>
                ) : null}
                <p className="text-xs text-slate-500">{new Date(snapshot.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => toggleSnapshotPin(snapshot.id)}>
                  {snapshot.pinned ? "Unpin" : "Pin"}
                </button>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => openSnapshot(snapshot)}>Open</button>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => copySnapshotUrl(snapshot)}>Copy URL</button>
                <button className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={() => deleteSnapshot(snapshot.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-slate-200 p-4 bg-slate-50">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            className="saas-input"
            placeholder="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button className="btn-secondary" onClick={savePreset}>
            Save Preset
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.length === 0 && <span className="text-xs text-slate-500">No saved presets.</span>}
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 bg-white">
              <button className="text-xs text-primary-600" onClick={() => applyPreset(preset)}>
                {preset.name}
              </button>
              <button className="text-xs text-red-600" onClick={() => deletePreset(preset.id)}>
                x
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 text-sm text-slate-600">
        <span>
          Showing {logs.length === 0 ? 0 : offset + 1}-{offset + logs.length} of {total}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-secondary py-1 disabled:opacity-50"
            onClick={() => load(filter, startDate, endDate, Math.max(offset - limit, 0), sortBy, sortDir)}
            disabled={offset === 0}
          >
            Previous
          </button>
          <button
            className="btn-secondary py-1 disabled:opacity-50"
            onClick={() => load(filter, startDate, endDate, offset + limit, sortBy, sortDir)}
            disabled={offset + logs.length >= total}
          >
            Next
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-slate-50">
              <th className="px-3 py-2 pr-2">Time</th>
              <th className="px-3 py-2 pr-2">Action</th>
              <th className="px-3 py-2 pr-2">Actor</th>
              <th className="px-3 py-2 pr-2">Target</th>
              <th className="px-3 py-2 pr-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 6 }).map((_, idx) => (
              <tr key={`audit-skeleton-${idx}`} className="border-b">
                <td className="px-3 py-3" colSpan={5}>
                  <div className="skeleton-line w-full" />
                </td>
              </tr>
            ))}
            {logs.map((log) => (
              <tr key={log.id} className="border-b align-top hover:bg-slate-50">
                <td className="px-3 py-2 pr-2 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2 pr-2">{log.action}</td>
                <td className="px-3 py-2 pr-2">{log.actorEmail || "-"}</td>
                <td className="px-3 py-2 pr-2">{log.targetType || "-"} {log.targetId ? `(${log.targetId})` : ""}</td>
                <td className="px-3 py-2 pr-2">
                  <pre className="whitespace-pre-wrap break-words text-xs text-slate-700">
                    {log.metadata ? JSON.stringify(log.metadata) : "-"}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-4">
            <h2 className="text-lg font-semibold mb-2">Confirm bulk delete</h2>
            <p className="text-sm text-slate-600 mb-4">
              Delete {selectedSnapshotIds.length} selected snapshots? This can be undone for 10 seconds.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  bulkDeleteSnapshots();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-4">
            <h2 className="text-lg font-semibold mb-2">Confirm snapshot import</h2>
            <p className="text-sm text-slate-600 mb-2">
              File: <span className="font-medium">{importPreview.fileName}</span>
            </p>
            <ul className="text-sm text-slate-700 list-disc pl-5 mb-3">
              <li>Total incoming: {importPreview.imported.length}</li>
              <li>New snapshots: {importPreview.newCount}</li>
              <li>Will overwrite existing IDs: {importPreview.overwriteCount}</li>
            </ul>
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1">Sample snapshots:</p>
              <p className="text-sm text-slate-700">
                {importPreview.sampleNames.length ? importPreview.sampleNames.join(", ") : "No snapshot names found"}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setImportPreview(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={confirmImportSnapshots}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {undoPayload?.items?.length ? (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
          <span className="text-sm">Deleted {undoPayload.items.length} snapshot(s)</span>
          <button className="text-sm underline" onClick={undoBulkDelete}>Undo</button>
          <button className="text-sm opacity-80" onClick={() => setUndoPayload(null)}>Dismiss</button>
        </div>
      ) : null}
      </div>
    </div>
  );
}
