/**
 * @file classScheduleRoutes.js
 * @description Express routes for class schedule and registration functionality.
 * Handles:
 *   - Viewing available course sections for a term
 *   - Student registration for courses
 *   - Viewing student's enrolled courses
 *   - Course withdrawal
 *   - Waitlist management
 */

import { Router } from 'express';

const router = Router();

/**
 * Helper function to extract building and room from location text
 * (used to clean location_text that may contain instructor names)
 * Examples: "HUMANITIES 1006Ryan Kaufman" -> {building: "HUMANITIES", room: "1006"}
 *           "FREY HALL 317 Scott Stoller" -> {building: "FREY HALL", room: "317"}
 */
function extractBuildingRoomFromText(locationText) {
  if (!locationText) return { building: null, room: null };
  let s = String(locationText).trim();
  if (!s) return { building: null, room: null };

  // Handle special case: "TBATBA" followed by instructor name - no real location
  if (/^TBATBA/i.test(s)) {
    return { building: null, room: null };
  }

  // Remove "TBA" if it's at the start or end
  s = s.replace(/^TBA\s+/i, '').replace(/\s+TBA$/i, '').trim();
  if (!s || s.toUpperCase() === 'TBA') return { building: null, room: null };

  // Remove "TBA" if it's concatenated at the end (e.g., "4530TBA" -> "4530")
  s = s.replace(/TBA$/i, '').trim();
  if (!s) return { building: null, room: null };

  // Split by spaces first
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return { building: null, room: null };
  
  // Look for room number pattern: alphanumeric with digits, 1-8 chars
  // Room can be concatenated with instructor (e.g., "1006Ryan", "143Hyun-Kyung", "S235SMichael") or separate
  for (let idx = 1; idx < tokens.length; idx++) {
    let tok = tokens[idx];
    
    // Remove "TBA" if concatenated at end of token
    tok = tok.replace(/TBA$/i, '');
    if (!tok) continue;
    
    // Check if this token contains a room number (has digits)
    if (/\d/.test(tok)) {
      // Pattern 1: Room concatenated with instructor name
      // Match: room number (alphanumeric with digits) followed by capital letter + lowercase (name start)
      // Examples: "1006Ryan", "143Hyun", "S235SMichael", "001William", "CENTR103Alan"
      const concatMatch = tok.match(/^([A-Z0-9]*\d+[A-Z0-9]*?)([A-Z][a-z].*)$/);
      if (concatMatch) {
        let room = concatMatch[1];
        // If room ends with a single letter and next part is instructor name, remove trailing letter
        // (e.g., "S235S" + "Michael" -> room should be "S235", not "S235S")
        if (/[A-Z]$/.test(room) && room.length > 1 && concatMatch[2]) {
          const withoutLast = room.slice(0, -1);
          if (/\d/.test(withoutLast) && withoutLast.length >= 1) {
            room = withoutLast;
          }
        }
        // Verify room has digits and is reasonable length (1-8 chars)
        if (/\d/.test(room) && room.length >= 1 && room.length <= 8) {
          return {
            building: tokens.slice(0, idx).join(" ").trim(),
            room: room
          };
        }
      }
      
      // Pattern 2: Room is a standalone token (e.g., "1006", "317", "001", "S235")
      // Must be alphanumeric, 1-8 chars, contains digits
      // Remove trailing single letter if it looks suspicious (e.g., "S235S" -> "S235")
      let cleanTok = tok;
      if (/[A-Z]$/.test(cleanTok) && cleanTok.length > 4 && /\d/.test(cleanTok)) {
        const withoutLast = cleanTok.slice(0, -1);
        if (/\d/.test(withoutLast) && withoutLast.length >= 1 && withoutLast.length <= 8) {
          cleanTok = withoutLast;
        }
      }
      if (/^[A-Z0-9]{1,8}$/i.test(cleanTok) && cleanTok.length <= 8) {
        return {
          building: tokens.slice(0, idx).join(" ").trim(),
          room: cleanTok
        };
      }
    }
  }
  
  return { building: null, room: null };
}

