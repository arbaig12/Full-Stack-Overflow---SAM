-- ============================================
-- Migration 005: Add Multiple Instructors Support
-- ============================================
-- 
-- Adds a junction table to support multiple instructors per class section.
-- This allows sections like ECO 383-01 to have multiple instructors
-- (e.g., Jiaxu Han, Xudong Zheng, and Juan Conesa).
-- 
-- Created: 2025-01-XX
-- 
-- ============================================

-- Create junction table for multiple instructors per section
CREATE TABLE IF NOT EXISTS class_section_instructors (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES class_sections(class_id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_section_instructor UNIQUE (class_id, instructor_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_class_section_instructors_class_id 
    ON class_section_instructors(class_id);
CREATE INDEX IF NOT EXISTS idx_class_section_instructors_instructor_id 
    ON class_section_instructors(instructor_id);

-- Migrate existing instructor_id from class_sections to junction table
-- This preserves existing data
INSERT INTO class_section_instructors (class_id, instructor_id)
SELECT class_id, instructor_id
FROM class_sections
WHERE instructor_id IS NOT NULL
ON CONFLICT (class_id, instructor_id) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE class_section_instructors IS 'Junction table linking class sections to instructors. Supports multiple instructors per section.';
COMMENT ON COLUMN class_section_instructors.class_id IS 'Foreign key to class_sections';
COMMENT ON COLUMN class_section_instructors.instructor_id IS 'Foreign key to users (instructors)';

