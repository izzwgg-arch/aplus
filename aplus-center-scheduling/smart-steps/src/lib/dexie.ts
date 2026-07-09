// Offline-first: Dexie mirrors Prisma for queue sync
import Dexie, { type Table } from "dexie";
import { useABAStore } from "@/store/abaStore";

export interface OfflineTrial {
  id?: number;
  sessionId: string;
  targetId: string;
  result: string;
  promptLevel?: string;
  latencyMs?: number;
  createdAt: string;
  synced: boolean;
  serverId?: string;
  retries?: number;
}

export interface OfflineSession {
  id?: number;
  clientId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  notes?: string;
  synced: boolean;
  serverId?: string;
}

export interface OfflineBehavior {
  id?: number;
  sessionId: string;
  type: string;
  value?: number;
  antecedent?: string;
  behavior?: string;
  consequence?: string;
  intensity?: string;
  createdAt: string;
  synced: boolean;
}

export interface SyncQueueItem {
  id?: number;
  table: "trials" | "sessions" | "behaviors";
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
  lastError?: string;
  synced: boolean;
}

export class SmartStepsDB extends Dexie {
  trials!: Table<OfflineTrial, number>;
  sessions!: Table<OfflineSession, number>;
  behaviors!: Table<OfflineBehavior, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("SmartStepsABA");
    this.version(2).stores({
      trials: "++id, sessionId, targetId, createdAt, synced",
      sessions: "++id, clientId, startedAt, synced",
      behaviors: "++id, sessionId, createdAt, synced",
      syncQueue: "++id, table, createdAt, synced, retries",
    });
  }
}

export const db = new SmartStepsDB();

/** Queue an offline-created session for later creation on the server.
 *
 * Data-loss fix: previously, when the initial `POST /api/sessions` call
 * failed (offline at session start) the UI fell back to using a local
 * placeholder session id ("session-<ts>-<n>") for the rest of the session,
 * but NOTHING ever queued that session itself to be created server-side.
 * Any trials/behaviors later queued against that placeholder id could
 * retry forever but would NEVER succeed, because the parent session they
 * reference would never exist in Postgres — under the old "mark everything
 * synced on HTTP 200" logic this meant those trials were silently discarded
 * for good. Call this whenever a session falls back to local-only so
 * `flushSyncQueue` can create it and re-point any dependent queue items at
 * the real server id once it's assigned. */
export async function queueSession(payload: {
  localId: string;
  clientId: string;
  startedAt: string;
  mode?: string;
}) {
  await db.syncQueue.add({
    table: "sessions",
    payload: { ...payload },
    createdAt: new Date().toISOString(),
    retries: 0,
    synced: false,
  });
}

/** Add a trial to the offline queue */
export async function queueTrial(payload: Omit<OfflineTrial, "id" | "synced">) {
  await db.trials.add({ ...payload, synced: false });
  await db.syncQueue.add({
    table: "trials",
    payload: { ...payload },
    createdAt: new Date().toISOString(),
    retries: 0,
    synced: false,
  });
}

/** Add a behavior event to the offline queue */
export async function queueBehavior(payload: Omit<OfflineBehavior, "id" | "synced">) {
  await db.behaviors.add({ ...payload, synced: false });
  await db.syncQueue.add({
    table: "behaviors",
    payload: { ...payload },
    createdAt: new Date().toISOString(),
    retries: 0,
    synced: false,
  });
}

/** After this many failed attempts, an item is considered "stuck" and is
 * surfaced to the user instead of retried silently forever. It is NEVER
 * auto-marked synced or deleted — data is only ever removed from the queue
 * once the server explicitly confirms it was processed. */
const MAX_SYNC_RETRIES = 20;

/** Process the sync queue — call when online.
 *
 * IMPORTANT — data-loss fix: this used to mark every item in `pending` as
 * `synced: true` as soon as the HTTP request came back `ok`, regardless of
 * whether the server actually persisted each individual item (the server
 * reports per-item failures in `errors[]`, e.g. an FK violation when a
 * trial's targetId was still an unresolved local placeholder id). That made
 * failed items disappear from the pending queue without ever reaching
 * Postgres — a silent, permanent data loss. This version only marks an item
 * synced when the server explicitly confirms it via `processedIds`; anything
 * else is left pending and retried, with retry/lastError tracked so
 * persistent failures are visible via `getStuckCount()` rather than silently
 * dropped. */
type SyncApiResponse = {
  synced: number;
  processedIds?: number[];
  conflictIds?: number[];
  errors?: { id?: number; table: string; error: string }[];
  sessionIdMap?: Record<string, string>;
};

async function bumpRetry(item: SyncQueueItem, lastError: string): Promise<number> {
  if (!item.id) return 0;
  const nextRetries = (item.retries ?? 0) + 1;
  await db.syncQueue.update(item.id, { retries: nextRetries, lastError });
  return nextRetries >= MAX_SYNC_RETRIES ? 1 : 0;
}

