-- ============================================
-- Migration 010: Create Academic Plans Tables
-- ============================================
-- 
-- Creates three tables to support academic planning for students:
-- 1. academic_plans - one saved plan per user (student)
-- 2. academic_plan_terms - terms inside that plan
-- 3. academic_plan_courses - courses inside each term
-- 
-- Includes triggers to ensure only students can have plans and
-- to automatically update timestamps.
-- 
-- Created: 2025-01-XX
-- 
-- ============================================

-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS public.academic_plan_courses CASCADE;
DROP TABLE IF EXISTS public.academic_plan_terms CASCADE;
DROP TABLE IF EXISTS public.academic_plans CASCADE;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.ensure_user_is_student() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

-- 1) One saved plan per user (student)
CREATE TABLE IF NOT EXISTS public.academic_plans (
  plan_id        BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL,
  graduation_semester VARCHAR(20),
  graduation_year INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_plans_user_id_key UNIQUE (user_id),
  CONSTRAINT academic_plans_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(user_id)
    ON DELETE CASCADE
);

-- 2) Terms inside that plan
CREATE TABLE IF NOT EXISTS public.academic_plan_terms (
  plan_term_id   BIGSERIAL PRIMARY KEY,
  plan_id        BIGINT NOT NULL,
  semester       VARCHAR(20) NOT NULL,
  year           INT NOT NULL,
  workload_limit NUMERIC(4,1) NOT NULL DEFAULT 15,
  sort_index     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_plan_terms_plan_id_fkey
    FOREIGN KEY (plan_id) REFERENCES public.academic_plans(plan_id)
    ON DELETE CASCADE,
  CONSTRAINT academic_plan_terms_unique_term UNIQUE (plan_id, semester, year)
);

-- 3) Courses inside each term
CREATE TABLE IF NOT EXISTS public.academic_plan_courses (
  plan_course_id BIGSERIAL PRIMARY KEY,
  plan_term_id   BIGINT NOT NULL,
  course_id      BIGINT NOT NULL,
  credits        NUMERIC(4,1) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_plan_courses_plan_term_id_fkey
    FOREIGN KEY (plan_term_id) REFERENCES public.academic_plan_terms(plan_term_id)
    ON DELETE CASCADE,
  CONSTRAINT academic_plan_courses_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id)
    ON DELETE RESTRICT,
  CONSTRAINT academic_plan_courses_unique UNIQUE (plan_term_id, course_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_academic_plan_terms_plan_id
  ON public.academic_plan_terms(plan_id);

CREATE INDEX IF NOT EXISTS idx_academic_plan_courses_plan_term_id
  ON public.academic_plan_courses(plan_term_id);

-- (Optional but recommended) prevent non-students from having plans
-- Adjust 'student' to match your enum labels in user_role.
CREATE OR REPLACE FUNCTION public.ensure_user_is_student()
RETURNS trigger AS $$
DECLARE r user_role;
BEGIN
  SELECT role INTO r FROM public.users WHERE user_id = NEW.user_id;
  IF r IS NULL THEN
    RAISE EXCEPTION 'User % not found', NEW.user_id;
  END IF;
  IF lower(r::text) <> 'student' THEN
    RAISE EXCEPTION 'User % is not a student (role=%)', NEW.user_id, r::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers with conditional creation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_academic_plans_student_only') THEN
    CREATE TRIGGER trg_academic_plans_student_only
    BEFORE INSERT OR UPDATE ON public.academic_plans
    FOR EACH ROW EXECUTE FUNCTION public.ensure_user_is_student();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_academic_plans_updated_at') THEN
    CREATE TRIGGER trg_academic_plans_updated_at
    BEFORE UPDATE ON public.academic_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_academic_plan_terms_updated_at') THEN
    CREATE TRIGGER trg_academic_plan_terms_updated_at
    BEFORE UPDATE ON public.academic_plan_terms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_academic_plan_courses_updated_at') THEN
    CREATE TRIGGER trg_academic_plan_courses_updated_at
    BEFORE UPDATE ON public.academic_plan_courses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE public.academic_plans IS 'Stores one academic plan per student user';
COMMENT ON TABLE public.academic_plan_terms IS 'Stores terms within each academic plan';
COMMENT ON TABLE public.academic_plan_courses IS 'Stores courses within each term of an academic plan';
COMMENT ON COLUMN public.academic_plans.graduation_semester IS 'Expected graduation semester (e.g., Fall, Spring)';
COMMENT ON COLUMN public.academic_plans.graduation_year IS 'Expected graduation year';
COMMENT ON COLUMN public.academic_plan_terms.workload_limit IS 'Maximum credits allowed for this term';
COMMENT ON COLUMN public.academic_plan_terms.sort_index IS 'Ordering index for terms within a plan';

