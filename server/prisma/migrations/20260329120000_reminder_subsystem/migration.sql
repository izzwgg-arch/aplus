-- Reminder subsystem: enums, tables, Appointment columns (additive only)

CREATE TYPE "ReminderTargetType" AS ENUM ('CLIENT', 'PROVIDER');
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "ReminderJobStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');
CREATE TYPE "ReminderTemplateKey" AS ENUM ('CLIENT_EMAIL', 'CLIENT_SMS', 'PROVIDER_EMAIL', 'PROVIDER_SMS');

ALTER TABLE "Appointment" ADD COLUMN "remindersUseDefaults" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Appointment" ADD COLUMN "reminderEmailEnabledOverride" BOOLEAN;
ALTER TABLE "Appointment" ADD COLUMN "reminderSmsEnabledOverride" BOOLEAN;
ALTER TABLE "Appointment" ADD COLUMN "remindClientOverride" BOOLEAN;
ALTER TABLE "Appointment" ADD COLUMN "remindProviderOverride" BOOLEAN;
ALTER TABLE "Appointment" ADD COLUMN "reminderOffsetsOverrideJson" TEXT;

CREATE TABLE "ReminderGlobalSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "remindersEnabledGlobal" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabledByDefault" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabledByDefault" BOOLEAN NOT NULL DEFAULT false,
    "smsProviderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voipmsDid" TEXT,
    "remindClientByDefault" BOOLEAN NOT NULL DEFAULT true,
    "remindProviderByDefault" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "sendWindowStartMinutes" INTEGER NOT NULL DEFAULT 480,
    "sendWindowEndMinutes" INTEGER NOT NULL DEFAULT 1200,
    "defaultOffsetsJson" TEXT NOT NULL DEFAULT '[{"value":24,"unit":"HOURS"},{"value":2,"unit":"HOURS"},{"value":30,"unit":"MINUTES"}]',
    "retryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelayMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastSmsTestAt" TIMESTAMP(3),
    "lastSmsTestResult" TEXT,
    "lastSmsTestOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderGlobalSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderTemplate" (
    "id" TEXT NOT NULL,
    "templateKey" "ReminderTemplateKey" NOT NULL,
    "subject" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderTemplate_templateKey_key" ON "ReminderTemplate"("templateKey");

CREATE TABLE "ClientCommunicationPreference" (
    "clientId" TEXT NOT NULL,
    "emailRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preferredChannel" TEXT NOT NULL DEFAULT 'BOTH',
    "smsOptOut" BOOLEAN NOT NULL DEFAULT false,
    "smsOptOutAt" TIMESTAMP(3),
    "reminderNotes" TEXT,

    CONSTRAINT "ClientCommunicationPreference_pkey" PRIMARY KEY ("clientId")
);

CREATE TABLE "ProviderCommunicationPreference" (
    "providerId" TEXT NOT NULL,
    "emailRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" TEXT NOT NULL DEFAULT 'EMAIL',

    CONSTRAINT "ProviderCommunicationPreference_pkey" PRIMARY KEY ("providerId")
);

CREATE TABLE "ReminderJob" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "targetType" "ReminderTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "templateKey" "ReminderTemplateKey",
    "destinationMasked" TEXT,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderJob_dedupeKey_key" ON "ReminderJob"("dedupeKey");
CREATE INDEX "ReminderJob_status_scheduledFor_idx" ON "ReminderJob"("status", "scheduledFor");
CREATE INDEX "ReminderJob_appointmentId_idx" ON "ReminderJob"("appointmentId");

CREATE TABLE "InboundSmsEvent" (
    "id" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT,
    "body" TEXT NOT NULL,
    "rawPayload" JSONB,
    "action" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundSmsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboundSmsEvent_fromNumber_idx" ON "InboundSmsEvent"("fromNumber");
CREATE INDEX "InboundSmsEvent_createdAt_idx" ON "InboundSmsEvent"("createdAt");

ALTER TABLE "ClientCommunicationPreference" ADD CONSTRAINT "ClientCommunicationPreference_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderCommunicationPreference" ADD CONSTRAINT "ProviderCommunicationPreference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ReminderGlobalSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
