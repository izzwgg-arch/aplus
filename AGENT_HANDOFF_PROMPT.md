# Agent Handoff Prompt - A Plus Center Application

## Project Context

You are continuing development on **A Plus Center**, a production-ready web application for an ABA (Applied Behavior Analysis) company. The application manages timesheets, analytics, and insurance invoicing.

**Repository Location**: `c:\dev\projects\A Plus center`
**Deployed Server**: `66.94.105.43` (SSH: root@66.94.105.43)
**Live URL**: Currently accessible at `http://66.94.105.43:3000`

## Technology Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Styling**: Tailwind CSS
- **State Management**: React hooks
- **Deployment**: PM2 + Nginx (configured but not fully set up)
- **Package Manager**: npm

## Current Status - What's Completed ✅

### 1. Infrastructure & Setup
- ✅ Next.js project structure with TypeScript
- ✅ Prisma database schema (all models defined)
- ✅ Authentication system with NextAuth.js
- ✅ Password validation (10-15 chars, uppercase, lowercase, special char)
- ✅ Role-based access control (Admin/User)
- ✅ User activation scheduling support
- ✅ Server deployment scripts
- ✅ Database deployed and configured on server

### 2. Core Pages & Components
- ✅ Login page
- ✅ Dashboard with navigation cards
- ✅ Providers management (list, create, edit, delete with signature upload)
- ✅ Clients management (list, create, edit, delete)
- ✅ BCBAs management (Admin only - list, create, edit, delete)
- ✅ Insurance management (Admin only - list, create, edit with rate history)
- ✅ Timesheets management (list, create, edit, delete, print preview)
- ✅ Invoices management (list, create, view, payments, adjustments)

### 3. Timesheet System
- ✅ Timesheet creation form with:
  - Date range selection
  - Provider/Client/BCBA/Insurance assignment
  - Default times for Sun/Weekdays/Fri
  - Auto-fill logic based on day type
  - DR (Direct Service) and SV (Supervision) time tracking
  - Real-time hours calculation
  - Dynamic day entries table
- ✅ Timesheet workflow states:
  - DRAFT → can be edited/deleted
  - SUBMITTED → cannot be edited, awaiting approval
  - APPROVED → ready for invoicing
  - REJECTED → can be resubmitted after edits
  - LOCKED → invoiced and locked
- ✅ Workflow actions (Submit, Approve, Reject)
- ✅ Print preview modal matching design specifications
- ✅ Timesheet list with pagination, search, and filtering

### 4. Invoice System
- ✅ Manual invoice creation from approved timesheets
- ✅ Invoice list with search and status filtering
- ✅ Invoice detail page with:
  - Entry breakdown
  - Payment tracking (add payments modal)
  - Adjustment tracking (positive/negative adjustments)
  - Summary sidebar (totals, paid, outstanding)
- ✅ Automatic timesheet locking when invoiced
- ✅ Payment recording with reference numbers
- ✅ Adjustments with required reasons
- ✅ Automatic status updates (Paid, Partially Paid)

### 5. API Routes Completed
- ✅ `/api/auth/[...nextauth]` - Authentication
- ✅ `/api/auth/session` - Session management
- ✅ `/api/providers` - CRUD operations
- ✅ `/api/clients` - CRUD operations
- ✅ `/api/bcbas` - CRUD operations (Admin only)
- ✅ `/api/insurance` - CRUD operations (Admin only)
- ✅ `/api/timesheets` - CRUD with filtering
- ✅ `/api/timesheets/[id]/submit` - Submit timesheet
- ✅ `/api/timesheets/[id]/approve` - Approve timesheet (Admin)
- ✅ `/api/timesheets/[id]/reject` - Reject timesheet (Admin)
- ✅ `/api/invoices` - CRUD operations
- ✅ `/api/invoices/[id]/payments` - Record payments
- ✅ `/api/invoices/[id]/adjustments` - Add adjustments

### 6. Database Schema
All Prisma models are defined:
- User (with activation scheduling)
- Provider
- Client
- BCBA
- Insurance (with rate history)
- Timesheet & TimesheetEntry
- Invoice & InvoiceEntry
- Payment
- InvoiceAdjustment
- AuditLog (schema ready, not implemented)
- Notification (schema ready, not implemented)
- ScheduledJob (schema ready, not implemented)

**Database**: PostgreSQL on server, database name: `apluscenter`
**Admin User**: `admin@apluscenter.com` / `Admin@12345!`

## What's Remaining - Priority Tasks 🚧

### High Priority

