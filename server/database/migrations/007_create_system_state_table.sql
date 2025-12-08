-- ============================================
-- Migration 007: Create system_state table
-- ============================================
-- 
-- Creates the system_state table to track the current term.
-- This table stores system-wide state information, primarily
-- the current academic term ID.
-- 
-- Created: 2024
-- 
-- Changes:
--   - Creates system_state table with current_term_id
--   - Adds index for efficient queries
-- 
-- ============================================

-- Create system_state table
CREATE TABLE IF NOT EXISTS system_state (
    system_state_id SERIAL PRIMARY KEY,
    current_term_id INTEGER REFERENCES terms(term_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient current term lookups
CREATE INDEX IF NOT EXISTS idx_system_state_current_term 
    ON system_state(current_term_id);

-- Insert initial row if table is empty (will be updated by registrar)
-- This ensures there's always at least one row to query
INSERT INTO system_state (current_term_id)
SELECT term_id 
FROM terms 
ORDER BY year DESC, 
  CASE semester::text
    WHEN 'Spring' THEN 1
    WHEN 'SummerI' THEN 2
    WHEN 'SummerII' THEN 3
    WHEN 'Fall' THEN 4
  END DESC
LIMIT 1
ON CONFLICT DO NOTHING;

