import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/auditLogger";

type QueueItem = {
  id?: number;
  table: "trials" | "sessions" | "behaviors";
  payload: Record<string, unknown>;
  createdAt: string;
};

const NUMERIC_PROMPT_MAP: Record<string, "FULL_PHYSICAL" | "PARTIAL_PHYSICAL" | "GESTURAL" | "VERBAL" | "MODEL" | "INDEPENDENT"> = {
  "0": "INDEPENDENT",
  "1": "VERBAL",
  "2": "GESTURAL",
  "3": "MODEL",
  "4": "PARTIAL_PHYSICAL",
  "5": "FULL_PHYSICAL",
};

function normalizePromptLevel(value: unknown) {
  if (value == null || value === "") return null;
  const asString = String(value);
  return NUMERIC_PROMPT_MAP[asString] ?? (asString as "FULL_PHYSICAL" | "PARTIAL_PHYSICAL" | "GESTURAL" | "VERBAL" | "MODEL" | "INDEPENDENT");
}

// Offline sync engine: timestamp-based last-write-wins conflict resolution
export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermissionResponse(user.id, "smartsteps.sync.use");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { queue } = body as { queue?: QueueItem[] };
    if (!Array.isArray(queue) || queue.length === 0) {
      return NextResponse.json({ synced: 0, processedIds: [], conflictIds: [], errors: [] });
    }

    const synced: string[] = [];
    // These three ID lists are keyed on the ORIGINAL client-side Dexie
    // syncQueue item `id` so the client can tell exactly which of the items
    // it sent may be safely marked synced, vs which must stay pending and be
    // retried. This is load-bearing for data integrity: previously the
    // client marked the ENTIRE batch as synced based only on the HTTP status
    // of this endpoint, ignoring which individual items actually succeeded —
    // any item whose insert threw (e.g. FK violation from a not-yet-resolved
    // local target/session id) was reported in `errors` but still marked
    // synced client-side, silently and permanently losing that trial/session/
    // behavior event. Never remove per-item id tracking here.
    const processedIds: number[] = []; // safe to mark synced (created or already existed as a legit conflict)
    const conflictIds: number[] = [];
    const errors: { id?: number; table: string; error: string }[] = [];
    // Maps a client-generated local session id (e.g. "session-171...-4") to
    // the real Prisma session id, whenever a queued "sessions" item is
    // created/resolved in this request. The client uses this to rewrite any
    // still-pending trial/behavior queue items that were stamped with that
    // local id (because the session failed to create synchronously when the
    // session was started) — without this, those trials/behaviors would
    // reference a session id that will NEVER exist server-side and would
    // fail to sync forever.
    const sessionIdMap: Record<string, string> = {};

    for (const item of queue) {
      try {
        if (item.table === "trials") {
          const p = item.payload;
          // LWW: if a trial with same id exists and is newer, skip
          const existing = p.id
            ? await prisma.trial.findUnique({ where: { id: p.id as string } }).catch(() => null)
            : null;

          if (existing) {
            // Conflict: server record exists — keep server version (LWW).
            // Safe to mark synced: the data already exists server-side.
            if (item.id != null) { processedIds.push(item.id); conflictIds.push(item.id); }
          } else {
            await prisma.trial.create({
              data: {
                sessionId: p.sessionId as string,
                targetId: p.targetId as string,
                result: p.result as "CORRECT" | "INCORRECT" | "PROMPTED" | "NR" | "SKIP",
                promptLevel: normalizePromptLevel(p.promptLevel),
                latencyMs: (p.latencyMs as number | undefined) ?? null,
              },
            });
            synced.push(`trial:${p.targetId}`);
            if (item.id != null) processedIds.push(item.id);
          }
        } else if (item.table === "sessions") {
          const p = item.payload;
          const existing = p.serverId
            ? await prisma.session.findUnique({ where: { id: p.serverId as string } }).catch(() => null)
            : null;
          let resolvedId: string | null = existing?.id ?? null;
          if (!existing) {
            const created = await prisma.session.create({
              data: {
                clientId: p.clientId as string,
                userId: user.id,
                startedAt: new Date(p.startedAt as string),
                mode: (p.mode as string | undefined) || "DTT",
              },
            });
            synced.push(`session:${created.id}`);
            resolvedId = created.id;
          }
          if (item.id != null) processedIds.push(item.id);
          if (resolvedId && typeof p.localId === "string") {
            sessionIdMap[p.localId] = resolvedId;
          }
        } else if (item.table === "behaviors") {
          const p = item.payload;
          await prisma.behaviorEvent.create({
            data: {
              sessionId: p.sessionId as string,
              type: p.type as string,
              value: (p.value as number | undefined) ?? null,
              antecedent: (p.antecedent as string | undefined) ?? null,
              behavior: (p.behavior as string | undefined) ?? null,
              consequence: (p.consequence as string | undefined) ?? null,
              intensity: (p.intensity as string | undefined) ?? null,
            },
          });
          synced.push(`behavior:${p.type}`);
          if (item.id != null) processedIds.push(item.id);
        }
      } catch (e) {
        // Do NOT add to processedIds — this item must remain pending so the
        // client retries it instead of losing it.
        errors.push({ id: item.id, table: item.table, error: String(e) });
      }
    }

    await auditLog(user.id, "LOG_TRIAL", "SyncQueue", null, {
      synced: synced.length,
      conflicts: conflictIds.length,
      errors: errors.length,
    });

    return NextResponse.json({ synced: synced.length, processedIds, conflictIds, errors, sessionIdMap });
  } catch (e) {
    // Whole-request failure (e.g. malformed body) — report zero items
    // processed so the client retries everything rather than assuming loss.
    return NextResponse.json({ synced: 0, processedIds: [], conflictIds: [], errors: [{ error: String(e), table: "*" }], sessionIdMap: {} });
  }
}
