# SAM Backend API Routes Summary

## ✅ Completed Routes

### Import Routes (`/api/import`)
- `POST /api/import/users` - Import users from YAML
- `POST /api/import/catalog` - Scrape and import course catalog
- `POST /api/import/degree-requirements` - Import degree requirements YAML
- `POST /api/import/academic-calendar` - Import academic calendar YAML

### User Management (`/api/user-management`)
- `GET /api/user-management/registrars` - Get all registrars
- `GET /api/user-management/search` - Search users (by name, role, major/minor)
- `GET /api/user-management/:sbu_id/export` - Export user as YAML
- `GET /api/user-management/students` - Get all students
- `GET /api/user-management/instructors` - Get all instructors
- `GET /api/user-management/advisors` - Get all advisors

### Course Catalog (`/api/catalog`)
- `GET /api/catalog/courses` - Browse/search courses (filters: term_id, subject, course_num, search, department_id)
- `GET /api/catalog/courses/:course_id` - Get course details
- `GET /api/catalog/courses/:course_id/sections` - Get sections for a course in a term
- `GET /api/catalog/subjects` - Get all available subject codes

### Class Schedule & Registration (`/api/schedule`)
- `GET /api/schedule/sections` - Get sections for a term (filters: term_id, subject, course_num, instructor_id)
- `GET /api/schedule/sections/:class_id` - Get section details
- `GET /api/schedule/enrollments/:student_id` - Get student's enrollments (filters: term_id, status)
- `POST /api/schedule/enrollments` - Register for a course (body: student_id, class_id, gpnc)
- `DELETE /api/schedule/enrollments/:student_id/:class_id` - Withdraw from a course

### Student Profile (`/api/students`)
- `GET /api/students/:student_id/profile` - Get student profile
- `GET /api/students/:student_id/transcript` - Get student transcript with GPA
- `GET /api/students/:student_id/programs` - Get declared majors/minors

### Degree Progress (`/api/degree`)
- `GET /api/degree/students/:student_id/degree-progress` - Calculate degree progress
- `GET /api/degree/degree-requirements/:program_id` - Get degree requirements for a program

### Program Declaration (`/api/programs`)
- `GET /api/programs/programs` - Get available programs (filters: type, department_id, is_active)
- `POST /api/programs/students/:student_id/declare` - Declare major/minor
- `DELETE /api/programs/students/:student_id/declare/:program_id` - Undeclare program

### Academic Calendar (`/api/calendar`)
- `GET /api/calendar/terms` - Get all terms (filters: year, semester)
- `GET /api/calendar/terms/current` - Get current term
- `GET /api/calendar/academic-calendar/:term_id` - Get academic calendar for a term

### Rosters & Grading (`/api/rosters`)
- `GET /api/rosters/instructors/:instructor_id/sections` - Get instructor's sections
- `GET /api/rosters/sections/:class_id/roster` - Get class roster
- `PUT /api/rosters/enrollments/:student_id/:class_id/grade` - Submit/update grade
- `POST /api/rosters/sections/:class_id/grades` - Bulk update grades

## Database Schema Notes

Based on the database dump, the following tables are used:
- `users` - All system users
- `students` - Student-specific data
- `instructors` - Instructor data
- `advisors` - Advisor data
- `courses` - Course catalog
- `class_sections` - Course sections/offerings (uses `class_id` as primary key)
- `enrollments` - Student enrollments (status: 'registered', 'waitlisted', 'dropped', 'withdrawn', 'completed')
- `programs` - Academic programs (majors/minors)
- `student_programs` - Student program declarations
- `departments` - Academic departments
- `colleges` - Colleges
- `terms` - Academic terms
- `term_schedules` - Term schedule dates
- `academic_calendar` - Academic calendar dates (if exists)
- `degree_requirements` - Degree requirement definitions
- `rooms` - Room information

## Important Notes

1. **Enrollment Status**: The `enrollments` table uses enum `enrollment_status` with values: 'registered', 'waitlisted', 'dropped', 'withdrawn', 'completed'

2. **Class Sections**: The table uses `class_id` as primary key, not `section_id`

3. **Terms**: Terms are identified by `term_id` and have `semester` (enum) and `year` fields

4. **Port Configuration**: Database is configured for port 5433 in `.env`

## Testing the API

Start the server:
```bash
cd server
npm install
npm run dev
```

Test endpoints:
```bash
# Health check
curl http://localhost:4000/api/health

# DB check
curl http://localhost:4000/api/db-check

# Get terms
curl http://localhost:4000/api/calendar/terms

# Get courses
curl http://localhost:4000/api/catalog/courses
```

