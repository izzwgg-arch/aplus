/**
 * SmartSteps ABA Tracker — Permission Catalog (Phase 1)
 *
 * Single source of truth for every permission key plus the default grants for
 * every seeded system AppRole. Scope (assigned vs. all clients) is encoded
 * directly in the permission key itself (e.g. `smartsteps.clients.view.assigned`
 * vs `smartsteps.clients.view.all`) rather than as a separate flag, per the
 * approved plan.
 *
 * `LEGACY_ROLE_KEY_MAP` bridges the existing `Role` enum (RBT/BCBA/ADMIN) to
 * the new AppRole used for the backfill:
 *  - ADMIN -> Admin: unchanged, full access.
 *  - BCBA  -> BCBA:  effectively unchanged (BCBA already has near-unrestricted
 *    access to all clients today; the new grants keep that).
 *  - RBT   -> RBT:   this project intentionally introduces real
 *    ClientAssignment-based scoping for RBTs (previously RBTs could read/write
 *    ANY client via the API despite the UI only showing assigned ones) — this
 *    is the approved Phase 1 security fix, not an accidental regression.
 */

export const CATEGORY = {
  DASHBOARD: "dashboard",
  CLIENTS: "clients",
  GOALS: "goals",
  TARGETS: "targets",
  SESSIONS: "sessions",
  TRIALS: "trials",
  NOTES: "notes",
  BEHAVIOR_PLAN: "behavior_plan",
  ASSESSMENTS: "assessments",
  ASSESSMENT_TEMPLATES: "assessment_templates",
  REPORTS: "reports",
  REPORT_TEMPLATES: "report_templates",
  GOAL_LIBRARY: "goal_library",
  PARENT_GOAL_LIBRARY: "parent_goal_library",
  TARGET_LIBRARY: "target_library",
  STAFF: "staff",
  ASSIGNMENTS: "assignments",
  ORG_SETTINGS: "organization_settings",
  PERMISSIONS: "permissions",
  PARENT_PORTAL: "parent_portal",
  INSIGHTS: "insights",
  PROGRAMS: "programs",
  SYNC: "sync",
  AUDIT: "audit"
} as const;

