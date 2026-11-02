import { prisma } from "@/lib/db";

/**
 * A goal that has collected trial data is "In Treatment" (phase ACQUISITION).
 *
 * Call this after persisting trials. It promotes any of the given targets that
 * are still NEW to ACQUISITION, server-side, so the promotion can never be
 * lost to a failed/permission-refused client PATCH (the old mechanism was a
 * fire-and-forget PATCH from the browser, which a BT without targets.edit
 * could not perform).
 *
 * Only NEW is promoted: BASELINE / MAINTENANCE / GENERALIZATION data
 * collection is a deliberate clinical choice of phase, and MASTERED goals are
 * finished work — none of those must be silently rewritten by data entry.
 *
 * Never throws — the trials are already saved and must not be reported as
 * failed because of the promotion.
 */
export async function promoteNewTargetsWithData(targetIds: string[]): Promise<void> {
  const ids = [...new Set(targetIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    await prisma.target.updateMany({
      where: { id: { in: ids }, phase: "NEW" },
      data: { phase: "ACQUISITION" },
    });
  } catch (e) {
    console.error("promoteNewTargetsWithData failed:", e);
  }
}