#### 1. Automatic Invoice Generation (Scheduled Jobs)
- [ ] Create cron job system (node-cron)
- [ ] Implement Friday 4:00 PM ET automatic invoice generation
- [ ] Generate invoices per client for approved timesheets
- [ ] Prevent duplicate invoice generation
- [ ] Lock timesheets after invoicing
- [ ] Create notification system for admins
- **Files to create/modify**: 
  - `lib/cron.ts` - Cron job setup
  - `lib/jobs/invoiceGeneration.ts` - Invoice generation logic
  - `app/api/cron/invoice-generation/route.ts` - API endpoint for cron

#### 2. Analytics Dashboard
- [ ] Build analytics page with charts (Recharts library)
- [ ] Implement line graphs (revenue trends, timesheet creation)
- [ ] Implement bar charts (provider productivity, client billing)
- [ ] Implement pie charts (invoice status distribution)
- [ ] Implement waterfall charts (billed → paid → adjustments → outstanding)
- [ ] Add filtering by date range, provider, client, BCBA, insurance
- [ ] Add drill-down functionality (chart to table view)
- [ ] Toggle between chart and table views
- **Data to track**:
  - Timesheets created/approved/rejected
  - Invoices generated/sent/paid
  - Amount billed/paid/outstanding
  - Revenue trends over time
  - Provider productivity
  - Client billing totals
  - Insurance payout comparisons

#### 3. Reports System
- [ ] Build reports page
- [ ] Generate PDF reports (PDFKit or similar)
- [ ] Generate CSV exports
- [ ] Generate Excel exports
- [ ] Report types:
  - Timesheet summaries
  - Invoice summaries
  - Insurance billing reports
  - Provider performance reports
- **Files to create**: 
  - `app/reports/page.tsx`
  - `lib/pdf/reportGenerator.ts`
  - `lib/excel/reportGenerator.ts`
  - `lib/csv/reportGenerator.ts`

#### 4. User Management (Admin Only)
- [ ] Build user management page
- [ ] Create user form (with password validation)
- [ ] Schedule activation/deactivation (date and time)
- [ ] Enable/disable users instantly
- [ ] Assign roles (Admin/User)
- [ ] **Files to create**: 
  - `app/users/page.tsx`
  - `app/users/new/page.tsx`
  - `components/users/UserForm.tsx`
  - `app/api/users/route.ts`

#### 5. Audit Logs System
- [ ] Create audit log viewer (Admin only)
- [ ] Log all critical actions:
  - User management
  - Timesheet lifecycle
  - Invoice lifecycle
  - Payments
- [ ] Display: Action, Entity, Entity ID, User, Timestamp, Old → New values
- [ ] **Files to create**: 
  - `app/audit-logs/page.tsx`
  - `lib/audit.ts` - Audit logging utility
  - Add audit logging to existing API routes

#### 6. Notifications System
- [ ] In-app notification component
- [ ] Notify admins when:
  - Timesheets submitted
  - Timesheets rejected
  - Invoices generated
  - Payments recorded
- [ ] Notification bell/indicator
- [ ] Mark as read functionality
- [ ] **Files to create**: 
  - `components/notifications/NotificationBell.tsx`
  - `app/api/notifications/route.ts`
  - Add notification creation to relevant API routes

### Medium Priority

#### 7. Forgot/Reset Password
- [ ] Forgot password page
- [ ] Email sending (Nodemailer configured in dependencies)
- [ ] Reset password page with token validation
- [ ] **Files to create**: 
  - `app/forgot-password/page.tsx`
  - `app/reset-password/page.tsx`
  - `app/api/auth/forgot-password/route.ts`
  - `app/api/auth/reset-password/route.ts`

#### 8. Timesheet Edit Functionality
- [ ] Edit page for draft timesheets
- [ ] Pre-populate form with existing data
- [ ] **Files to create**: 
  - `app/timesheets/[id]/edit/page.tsx`
  - Reuse `TimesheetForm` component

#### 9. Invoice Edit Functionality
- [ ] Edit page for draft invoices
- [ ] Allow status updates
- [ ] **Files to create**: 
  - `app/invoices/[id]/edit/page.tsx`

#### 10. Export Functionality
- [ ] Implement CSV/Excel exports for:
  - Providers
  - Clients
  - Timesheets
  - Invoices
- [ ] Use existing `xlsx` and `csv-writer` packages

### Low Priority / Polish

#### 11. PDF Generation Enhancements
- [ ] Improve timesheet PDF formatting
- [ ] Create invoice PDF templates
- [ ] Add company branding/logos