const RAW_PERMISSIONS: Array<[string, string, string]> = [
  ["smartsteps.dashboard.view", CATEGORY.DASHBOARD, "View dashboard"],

  ["smartsteps.clients.view.assigned", CATEGORY.CLIENTS, "View assigned clients"],
  ["smartsteps.clients.view.all", CATEGORY.CLIENTS, "View all clients"],
  ["smartsteps.clients.create", CATEGORY.CLIENTS, "Create clients"],
  ["smartsteps.clients.edit.assigned", CATEGORY.CLIENTS, "Edit assigned clients"],
  ["smartsteps.clients.edit.all", CATEGORY.CLIENTS, "Edit any client"],
  ["smartsteps.clients.archive", CATEGORY.CLIENTS, "Archive clients"],
  ["smartsteps.clients.delete", CATEGORY.CLIENTS, "Delete clients"],

  ["smartsteps.goals.view.assigned", CATEGORY.GOALS, "View goals (assigned clients)"],
  ["smartsteps.goals.view.all", CATEGORY.GOALS, "View goals (all clients)"],
  ["smartsteps.goals.create", CATEGORY.GOALS, "Create goals"],
  ["smartsteps.goals.edit", CATEGORY.GOALS, "Edit goals"],
  ["smartsteps.goals.delete", CATEGORY.GOALS, "Delete goals"],

  ["smartsteps.targets.view.assigned", CATEGORY.TARGETS, "View targets (assigned clients)"],
  ["smartsteps.targets.view.all", CATEGORY.TARGETS, "View targets (all clients)"],
  ["smartsteps.targets.create", CATEGORY.TARGETS, "Create targets"],
  ["smartsteps.targets.edit", CATEGORY.TARGETS, "Edit targets"],
  ["smartsteps.targets.delete", CATEGORY.TARGETS, "Delete targets"],

  ["smartsteps.sessions.view.assigned", CATEGORY.SESSIONS, "View sessions (assigned clients)"],
  ["smartsteps.sessions.view.all", CATEGORY.SESSIONS, "View sessions (all clients)"],
  ["smartsteps.sessions.create", CATEGORY.SESSIONS, "Create sessions"],
  ["smartsteps.sessions.edit", CATEGORY.SESSIONS, "Edit sessions"],
  ["smartsteps.sessions.delete", CATEGORY.SESSIONS, "Delete sessions"],

  ["smartsteps.trials.create", CATEGORY.TRIALS, "Log trials"],
  ["smartsteps.trials.edit", CATEGORY.TRIALS, "Edit trials"],
  ["smartsteps.trials.delete", CATEGORY.TRIALS, "Delete trials"],

  ["smartsteps.notes.view.assigned", CATEGORY.NOTES, "View notes (assigned clients)"],
  ["smartsteps.notes.view.all", CATEGORY.NOTES, "View notes (all clients)"],
  ["smartsteps.notes.create", CATEGORY.NOTES, "Create notes"],
  ["smartsteps.notes.edit", CATEGORY.NOTES, "Edit notes"],
  ["smartsteps.notes.delete", CATEGORY.NOTES, "Delete notes"],

  ["smartsteps.behavior_plan.view.assigned", CATEGORY.BEHAVIOR_PLAN, "View behavior plan (assigned clients)"],
  ["smartsteps.behavior_plan.view.all", CATEGORY.BEHAVIOR_PLAN, "View behavior plan (all clients)"],
  ["smartsteps.behavior_plan.edit", CATEGORY.BEHAVIOR_PLAN, "Edit behavior plan"],

  ["smartsteps.assessments.view.assigned", CATEGORY.ASSESSMENTS, "View assessments (assigned clients)"],
  ["smartsteps.assessments.view.all", CATEGORY.ASSESSMENTS, "View assessments (all clients)"],
  ["smartsteps.assessments.create", CATEGORY.ASSESSMENTS, "Create assessments"],
  ["smartsteps.assessments.edit", CATEGORY.ASSESSMENTS, "Edit assessments"],
  ["smartsteps.assessments.delete", CATEGORY.ASSESSMENTS, "Delete assessments"],

  ["smartsteps.assessment_templates.view", CATEGORY.ASSESSMENT_TEMPLATES, "View assessment templates"],
  ["smartsteps.assessment_templates.manage", CATEGORY.ASSESSMENT_TEMPLATES, "Create/edit/delete assessment templates"],

  ["smartsteps.reports.view.assigned", CATEGORY.REPORTS, "View reports (assigned clients)"],
  ["smartsteps.reports.view.all", CATEGORY.REPORTS, "View reports (all clients)"],
  ["smartsteps.reports.create", CATEGORY.REPORTS, "Create reports"],
  ["smartsteps.reports.edit", CATEGORY.REPORTS, "Edit reports"],
  ["smartsteps.reports.delete", CATEGORY.REPORTS, "Delete reports"],
  ["smartsteps.reports.export", CATEGORY.REPORTS, "Export/print reports"],

  ["smartsteps.report_templates.view", CATEGORY.REPORT_TEMPLATES, "View report templates"],
  ["smartsteps.report_templates.manage", CATEGORY.REPORT_TEMPLATES, "Create/edit/delete report templates"],

  ["smartsteps.goal_library.view", CATEGORY.GOAL_LIBRARY, "View goal library"],
  ["smartsteps.goal_library.manage", CATEGORY.GOAL_LIBRARY, "Manage goal library"],

  ["smartsteps.parent_goal_library.view", CATEGORY.PARENT_GOAL_LIBRARY, "View parent goal library"],
  ["smartsteps.parent_goal_library.manage", CATEGORY.PARENT_GOAL_LIBRARY, "Manage parent goal library"],

  ["smartsteps.target_library.view", CATEGORY.TARGET_LIBRARY, "View target library"],
  ["smartsteps.target_library.manage", CATEGORY.TARGET_LIBRARY, "Manage target library"],

  ["smartsteps.staff.view", CATEGORY.STAFF, "View staff directory"],
  ["smartsteps.staff.create", CATEGORY.STAFF, "Invite/create staff"],
  ["smartsteps.staff.edit", CATEGORY.STAFF, "Edit staff"],
  ["smartsteps.staff.deactivate", CATEGORY.STAFF, "Deactivate staff"],
  ["smartsteps.staff.manage_roles", CATEGORY.STAFF, "Change a staff member's role"],

  ["smartsteps.assignments.view", CATEGORY.ASSIGNMENTS, "View client assignments"],
  ["smartsteps.assignments.manage", CATEGORY.ASSIGNMENTS, "Assign/unassign staff to clients"],

  ["smartsteps.organization_settings.view", CATEGORY.ORG_SETTINGS, "View organization settings"],
  ["smartsteps.organization_settings.edit", CATEGORY.ORG_SETTINGS, "Edit organization settings"],

  ["smartsteps.permissions.manage", CATEGORY.PERMISSIONS, "Manage roles & permissions"],

  ["smartsteps.parent_portal.manage", CATEGORY.PARENT_PORTAL, "Generate parent portal access tokens"],

  ["smartsteps.insights.view", CATEGORY.INSIGHTS, "View insights/analytics"],

  ["smartsteps.programs.view.assigned", CATEGORY.PROGRAMS, "View programs (assigned clients)"],
  ["smartsteps.programs.view.all", CATEGORY.PROGRAMS, "View programs (all clients)"],
  ["smartsteps.programs.create", CATEGORY.PROGRAMS, "Create programs"],
  ["smartsteps.programs.edit", CATEGORY.PROGRAMS, "Edit programs"],
  ["smartsteps.programs.delete", CATEGORY.PROGRAMS, "Delete programs"],

  ["smartsteps.sync.use", CATEGORY.SYNC, "Use offline/mobile sync"],

  ["smartsteps.audit_logs.view", CATEGORY.AUDIT, "View audit log"]
];

