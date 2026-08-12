-- AlterTable
ALTER TABLE "ReminderGlobalSettings" ADD COLUMN "defaultReminderProviderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ReminderGlobalSettings_defaultReminderProviderId_key" ON "ReminderGlobalSettings"("defaultReminderProviderId");

-- AddForeignKey
ALTER TABLE "ReminderGlobalSettings" ADD CONSTRAINT "ReminderGlobalSettings_defaultReminderProviderId_fkey" FOREIGN KEY ("defaultReminderProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
