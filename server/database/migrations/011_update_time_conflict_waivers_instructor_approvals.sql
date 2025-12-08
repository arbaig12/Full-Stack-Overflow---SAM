-- ============================================
-- Migration 011: Update Time Conflict Waivers for Two Instructor Approvals
-- ============================================
-- 
-- Updates the time_conflict_waivers table to require separate approvals
-- from both instructors (one for class_id_1, one for class_id_2) instead
-- of a single instructor approval. This ensures both conflicting course
-- instructors must approve the time conflict waiver.
-- 
-- Created: 2025-12-08
-- 
-- Changes:
--   - Add instructor_1_approved, instructor_1_approved_by, instructor_1_approved_at columns
--   - Add instructor_2_approved, instructor_2_approved_by, instructor_2_approved_at columns
--   - Migrate existing data (if any) from old instructor_approved fields
--   - Drop old instructor_approved, instructor_approved_by, instructor_approved_at columns
-- 
-- ============================================

-- Step 1: Add new columns for instructor_1 approvals
ALTER TABLE time_conflict_waivers
  ADD COLUMN IF NOT EXISTS instructor_1_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS instructor_1_approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instructor_1_approved_at TIMESTAMP;

-- Step 2: Add new columns for instructor_2 approvals
ALTER TABLE time_conflict_waivers
  ADD COLUMN IF NOT EXISTS instructor_2_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS instructor_2_approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instructor_2_approved_at TIMESTAMP;

-- Step 3: Migrate existing data (if any) from old columns to new columns
-- If there was an existing approval, set both instructor approvals to the same value
-- This ensures backward compatibility with any existing waiver requests
UPDATE time_conflict_waivers
SET 
  instructor_1_approved = COALESCE(instructor_approved, FALSE),
  instructor_1_approved_by = instructor_approved_by,
  instructor_1_approved_at = instructor_approved_at,
  instructor_2_approved = COALESCE(instructor_approved, FALSE),
  instructor_2_approved_by = instructor_approved_by,
  instructor_2_approved_at = instructor_approved_at
WHERE instructor_approved IS NOT NULL 
  AND instructor_approved = TRUE
  AND (instructor_1_approved IS NULL OR instructor_1_approved = FALSE);

-- Step 4: Drop old columns (only if they exist)
DO $$
BEGIN
  -- Check if instructor_approved column exists before dropping
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_conflict_waivers' 
    AND column_name = 'instructor_approved'
  ) THEN
    ALTER TABLE time_conflict_waivers DROP COLUMN instructor_approved;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_conflict_waivers' 
    AND column_name = 'instructor_approved_by'
  ) THEN
    ALTER TABLE time_conflict_waivers DROP COLUMN instructor_approved_by;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_conflict_waivers' 
    AND column_name = 'instructor_approved_at'
  ) THEN
    ALTER TABLE time_conflict_waivers DROP COLUMN instructor_approved_at;
  END IF;
END $$;

