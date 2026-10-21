/**
 * Identity and de-duplication for rows in the persisted ABA store
 * (`useABAStore` — categories, skill areas, goals).
 *
 * Why this exists: THREE effects hydrate the same shared store from the server,
 * concurrently, in two different components —
 *
 *   - `ProgramsTab`'s serverId sync      (GET /api/clients/[id]/targets)
 *   - `ProgramsTab`'s cross-device hydration (GET /api/programs + .../goals)
 *   - `DataEntryTab`'s serverId sync      (GET /api/clients/[id]/targets)
 *
 * Each one used to read a single `useABAStore.getState()` snapshot BEFORE its
 * loop and then test "is this server row already in the store?" against that
 * stale copy, while `addTarget` was a blind `[...s.targets, row]` push with no
 * guard of its own. Two effects racing therefore both concluded the row was
 * missing and both appended it, leaving the store with two rows for one server
 * record.
 *
 * The duplicates were invisible in the Goals & Targets drill-down but doubled
 * in the session data-entry lists, because the two sync paths write DIFFERENT
 * parent links for the same goal: the serverId syncs set `programId` to the
 * server `ParentGoal` id, while hydration sets it to the LOCAL skill-area id.
 * The drill-down filters on the local id, so the extra copy matched no skill
 * area and dropped out of it — but the data-entry lists are flat and showed
 * both. (Reported for client Libby Weiner, whose server data has no duplicates
 * at all: 20 targets, each returned exactly once.)
 *
 * A row's identity is its SERVER id when it has one, so a locally-created row
 * that has since synced is the same record as the server copy. A row that has
 * never synced is identified by its local id and can never collide with a
 * server row.
 */

/** A persisted store row that may or may not have reached the server yet. */
export interface IdentifiableRow {
  id: string;
  serverId?: string | null;
}

/** The server id when the row has synced, otherwise its local id. */
export function rowIdentity(row: IdentifiableRow): string {
  return row.serverId ?? row.id;
}

/**
 * Collapse rows that refer to the same server record, keeping the FIRST
 * occurrence — on a machine where the goal was created locally that is the row
 * carrying the correct `local-…` parent links, and `ProgramsTab`'s hydration
 * reconciles the survivor's links against the server afterwards either way.
 *
 * The one case where a later row wins is when the kept row has not recorded its
 * `serverId` and the later one has: that row is the same record, better linked.
 *
 * Order is otherwise preserved; callers sort afterwards.
 */
export function dedupeStoreRows<T extends IdentifiableRow>(rows: readonly T[] | undefined | null): T[] {
  if (!rows?.length) return [];
  const byIdentity = new Map<string, T>();
  for (const row of rows) {
    const key = rowIdentity(row);
    const kept = byIdentity.get(key);
    if (!kept) {
      byIdentity.set(key, row);
    } else if (!kept.serverId && row.serverId) {
      byIdentity.set(key, row);
    }
  }
  return [...byIdentity.values()];
}

/**
 * Whether `rows` already holds the record `candidate` refers to. Used by the
 * store's add actions so a racing second `add` of the same server row is a
 * no-op rather than a duplicate — the guard has to live there, since the
 * callers cannot see each other's writes.
 */
export function containsRow(rows: readonly IdentifiableRow[], candidate: IdentifiableRow): boolean {
  const key = rowIdentity(candidate);
  return rows.some((row) => rowIdentity(row) === key || row.id === candidate.id);
}

/**
 * The comparison form for a goal definition / skill-area name when matching a
 * LOCAL row against a SERVER row.
 *
 * Internal whitespace is collapsed, which the call sites' own
 * `trim().toLowerCase()` did not do. That omission is how a duplicate survived
 * the identity de-duplication above: a local row whose title differed from the
 * server's definition by nothing more than a double space, a newline or a
 * non-breaking space failed to match, so the serverId sync fell through to
 * `addTarget` and the store ended up with the unsynced local row AND the server
 * row. Those two have DIFFERENT identities — one has no `serverId` at all — so
 * `dedupeStoreRows` cannot tell they are the same goal, and the user keeps
 * seeing the goal twice in session data entry.
 */
export function normalizeLabel(label: string | null | undefined): string {
  return (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** A store row that carries a client and a human label. */
export interface LabelledRow extends IdentifiableRow {
  clientId?: string;
  title?: string;
}

/**
 * De-duplicate goal rows: by identity first, then drop any UNSYNCED row whose
 * goal is already on the server for the same client under the same label.
 *
 * An unsynced row that duplicates a synced one is a leftover from an optimistic
 * write whose server id never came back (or came back against a differently
 * whitespaced title). The server copy is present and authoritative, so dropping
 * the leftover loses nothing — it is the outcome the serverId sync was trying
 * to reach when it called `setTargetServerId`.
 *
 * Two SERVER-backed rows are never collapsed by label. `POST /api/targets` is
 * idempotent only within one parent, so a clinic may legitimately carry the same
 * wording under two different skill areas, and hiding one of those would be data
 * loss rather than a fix.
 */
export function dedupeTargetRows<T extends LabelledRow>(rows: readonly T[] | undefined | null): T[] {
  const byIdentity = dedupeStoreRows(rows);
  const labelKey = (row: T) => `${row.clientId ?? ""}::${normalizeLabel(row.title)}`;
  const syncedLabels = new Set(byIdentity.filter((row) => row.serverId).map(labelKey));
  return byIdentity.filter((row) => {
    if (row.serverId) return true;
    if (!normalizeLabel(row.title)) return true;
    return !syncedLabels.has(labelKey(row));
  });
}
