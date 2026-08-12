/**
 * Single source of truth for mapping an A+ Center Scheduling JWT role
 * (ADMIN | BCBA | STAFF) to a SmartSteps `Role` enum value (ADMIN | BCBA | RBT).
 *
 * Previously both `src/auth.ts` and `src/app/api/sso/route.ts` did
 * `role: payload.role || "RBT"`, which only substitutes when `role` is
 * falsy — a literal `"STAFF"` (a real, non-falsy A+ role) passed straight
 * through unmapped, producing a session with `role === "STAFF"`, a value
 * that doesn't exist in SmartSteps' `Role` enum and silently fails any
 * `=== "RBT"` / `=== "BCBA"` / `=== "ADMIN"` gate. Both call sites now use
 * this function instead.
 */

export type SmartStepsRole = "ADMIN" | "BCBA" | "RBT";

const APLUS_TO_SMARTSTEPS_ROLE: Record<string, SmartStepsRole> = {
  ADMIN: "ADMIN",
  BCBA: "BCBA",
  STAFF: "RBT"
};

export function mapAplusRoleToSmartStepsRole(aplusRole: string | undefined | null): SmartStepsRole {
  if (!aplusRole) return "RBT";
  return APLUS_TO_SMARTSTEPS_ROLE[aplusRole] ?? "RBT";
}
