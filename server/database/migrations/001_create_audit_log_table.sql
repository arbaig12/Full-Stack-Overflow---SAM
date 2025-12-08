-- ============================================
-- Create audit_log table
-- This table tracks all audit-worthy actions in the system
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    action_description TEXT NOT NULL,
    performed_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    entity_type VARCHAR(100),
    entity_id INTEGER,
    note TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_student_id 
    ON audit_log(student_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by 
    ON audit_log(performed_by);

CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at 
    ON audit_log(performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_type 
    ON audit_log(action_type);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity 
    ON audit_log(entity_type, entity_id) 
    WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

