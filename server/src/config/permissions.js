/**
 * A Plus Center Scheduling — Permission Catalog (Phase 1)
 *
 * Single source of truth for every permission key, plus the default
 * permission grants for every seeded system Role. Route files import
 * `PERMISSIONS` keys (via `requirePermission("aplus.x.y")`) rather than
 * hardcoding string literals, so a typo fails fast at seed time instead of
 * silently granting/denying the wrong thing.
 *
 * IMPORTANT: `LEGACY_ROLE_KEY_MAP` below is the backward-compatibility bridge.
 * Every existing user's legacy `role` enum (ADMIN/BCBA/STAFF) is backfilled to
 * a system Role with the SAME EFFECTIVE ACCESS they have today (see
 * docs/ai-context/PERMISSIONS.md for the audit this was derived from), so
 * deploying this migration changes nothing for existing accounts. The
 * additional named roles (Office Admin, Scheduler, Billing Manager,
 * Receptionist, Provider, Read Only) are opinionated, more-restrictive
 * presets an admin can move people into afterwards — they are NOT what
 * existing accounts get auto-migrated to.
 */

const CATEGORY = {
  DASHBOARD: "dashboard",
  CLIENTS: "clients",
  APPOINTMENTS: "appointments",
  BILLING: "billing",
  PROVIDERS: "providers",
  SERVICES: "services",
  REPORTS: "reports",
  SETTINGS: "settings",
  QUICKBOOKS: "quickbooks",
  INTEGRATIONS: "integrations",
  COMMUNICATIONS: "communications",
  USERS: "users",
  AUDIT: "audit",
  WAITLIST: "waitlist",
  DATA_TRACKING: "data_tracking",
  INTAKE: "intake",
  CLIENT_FILES: "client_files",
  ASSESSMENTS: "assessments",
  ASSESSMENT_TEMPLATES: "assessment_templates",
  ASSESSMENT_REPORTS: "assessment_reports"
};

