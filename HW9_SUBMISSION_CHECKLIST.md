# HW9-Code3 Submission Checklist

## ✅ COMPLETED

### Implementation
- [x] **Route files created and compliant** - All routes follow project requirements
  - Course catalog routes with prerequisites, corequisites, SBCs, Classie URL
  - Class schedule routes with meeting times/days and filters
  - Academic calendar routes with date wrapper
  - All other required routes (degree progress, program declaration, rosters, etc.)
- [x] **Date wrapper utility** - Created for Section 9.3 compliance
- [x] **Documentation** - API summary, compliance fixes, verification checklist

### Code Quality
- [x] **No linter errors** - All files pass linting
- [x] **Code pushed to repository** - All changes committed and pushed

## ❌ STILL NEEDED

### 1. Implementation Status Report (IGS)
- [ ] **Create/Update Implementation Grading Sheet (IGS)**
  - Include "hw6 actual" and "hw7 actual" scores from graded submissions
  - Fill "hw9 claimed" column with cumulative points (including hw6 and hw7)
  - Prefix new comments with "hw9:"
  - Should show 100% implementation (84+ points)

### 2. AI Report
- [ ] **Create/Update AI Report**
  - If exists from hw7-code2, append hw9 experience
  - If new, create cumulative report including hw9
  - File name: `TEAM_NAME-AI-report.*` (e.g., `.md` or `.txt`)
  - Optional: Create `AI-report-share.*` for sharing (can be anonymized)

### 3. Automated Testing (90% Coverage Required)
- [ ] **Backend Testing** - Need 90% coverage
  - Current: Only `server/tests/userRoutes.test.js` exists
  - Need tests for:
    - Course catalog routes
    - Class schedule routes
    - Academic calendar routes
    - Degree progress routes
    - Program declaration routes
    - Rosters/grading routes
    - Student profile routes
    - Import routes
- [ ] **Frontend Testing** - Need 90% coverage
  - Current: Only `src/test/declare_test.jsx` exists
  - Need tests for all pages/components:
    - CourseCatalog.jsx
    - RegistrationSchedule.jsx
    - DegreeProgress.jsx
    - StudentProfile.jsx
    - Dashboard.jsx
    - ImportPage.jsx
    - RostersGrading.jsx
    - UserManage.jsx
    - DeclareMajor.jsx
    - Plan.jsx
- [ ] **Test Report** - Generate coverage report
  - Backend: `cd server && npm run coverage`
  - Frontend: `npm test -- --coverage`
  - Document coverage percentages

### 4. Design Document
- [ ] **Update Design Document** (same structure as hw7-code2)
  - Update content as appropriate for hw9
  - Include architecture, database schema, API design, etc.

### 5. Video
- [ ] **Create/Update Video** (omits Step 1, replaced by live demo)
  - Step 2: Automated testing demonstration
  - Step 3: Code walkthrough
  - Step 4: Architecture overview
  - Step 5: Future work/discussion

### 6. Demo Preparation
- [ ] **Prepare Database** with:
  - One or more team members as registrars
  - Scraped Fall 2025 course descriptions for: PSY, ECO, AMS, POL, ARH, CHE, CHI, EGL, HIS, PHI, PHY, SOC, SPN, WRT
  - Imported Fall 2025 and Spring 2026 class schedules for: PSY, ECO, AMS, POL
- [ ] **Save files on server:**
  - `rooms1.yaml`
  - `graduation_requirements.yaml`
- [ ] **Prepare hash file** (if using option 2a):
  - Create `TEAM_NAME-hw9-hash.txt` with hash command and result
  - Use provided commands (Linux/macOS/Windows)

### 7. Submission Files
- [ ] **Create submission zip** with:
  - All implementation files
  - Design document
  - IGS (Implementation Grading Sheet)
  - AI report
  - Test reports (coverage)
  - Video file or link
  - Any other required documentation
- [ ] **Upload separately** (if using option 2a):
  - `TEAM_NAME-hw9-hash.txt`

## Priority Actions

1. **HIGH PRIORITY** - Create comprehensive test suite (90% coverage)
2. **HIGH PRIORITY** - Create/update IGS with claimed points
3. **HIGH PRIORITY** - Create/update AI report
4. **MEDIUM PRIORITY** - Update design document
5. **MEDIUM PRIORITY** - Create video
6. **LOW PRIORITY** - Prepare demo database (can be done closer to demo)

## Notes

- Implementation is complete and compliant with requirements
- Testing coverage is the main gap - need to expand test suites significantly
- Documentation needs to be created/updated
- Demo preparation can be done closer to the demo date