#### 12. Advanced Features
- [ ] Invoice versioning (schema supports it)
- [ ] Multiple invoices per payment
- [ ] Timezone handling improvements
- [ ] Validation rules enforcement (prevent overlapping sessions)
- [ ] Data validation enhancements

## Key Files & Locations

### Important Configuration Files
- `prisma/schema.prisma` - Database schema (fully defined)
- `lib/prisma.ts` - Prisma client singleton
- `lib/auth.ts` - NextAuth configuration
- `lib/utils.ts` - Utility functions
- `lib/dateUtils.ts` - Date/time utilities
- `.env` - Environment variables (on server: `/var/www/aplus-center/.env`)
- `package.json` - Dependencies (all installed)

### Component Structure
```
components/
  ├── AuthProvider.tsx
  ├── DashboardNav.tsx
  ├── providers/ (ProviderForm.tsx, ProvidersList.tsx)
  ├── clients/ (ClientForm.tsx, ClientsList.tsx)
  ├── bcbas/ (BCBAForm.tsx, BCBAsList.tsx)
  ├── insurance/ (InsuranceForm.tsx, InsuranceList.tsx)
  ├── timesheets/ (TimesheetForm.tsx, TimesheetsList.tsx, TimesheetPrintPreview.tsx)
  └── invoices/ (InvoiceForm.tsx, InvoicesList.tsx, InvoiceDetail.tsx)
```

### API Routes Structure
```
app/api/
  ├── auth/
  ├── providers/
  ├── clients/
  ├── bcbas/
  ├── insurance/
  ├── timesheets/
  ├── invoices/
  └── (missing: users, notifications, audit-logs, cron)
```

## Development Workflow

### Local Development
```bash
npm install
cp .env.example .env
# Edit .env with database credentials
npx prisma generate
npx prisma db push
npm run create-admin
npm run dev
```

### Server Deployment
The application is deployed at `/var/www/aplus-center` on the server.

To deploy updates:
1. Build locally: `npm run build`
2. Copy files to server
3. On server: `cd /var/www/aplus-center && npm install && npx prisma generate && npm run build && pm2 restart aplus-center`

### Database Migrations
Currently using `prisma db push` for development. For production, consider using `prisma migrate` for versioned migrations.

## Important Notes

1. **Permissions**: Admin-only features are protected at both UI and API levels. Check `session.user.role === 'ADMIN'` before allowing access.

2. **Timesheet Workflow**: Only DRAFT timesheets can be edited/deleted. Submitted timesheets can only be approved/rejected by admins.

3. **Invoice Workflow**: Only DRAFT invoices can be deleted. Once sent, invoices should use versioning for changes.

4. **Password Rules**: Enforced via `validatePassword()` in `lib/utils.ts`:
   - 10-15 characters
   - 1 uppercase, 1 lowercase, 1 special character

5. **Rate Changes**: Insurance rate changes don't affect existing invoices (rate is stored at invoice creation time in InvoiceEntry).

6. **Scheduled Jobs**: Need to set up cron jobs for automatic invoice generation (Friday 4 PM ET).

7. **Timezone**: Application uses `America/New_York` timezone for scheduling. Store timestamps in UTC.

## Next Steps Recommendation

1. **Start with Automatic Invoice Generation** - This is a core feature and relatively straightforward to implement
2. **Build Analytics Dashboard** - Visual analytics is important for business intelligence
3. **Implement Reports** - PDF/Excel generation is needed for compliance
4. **Add User Management** - Needed for production deployment
5. **Audit Logs & Notifications** - Important for tracking and awareness

## Questions to Consider

- Do we need email notifications in addition to in-app?
- Should we add real-time updates (WebSockets) or is polling sufficient?
- What format should PDF reports follow? Any specific templates?
- Are there additional validation rules needed for timesheet entries?
- Should we add bulk operations (bulk approve timesheets, etc.)?

## Code Style & Patterns

- Use TypeScript for all files
- Use functional components with hooks
- Follow Next.js 14 App Router conventions
- Use Prisma for all database operations
- Use toast notifications (react-hot-toast) for user feedback
- Follow existing component structure patterns
- Use Tailwind CSS for styling
- Maintain consistent error handling patterns

## Testing Recommendations

While not explicitly requested, consider:
- Unit tests for utility functions
- Integration tests for API routes
- E2E tests for critical workflows (timesheet creation, invoice generation)

---

**Last Updated**: Current session
**Codebase Status**: ~70% complete, core functionality working
**Production Ready**: Partial - core features work, but missing scheduled jobs, analytics, and reports

Continue development with focus on the high-priority items listed above. The foundation is solid and well-structured, making it straightforward to add new features following existing patterns.