// key, category, label
const RAW_PERMISSIONS = [
  ["aplus.dashboard.view", CATEGORY.DASHBOARD, "View dashboard"],

  ["aplus.clients.view", CATEGORY.CLIENTS, "View clients"],
  ["aplus.clients.create", CATEGORY.CLIENTS, "Create clients"],
  ["aplus.clients.edit", CATEGORY.CLIENTS, "Edit clients"],
  ["aplus.clients.archive", CATEGORY.CLIENTS, "Archive clients"],
  ["aplus.clients.delete", CATEGORY.CLIENTS, "Delete clients"],

  ["aplus.appointments.view", CATEGORY.APPOINTMENTS, "View appointments"],
  ["aplus.appointments.create", CATEGORY.APPOINTMENTS, "Create appointments"],
  ["aplus.appointments.edit", CATEGORY.APPOINTMENTS, "Edit appointments"],
  ["aplus.appointments.cancel", CATEGORY.APPOINTMENTS, "Cancel appointments"],
  ["aplus.appointments.complete", CATEGORY.APPOINTMENTS, "Complete appointments"],
  ["aplus.appointments.mark_no_show", CATEGORY.APPOINTMENTS, "Mark no-show"],
  ["aplus.appointments.change_provider", CATEGORY.APPOINTMENTS, "Change provider"],
  ["aplus.appointments.change_service", CATEGORY.APPOINTMENTS, "Change service"],
  ["aplus.appointments.backdate", CATEGORY.APPOINTMENTS, "Backdate appointment"],
  ["aplus.appointments.edit_completed_bill", CATEGORY.APPOINTMENTS, "Edit completed appointment bill"],

  ["aplus.billing.view_invoices", CATEGORY.BILLING, "View invoices"],
  ["aplus.billing.edit_invoices", CATEGORY.BILLING, "Edit invoices"],
  ["aplus.billing.take_payments", CATEGORY.BILLING, "Take payments"],
  ["aplus.billing.record_cash", CATEGORY.BILLING, "Record cash/check"],
  ["aplus.billing.refund", CATEGORY.BILLING, "Refund payments"],
  ["aplus.billing.void", CATEGORY.BILLING, "Void payments"],
  ["aplus.billing.sync", CATEGORY.BILLING, "Sync billing"],
  ["aplus.billing.view_payment_history", CATEGORY.BILLING, "View payment history"],

  ["aplus.providers.view", CATEGORY.PROVIDERS, "View providers"],
  ["aplus.providers.create", CATEGORY.PROVIDERS, "Create providers"],
  ["aplus.providers.edit", CATEGORY.PROVIDERS, "Edit providers"],
  ["aplus.providers.deactivate", CATEGORY.PROVIDERS, "Deactivate providers"],
  ["aplus.providers.assign", CATEGORY.PROVIDERS, "Assign providers"],

  ["aplus.services.view", CATEGORY.SERVICES, "View services"],
  ["aplus.services.create", CATEGORY.SERVICES, "Create services"],
  ["aplus.services.edit", CATEGORY.SERVICES, "Edit services"],
  ["aplus.services.archive", CATEGORY.SERVICES, "Archive/restore services"],

  ["aplus.reports.view", CATEGORY.REPORTS, "View reports"],
  ["aplus.reports.export", CATEGORY.REPORTS, "Export reports"],

  ["aplus.settings.view", CATEGORY.SETTINGS, "View settings"],
  ["aplus.settings.edit", CATEGORY.SETTINGS, "Edit settings"],
  ["aplus.settings.manage_permissions", CATEGORY.SETTINGS, "Manage permissions"],

  ["aplus.quickbooks.view_sync", CATEGORY.QUICKBOOKS, "View QuickBooks sync status/audit"],
  ["aplus.quickbooks.trigger_sync", CATEGORY.QUICKBOOKS, "Trigger sync for a client/invoice"],
  ["aplus.quickbooks.manage_connection", CATEGORY.QUICKBOOKS, "Connect/disconnect/configure QuickBooks"],
  ["aplus.quickbooks.fix_sync_errors", CATEGORY.QUICKBOOKS, "Fix sync errors"],

  ["aplus.integrations.view", CATEGORY.INTEGRATIONS, "View integration accounts"],
  ["aplus.integrations.manage", CATEGORY.INTEGRATIONS, "Connect/disconnect/test other integrations (Sola, Payment Hub, Google Workspace, VoIP.ms)"],

  ["aplus.communications.view", CATEGORY.COMMUNICATIONS, "View communications/reminder jobs"],
  ["aplus.communications.send", CATEGORY.COMMUNICATIONS, "Send messages / reconcile reminders"],
  ["aplus.communications.manage_settings", CATEGORY.COMMUNICATIONS, "Manage reminder/communication global settings"],
  ["aplus.communications.manage_templates", CATEGORY.COMMUNICATIONS, "Manage reminder templates"],

  ["aplus.users.view", CATEGORY.USERS, "View users"],
  ["aplus.users.create", CATEGORY.USERS, "Invite/create users"],
  ["aplus.users.edit", CATEGORY.USERS, "Edit users / enable-disable"],
  ["aplus.users.manage_roles", CATEGORY.USERS, "Change a user's role"],
  ["aplus.users.delete", CATEGORY.USERS, "Delete users"],

  ["aplus.audit_logs.view", CATEGORY.AUDIT, "View audit logs"],

  ["aplus.waitlist.view", CATEGORY.WAITLIST, "View waitlist"],
  ["aplus.waitlist.create", CATEGORY.WAITLIST, "Add to waitlist"],
  ["aplus.waitlist.edit", CATEGORY.WAITLIST, "Edit waitlist entries"],
  ["aplus.waitlist.delete", CATEGORY.WAITLIST, "Remove waitlist entries"],

  ["aplus.data_tracking.view", CATEGORY.DATA_TRACKING, "View data tracking entries"],
  ["aplus.data_tracking.create", CATEGORY.DATA_TRACKING, "Create data tracking entries"],

  ["aplus.intake.view", CATEGORY.INTAKE, "View/generate intake forms"],

  ["aplus.client_files.view", CATEGORY.CLIENT_FILES, "View client files"],
  ["aplus.client_files.upload", CATEGORY.CLIENT_FILES, "Upload client files"],
  ["aplus.client_files.edit", CATEGORY.CLIENT_FILES, "Rename/move client files"],
  ["aplus.client_files.delete", CATEGORY.CLIENT_FILES, "Delete client files"],

  ["aplus.assessments.view", CATEGORY.ASSESSMENTS, "View client assessments"],
  ["aplus.assessments.create", CATEGORY.ASSESSMENTS, "Create client assessments"],
  ["aplus.assessments.edit", CATEGORY.ASSESSMENTS, "Edit client assessments"],
  ["aplus.assessments.delete", CATEGORY.ASSESSMENTS, "Delete client assessments"],

  ["aplus.assessment_templates.view", CATEGORY.ASSESSMENT_TEMPLATES, "View assessment templates"],
  ["aplus.assessment_templates.create", CATEGORY.ASSESSMENT_TEMPLATES, "Create assessment templates"],
  ["aplus.assessment_templates.edit", CATEGORY.ASSESSMENT_TEMPLATES, "Edit assessment templates"],
  ["aplus.assessment_templates.delete", CATEGORY.ASSESSMENT_TEMPLATES, "Delete assessment templates"],

  ["aplus.assessment_reports.view", CATEGORY.ASSESSMENT_REPORTS, "View assessment reports"],
  ["aplus.assessment_reports.create", CATEGORY.ASSESSMENT_REPORTS, "Create assessment reports"],
  ["aplus.assessment_reports.edit", CATEGORY.ASSESSMENT_REPORTS, "Edit assessment reports"],
  ["aplus.assessment_reports.delete", CATEGORY.ASSESSMENT_REPORTS, "Delete assessment reports"],
  ["aplus.assessment_reports.export", CATEGORY.ASSESSMENT_REPORTS, "Export/print assessment reports"]
];

