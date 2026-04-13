// Offline-first: Dexie mirrors Prisma for queue sync
import Dexie, { type Table } from "dexie";

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

/** Process the sync queue — call when online */
export async function flushSyncQueue(): Promise<{
  synced: number;
  conflicts: number;
  errors: number;
}> {
  const pending = await db.syncQueue.where("synced").equals(0).toArray();
  if (pending.length === 0) return { synced: 0, conflicts: 0, errors: 0 };

  try {
    const res = await fetch("/smart-steps/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue: pending }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json() as { synced: number; conflicts: unknown[]; errors: unknown[] };

    // Mark processed items as synced
    const ids = pending.map((p) => p.id!).filter(Boolean);
    await db.syncQueue.where("id").anyOf(ids).modify({ synced: true });

    return {
      synced: result.synced,
      conflicts: result.conflicts?.length ?? 0,
      errors: result.errors?.length ?? 0,
    };
  } catch (e) {
    // Increment retry count
    for (const item of pending) {
      if (item.id) {
        await db.syncQueue.update(item.id, {
          retries: (item.retries ?? 0) + 1,
          lastError: String(e),
        });
      }
    }
    return { synced: 0, conflicts: 0, errors: pending.length };
  }
}

/** Count unsynced items */
export async function getPendingCount(): Promise<number> {
  return db.syncQueue.where("synced").equals(0).count();
}
