-- A staff/provider record can now exist without an email address, so a name
-- that only ever needs to appear as the provider on a session or note can be
-- added without creating a login. The unique index is kept: Postgres treats
-- NULLs as distinct, so any number of login-less records can coexist.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
