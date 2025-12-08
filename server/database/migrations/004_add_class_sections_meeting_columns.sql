-- ============================================
-- Migration 004: Add Meeting Days/Times to Class Sections
-- ============================================
-- 
-- Adds columns to the class_sections table to support meeting schedule information:
-- - meeting_days: Days of the week when the class meets (e.g., "Tue,Thu" or "Mon,Wed,Fri")
-- - meeting_times: Time range when the class meets (e.g., "2:00-3:20 PM")
-- 
-- These columns are used throughout the application for:
-- - Displaying class schedules
-- - Checking time conflicts during registration
-- - Building student schedules
-- 
-- Created: 2025-01-XX
-- 
-- ============================================

ALTER TABLE class_sections 
  ADD COLUMN IF NOT EXISTS meeting_days VARCHAR(50),
  ADD COLUMN IF NOT EXISTS meeting_times VARCHAR(100);

-- Add comments for documentation
COMMENT ON COLUMN class_sections.meeting_days IS 'Days of the week when the class meets (e.g., "Tue,Thu", "Mon,Wed,Fri")';
COMMENT ON COLUMN class_sections.meeting_times IS 'Time range when the class meets (e.g., "2:00-3:20 PM", "10:00 AM-11:20 AM")';

