-- ============================================
-- Migration XXX: [DESCRIPTION]
-- ============================================
-- 
-- [Brief description of what this migration does]
-- 
-- Created: [Date]
-- Author: [Your name]
-- 
-- Changes:
--   - [List of changes made in this migration]
-- 
-- ============================================

-- Example: Create a new table
-- CREATE TABLE IF NOT EXISTS example_table (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(100) NOT NULL,
--     created_at TIMESTAMP DEFAULT NOW()
-- );

-- Example: Add an index
-- CREATE INDEX IF NOT EXISTS idx_example_name 
--     ON example_table(name);

-- Example: Add a column
-- ALTER TABLE existing_table 
--     ADD COLUMN IF NOT EXISTS new_column VARCHAR(50);

-- Example: Insert seed data
-- INSERT INTO example_table (name) 
-- VALUES ('Example 1'), ('Example 2')
-- ON CONFLICT DO NOTHING;

-- ============================================
-- Instructions:
-- ============================================
-- 1. Copy this file and rename it to: XXX_description.sql
--    where XXX is the next available migration number
-- 2. Replace [DESCRIPTION] and [Date] with actual values
-- 3. Write your SQL changes below
-- 4. Remove these instructions before committing
-- 5. Test with: npm run migrate
-- 6. Commit to git