export const PERMISSIONS = RAW_PERMISSIONS.map(([key, category, label]) => ({ key, category, label }));
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

function allKeysExcept(excluded) {
  const excludedSet = new Set(excluded);
  return PERMISSION_KEYS.filter((k) => !excludedSet.has(k));
}

const ADMIN_ONLY_KEYS = [
  "aplus.users.view",
  "aplus.users.create",
  "aplus.users.edit",
  "aplus.users.manage_roles",
  "aplus.users.delete",
  "aplus.audit_logs.view",
  "aplus.settings.edit",
  "aplus.settings.manage_permissions",
  "aplus.integrations.manage",
  "aplus.quickbooks.manage_connection",
  "aplus.quickbooks.view_sync",
  "aplus.communications.manage_settings",
  "aplus.communications.manage_templates"
];

// Endpoints today gated requireRole("ADMIN","STAFF") — excludes BCBA.
const ADMIN_STAFF_ONLY_KEYS = [
  "aplus.providers.create",
  "aplus.providers.edit",
  "aplus.providers.deactivate",
  "aplus.services.create",
  "aplus.services.edit",
  "aplus.services.archive",
  "aplus.communications.send"
];

// Endpoints today gated requireRole("ADMIN") only, beyond ADMIN_ONLY_KEYS above.
const ADMIN_ONLY_EXTRA_KEYS = [
  "aplus.providers.deactivate" // DELETE /providers/:id is ADMIN-only (create/edit are ADMIN+STAFF)
];

/**
 * Legacy-faithful role permission sets — used ONLY for the backfill so that
 * existing ADMIN/BCBA/STAFF accounts keep exactly the access they have today.
 */
const LEGACY_ADMIN_PERMS = PERMISSION_KEYS; // everything
const LEGACY_BCBA_PERMS = allKeysExcept([...new Set([...ADMIN_ONLY_KEYS, ...ADMIN_STAFF_ONLY_KEYS, ...ADMIN_ONLY_EXTRA_KEYS])]);
const LEGACY_STAFF_PERMS = allKeysExcept([...new Set([...ADMIN_ONLY_KEYS, "aplus.providers.deactivate"])]);

/**
 * System role definitions. `key` must be stable/unique. `legacy: true` roles
 * are the backfill targets for existing accounts; the rest are additional,
 * more-curated presets an admin can reassign users to going forward.
 */
