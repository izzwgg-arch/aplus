# API Routes

## A Plus Scheduling Server

Route mounts from `aplus-center-scheduling/server/src/app.js`:

- `GET /api/health`
- `GET /api/health/db`
- `/api/auth` → `server/src/routes/auth.routes.js`
- `/api/clients` → `client.routes.js`
- `/api/clients/:clientId/files` → `clientFiles.routes.js`
- `/api/appointments` → `appointment.routes.js`
- `/api/reports` → `report.routes.js`
- `/api/invoices` → `invoice.routes.js`
- `/api/dashboard` → `dashboard.routes.js`
- `/api/waitlist` → `waitlist.routes.js`
- `/api/intake` → `intake.routes.js`
- `/api/users` → `user.routes.js`
- `/api/settings` → `settings.routes.js`
- `/api/audit-logs` → `audit.routes.js`
- `/api/payments` → `payment.routes.js`
- `/api/integrations` → `integration.routes.js`
- `/api/data-tracking` → `dataTracking.routes.js`
- `/api/assessments` → `assessment.routes.js`
- `/api/assessment-templates` → `assessmentTemplate.routes.js`
- `/api/assessment-reports` → `assessmentReport.routes.js`
- `/api/services` → `service.routes.js`
- `/api/providers` → `provider.routes.js`
- `/api/reminders` → `reminder.routes.js`
- `/api/webhooks` → `webhooks.routes.js`
- `/api/admin` → `admin.routes.js`

Public or special routes:
- Invoice HTML supports bearer token or `?token=` before router-level auth.
- Payment webhooks and browser-post confirmation are declared before `requireAuth` in `payment.routes.js`.
- QuickBooks OAuth callback is under `integration.routes.js`.
- VoIP.ms SMS webhook is under `/api/webhooks/voipms/sms`.

Assessment template/report routes:
- `POST /api/assessment-templates/:id/generate-report` creates an editable `AssessmentReport` snapshot for a selected client.
- Generated reports are edited through `/api/assessment-reports` and are separate from the legacy `/api/reports` appointment upload flow.

## SmartSteps API

Representative routes under `aplus-center-scheduling/smart-steps/src/app/api`:
- `auth/[...nextauth]`
- `sso`
- `clients`
- `clients/[clientId]`
- `clients/[clientId]/assignments`
- `clients/[clientId]/goals`
- `clients/[clientId]/goals/[goalId]`
- `clients/[clientId]/targets`
- `sessions`
- `sessions/[sessionId]`
- `trials`
- `trials/[trialId]`
- `programs`
- `programs/[programId]/targets`
- `assessments/templates`
- `clients/[clientId]/assessments`
- `report-templates`
- `client-reports`
- `parent/[clientId]`
- `parent/generate-token`
- `sync`
- `dashboard/stats`

## Route Safety
- Before changing an API, identify auth middleware, role checks, request body, model writes, integrations, and UI consumers.
- For payment/webhook routes, do not move middleware order without explicit approval.
- For client-scoped routes, verify assignment/role gates before changing.
