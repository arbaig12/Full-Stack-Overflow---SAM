-- ============================================
-- Migration 002: Registration System Tables
-- ============================================
-- 
-- Adds tables for the comprehensive registration system:
-- - Time conflict waivers
-- - Prerequisite waivers
-- - Department permissions
-- - Registration schedules
-- - Capacity overrides
-- 
-- Note: registration_holds and waivers tables already exist
-- in the base schema, so they are not created here.

-- 1. Time Conflict Waivers Table
-- Note: The existing 'waivers' table is generic, but we need specific fields for time conflicts
-- Note: This schema was updated in migration 011 to require two separate instructor approvals
CREATE TABLE IF NOT EXISTS time_conflict_waivers (
    waiver_id SERIAL PRIMARY KEY,
    student_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    class_id_1 INTEGER NOT NULL REFERENCES class_sections(class_id) ON DELETE CASCADE,
    class_id_2 INTEGER NOT NULL REFERENCES class_sections(class_id) ON DELETE CASCADE,
    instructor_1_approved BOOLEAN DEFAULT FALSE,
    instructor_1_approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    instructor_1_approved_at TIMESTAMP,
    instructor_2_approved BOOLEAN DEFAULT FALSE,
    instructor_2_approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    instructor_2_approved_at TIMESTAMP,
    advisor_approved BOOLEAN DEFAULT FALSE,
    advisor_approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    advisor_approved_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT check_different_classes CHECK (class_id_1 != class_id_2),
    CONSTRAINT unique_waiver_request UNIQUE (student_user_id, class_id_1, class_id_2)
);

CREATE INDEX IF NOT EXISTS idx_time_conflict_waivers_student 
    ON time_conflict_waivers(student_user_id);
CREATE INDEX IF NOT EXISTS idx_time_conflict_waivers_status 
    ON time_conflict_waivers(status);

-- 2. Prerequisite Waivers Table
CREATE TABLE IF NOT EXISTS prerequisite_waivers (
    waiver_id SERIAL PRIMARY KEY,
    student_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    waived_course_code VARCHAR(20) NOT NULL, -- e.g., 'CSE 114'
    granted_by_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'denied')),
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_prereq_waiver UNIQUE (student_user_id, course_id, waived_course_code)
);

CREATE INDEX IF NOT EXISTS idx_prerequisite_waivers_student_course 
    ON prerequisite_waivers(student_user_id, course_id);

-- 3. Department Permissions Table
CREATE TABLE IF NOT EXISTS department_permissions (
    permission_id SERIAL PRIMARY KEY,
    student_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    granted_by_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'denied')),
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_department_permission UNIQUE (student_user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_department_permissions_student 
    ON department_permissions(student_user_id);
CREATE INDEX IF NOT EXISTS idx_department_permissions_course 
    ON department_permissions(course_id);

-- 4. Registration Schedules Table
CREATE TABLE IF NOT EXISTS registration_schedules (
    schedule_id SERIAL PRIMARY KEY,
    term_id INTEGER NOT NULL REFERENCES terms(term_id) ON DELETE CASCADE,
    class_standing VARCHAR(2) NOT NULL CHECK (class_standing IN ('U1', 'U2', 'U3', 'U4')),
    credit_threshold INTEGER, -- NULL means no credit threshold
    registration_start_date DATE NOT NULL,
    CONSTRAINT unique_registration_window UNIQUE (term_id, class_standing, credit_threshold)
);

CREATE INDEX IF NOT EXISTS idx_registration_schedules_term 
    ON registration_schedules(term_id);
CREATE INDEX IF NOT EXISTS idx_registration_schedules_term_standing 
    ON registration_schedules(term_id, class_standing);

-- 5. Capacity Overrides Table
CREATE TABLE IF NOT EXISTS capacity_overrides (
    override_id SERIAL PRIMARY KEY,
    student_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES class_sections(class_id) ON DELETE CASCADE,
    granted_by_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_capacity_override UNIQUE (student_user_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_capacity_overrides_student 
    ON capacity_overrides(student_user_id);
CREATE INDEX IF NOT EXISTS idx_capacity_overrides_class 
    ON capacity_overrides(class_id);

