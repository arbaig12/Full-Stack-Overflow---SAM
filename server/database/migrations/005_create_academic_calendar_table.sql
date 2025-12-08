-- ============================================
-- Migration 005: Create Academic Calendar Table
-- ============================================
-- 
-- Creates the academic_calendar table to store academic calendar dates
-- for each term (semester/year).
-- 
-- This table supports Section 3.4 requirements for importing and viewing
-- academic calendars from YAML files.
-- 
-- Created: 2025-01-XX
-- 
-- ============================================

CREATE TABLE IF NOT EXISTS academic_calendar (
    id SERIAL PRIMARY KEY,
    term JSONB NOT NULL,
    major_and_minor_changes_end DATE,
    waitlist DATE,
    waitlist_process_ends DATE,
    late_registration_ends DATE,
    GPNC_selection_ends DATE,
    course_withdrawal_ends DATE,
    major_and_minor_changes_begin DATE,
    advanced_registration_begins DATE,
    semester_end DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE academic_calendar IS 'Stores academic calendar dates and deadlines for each term';
COMMENT ON COLUMN academic_calendar.term IS 'JSONB object with semester and year, e.g., {"semester": "Fall", "year": 2025}';
COMMENT ON COLUMN academic_calendar.major_and_minor_changes_end IS 'Last day to change major/minor before semester starts';
COMMENT ON COLUMN academic_calendar.waitlist IS 'Last day to waitlist a class';
COMMENT ON COLUMN academic_calendar.waitlist_process_ends IS 'Last day waitlist processing occurs';
COMMENT ON COLUMN academic_calendar.late_registration_ends IS 'Last day for late registration';
COMMENT ON COLUMN academic_calendar.GPNC_selection_ends IS 'Last day to select GPNC grading option';
COMMENT ON COLUMN academic_calendar.course_withdrawal_ends IS 'Last day to withdraw from a course';
COMMENT ON COLUMN academic_calendar.major_and_minor_changes_begin IS 'First day major/minor changes reopen after semester starts';
COMMENT ON COLUMN academic_calendar.advanced_registration_begins IS 'First day of advanced registration for next semester';
COMMENT ON COLUMN academic_calendar.semester_end IS 'Last day of the semester';

-- Create unique index on term fields to prevent duplicates
-- This ensures only one academic calendar per semester/year combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_calendar_unique_term 
    ON academic_calendar ((term->>'semester'), (term->>'year'));

-- Create GIN index on term for faster JSONB queries
CREATE INDEX IF NOT EXISTS idx_academic_calendar_term 
    ON academic_calendar USING GIN (term);

-- Create index on term fields for faster queries
CREATE INDEX IF NOT EXISTS idx_academic_calendar_semester_year 
    ON academic_calendar ((term->>'semester'), (term->>'year'));

