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
