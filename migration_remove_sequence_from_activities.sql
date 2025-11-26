-- Migration: Remove sequence column from app_activities and app_house_activities tables
-- Run this SQL script on your existing database to remove the sequence column
-- WARNING: This will modify existing tables. Backup your data first!

-- Step 1: Drop indexes on sequence column

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_activities_sequence'
    ) THEN
        EXECUTE 'DROP INDEX idx_activities_sequence';
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_house_activities_sequence'
    ) THEN
        EXECUTE 'DROP INDEX idx_house_activities_sequence';
    END IF;
END$$;

-- Step 2: Drop sequence column from app_house_activities table
ALTER TABLE app_house_activities
DROP COLUMN IF EXISTS sequence;

-- Step 3: Drop sequence column from app_activities table
ALTER TABLE app_activities
DROP COLUMN IF EXISTS sequence;

-- Note: After running this migration, the sequence property will no longer be available
-- in the app_activities and app_house_activities tables or in the API responses.
-- Activities will now be ordered by num instead of sequence.