export const SYSTEM_ROLES = [
  {
    key: "ADMIN",
    name: "Admin",
    description: "Full access to A Plus Center Scheduling (legacy ADMIN role, unchanged).",
    legacy: true,
    permissions: LEGACY_ADMIN_PERMS
  },
  {
    key: "BCBA",
    name: "BCBA",
    description: "Legacy BCBA access — unchanged from current behavior.",
    legacy: true,
    permissions: LEGACY_BCBA_PERMS
  },
  {
    key: "STAFF",
    name: "Staff",
    description: "Legacy Staff access — unchanged from current behavior.",
    legacy: true,
    permissions: LEGACY_STAFF_PERMS
  },
  {
    key: "OWNER",
    name: "Owner",
    description: "Full access, equivalent to Admin.",
    legacy: false,
    permissions: LEGACY_ADMIN_PERMS
  },
  {
    key: "OFFICE_ADMIN",
    name: "Office Admin",
    description: "Manages clinical/scheduling operations without financial or system-admin access.",
    legacy: false,
    permissions: [
      "aplus.dashboard.view",
      "aplus.clients.view", "aplus.clients.create", "aplus.clients.edit", "aplus.clients.archive",
      "aplus.appointments.view", "aplus.appointments.create", "aplus.appointments.edit", "aplus.appointments.cancel",
      "aplus.appointments.complete", "aplus.appointments.mark_no_show", "aplus.appointments.change_provider",
      "aplus.appointments.change_service",
      "aplus.providers.view", "aplus.services.view",
      "aplus.reports.view", "aplus.reports.export",
      "aplus.waitlist.view", "aplus.waitlist.create", "aplus.waitlist.edit", "aplus.waitlist.delete",
      "aplus.data_tracking.view", "aplus.data_tracking.create",
      "aplus.intake.view",
      "aplus.client_files.view", "aplus.client_files.upload", "aplus.client_files.edit",
      "aplus.assessments.view", "aplus.assessments.create", "aplus.assessments.edit",
      "aplus.assessment_templates.view",
      "aplus.assessment_reports.view", "aplus.assessment_reports.create", "aplus.assessment_reports.edit", "aplus.assessment_reports.export",
      "aplus.communications.view",
      "aplus.billing.view_invoices", "aplus.billing.view_payment_history",
      "aplus.settings.view",
      "aplus.users.view"
    ]
  },
  {
    key: "SCHEDULER",
    name: "Scheduler",
    description: "Manages the calendar and waitlist only.",
    legacy: false,
    permissions: [
      "aplus.dashboard.view",
      "aplus.clients.view",
      "aplus.appointments.view", "aplus.appointments.create", "aplus.appointments.edit", "aplus.appointments.cancel",
      "aplus.appointments.mark_no_show", "aplus.appointments.change_provider", "aplus.appointments.change_service",
      "aplus.providers.view", "aplus.services.view",
      "aplus.waitlist.view", "aplus.waitlist.create", "aplus.waitlist.edit", "aplus.waitlist.delete",
      "aplus.reports.view",
      "aplus.client_files.view"
    ]
  },
  {
    key: "BILLING_MANAGER",
    name: "Billing Manager",
    description: "Full billing/invoicing/payments access.",
    legacy: false,
    permissions: [
      "aplus.dashboard.view",
      "aplus.clients.view",
      "aplus.appointments.view",
      "aplus.billing.view_invoices", "aplus.billing.edit_invoices", "aplus.billing.take_payments",
      "aplus.billing.record_cash", "aplus.billing.refund", "aplus.billing.void", "aplus.billing.sync",
      "aplus.billing.view_payment_history",
      "aplus.quickbooks.view_sync", "aplus.quickbooks.trigger_sync", "aplus.quickbooks.fix_sync_errors",
      "aplus.reports.view", "aplus.reports.export"
    ]
  },
  {
    key: "RECEPTIONIST",
    name: "Receptionist",
    description: "Front-desk: clients, scheduling, waitlist, intake, communications.",
    legacy: false,
    permissions: [
      "aplus.dashboard.view",
      "aplus.clients.view", "aplus.clients.create", "aplus.clients.edit",
      "aplus.appointments.view", "aplus.appointments.create", "aplus.appointments.edit", "aplus.appointments.cancel",
      "aplus.appointments.mark_no_show", "aplus.appointments.change_provider", "aplus.appointments.change_service",
      "aplus.waitlist.view", "aplus.waitlist.create", "aplus.waitlist.edit", "aplus.waitlist.delete",
      "aplus.intake.view",
      "aplus.communications.view", "aplus.communications.send",
      "aplus.client_files.view", "aplus.client_files.upload",
      "aplus.providers.view", "aplus.services.view"
    ]
  },
  {
    key: "PROVIDER",
    name: "Provider",
    description: "Clinical role: own appointments, assessments, data tracking.",
    legacy: false,
    permissions: [
      "aplus.dashboard.view",
      "aplus.clients.view",
      "aplus.appointments.view", "aplus.appointments.edit", "aplus.appointments.complete",
      "aplus.assessments.view", "aplus.assessments.create", "aplus.assessments.edit",
      "aplus.assessment_templates.view",
      "aplus.assessment_reports.view", "aplus.assessment_reports.create", "aplus.assessment_reports.edit", "aplus.assessment_reports.export",
      "aplus.data_tracking.view", "aplus.data_tracking.create",
      "aplus.client_files.view", "aplus.client_files.upload",
      "aplus.reports.view"
    ]
  },
  {
    key: "READ_ONLY",
    name: "Read Only",
    description: "View-only access across the system.",
    legacy: false,
    permissions: PERMISSION_KEYS.filter((k) => k.endsWith(".view") || k.endsWith("_view") || k.includes(".view_"))
  }
];

/** Maps legacy `UserRole` enum values to the system Role `key` used for backfill. */
export const LEGACY_ROLE_KEY_MAP = {
  ADMIN: "ADMIN",
  BCBA: "BCBA",
  STAFF: "STAFF"
};
