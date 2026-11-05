/**
 * Which target phases an "assigned-only" viewer (BT/RBT, Parent Viewer — any
 * user without the `.all` scope) is allowed to see.
 *
 * History: these viewers were originally restricted to `phase === "ACQUISITION"`
 * on the theory that a BT should only see goals "In Treatment". In practice that
 * hid essentially everything, because:
 *
 *  - every target is created with `phase: "NEW"` (see `POST /api/targets` and
 *    the goals page target form) and nothing bulk-promotes them; and
 *  - the promotion NEW -> ACQUISITION happens when a BT collects the first
 *    trial on the target (`TargetDetailPanel`), which they can only do if the
 *    target is visible to them in the first place.
 *
 * So an ACQUISITION-only gate is a deadlock: the BT can never see the goal, so
 * it never leaves NEW, so the BT never sees it. Assigned-only viewers now see
 * every active phase EXCEPT `MASTERED`, which keeps finished goals out of the
 * data-entry lists while leaving all live clinical work visible.
 */
export const RESTRICTED_VISIBLE_PHASES = [
  "NEW",
  "BASELINE",
  "ACQUISITION",
  "MAINTENANCE",
  "GENERALIZATION",
] as const;

export function isPhaseVisibleToRestrictedViewer(phase: string): boolean {
  return (RESTRICTED_VISIBLE_PHASES as readonly string[]).includes(phase);
}

/**
 * Prisma `where` fragment for `Target.phase`. Spread into a target query:
 *   where: { isActive: true, ...restrictedPhaseWhere(restricted) }
 * Returns `{}` for unrestricted viewers (BCBA/Admin) so they see every phase.
 */
export function restrictedPhaseWhere(restricted: boolean) {
  return restricted ? { phase: { in: [...RESTRICTED_VISIBLE_PHASES] } } : {};
}

/** The phase a goal reaches when it is finished. */
export const MASTERED_PHASE = "MASTERED";

export function isMasteredPhase(phase?: string | null): boolean {
  return phase === MASTERED_PHASE;
}

/**
 * True when a goal may be offered in a SESSION DATA-ENTRY list (the DTT goal
 * cards, the new-session target picker, the Session Snapshot "add goal"
 * picker).
 *
 * Excludes NEW goals (not started yet) and MASTERED goals (finished clinical
 * work). Allows BASELINE, ACQUISITION, MAINTENANCE, GENERALIZATION — all
 * active phases where trials can be collected.
 *
 * The local store's `status` is checked as well: a locally-created goal that
 * has not been re-hydrated from the server can carry `status: "mastered"` with
 * a stale phase.
 */
export function isOpenForDataEntry(target: {
  phase?: string | null;
  status?: string | null;
}): boolean {
  return !isMasteredPhase(target.phase) && target.phase !== "NEW" && target.status !== "mastered";
}

/**
 * Prisma `where` fragment for `Target.phase` on the session-picker endpoint.
 * Restricted viewers keep their phase allow-list (which already excludes
 * MASTERED); an unrestricted viewer asking for data-entry goals gets
 * everything except MASTERED.
 */
export function targetPhaseWhere(opts: { restricted: boolean; excludeMastered?: boolean }) {
  if (opts.restricted) return restrictedPhaseWhere(true);
  if (opts.excludeMastered) return { phase: { not: MASTERED_PHASE } };
  return {};
}
