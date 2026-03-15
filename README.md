# A Plus Center - ABA Timesheet, Analytics & Insurance Invoicing Platform

A comprehensive web application for managing ABA (Applied Behavior Analysis) operations including timesheets, analytics, and insurance invoicing.

## Features

- **User Management**: Role-based access (Admin/User) with scheduled activation
- **Dashboard**: Centralized view with navigation to all modules
- **Provider Management**: Manage ABA providers with signatures
- **Client Management**: Track clients and their insurance information
- **BCBA Management**: Manage Board Certified Behavior Analysts
- **Insurance Management**: Configure insurance rates (rate changes don't affect existing invoices)
- **Timesheet System**: Create, submit, approve, and lock timesheets with workflow
- **Automatic Invoicing**: Scheduled weekly invoice generation (Fridays at 4 PM ET)
- **Manual Invoicing**: Create invoices by date range
- **Payment Tracking**: Record payments with partial payment support
- **Advanced Analytics**: Visual charts (line, bar, pie, waterfall) with detailed filtering
- **Reports**: Generate PDF, CSV, and Excel reports
- **Audit Logs**: Complete audit trail for all critical actions
- **Notifications**: In-app notifications for important events

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **PDF Generation**: PDFKit
- **Scheduling**: node-cron
- **Deployment**: PM2 + Nginx

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL 14 or higher
- npm or yarn

## Installation

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd a-plus-center
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials and secrets
```

4. Set up the database:
```bash
npx prisma generate
npx prisma db push
# Or use migrations: npx prisma migrate dev
```

5. Create an admin user (you'll need to create a script for this):
```bash
npm run create-admin
```

6. Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Server Deployment

1. SSH into your server:
```bash
ssh root@66.94.105.43
```

2. Run the deployment script:
```bash
chmod +x deploy.sh
./deploy.sh
```

3. Upload your application files to `/var/www/aplus-center`

4. Configure environment variables:
```bash
cd /var/www/aplus-center
nano .env
# Update DATABASE_URL, NEXTAUTH_SECRET, etc.
```

5. Install dependencies and build:
```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

6. Start with PM2:
```bash
pm2 start deploy/pm2.config.js
pm2 save
pm2 startup
```

7. Configure Nginx:
```bash
cp deploy/nginx.conf /etc/nginx/sites-available/aplus-center
ln -s /etc/nginx/sites-available/aplus-center /etc/nginx/sites-enabled/
# Update server_name and SSL certificates
nginx -t
systemctl reload nginx
```

8. Set up SSL (optional but recommended):
```bash
apt-get install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Project Structure

```
a-plus-center/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── (auth)/            # Auth pages (login, etc.)
│   ├── dashboard/         # Dashboard page
│   ├── providers/         # Provider management
│   ├── clients/           # Client management
│   ├── bcbas/             # BCBA management
│   ├── insurance/         # Insurance management
│   ├── timesheets/        # Timesheet management
│   ├── invoices/          # Invoice management
│   ├── analytics/         # Analytics dashboard
│   ├── reports/           # Reports page
│   └── layout.tsx         # Root layout
├── components/            # React components
├── lib/                   # Utility functions
│   ├── prisma.ts         # Prisma client
│   ├── auth.ts           # NextAuth config
│   └── utils.ts          # Helper functions
├── prisma/               # Database schema
│   └── schema.prisma
├── types/                # TypeScript types
├── deploy/               # Deployment configs
└── public/               # Static assets
```

## Environment Variables

Required environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_URL`: Your application URL
- `NEXTAUTH_SECRET`: Secret for NextAuth (generate with `openssl rand -base64 32`)
- `NODE_ENV`: `development` or `production`
- `TZ`: Timezone (default: `America/New_York`)

## Password Requirements

User passwords must:
- Be 10-15 characters long
- Contain at least 1 uppercase letter
- Contain at least 1 lowercase letter
- Contain at least 1 special character

## Scheduled Jobs

The application includes automatic invoice generation:
- Runs every Friday at 4:00 PM America/New_York time
- Generates invoices for approved timesheets
- Locks related timesheets after invoicing

## License

Proprietary - All rights reserved

## Support

For issues or questions, please contact the development team.