export const PERMISSIONS = RAW_PERMISSIONS.map(([key, category, label]) => ({ key, category, label }));
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

function keysExcept(excluded: string[]): string[] {
  const excludedSet = new Set(excluded);
  return PERMISSION_KEYS.filter((k) => !excludedSet.has(k));
}

/**
 * RBT — stricter model (locked in after final pre-deploy review). RBT gets:
 * assigned clients, read-only goals/parent-goals for assigned clients, data
 * entry (trials/sessions) and session notes for assigned clients. RBT has
 * ZERO access to assessments, assessment results, reports/report viewer/
 * export, and organization settings — not even for their assigned clients.
 * (Previously included `assessments.view.assigned` / `reports.view.assigned`
 * / `organization_settings.view` — intentionally removed; see
 * docs/ai-context/PERMISSIONS.md for the rationale and rollback note.)
 */
const RBT_PERMISSIONS = [
  "smartsteps.dashboard.view",
  "smartsteps.clients.view.assigned",
  "smartsteps.goals.view.assigned",
  "smartsteps.targets.view.assigned",
  "smartsteps.sessions.view.assigned", "smartsteps.sessions.create", "smartsteps.sessions.edit",
  "smartsteps.trials.create", "smartsteps.trials.edit",
  "smartsteps.notes.view.assigned", "smartsteps.notes.create", "smartsteps.notes.edit",
  "smartsteps.behavior_plan.view.assigned",
  "smartsteps.goal_library.view",
  "smartsteps.parent_goal_library.view",
  "smartsteps.target_library.view", "smartsteps.target_library.manage",
  "smartsteps.programs.view.assigned",
  "smartsteps.insights.view",
  "smartsteps.sync.use"
];

