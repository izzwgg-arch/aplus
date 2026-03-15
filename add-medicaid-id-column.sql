-- Migration: Add medicaidId column to CommunityClient table
-- Run this on the server after deploying schema changes

-- Add medicaidId column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'CommunityClient' 
        AND column_name = 'medicaidId'
    ) THEN
        ALTER TABLE "CommunityClient" ADD COLUMN "medicaidId" TEXT;
        RAISE NOTICE 'Column medicaidId added to CommunityClient';
    ELSE
        RAISE NOTICE 'Column medicaidId already exists in CommunityClient';
    END IF;
END $$;
