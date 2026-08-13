echo "=== all SmartSteps users with role + appRoleId + appRole active status ==="
sudo -u postgres psql -d aba_db -c "
SET search_path TO public;
SELECT u.id, u.email, u.role, u.\"appRoleId\", ar.key AS approle_key, ar.\"isActive\" AS approle_active
FROM \"User\" u
LEFT JOIN \"AppRole\" ar ON ar.id = u.\"appRoleId\"
ORDER BY u.role;
"
echo "=== recent errors from smart-steps referencing permissions ==="
grep -i "permission" /root/.pm2/logs/smart-steps-error.log | tail -30
echo "=== recent /api/permissions/me access in out log ==="
grep -i "permissions/me" /root/.pm2/logs/smart-steps-out.log | tail -20
