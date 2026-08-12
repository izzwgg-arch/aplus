# Smart Steps – production deploy

- **Server:** 91.229.245.143 (root)
- **App dir:** `/var/www/aplus/aplus-center-scheduling/smart-steps`
- **PM2:** `smart-steps` (port 3001)

## After deploy

1. **SSO (no separate password):**  
   Edit `/var/www/aplus/aplus-center-scheduling/smart-steps/.env.local` and set  
   `APLUS_JWT_SECRET` to the same value as the main A+ app `JWT_SECRET`.  
   Then: `pm2 restart smart-steps`

2. **Nginx:**  
   Add the proxy from `nginx-smart-steps.conf` to your site (e.g. `app.apluscentercinc.org`),  
   then: `sudo nginx -t && sudo systemctl reload nginx`

3. **Open firewall (if needed):**  
   Port 3001 only needs to be reachable from localhost if using Nginx proxy.

## Commands on server

```bash
cd /var/www/aplus/aplus-center-scheduling/smart-steps
pm2 logs smart-steps
pm2 restart smart-steps
```
