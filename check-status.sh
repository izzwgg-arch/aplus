#!/bin/bash
cd /var/www/aplus-center
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "📋 Recent Logs:"
pm2 logs aplus-center --lines 10 --nostream
