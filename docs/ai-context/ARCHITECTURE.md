# Architecture

## App Boundaries

### Root Next.js App
- Path: repo root.
- Framework: Next.js 14, React 18, Prisma 5, NextAuth 4.
- Evidence: root `package.json`.
- App Router path: `app/`.
- Database schema: root `prisma/schema.prisma`.
- Detailed route/auth mapping: `UNKNOWN — verify before changing.`

### A Plus Scheduling App
- Path: `aplus-center-scheduling`.
- Client: `client`, React + Vite + Tailwind + React Router.
- Server: `server`, Node/Express + Prisma.
- Database: PostgreSQL via `server/prisma/schema.prisma`.
- Auth: JWT + bcrypt. Server middleware reads `Authorization: Bearer <token>`.
- Deployment evidence: `/opt/aba`, PM2 app `aba-app`, nginx proxy to `127.0.0.1:4000`.

Entrypoints:
- Server: `server/src/server.js` imports `server/src/app.js`.
- Client: `client/src/main.jsx`, `client/src/App.jsx`.
- Static production serving: `server/src/app.js` serves `client/dist` when `NODE_ENV === "production"`.

### SmartSteps ABA Tracker
- Path: `aplus-center-scheduling/smart-steps`.
- Framework: Next.js 16, React 19, NextAuth v5 beta.
- Base path: `/smart-steps` in `next.config.ts`.
- App Router path: `src/app`.
- Database schema: `prisma/schema.prisma`.
- Auth: `auth()` from `@/auth`, Credentials provider, SSO bridge from A Plus JWT, JWT sessions.
- State: React Query and Zustand local store; Dexie/offline sync referenced in main layout.

## API Structures

### A Plus Scheduling API
Mounted in `server/src/app.js`:
- `/api/auth`
- `/api/clients`
- `/api/clients/:clientId/files`
- `/api/appointments`
- `/api/reports`
- `/api/invoices`
- `/api/dashboard`
- `/api/waitlist`
- `/api/intake`
- `/api/users`
- `/api/settings`
- `/api/audit-logs`
- `/api/payments`
- `/api/integrations`
- `/api/data-tracking`
- `/api/assessments`
- `/api/assessment-templates`
- `/api/assessment-reports`
- `/api/services`
- `/api/providers`
- `/api/reminders`
- `/api/webhooks`
- `/api/admin`

### SmartSteps API
Examples under `smart-steps/src/app/api`:
- `auth/[...nextauth]`
- `clients`, `clients/[clientId]`
- `clients/[clientId]/goals`
- `clients/[clientId]/targets`
- `sessions`, `trials`
- `assessments/templates`
- `clients/[clientId]/assessments`
- `report-templates`, `client-reports`
- `parent/[clientId]`, `parent/generate-token`
- `sync`, `sso`, `dashboard/stats`

## Deployment Hints

Evidence from `aplus-center-scheduling/deploy.sh`, `ecosystem.config.js`, and `deploy/nginx.aplus-center.conf`:
- Production directory: `/opt/aba`.
- PM2 process: `aba-app`.
- Server port: health checks reference `127.0.0.1:4000`.
- nginx sample proxies `/smart-steps` to `127.0.0.1:3000`.
- SmartSteps dev script uses port `3001`; exact production port is `UNKNOWN — verify before changing.`

## Environment Variables

Visible names without secrets include:
- Scheduling server: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ENCRYPTION_KEY`, `EMAIL_*`, `APP_BASE_URL`, `API_BASE_URL`, `PUBLIC_WEBHOOK_BASE_URL`, `PORT`, `UPLOAD_DIR`, `GLOBAL_HOURLY_RATE`, QuickBooks `QUICKBOOKS_*` / `QB_*`, `SOLA_*`, `PAYMENT_HUB_*`, `GOOGLE_WORKSPACE_*`, `VOIPMS_*`.
- Scheduling client: `VITE_API_BASE_URL`, optional `VITE_SMART_STEPS_URL`.
- SmartSteps: uses `DATABASE_URL`, `SCHEDULING_DATABASE_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, A Plus JWT secret names in SSO code.

Do not reveal or hard-code secrets.
