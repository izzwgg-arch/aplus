-- When the supervising BCBA was actually present during a BT session.
-- Optional: NULL means the supervision covered the whole session window.
-- A direct-supervision (DSU) note takes its Time In / Time Out from this.
ALTER TABLE "Session" ADD COLUMN "supervisionStartedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "supervisionEndedAt" TIMESTAMP(3);
