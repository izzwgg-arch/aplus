\echo === OrganizationSettings email config (no secret shown) ===
SELECT "emailEnabled", "emailFromAddress", "emailUser", "smtpHost", "smtpPort", "smtpSecure", ("smtpPasswordEnc" IS NOT NULL) AS has_pw
FROM "OrganizationSettings";
\echo === Recent email test audit entries ===
SELECT action, details, "createdAt"
FROM "AuditEntry"
WHERE action IN ('EMAIL_TEST_CONNECTION','EMAIL_TEST_SEND')
ORDER BY "createdAt" DESC
LIMIT 8;