/**
 * Helper function to extract instructor name from location text
 * (used when instructor_id is NULL but location_text may contain instructor name)
 * Examples: "TBATBAEsther Arkin" -> "Esther Arkin"
 *           "HUMANITIES 1006 Ryan Kaufman" -> "Ryan Kaufman"
 *           "FREY HALL 317 Scott Stoller" -> "Scott Stoller"
 */
function extractInstructorNameFromText(locationText) {
  if (!locationText) return null;
  let s = String(locationText).trim();
  if (!s) return null;

  // Handle special case: "TBATBA" followed by instructor name (e.g., "TBATBAEsther Arkin")
  const tbaTbaMatch = s.match(/^TBATBA([A-Z][a-z].*)$/i);
  if (tbaTbaMatch) {
    const name = tbaTbaMatch[1].trim();
    if (name.length > 2 && /[A-Z][a-z]/.test(name)) {
      return name;
    }
  }

  // Remove "TBA" if it's at the start or end
  s = s.replace(/^TBA\s+/i, '').replace(/\s+TBA$/i, '').trim();
  if (!s || s.toUpperCase() === 'TBA') return null;

  // Pattern: building + room + instructor name
  // Instructor name typically starts with capital letter followed by lowercase
  // Examples: "HUMANITIES 1006 Ryan Kaufman", "FREY HALL 317 Scott Stoller"
  const tokens = s.split(/\s+/).filter(Boolean);
  
  // Find room number (has digits)
  for (let idx = 1; idx < tokens.length; idx++) {
    let tok = tokens[idx];
    
    // Remove "TBA" if concatenated at end
    tok = tok.replace(/TBA$/i, '');
    if (!tok) continue;
    
    if (/\d/.test(tok)) {
      // Check if room is concatenated with instructor (e.g., "1006Ryan", "4530TBAEsther")
      const concatMatch = tok.match(/^([A-Z0-9]*\d+[A-Z0-9]*)([A-Z][a-z].*)$/);
      if (concatMatch && concatMatch[2]) {
        // Instructor name starts in same token
        const remainingTokens = tokens.slice(idx + 1);
        const fullName = [concatMatch[2], ...remainingTokens].join(" ").trim();
        if (fullName.length > 2 && /[A-Z][a-z]/.test(fullName)) {
          return fullName;
        }
      }
      // Room is separate, instructor is in remaining tokens
      const instructorTokens = tokens.slice(idx + 1);
      if (instructorTokens.length > 0) {
        const instructorName = instructorTokens.join(" ").trim();
        // Verify it looks like a name (has capital letter + lowercase)
        if (/[A-Z][a-z]/.test(instructorName) && instructorName.length > 2) {
          return instructorName;
        }
      }
      break;
    }
  }
  
  return null;
}

/**
 * GET /sections
 * Get all course sections for a given term.
 * Supports filtering by SBC and days-of-week per Section 3.3 requirements.
 * 
 * Query params:
 *   - term_id: Required term ID
 *   - subject: Optional subject filter (e.g., "CSE")
 *   - course_num: Optional course number filter
 *   - instructor_id: Optional instructor filter
 *   - sbc: Optional SBC filter (e.g., "TECH", "WRT", "QPS")
 *   - days: Optional days-of-week filter (comma-separated, e.g., "Tue,Thu,Fri")
 * 
 * @route GET /sections
 * @returns {Object} 200 - List of course sections
 * @returns {Object} 400 - Missing term_id
 * @returns {Object} 500 - Query failure
 */
