-- ============================================
-- Migration 003: Add Course Catalog Columns
-- ============================================
-- 
-- Adds columns to the courses table to support course catalog scraping:
-- - prerequisites: Course prerequisites text
-- - corequisites: Course corequisites text
-- - anti_requisites: Course anti-requisites text
-- - advisory_prerequisites: Advisory prerequisites text
-- - sbc: Stony Brook Curriculum (SBC) designations

ALTER TABLE courses 
  ADD COLUMN IF NOT EXISTS prerequisites TEXT,
  ADD COLUMN IF NOT EXISTS corequisites TEXT,
  ADD COLUMN IF NOT EXISTS anti_requisites TEXT,
  ADD COLUMN IF NOT EXISTS advisory_prerequisites TEXT,
  ADD COLUMN IF NOT EXISTS sbc TEXT;