async function postToSyncApi(queue: SyncQueueItem[]): Promise<SyncApiResponse> {
  const res = await fetch("/smart-steps/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queue }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function flushSyncQueue(): Promise<{
  synced: number;
  conflicts: number;
  errors: number;
  stuck: number;
}> {
  const allPending = await db.syncQueue.where("synced").equals(0).toArray();
  if (allPending.length === 0) return { synced: 0, conflicts: 0, errors: 0, stuck: 0 };

  let totalSynced = 0;
  let totalErrors = 0;
  let totalStuck = 0;

  // ── Phase 1: sessions ────────────────────────────────────────────────
  // Runs first and in its own request so that any offline-created session
  // gets a real server id *before* we look at trials/behaviors below. Those
  // items may still be pointing at that session's local placeholder id (set
  // when the session's own creation call failed at session-start) — without
  // resolving the session first, they would be sent with a sessionId that
  // can never exist server-side and would fail forever. See queueSession().
  const sessionItems = allPending.filter((i) => i.table === "sessions");
  if (sessionItems.length > 0) {
    try {
      const result = await postToSyncApi(sessionItems);
      const processedIds = new Set(result.processedIds ?? []);
      const idsToMarkSynced = sessionItems.map((p) => p.id!).filter((id) => id && processedIds.has(id));
      if (idsToMarkSynced.length > 0) {
        await db.syncQueue.where("id").anyOf(idsToMarkSynced).modify({ synced: true });
      }
      totalSynced += idsToMarkSynced.length;

      for (const [localSessionId, serverSessionId] of Object.entries(result.sessionIdMap ?? {})) {
        useABAStore.getState().setSessionServerId(localSessionId, serverSessionId);
        // Re-point any other still-pending queue items (trials/behaviors)
        // that were stamped with this local session id, so they stop
        // targeting a dead-end placeholder and can sync in phase 2 below.
        const dependents = await db.syncQueue
          .where("synced").equals(0)
          .filter((qi) => qi.table !== "sessions" && qi.payload.sessionId === localSessionId)
          .toArray();
        for (const dep of dependents) {
          if (dep.id != null) {
            await db.syncQueue.update(dep.id, { payload: { ...dep.payload, sessionId: serverSessionId } });
          }
        }
      }

      for (const item of sessionItems) {
        if (!item.id || processedIds.has(item.id)) continue;
        const errEntry = (result.errors ?? []).find((e) => e.id === item.id);
        totalStuck += await bumpRetry(item, errEntry?.error ?? "Server did not confirm this session was saved");
        totalErrors++;
      }
    } catch (e) {
      for (const item of sessionItems) {
        totalStuck += await bumpRetry(item, String(e));
      }
      totalErrors += sessionItems.length;
    }
  }

  // ── Phase 2: trials & behaviors ──────────────────────────────────────
  // Re-read from Dexie (not the original `allPending` array) since phase 1
  // may have just rewritten some of these items' `sessionId` in place.
  const pending = (await db.syncQueue.where("synced").equals(0).toArray())
    .filter((i) => i.table !== "sessions");
  if (pending.length === 0) {
    return { synced: totalSynced, conflicts: 0, errors: totalErrors, stuck: totalStuck };
  }

  // Resolve any still-local target ids against the current store state
  // before sending. An item that can't yet be resolved is skipped this
  // round (left pending, not sent) instead of being sent to a guaranteed
  // FK-violation failure on the server.
  const { targets } = useABAStore.getState();
  const sendable: SyncQueueItem[] = [];
  for (const item of pending) {
    if (item.table === "trials" && typeof item.payload.targetId === "string" && item.payload.targetId.startsWith("local-")) {
      const resolvedServerId = targets.find((t) => t.id === item.payload.targetId)?.serverId;
      if (!resolvedServerId) continue; // still unresolved — try again next flush
      item.payload = { ...item.payload, targetId: resolvedServerId };
    }
    sendable.push(item);
  }
  if (sendable.length === 0) {
    return { synced: totalSynced, conflicts: 0, errors: totalErrors, stuck: totalStuck };
  }

  try {
    const result = await postToSyncApi(sendable);

    const processedIds = new Set(result.processedIds ?? []);
    const idsToMarkSynced = sendable.map((p) => p.id!).filter((id) => id && processedIds.has(id));
    if (idsToMarkSynced.length > 0) {
      await db.syncQueue.where("id").anyOf(idsToMarkSynced).modify({ synced: true });
    }

    let stuck = 0;
    for (const item of sendable) {
      if (!item.id || processedIds.has(item.id)) continue;
      const errEntry = (result.errors ?? []).find((e) => e.id === item.id);
      stuck += await bumpRetry(item, errEntry?.error ?? "Server did not confirm this item was saved");
    }

    return {
      synced: totalSynced + idsToMarkSynced.length,
      conflicts: result.conflictIds?.length ?? 0,
      errors: totalErrors + (result.errors ?? []).length,
      stuck: totalStuck + stuck,
    };
  } catch (e) {
    let stuck = 0;
    for (const item of sendable) {
      stuck += await bumpRetry(item, String(e));
    }
    return { synced: totalSynced, conflicts: 0, errors: totalErrors + sendable.length, stuck: totalStuck + stuck };
  }
}

/** Count unsynced items */
export async function getPendingCount(): Promise<number> {
  return db.syncQueue.where("synced").equals(0).count();
}

/** Raw dump of every local record this browser profile still holds, used by
 * the data-recovery tool (/data-recovery). Deliberately reads `db.trials`
 * and `db.behaviors` regardless of their `synced` flag: those two tables
 * are only ever inserted into by queueTrial()/queueBehavior() and NOTHING
 * in this codebase ever deletes from them — so even a trial that was
 * incorrectly marked `synced` by the old flushSyncQueue() bug (and
 * therefore never actually reached Postgres) should still be sitting here
 * on the original device, unless the browser's site data was cleared. */
export async function getRecoverySnapshot() {
  const [trials, behaviors, syncQueue] = await Promise.all([
    db.trials.toArray(),
    db.behaviors.toArray(),
    db.syncQueue.toArray(),
  ]);
  return { trials, behaviors, syncQueue };
}

/** Count items that have failed to sync MAX_SYNC_RETRIES times in a row.
 * These are never auto-discarded, but need a human to look at them
 * (e.g. a permanently-missing referenced session/target). */
export async function getStuckCount(): Promise<number> {
  const pending = await db.syncQueue.where("synced").equals(0).toArray();
  return pending.filter((i) => (i.retries ?? 0) >= MAX_SYNC_RETRIES).length;
}