router.get('/sections', async (req, res) => {
  try {
    const { term_id, subject, course_num, instructor_id, sbc, days, search } = req.query;

    if (!term_id) {
      return res.status(400).json({ 
        ok: false, 
        error: 'term_id query parameter is required' 
      });
    }

    // Check if class_section_instructors table exists
    const tableCheck = await req.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'class_section_instructors'
      ) AS table_exists
    `);
    const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

    // Trim and normalize filter values
    const subjectFilter = subject ? String(subject).trim() : '';
    const courseNumFilter = course_num ? String(course_num).trim() : '';
    const daysFilter = days ? String(days).trim() : '';
    const searchFilter = search ? String(search).trim() : '';

    let sql = hasJunctionTable ? `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.term_id,
        cs.course_id,
        cs.instructor_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.description,
        COALESCE(c.sbc, '') AS sbc,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        r.building,
        r.room,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count,
        -- Aggregate all instructors for this section
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u_instr.user_id,
              'name', u_instr.first_name || ' ' || u_instr.last_name,
              'email', u_instr.email
            )
            ORDER BY u_instr.last_name, u_instr.first_name
          ) FILTER (WHERE u_instr.user_id IS NOT NULL),
          '[]'::json
        ) AS instructors
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
      LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.term_id = $1
    ` : `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.term_id,
        cs.course_id,
        cs.instructor_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.description,
        COALESCE(c.sbc, '') AS sbc,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        u.first_name || ' ' || u.last_name AS instructor_name,
        u.email AS instructor_email,
        r.building,
        r.room,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.term_id = $1
    `;

    const params = [term_id];
    let paramIndex = 1;

    if (subjectFilter) {
      paramIndex++;
      sql += ` AND c.subject = $${paramIndex}`;
      params.push(subjectFilter.toUpperCase());
    }

    if (courseNumFilter) {
      paramIndex++;
      sql += ` AND c.course_num = $${paramIndex}`;
      params.push(courseNumFilter);
    }

    if (instructor_id) {
      paramIndex++;
      sql += ` AND cs.instructor_id = $${paramIndex}`;
      params.push(instructor_id);
    }

    // SBC filter (Section 3.3 requirement)
    if (sbc) {
      const sbcFilter = String(sbc).trim();
      if (sbcFilter) {
        paramIndex++;
        sql += ` AND UPPER(COALESCE(c.sbc, '')) LIKE $${paramIndex}`;
        params.push(`%${sbcFilter.toUpperCase()}%`);
      }
    }

    // Days-of-week filter (Section 3.3 requirement)
    // Filter for classes that meet on ALL specified days (AND logic)
    if (daysFilter) {
      const dayList = daysFilter.split(',').map(d => d.trim().toUpperCase()).filter(d => d);
      if (dayList.length > 0) {
        const dayConditions = dayList.map((day) => {
          paramIndex++;
          params.push(`%${day}%`);
          return `UPPER(COALESCE(cs.meeting_days, '')) LIKE $${paramIndex}`;
        });
        sql += ` AND (${dayConditions.join(' AND ')})`;
      }
    }

    // Search filter - searches in course title and description
    if (searchFilter) {
      paramIndex++;
      params.push(`%${searchFilter.toLowerCase()}%`);
      sql += ` AND (
        LOWER(c.title) LIKE $${paramIndex} OR
        LOWER(COALESCE(c.description, '')) LIKE $${paramIndex} OR
        LOWER(c.subject || c.course_num) LIKE $${paramIndex}
      )`;
    }

    sql += `
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.requires_dept_permission, cs.notes, cs.term_id, cs.course_id,
               cs.instructor_id, c.subject, c.course_num, c.title, c.credits,
               c.description, c.sbc, cs.meeting_days, cs.meeting_times,
               r.building, r.room
      ORDER BY c.subject, c.course_num, cs.section_num
    `;

    console.log(`[schedule] GET /sections - term_id=${term_id}, subject=${subjectFilter || 'any'}, course_num=${courseNumFilter || 'any'}, days=${daysFilter || 'any'}`);
    console.log(`[schedule] SQL: ${sql.substring(0, 200)}...`);
    console.log(`[schedule] Params:`, params);

    const result = await req.db.query(sql, params);

    console.log(`[schedule] Query returned ${result.rows.length} rows`);

    const sections = result.rows.map(row => {
      // Parse instructors from JSON array (if junction table exists)
      let instructors = [];
      if (row.instructors !== undefined) {
        try {
          if (typeof row.instructors === 'string') {
            instructors = JSON.parse(row.instructors);
          } else if (Array.isArray(row.instructors)) {
            instructors = row.instructors;
          }
        } catch (e) {
          console.warn(`[schedule] Failed to parse instructors for class_id=${row.class_id}:`, e);
        }
      } else {
        // Fallback: use old single instructor format
        if (row.instructor_id && row.instructor_name) {
          instructors = [{
            id: row.instructor_id,
            name: row.instructor_name,
            email: row.instructor_email || null
          }];
        } else {
          // Try to extract instructor name from location_text
          const extractedName = extractInstructorNameFromText(row.location_text);
          if (extractedName) {
            instructors = [{ id: null, name: extractedName, email: null }];
          }
        }
      }

      return {
        classId: row.class_id,
        sectionNumber: row.section_num,
        courseId: row.course_id,
        subject: row.subject,
        courseNum: row.course_num,
        courseCode: `${row.subject}${row.course_num}`,
        title: row.title,
        credits: parseFloat(row.credits),
        description: row.description || '',
        sbc: row.sbc || '',
        meetingDays: row.meeting_days || '',
        meetingTimes: row.meeting_times || '',
        instructors: instructors,
        instructor: instructors.length > 0 ? instructors[0] : null, // Keep for backward compatibility
        // Prefer building+room over location_text (location_text may contain instructor names from old imports)
        location: (() => {
          if (row.building && row.room) {
            return `${row.building} ${row.room}`;
          }
          // Fallback to location_text, but clean it if it looks like it contains an instructor name
          if (row.location_text) {
            const { building, room } = extractBuildingRoomFromText(row.location_text);
            if (building && room) {
              return `${building} ${room}`;
            }
            return row.location_text;
          }
          return null;
        })(),
        capacity: row.capacity,
        enrolled: parseInt(row.enrolled_count) || 0,
        available: row.capacity - (parseInt(row.enrolled_count) || 0),
        requiresPermission: row.requires_dept_permission,
        notes: row.notes,
        termId: row.term_id
      };
    });

    if (sections.length > 0) {
      console.log(`[schedule] Returning ${sections.length} sections. Sample: ${sections[0].courseCode}-${sections[0].sectionNumber}`);
    } else {
      console.log(`[schedule] No sections found matching criteria`);
    }

    return res.json({ 
      ok: true, 
      count: sections.length,
      sections 
    });
  } catch (e) {
    console.error('[schedule] /sections failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /sections/:class_id
 * Get detailed information about a specific course section.
 * 
 * @route GET /sections/:class_id
 * @returns {Object} 200 - Section details
 * @returns {Object} 404 - Section not found
 * @returns {Object} 500 - Query failure
 */
router.get('/sections/:class_id', async (req, res) => {
  try {
    const { class_id } = req.params;

    // Check if class_section_instructors table exists
    const tableCheck = await req.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'class_section_instructors'
      ) AS table_exists
    `);
    const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

    const sql = hasJunctionTable ? `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.term_id,
        cs.course_id,
        cs.instructor_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.description,
        COALESCE(c.sbc, '') AS sbc,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        r.building,
        r.room,
        t.semester::text AS semester,
        t.year,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count,
        -- Aggregate all instructors for this section
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u_instr.user_id,
              'name', u_instr.first_name || ' ' || u_instr.last_name,
              'email', u_instr.email
            )
            ORDER BY u_instr.last_name, u_instr.first_name
          ) FILTER (WHERE u_instr.user_id IS NOT NULL),
          '[]'::json
        ) AS instructors
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
      LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.class_id = $1
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.requires_dept_permission, cs.notes, cs.term_id, cs.course_id,
               cs.instructor_id, c.subject, c.course_num, c.title, c.credits,
               c.description, c.sbc, cs.meeting_days, cs.meeting_times,
               r.building, r.room, t.semester, t.year
    ` : `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.term_id,
        cs.course_id,
        cs.instructor_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.description,
        COALESCE(c.sbc, '') AS sbc,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        u.first_name || ' ' || u.last_name AS instructor_name,
        u.email AS instructor_email,
        r.building,
        r.room,
        t.semester::text AS semester,
        t.year,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.class_id = $1
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.requires_dept_permission, cs.notes, cs.term_id, cs.course_id,
               cs.instructor_id, c.subject, c.course_num, c.title, c.credits,
               c.description, c.sbc, cs.meeting_days, cs.meeting_times,
               u.first_name, u.last_name, u.email, r.building, r.room,
               t.semester, t.year
    `;

    const result = await req.db.query(sql, [class_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Section not found' 
      });
    }

    const row = result.rows[0];
    
    // Parse instructors from JSON array (if junction table exists)
    let instructors = [];
    if (row.instructors !== undefined) {
      try {
        if (typeof row.instructors === 'string') {
          instructors = JSON.parse(row.instructors);
        } else if (Array.isArray(row.instructors)) {
          instructors = row.instructors;
        }
      } catch (e) {
        console.warn(`[schedule] Failed to parse instructors for class_id=${row.class_id}:`, e);
      }
    } else {
      // Fallback: use old single instructor format
      if (row.instructor_id && row.instructor_name) {
        instructors = [{
          id: row.instructor_id,
          name: row.instructor_name,
          email: row.instructor_email || null
        }];
      } else {
        const extractedName = extractInstructorNameFromText(row.location_text);
        if (extractedName) {
          instructors = [{ id: null, name: extractedName, email: null }];
        }
      }
    }

    const section = {
      classId: row.class_id,
      sectionNumber: row.section_num,
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      credits: parseFloat(row.credits),
      description: row.description || '',
      sbc: row.sbc || '',
      meetingDays: row.meeting_days || '',
      meetingTimes: row.meeting_times || '',
      instructors: instructors,
      instructor: instructors.length > 0 ? instructors[0] : null, // Keep for backward compatibility
      // Prefer building+room over location_text (location_text may contain instructor names from old imports)
      location: (() => {
        if (row.building && row.room) {
          return `${row.building} ${row.room}`;
        }
        // Fallback to location_text, but clean it if it looks like it contains an instructor name
        if (row.location_text) {
          const { building, room } = extractBuildingRoomFromText(row.location_text);
          if (building && room) {
            return `${building} ${room}`;
          }
          return row.location_text;
        }
        return null;
      })(),
      capacity: row.capacity,
      enrolled: parseInt(row.enrolled_count) || 0,
      available: row.capacity - (parseInt(row.enrolled_count) || 0),
      requiresPermission: row.requires_dept_permission,
      notes: row.notes,
      term: {
        id: row.term_id,
        semester: row.semester,
        year: row.year
      }
    };

    return res.json({ ok: true, section });
  } catch (e) {
    console.error('[schedule] /sections/:class_id failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /enrollments/:student_id
 * Get all enrollments for a specific student.
 * 
 * Query params:
 *   - term_id: Optional term filter
 *   - status: Optional status filter (registered, waitlisted, etc.)
 * 
 * @route GET /enrollments/:student_id
 * @returns {Object} 200 - List of student enrollments
 * @returns {Object} 500 - Query failure
 */
router.get('/enrollments/:student_id', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { term_id, status } = req.query;

    let sql = `
      SELECT
        e.class_id,
        e.student_id,
        e.status::text AS enrollment_status,
        e.gpnc,
        e.credits,
        e.grade::text AS grade,
        e.added_at,
        e.updated_at,
        cs.section_num,
        cs.term_id,
        c.course_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits AS course_credits,
        u.first_name || ' ' || u.last_name AS instructor_name,
        t.semester::text AS semester,
        t.year
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE e.student_id = $1
    `;

    const params = [student_id];
    let paramIndex = 1;

    if (term_id) {
      paramIndex++;
      sql += ` AND cs.term_id = $${paramIndex}`;
      params.push(term_id);
    }

    if (status) {
      paramIndex++;
      sql += ` AND e.status::text = $${paramIndex}`;
      params.push(status);
    }

    sql += ` ORDER BY t.year DESC, t.semester DESC, c.subject, c.course_num`;

    const result = await req.db.query(sql, params);

    const enrollments = result.rows.map(row => ({
      classId: row.class_id,
      studentId: row.student_id,
      sectionNumber: row.section_num,
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      credits: parseFloat(row.credits || row.course_credits),
      instructor: row.instructor_name || null,
      term: {
        id: row.term_id,
        semester: row.semester,
        year: row.year
      },
      status: row.enrollment_status,
      grade: row.grade,
      gpnc: row.gpnc,
      addedAt: row.added_at,
      updatedAt: row.updated_at
    }));

    return res.json({ 
      ok: true, 
      count: enrollments.length,
      enrollments 
    });
  } catch (e) {
    console.error('[schedule] /enrollments/:student_id failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /enrollments
 * Register a student for a course section.
 * 
 * Body:
 *   - student_id: Student's user_id
 *   - class_id: Section to enroll in
 *   - gpnc: Optional boolean for GPNC option
 * 
 * @route POST /enrollments
 * @returns {Object} 200 - Enrollment successful
 * @returns {Object} 400 - Invalid request or validation failure
 * @returns {Object} 409 - Conflict (already enrolled, full, etc.)
 * @returns {Object} 500 - Query failure
 */
router.post('/enrollments', async (req, res) => {
  try {
    const { student_id, class_id, gpnc } = req.body;

    if (!student_id || !class_id) {
      return res.status(400).json({ 
        ok: false, 
        error: 'student_id and class_id are required' 
      });
    }

    // Check if section exists and get details
    const sectionCheck = await req.db.query(
      `SELECT capacity, term_id, course_id FROM class_sections WHERE class_id = $1`,
      [class_id]
    );

    if (sectionCheck.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Section not found' 
      });
    }

    const section = sectionCheck.rows[0];

    // Check if already enrolled
    const existingEnrollment = await req.db.query(
      `SELECT class_id FROM enrollments 
       WHERE student_id = $1 AND class_id = $2 
       AND status IN ('registered', 'waitlisted')`,
      [student_id, class_id]
    );

    if (existingEnrollment.rows.length > 0) {
      return res.status(409).json({ 
        ok: false, 
        error: 'Student is already enrolled or waitlisted in this section' 
      });
    }

    // Count current enrollments
    const enrollmentCount = await req.db.query(
      `SELECT COUNT(*) as count FROM enrollments 
       WHERE class_id = $1 AND status = 'registered'`,
      [class_id]
    );

    const enrolled = parseInt(enrollmentCount.rows[0].count) || 0;
    const available = section.capacity - enrolled;

    if (available <= 0) {
      // Add to waitlist
      await req.db.query(
        `INSERT INTO enrollments (student_id, class_id, status, gpnc, credits)
         VALUES ($1, $2, 'waitlisted', $3, (SELECT credits FROM courses WHERE course_id = $4))`,
        [student_id, class_id, gpnc || false, section.course_id]
      );

      return res.status(201).json({ 
        ok: true, 
        message: 'Added to waitlist (section is full)',
        waitlisted: true
      });
    }

    // Insert enrollment
    await req.db.query(
      `INSERT INTO enrollments (student_id, class_id, status, gpnc, credits)
       VALUES ($1, $2, 'registered', $3, (SELECT credits FROM courses WHERE course_id = $4))`,
      [student_id, class_id, gpnc || false, section.course_id]
    );

    return res.status(201).json({ 
      ok: true, 
      message: 'Successfully enrolled in course',
      waitlisted: false
    });
  } catch (e) {
    console.error('[schedule] POST /enrollments failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /enrollments/:student_id/:class_id
 * Withdraw a student from a course.
 * 
 * @route DELETE /enrollments/:student_id/:class_id
 * @returns {Object} 200 - Withdrawal successful
 * @returns {Object} 404 - Enrollment not found
 * @returns {Object} 500 - Query failure
 */
router.delete('/enrollments/:student_id/:class_id', async (req, res) => {
  try {
    const { student_id, class_id } = req.params;

    // Get enrollment details
    const enrollment = await req.db.query(
      `SELECT status FROM enrollments 
       WHERE student_id = $1 AND class_id = $2`,
      [student_id, class_id]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Enrollment not found' 
      });
    }

    // Delete enrollment
    await req.db.query(
      `DELETE FROM enrollments WHERE student_id = $1 AND class_id = $2`,
      [student_id, class_id]
    );

    return res.json({ 
      ok: true, 
      message: 'Successfully withdrew from course' 
    });
  } catch (e) {
    console.error('[schedule] DELETE /enrollments failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