const BCBA_PERMISSIONS = [
  ...RBT_PERMISSIONS.filter((k) => !k.endsWith(".assigned")),
  "smartsteps.clients.view.all", "smartsteps.clients.create", "smartsteps.clients.edit.all", "smartsteps.clients.archive",
  "smartsteps.goals.view.all", "smartsteps.goals.create", "smartsteps.goals.edit", "smartsteps.goals.delete",
  "smartsteps.targets.view.all", "smartsteps.targets.create", "smartsteps.targets.edit", "smartsteps.targets.delete",
  "smartsteps.sessions.view.all", "smartsteps.sessions.delete",
  "smartsteps.trials.delete",
  "smartsteps.notes.view.all", "smartsteps.notes.delete",
  "smartsteps.behavior_plan.view.all", "smartsteps.behavior_plan.edit",
  "smartsteps.assessments.view.all", "smartsteps.assessments.create", "smartsteps.assessments.edit", "smartsteps.assessments.delete",
  "smartsteps.assessment_templates.view", "smartsteps.assessment_templates.manage",
  "smartsteps.reports.view.all", "smartsteps.reports.create", "smartsteps.reports.edit", "smartsteps.reports.delete", "smartsteps.reports.export",
  "smartsteps.report_templates.view", "smartsteps.report_templates.manage",
  "smartsteps.goal_library.manage",
  "smartsteps.parent_goal_library.manage",
  "smartsteps.programs.view.all", "smartsteps.programs.create", "smartsteps.programs.edit", "smartsteps.programs.delete",
  "smartsteps.assignments.view", "smartsteps.assignments.manage",
  "smartsteps.parent_portal.manage",
  "smartsteps.staff.view",
  // No longer inherited via the RBT_PERMISSIONS filter above now that RBT has
  // zero organization_settings access — BCBA needs both explicitly.
  "smartsteps.organization_settings.view", "smartsteps.organization_settings.edit"
];

const ADMIN_PERMISSIONS = PERMISSION_KEYS; // everything

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  legacy: boolean;
  permissions: string[];
}

export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    key: "RBT",
    name: "RBT",
    description: "Registered Behavior Technician — assigned clients only.",
    legacy: true,
    permissions: RBT_PERMISSIONS
  },
  {
    key: "BCBA",
    name: "BCBA",
    description: "Board Certified Behavior Analyst — full clinical access.",
    legacy: true,
    permissions: BCBA_PERMISSIONS
  },
  {
    key: "ADMIN",
    name: "Admin",
    description: "Full system access including staff, org settings, and permissions.",
    legacy: true,
    permissions: ADMIN_PERMISSIONS
  },
  {
    key: "SUPERVISOR",
    name: "Supervisor",
    description: "BCBA-level access plus staff visibility, without org-level admin.",
    legacy: false,
    permissions: [...new Set([...BCBA_PERMISSIONS, "smartsteps.assignments.manage"])]
  },
  {
    key: "PARENT_VIEWER",
    name: "Parent Viewer",
    description: "Read-only visibility into a single client (used by the parent portal path, not for staff logins).",
    legacy: false,
    permissions: [
      "smartsteps.clients.view.assigned",
      "smartsteps.goals.view.assigned",
      "smartsteps.targets.view.assigned",
      "smartsteps.reports.view.assigned"
    ]
  },
  {
    key: "READ_ONLY",
    name: "Read Only",
    description: "View-only access across the system.",
    legacy: false,
    permissions: PERMISSION_KEYS.filter((k) => k.includes(".view"))
  }
];

/** Maps legacy `Role` enum values to the system AppRole `key` used for backfill. */
export const LEGACY_ROLE_KEY_MAP: Record<string, string> = {
  RBT: "RBT",
  BCBA: "BCBA",
  ADMIN: "ADMIN"
};

/** Permission keys that have an `.assigned` / `.all` scope pair. Used by canForClient. */
export function scopedKeyPair(baseKey: string): { assigned: string; all: string } {
  return { assigned: `${baseKey}.assigned`, all: `${baseKey}.all` };
}
