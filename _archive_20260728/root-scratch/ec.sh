#!/bin/bash
cd /var/www/aplus/aplus-center-scheduling/smart-steps
DBURL=$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | cut -d'?' -f1)
psql "$DBURL" -f /var/www/aplus/_email_check.sql
