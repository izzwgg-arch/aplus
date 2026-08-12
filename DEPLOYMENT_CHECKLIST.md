# A+ Center VPS Deployment Checklist

## 1) First-time setup on server

```bash
cd /opt/aba
git pull origin main
bash setup-production.sh /opt/aba
```

## 2) Environment values (required)

Edit `server/.env` and set:
- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`
- `APP_BASE_URL` and `API_BASE_URL` (public URL)

## 3) Database migration

```bash
cd /opt/aba
npm run prisma:generate
npm run prisma:migrate
```

## 4) PM2 process

```bash
cd /opt/aba
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
pm2 status
```

## 5) Nginx reverse proxy

Copy `deploy/nginx.aplus-center.conf` to `/etc/nginx/sites-available/aplus-center`,
enable it, test config, reload nginx.

## 6) Smoke checks

```bash
curl -I http://127.0.0.1:4000/api/health
curl -I http://127.0.0.1:4000/api/health/db
```

Expected:
- `/api/health` => 200
- `/api/health/db` => 200

## 7) Routine deploy

```bash
cd /opt/aba
./deploy.sh
```
