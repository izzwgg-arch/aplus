-- The BT's own observation of the session, required before a BT session
-- note counts as written. Nullable: notes created before this column existed
-- (and a freshly generated note, which the BT has not opened yet) have none.
ALTER TABLE "Note" ADD COLUMN "btObservation" TEXT;
