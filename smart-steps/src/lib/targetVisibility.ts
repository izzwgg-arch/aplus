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
