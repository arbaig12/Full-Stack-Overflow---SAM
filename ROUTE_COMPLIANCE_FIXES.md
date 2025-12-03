# Route Compliance Fixes - SAM Project Requirements

This document summarizes the changes made to ensure all routes comply with the SAM project requirements.

## Summary of Changes

### 1. Course Catalog Routes (`server/routes/courseCatalogRoutes.js`)

#### ✅ Section 3.1 - Course Catalog Information
- **Added prerequisites, corequisites, anti-requisites, and advisory prerequisites** to course responses
- **Added SBC (Stony Brook Curriculum) designations** to course responses
- **Added Classie evaluations URL** - automatically generated for each course (e.g., `https://classie-evals.stonybrook.edu/?SearchKeyword=CSE416&SearchTerm=ALL`)
- **Implemented fallback to nearest term catalog** - When a course catalog doesn't exist for a requested term, the system now uses the nearest available term's catalog (as required by Section 3.1)

#### ✅ Section 3.3 - Search Functionality
- **Added SBC filter** - Courses can now be filtered by SBC designation (e.g., `?sbc=TECH`)
- **Enhanced search** - Search now includes all course fields including prerequisites and SBCs

**Updated Endpoints:**
- `GET /api/catalog/courses` - Now includes prerequisites, corequisites, anti-requisites, SBCs, and Classie URL
- `GET /api/catalog/courses/:course_id` - Now includes all course requirement information

### 2. Class Schedule Routes (`server/routes/classScheduleRoutes.js`)

#### ✅ Section 3.3 - Class Schedule Search
- **Added meeting days and times** - Class sections now include `meetingDays` and `meetingTimes` fields
- **Added SBC filter** - Class schedules can be filtered by SBC (e.g., `?sbc=TECH`)
- **Added days-of-week filter** - Class schedules can be filtered by meeting days (e.g., `?days=Tue,Thu,Fri`)

**Updated Endpoints:**
- `GET /api/schedule/sections` - Now includes meeting days/times and supports SBC and days-of-week filtering
- `GET /api/schedule/sections/:class_id` - Now includes meeting days/times and SBC information

### 3. Academic Calendar Routes (`server/routes/academicCalendarRoutes.js`)

#### ✅ Section 9.3 - Current Date Configuration
- **Fixed date handling** - Now uses the date wrapper utility instead of `new Date()` directly
- **Created date wrapper utility** - `server/utils/dateWrapper.js` provides a configurable date function for testing

**Updated Endpoints:**
- `GET /api/calendar/terms/current` - Now uses `getCurrentDate()` from date wrapper

### 4. New Utility: Date Wrapper (`server/utils/dateWrapper.js`)

Created a new utility module that:
- Provides `getCurrentDate()` function that returns either the actual current date or a custom date for testing
- Supports `setCustomDate(dateString)` to set a custom date (for registrars to configure per Section 9.3)
- Provides `getCurrentDateString()` for formatted date strings

## Database Schema Assumptions

The following columns are assumed to exist in the database:

### `courses` table:
- `prerequisites` (TEXT) - Prerequisites text
- `corequisites` (TEXT) - Corequisites text
- `anti_requisites` (TEXT) - Anti-requisites text
- `advisory_prerequisites` (TEXT) - Advisory prerequisites text
- `sbc` (TEXT) - SBC designations (comma-separated or space-separated)

### `class_sections` table:
- `meeting_days` (TEXT) - Days of week (e.g., "Tue,Thu" or "Mon/Wed/Fri")
- `meeting_times` (TEXT) - Meeting times (e.g., "2:00-3:20 PM")

**Note:** If these columns don't exist, you'll need to add them to your database schema. The code uses `COALESCE()` to handle NULL values gracefully.

## Testing Recommendations

1. **Test SBC filtering**: Try `GET /api/catalog/courses?sbc=TECH` to filter courses by SBC
2. **Test days-of-week filtering**: Try `GET /api/schedule/sections?term_id=1&days=Tue,Thu`
3. **Test fallback catalog**: Request a term that doesn't have a catalog and verify it uses the nearest available term
4. **Test date wrapper**: Configure a custom date and verify the current term endpoint uses it

## Remaining Requirements

While these fixes address the core route requirements, there are additional features mentioned in the requirements that may need separate implementation:

- **Section 3.2**: Import class schedule from PDF (separate import route needed)
- **Section 6**: Registration functionality (prerequisites enforcement, time conflicts, holds, waitlists)
- **Section 7**: Incomplete grade handling (I → I/F after 6 months)
- **Section 5**: Complete student profile with audit logs, term GPA, etc.
- **Section 8**: Class schedule planning and auto-planner

These are beyond the scope of the route fixes but should be implemented separately.

