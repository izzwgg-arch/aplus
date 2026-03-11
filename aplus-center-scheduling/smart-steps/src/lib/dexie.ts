// Offline-first: Dexie mirrors Prisma for queue sync
import Dexie, { type Table } from "dexie";

export interface OfflineTrial {
  id?: string;
  sessionId: string;
  targetId: string;
  result: string;
  promptLevel?: string;
  latencyMs?: number;
  createdAt: string;
  synced?: boolean;
  serverId?: string;
}

export interface OfflineSession {
  id?: string;
  clientId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  notes?: string;
  synced?: boolean;
  serverId?: string;
}

export class SmartStepsDB extends Dexie {
  trials!: Table<OfflineTrial, string>;
  sessions!: Table<OfflineSession, string>;
  syncQueue!: Table<{ id?: number; table: string; payload: unknown; createdAt: string }, number>;

  constructor() {
    super("SmartStepsABA");
    this.version(1).stores({
      trials: "++id, sessionId, targetId, createdAt, synced",
      sessions: "++id, clientId, startedAt, synced",
      syncQueue: "++id, table, createdAt",
    });
  }
}

export const db = new SmartStepsDB();
