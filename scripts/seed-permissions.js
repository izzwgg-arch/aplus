const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const permissions = [
  // Providers
  { name: 'providers.view', description: 'View providers', category: 'providers' },
  { name: 'providers.create', description: 'Create providers', category: 'providers' },
  { name: 'providers.update', description: 'Update providers', category: 'providers' },
  { name: 'providers.delete', description: 'Delete providers', category: 'providers' },
  { name: 'providers.export', description: 'Export providers', category: 'providers' },
  
  // Clients
  { name: 'clients.view', description: 'View clients', category: 'clients' },
  { name: 'clients.create', description: 'Create clients', category: 'clients' },
  { name: 'clients.update', description: 'Update clients', category: 'clients' },
  { name: 'clients.delete', description: 'Delete clients', category: 'clients' },
  { name: 'clients.export', description: 'Export clients', category: 'clients' },
  
  // BCBAs
  { name: 'bcbas.view', description: 'View BCBAs', category: 'bcbas' },
  { name: 'bcbas.create', description: 'Create BCBAs', category: 'bcbas' },
  { name: 'bcbas.update', description: 'Update BCBAs', category: 'bcbas' },
  { name: 'bcbas.delete', description: 'Delete BCBAs', category: 'bcbas' },
  { name: 'bcbas.export', description: 'Export BCBAs', category: 'bcbas' },
  
  // Insurance
  { name: 'insurance.view', description: 'View insurance', category: 'insurance' },
  { name: 'insurance.create', description: 'Create insurance', category: 'insurance' },
  { name: 'insurance.update', description: 'Update insurance', category: 'insurance' },
  { name: 'insurance.delete', description: 'Delete insurance', category: 'insurance' },
  { name: 'insurance.export', description: 'Export insurance', category: 'insurance' },
  
  // Timesheets
  { name: 'timesheets.view', description: 'View timesheets', category: 'timesheets' },
  { name: 'timesheets.viewAll', description: 'View all timesheets', category: 'timesheets' },
  { name: 'timesheets.viewSelectedUsers', description: 'View selected users\' timesheets', category: 'timesheets' },
  { name: 'timesheets.create', description: 'Create timesheets', category: 'timesheets' },
  { name: 'timesheets.update', description: 'Update timesheets', category: 'timesheets' },
  { name: 'timesheets.delete', description: 'Delete timesheets', category: 'timesheets' },
  { name: 'timesheets.submit', description: 'Submit timesheets', category: 'timesheets' },
  { name: 'timesheets.approve', description: 'Approve timesheets', category: 'timesheets' },
  { name: 'timesheets.reject', description: 'Reject timesheets', category: 'timesheets' },
  { name: 'timesheets.unapprove', description: 'Unapprove timesheets', category: 'timesheets' },
  { name: 'timesheets.export', description: 'Export timesheets', category: 'timesheets' },
  
  // BCBA Timesheets
  { name: 'bcbaTimesheets.view', description: 'View BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.viewAll', description: 'View all BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.viewSelectedUsers', description: 'View selected users\' BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.create', description: 'Create BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.update', description: 'Update BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.delete', description: 'Delete BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.approve', description: 'Approve BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.reject', description: 'Reject BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.unapprove', description: 'Unapprove BCBA timesheets', category: 'bcbaTimesheets' },
  { name: 'bcbaTimesheets.export', description: 'Export BCBA timesheets', category: 'bcbaTimesheets' },
  
  // Invoices
  { name: 'invoices.view', description: 'View invoices', category: 'invoices' },
  { name: 'invoices.create', description: 'Create invoices', category: 'invoices' },
  { name: 'invoices.update', description: 'Update invoices', category: 'invoices' },
  { name: 'invoices.delete', description: 'Delete invoices', category: 'invoices' },
  { name: 'invoices.payment', description: 'Record payments', category: 'invoices' },
  { name: 'invoices.adjustment', description: 'Make adjustments', category: 'invoices' },
  { name: 'invoices.export', description: 'Export invoices', category: 'invoices' },
  
  // Users
  { name: 'users.view', description: 'View users', category: 'users' },
  { name: 'users.create', description: 'Create users', category: 'users' },
  { name: 'users.update', description: 'Update users', category: 'users' },
  { name: 'users.delete', description: 'Delete users', category: 'users' },
  
  // Roles
  { name: 'roles.view', description: 'View roles', category: 'roles' },
  { name: 'roles.create', description: 'Create roles', category: 'roles' },
  { name: 'roles.update', description: 'Update roles', category: 'roles' },
  { name: 'roles.delete', description: 'Delete roles', category: 'roles' },
  
  // Reports
  { name: 'reports.view', description: 'View reports', category: 'reports' },
  { name: 'reports.generate', description: 'Generate reports', category: 'reports' },
  { name: 'reports.export', description: 'Export reports', category: 'reports' },
  { name: 'reports.timesheetArchive.view', description: 'View regular timesheet archive', category: 'reports' },
  { name: 'reports.bcbaTimesheetArchive.view', description: 'View BCBA timesheet archive', category: 'reports' },
  
  // Analytics
  { name: 'analytics.view', description: 'View analytics', category: 'analytics' },
  
  // Audit Logs
  { name: 'audit.view', description: 'View audit logs', category: 'audit' },
  
  // Email Queue
  { name: 'emailQueue.view', description: 'View email queue', category: 'emailQueue' },
  { name: 'emailQueue.sendBatch', description: 'Send batch emails from queue', category: 'emailQueue' },
  { name: 'emailQueue.delete', description: 'Delete items from email queue', category: 'emailQueue' },
  
  // Community Classes Module
  { name: 'community.view', description: 'View community classes module', category: 'community' },
  { name: 'community.clients.view', description: 'View community clients', category: 'community' },
  { name: 'community.clients.create', description: 'Create community clients', category: 'community' },
  { name: 'community.clients.update', description: 'Update community clients', category: 'community' },
  { name: 'community.clients.delete', description: 'Delete community clients', category: 'community' },
  { name: 'community.classes.view', description: 'View community classes', category: 'community' },
  { name: 'community.classes.create', description: 'Create community classes', category: 'community' },
  { name: 'community.classes.update', description: 'Update community classes', category: 'community' },
  { name: 'community.classes.delete', description: 'Delete community classes', category: 'community' },
  { name: 'community.invoices.view', description: 'View community invoices', category: 'community' },
  { name: 'community.invoices.create', description: 'Create community invoices', category: 'community' },
  { name: 'community.invoices.update', description: 'Update community invoices', category: 'community' },
  { name: 'community.invoices.delete', description: 'Delete community invoices', category: 'community' },
  { name: 'community.invoices.approve', description: 'Approve community invoices', category: 'community' },
  { name: 'community.invoices.reject', description: 'Reject community invoices', category: 'community' },
  { name: 'community.invoices.emailqueue.view', description: 'View community email queue', category: 'community' },
  { name: 'community.invoices.emailqueue.send', description: 'Send community invoice emails', category: 'community' },
  { name: 'community.invoices.emailqueue.delete', description: 'Delete items from community email queue', category: 'community' },
  
  // Dashboard Visibility
  { name: 'dashboard.analytics', description: 'Show Analytics in Dashboard', category: 'dashboard' },
  { name: 'dashboard.providers', description: 'Show Providers in Dashboard', category: 'dashboard' },
  { name: 'dashboard.clients', description: 'Show Clients in Dashboard', category: 'dashboard' },
  { name: 'dashboard.timesheets', description: 'Show Timesheets in Dashboard', category: 'dashboard' },
  { name: 'dashboard.invoices', description: 'Show Invoices in Dashboard', category: 'dashboard' },
  { name: 'dashboard.reports', description: 'Show Reports in Dashboard', category: 'dashboard' },
  { name: 'dashboard.users', description: 'Show Users in Dashboard', category: 'dashboard' },
  { name: 'dashboard.bcbas', description: 'Show BCBAs in Dashboard', category: 'dashboard' },
  { name: 'dashboard.insurance', description: 'Show Insurance in Dashboard', category: 'dashboard' },
  { name: 'dashboard.community', description: 'Show Community Classes in Dashboard', category: 'dashboard' },
  { name: 'dashboard.emailQueue', description: 'Show Email Queue in Dashboard', category: 'dashboard' },
  { name: 'dashboard.bcbaTimesheets', description: 'Show BCBA Timesheets in Dashboard', category: 'dashboard' },
  { name: 'dashboard.forms', description: 'Show Forms in Dashboard', category: 'dashboard' },
  
  // Forms
  { name: 'FORMS_VIEW', description: 'View forms', category: 'forms' },
  { name: 'FORMS_EDIT', description: 'Edit forms', category: 'forms' },
  
  // Payroll Management
  { name: 'PAYROLL_VIEW', description: 'View payroll management', category: 'payroll' },
  { name: 'PAYROLL_MANAGE_EMPLOYEES', description: 'Manage employee directory and pay rates', category: 'payroll' },
  { name: 'PAYROLL_IMPORT_EDIT', description: 'Import and edit time logs', category: 'payroll' },
  { name: 'PAYROLL_RUN_CREATE', description: 'Create and manage payroll runs', category: 'payroll' },
  { name: 'PAYROLL_PAYMENTS_EDIT', description: 'Record and edit payments', category: 'payroll' },
  { name: 'PAYROLL_ANALYTICS_VIEW', description: 'View payroll analytics and dashboard', category: 'payroll' },
  { name: 'PAYROLL_REPORTS_EXPORT', description: 'Export payroll reports', category: 'payroll' },
  
  // Dashboard Visibility
  { name: 'dashboard.payroll', description: 'Show Payroll Management in Dashboard', category: 'dashboard' },
]

async function main() {
  console.log('Seeding permissions...')
  
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    })
  }
  
  console.log(`Seeded ${permissions.length} permissions`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
