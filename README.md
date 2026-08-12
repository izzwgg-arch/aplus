# A+ Center Scheduling App

Production-oriented scheduling app for cranial sacral therapy workflows.

## Stack

- Frontend: React + Vite + Tailwind + FullCalendar
- Backend: Node.js + Express + Prisma
- Database: PostgreSQL
- Auth: JWT + bcrypt
- Email: Nodemailer

## Project Structure

```text
aplus-center-scheduling/
  client/
    src/
      components/
        common/            # Protected route
        layout/            # Sidebar/topbar/app layout
      context/             # Auth context
      lib/                 # API client
      pages/
        aplus/             # Clinic module pages
  server/
    prisma/
      schema.prisma
    src/
      config/              # env + prisma
      jobs/                # cron schedulers
      middleware/          # auth, upload, error handling
      routes/              # modular API routes
      services/            # reminders + invoices
      utils/               # crypto, jwt, email, logger
  .env.example
  deploy.sh
  ecosystem.config.js
  package.json
```

## Setup

1. Copy env values:
   - `cp .env.example server/.env`
   - `cp .env.example client/.env`
2. Install dependencies:
   - `npm install`
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Run migrations:
   - `npm run prisma:migrate`
5. Start in development:
   - API only: `npm run dev`
   - UI only: `npm run dev:client`
   - Both: `npm run dev:all`
6. Seed starter admin:
   - `npm run seed -w server`

## Production (Contabo VPS)

1. Clone to `/opt/aba`.
2. Copy env and set real values:
   - `cp server/.env.example server/.env`
3. Run bootstrap:
   - `bash setup-production.sh /opt/aba`
4. Configure Nginx using:
   - `deploy/nginx.aplus-center.conf`
5. (Optional) enable HTTPS with Certbot after DNS points to server.

The server process runs as PM2 app `aba-app` and serves:
- API under `/api/*`
- uploads under `/uploads/*`
- React SPA routes from built client bundle

## Core API Endpoints

- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET/POST/PUT /api/clients`
- `POST /api/clients/:id/documents`
- `GET/POST/PUT/DELETE /api/appointments`
- `POST /api/appointments/:id/cancel`
- `POST /api/reports/upload/:token`
- `GET /api/reports/upload/:token` (secure upload page for BCBA)
- `GET /api/invoices`, `POST /api/invoices/:id/send`, `POST /api/invoices/:id/pay`
- `GET /api/dashboard/stats` (overview KPIs, utilization, BCBA workload, trend + status breakdown; supports `rangePreset`, `startDate`, `endDate`)
- `GET/POST /api/waitlist`
- `GET /api/intake/pdf`
- `GET/PUT /api/settings` (clinic defaults, PUT requires ADMIN)
- `GET /api/users` (ADMIN), `POST /api/users` (ADMIN), `PATCH /api/users/:id/role` (ADMIN)
- `POST /api/auth/change-password` (authenticated user)
- `PATCH /api/users/:id/password` (ADMIN reset user password)
- `GET /api/audit-logs` (ADMIN, optional `action`, `startDate`, `endDate`, `sortBy`, `sortDir`, `limit`, `offset`)
- `GET /api/audit-logs/export.csv` (ADMIN CSV export, same filters)
- `GET /api/health`, `GET /api/health/db`

## Security Notes

- File uploads are type-restricted and sanitized.
- No PHI should be logged in plain text.
- Sensitive fields are encrypted at rest (address and notes).
- HTTPS-ready behind reverse proxy (Nginx/Caddy on VPS).

## Deployment Model

Local Dev -> Git Push -> Server Pull -> `./deploy.sh` -> PM2 restart

`deploy.sh` is generated in the app root and can be adapted for your VPS.

## UI Notes

- Dashboard first screen has two large cards:
  - `A+ Center`
  - `Smart Steps ABA Tracker` (coming soon page)
- A+ Center UI uses a medical-blue theme with responsive collapsible sidebar.
