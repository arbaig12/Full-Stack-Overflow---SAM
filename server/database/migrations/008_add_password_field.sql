-- ============================================
-- Migration 008: Add password field to users table
-- ============================================
-- 
-- Adds a password_hash field to the users table to support
-- bypass authentication for testing/demo purposes.
-- This allows password-based login when ENABLE_AUTH_BYPASS is enabled.
-- 
-- Created: 2025-12-06
-- 
-- Changes:
--   - Adds password_hash column to users table (nullable, for backwards compatibility)
--   - Passwords are stored as plain text for demo/testing simplicity
--   - In production, passwords would be hashed (e.g., using bcrypt)
-- 
-- ============================================

-- Add password_hash column to users table
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Note: For demo/testing purposes, we'll store passwords as plain text.
-- In production, this should be hashed using bcrypt or similar.
-- The migration runner will handle this automatically if column doesn't exist.

