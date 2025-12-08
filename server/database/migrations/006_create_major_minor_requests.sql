-- ============================================
-- Migration 006: Create Major/Minor Requests Table
-- ============================================
-- 
-- Creates the major_minor_requests table to support the advisor approval workflow
-- for major/minor declarations. Students submit requests, and advisors approve/deny them.
-- 
-- This table supports Section 4.2 requirements for declaring majors and minors
-- with advisor approval and effective term handling.
-- 
-- Created: 2025-01-XX
-- 
-- ============================================

CREATE TABLE IF NOT EXISTS major_minor_requests (
    request_id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(program_id) ON DELETE CASCADE,
    request_type VARCHAR(10) NOT NULL CHECK (request_type IN ('DECLARE', 'DROP')),
    effective_term_id INTEGER REFERENCES terms(term_id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    denied_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    denied_at TIMESTAMP,
    denial_reason TEXT
);

-- Create unique partial index for pending requests (prevents duplicate pending requests)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_request 
    ON major_minor_requests(student_id, program_id, request_type) 
    WHERE status = 'pending';

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_major_minor_requests_student 
    ON major_minor_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_major_minor_requests_program 
    ON major_minor_requests(program_id);
CREATE INDEX IF NOT EXISTS idx_major_minor_requests_status 
    ON major_minor_requests(status);
CREATE INDEX IF NOT EXISTS idx_major_minor_requests_approved_by 
    ON major_minor_requests(approved_by) WHERE approved_by IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE major_minor_requests IS 'Stores requests to declare or drop majors/minors, requiring advisor approval';
COMMENT ON COLUMN major_minor_requests.request_type IS 'Type of request: DECLARE (add major/minor) or DROP (remove major/minor)';
COMMENT ON COLUMN major_minor_requests.effective_term_id IS 'Term when the declaration should take effect (NULL means immediate)';
COMMENT ON COLUMN major_minor_requests.status IS 'Request status: pending, approved, or denied';
COMMENT ON COLUMN major_minor_requests.denial_reason IS 'Optional reason provided when denying a request';

