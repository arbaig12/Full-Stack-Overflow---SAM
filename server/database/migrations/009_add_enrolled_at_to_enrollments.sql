-- ============================================
-- Migration 009: Add enrolled_at Column to Enrollments
-- ============================================
-- 
-- Adds the enrolled_at column to the enrollments table to track when
-- a student enrolled in a class. This column is used by:
-- - importRoutes.js for importing student class data
-- - registrationScheduleRoutes.js for registration tracking
-- - dashboardRoutes.js for displaying enrollment history
-- 
-- Created: 2025-01-XX
-- 
-- ============================================

ALTER TABLE enrollments 
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMP DEFAULT NOW();

-- Add comment for documentation
COMMENT ON COLUMN enrollments.enrolled_at IS 'Timestamp when the student enrolled in the class';

-- Update existing rows that don't have enrolled_at set
-- Try to use added_at if that column exists, otherwise use updated_at, otherwise use NOW()
-- Note: This will only work if added_at column exists. If it doesn't, the COALESCE will use updated_at or NOW()
DO $$
BEGIN
  -- Check if added_at column exists and use it, otherwise use updated_at or NOW()
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'enrollments' AND column_name = 'added_at'
  ) THEN
    EXECUTE 'UPDATE enrollments SET enrolled_at = COALESCE(added_at, updated_at, NOW()) WHERE enrolled_at IS NULL';
  ELSE
    EXECUTE 'UPDATE enrollments SET enrolled_at = COALESCE(updated_at, NOW()) WHERE enrolled_at IS NULL';
  END IF;
END $$;

