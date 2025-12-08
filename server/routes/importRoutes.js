import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import multer from "multer";
import yaml from "js-yaml";
import * as pdfParseMod from "pdf-parse";
import { scrapeCatalog } from "../services/catalogScraper.js";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, "..", "uploads"),
  limits: { fileSize: 5 * 1024 * 1024 },
});

async function extractPdfText(pdfBuffer) {
  if (typeof pdfParseMod?.PDFParse === "function") {
    const parser = new pdfParseMod.PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    if (typeof parser.destroy === "function") await parser.destroy();
    return result?.text || "";
  }

  if (typeof pdfParseMod?.default === "function") {
    const result = await pdfParseMod.default(pdfBuffer);
    return result?.text || "";
  }

  try {
    const legacy = require("pdf-parse");
    const fn = legacy?.default || legacy;
    if (typeof fn === "function") {
      const result = await fn(pdfBuffer);
      return result?.text || "";
    }
  } catch {}

  throw new TypeError("pdf-parse did not expose a usable parser API.");
}

function toMilitaryTimeRange(timeStr) {
  if (!timeStr || timeStr === "TBA") return timeStr;

  // Handle format: "12:30-01:50PM" (AM/PM only on end time)
  // The start time is inferred: if end is PM and start < end in 12-hour, start is also PM
  // If start > end (like 12:30 to 01:50), start is PM and end is PM (next hour)
  let match = /^(\d{1,2}):(\d{2})(AM|PM)?-(\d{1,2}):(\d{2})(AM|PM)$/i.exec(timeStr.trim());
  
  if (match) {
    let [, h1, m1, suffix1, h2, m2, suffix2] = match;
    let hour1 = parseInt(h1, 10);
    let hour2 = parseInt(h2, 10);
    
    const isPM2 = suffix2 && suffix2.toUpperCase() === "PM";
    
    // If first time has AM/PM, use it
    if (suffix1) {
      const isPM1 = suffix1.toUpperCase() === "PM";
      if (isPM1 && hour1 !== 12) hour1 += 12;
      if (!isPM1 && hour1 === 12) hour1 = 0;
    } else {
      // Infer from second time and logic
      // Common patterns:
      // - "11:00-12:20PM" typically means 11:00 AM to 12:20 PM (morning class)
      // - "11:30-01:50PM" typically means 11:30 AM to 1:50 PM (lunchtime class, crossing noon)
      // - "12:30-01:50PM" means 12:30 PM to 1:50 PM (afternoon class)
      // - "01:00-02:20PM" means 1:00 PM to 2:20 PM (afternoon class)
      if (isPM2) {
        if (hour1 === 12) {
          // 12:xx is noon (PM) - keep as 12
          hour1 = 12;
        } else if (hour1 < hour2) {
          // Start hour < end hour: most likely both are in the same period
          // But for morning classes (11:00-12:20PM), start is AM, end is PM
          // For afternoon classes (01:00-02:20PM), both are PM
          // Heuristic: if start is 11 or less and end is 12, assume start is AM (morning class)
          if (hour1 <= 11 && hour2 === 12) {
            // Morning class: 11:00 AM to 12:20 PM
            // hour1 stays as-is (AM)
          } else {
            // Afternoon/evening class: both PM
            hour1 += 12;
          }
        } else {
          // hour1 > hour2: e.g., 11:30-01:50PM or 12:30-01:50PM
          // This means we're crossing noon
          // If start is 12, it's PM (noon)
          // If start is 1-11, it's AM (crossing noon to PM)
          if (hour1 === 12) {
            hour1 = 12; // noon (PM)
          } else {
            // hour1 is 1-11, so it's AM (stays as-is)
            // e.g., 11:30-01:50PM -> 11:30 AM to 1:50 PM
          }
        }
      } else {
        // End is AM
        if (hour1 === 12) hour1 = 0; // midnight
        // Otherwise hour1 stays as-is (AM)
      }
    }

    if (isPM2 && hour2 !== 12) hour2 += 12;
    if (!isPM2 && hour2 === 12) hour2 = 0;

    return `${String(hour1).padStart(2, "0")}:${m1}-${String(hour2).padStart(2, "0")}:${m2}`;
  }

  // Fallback: try original format with AM/PM on both
  match = /^(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)$/i.exec(timeStr.trim());
  if (match) {
    let [, h1, m1, suffix1, h2, m2, suffix2] = match;
    let hour1 = parseInt(h1, 10);
    let hour2 = parseInt(h2, 10);
    const isPM1 = suffix1.toUpperCase() === "PM";
    const isPM2 = suffix2.toUpperCase() === "PM";

    if (isPM1 && hour1 !== 12) hour1 += 12;
    if (!isPM1 && hour1 === 12) hour1 = 0;

    if (isPM2 && hour2 !== 12) hour2 += 12;
    if (!isPM2 && hour2 === 12) hour2 = 0;

    return `${String(hour1).padStart(2, "0")}:${m1}-${String(hour2).padStart(2, "0")}:${m2}`;
  }

  return timeStr;
}

function extractTermFromPdfText(text) {
  if (!text) return null;

  const head = text.slice(0, 6000);

  let m = /\b(Fall|Spring|Summer|Winter)\s+(20\d{2})\b/i.exec(head);
  if (m) {
    const semester = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const year = Number(m[2]);
    return Number.isFinite(year) ? { semester, year } : null;
  }

  m = /\b(20\d{2})\s+(Fall|Spring|Summer|Winter)\b/i.exec(head);
  if (m) {
    const semester = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    const year = Number(m[1]);
    return Number.isFinite(year) ? { semester, year } : null;
  }

  return null;
}

async function lookupTermId(db, semester, year) {
  const r = await db.query(
    `
    SELECT term_id
    FROM terms
    WHERE lower(semester::text) = lower($1)
      AND year = $2
    LIMIT 1
    `,
    [semester, year]
  );
  return r.rows[0]?.term_id ?? null;
}

/**
 * Given the tail text (e.g. "FREY HALL 317 Scott Stoller" or "HUMANITIES 1006Ryan Kaufman"),
 * split out building, room, and instructor name.
 * Returns: { building, room, instructorName }
 */
function splitLocationTail(tail) {
  if (!tail) {
    return { building: null, room: null, instructorName: null };
  }

  let s = String(tail).trim();
  if (!s) {
    return { building: null, room: null, instructorName: null };
  }

  // Handle special case: "TBATBA" prefix followed by instructor name (e.g., "TBATBAEsther Arkin")
  // This means no location, just instructor name
  const tbaTbaMatch = /^TBATBA(.+)$/i.exec(s);
  if (tbaTbaMatch) {
    const instructorName = tbaTbaMatch[1].trim();
    // Check if it looks like a name (has capital letter + lowercase)
    if (instructorName.length > 2 && /[A-Z][a-z]/.test(instructorName)) {
      return { building: null, room: null, instructorName };
    }
    return { building: null, room: null, instructorName: null };
  }

  // Remove standalone "TBA" tokens and clean up
  s = s.replace(/\bTBA\b/gi, '').replace(/\s+/g, ' ').trim();
  
  // If after removing TBA we have nothing, return null
  if (!s) {
    return { building: null, room: null, instructorName: null };
  }

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    // If only one token, check if it's a name
    if (tokens.length === 1 && /[A-Z][a-z]/.test(tokens[0]) && tokens[0].length > 2) {
      return { building: null, room: null, instructorName: tokens[0] };
    }
    return { building: null, room: null, instructorName: null };
  }

  // Find the first token that "looks like" a room code (205, E4310, N107, 317, 1006, etc.)
  // Room pattern: alphanumeric, 1-10 chars, contains digits
  const roomRe = /^[A-Z0-9]{1,10}$/i;
  let roomIndex = -1;
  let roomToken = null;
  
  for (let idx = 1; idx < tokens.length; idx++) {
    let tok = tokens[idx];
    
    // Remove "TBA" if concatenated at end (e.g., "4530TBA", "P112TBA")
    tok = tok.replace(/TBA$/i, '');
    if (!tok) continue;
    
    // Check if token looks like a room number
    if (roomRe.test(tok) && /\d/.test(tok)) {
      // Check if room number is concatenated with instructor name (e.g., "1006Ryan", "4530Esther")
      const roomMatch = tok.match(/^([A-Z0-9]{1,10})([A-Z][a-z].*)$/);
      if (roomMatch) {
        // Room and instructor concatenated: split them
        roomToken = roomMatch[1];
        roomIndex = idx;
        // Insert instructor part as new token
        tokens.splice(idx + 1, 0, roomMatch[2]);
        break;
      } else if (tok.length <= 10) {
        // Normal room token
        roomToken = tok;
        roomIndex = idx;
        break;
      }
    }
  }

  if (roomIndex <= 0 || !roomToken) {
    // No room found - check if we have an instructor name
    // Look for tokens that look like names (capital letter + lowercase)
    const nameTokens = tokens.filter(t => /[A-Z][a-z]/.test(t) && t.length > 2);
    if (nameTokens.length > 0) {
      return { building: null, room: null, instructorName: nameTokens.join(' ') };
    }
    return { building: null, room: null, instructorName: null };
  }

  const buildingTokens = tokens.slice(0, roomIndex);
  const instructorTokens = tokens.slice(roomIndex + 1);

  const building = buildingTokens.join(" ").trim();
  const room = roomToken.trim();
  
  // Extract instructor name from remaining tokens
  let instructorName = null;
  if (instructorTokens.length > 0) {
    const nameStr = instructorTokens.join(" ").trim();
    // Verify it looks like a name (has capital letter + lowercase)
    if (nameStr.length > 2 && /[A-Z][a-z]/.test(nameStr)) {
      instructorName = nameStr;
    }
  }

  // Treat "TBA" as no real location.
  if (!building || !room || building.toUpperCase() === "TBA" || room.toUpperCase() === "TBA") {
    // If we have an instructor name but no location, return just the instructor
    if (instructorName) {
      return { building: null, room: null, instructorName };
    }
    return { building: null, room: null, instructorName: null };
  }

  return { building, room, instructorName };
}

function parseSocPdfToSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];

  let currentSubject = null;
  let currentCourseNum = null;

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Match course header: "AAS 110 G Appreciating Indian Music Credit(s): 3 SBC: ARTS"
    // or "AAS 110" at start of line
    const courseMatch = /^([A-Z]{2,4})\s+(\d{3})\b/.exec(line);
    if (courseMatch) {
      currentSubject = courseMatch[1];
      currentCourseNum = courseMatch[2];
      continue;
    }

    if (!currentSubject || !currentCourseNum) continue;

    // Match section line formats:
    // Compact: "85429LEC01TR12:30-01:50PM25-AUG-202518-DEC-2025FREY HALL205Aruna Sharma"
    // Also: "91486SEMS01M11:00-11:55AM25-AUG-202518-DEC-2025SOCBEHAV SCIN107GiAnna Biondi"
    // Note: Section types can be LEC, REC, LAB, SEM, TUT, CLN, SUP, STU, or SEMS, RECR, LABL, TUTT
    // Days can be single (M, T, W, R, F) or multiple (MW, TR, etc.)
    // Times can have any minutes (:00, :30, :21, :51, :55, etc.)
    
    // Try compact format first (no spaces between main fields)
    // Pattern: 5digits + LEC/REC/etc + 1-3digits + days + time + startdate + enddate + rest
    // Allow section types: LEC, REC, LAB, SEM, TUT, CLN, SUP, STU, SEMS, RECR, LABL, TUTT
    // Allow section numbers: 01, 02, 1, 2, 327, 328, etc. (1-3 digits)
    // Allow any minutes in time: \d{2} (not just :00 or :30)
    // Allow days to be single letter (M, T, W, R, F, H) or multiple (MW, TR, MWF, etc.) or FLEX or APPT
    // Days pattern: M, T, W, R, F, H, or combinations like MW, TR, MWF, TWR, etc. (max 4 chars, only M/T/W/R/F/H)
    // Allow time to be TBA (possibly followed by -), "-", or time range
    const daysPattern = '[MTWRFH]{1,4}|APPT|FLEX';
    const timePattern = '\\d{1,2}:\\d{2}(?:AM|PM)?-\\d{1,2}:\\d{2}(?:AM|PM)|TBA-?|-';
    let secMatch = new RegExp(`^\\s*(\\d{5})(LEC|REC|LAB|SEM|TUT|CLN|SUP|STU|SEMS|RECR|LABL|TUTT)(\\d{1,3})(${daysPattern})(${timePattern})(\\d{2}-[A-Z]{3}-\\d{4})(\\d{2}-[A-Z]{3}-\\d{4})(.+)$`).exec(line);
    
    // If compact format doesn't match, try spaced format
    if (!secMatch) {
      secMatch = new RegExp(`^\\s*(\\d{5})\\s+(LEC|REC|LAB|SEM|TUT|CLN|SUP|STU|SEMS|RECR|LABL|TUTT)\\s+(\\S+)\\s+(${daysPattern})\\s+(${timePattern})\\s+(\\d{2}-[A-Z]{3}-\\d{4})\\s+(\\d{2}-[A-Z]{3}-\\d{4})\\s+(.+)$`).exec(line);
    }
    
    // Normalize section types: TUTT->TUT, SEMS->SEM, RECR->REC, LABL->LAB
    if (secMatch) {
      const typeMap = { 'TUTT': 'TUT', 'SEMS': 'SEM', 'RECR': 'REC', 'LABL': 'LAB' };
      if (typeMap[secMatch[2]]) {
        secMatch[2] = typeMap[secMatch[2]];
      }
    }

    if (!secMatch) {
      // Debug: log lines that look like sections but don't match
      if (/^\s*\d{5}/.test(line)) {
        console.log(`[API] DEBUG: Line looks like section but didn't match regex: "${line.substring(0, 80)}"`);
      }
      continue;
    }

    const sectionNum = secMatch[3];
    let days = secMatch[4];
    const times = secMatch[5];
    // Clean up tail: normalize multiple spaces to single space
    const tail = secMatch[8].replace(/\s+/g, ' ').trim();
    
    // Normalize days: "RT" should be "TR" (Tuesday/Thursday)
    if (days === "RT") {
      days = "TR";
    }
    
    // Debug: log successful matches for first few sections
    if (sections.length < 3) {
      console.log(`[API] DEBUG: Matched section - subject: ${currentSubject}, course: ${currentCourseNum}, section: ${sectionNum}, days: ${days}, time: ${times}`);
    }

    const { building, room, instructorName } = splitLocationTail(tail);

    sections.push({
      subject: currentSubject,
      courseNum: currentCourseNum,
      sectionNum,
      meetingDays: (days === "APPT" || days === "FLEX" || days === "-") ? "TBA" : days,
      meetingTimes: (times === "-" || times === "TBA" || times === "TBA-") ? "TBA" : toMilitaryTimeRange(times),
      locationText: tail,
      building,
      room,
      instructorName,
    });
  }

  return sections;
}

router.post("/catalog", async (req, res) => {
  const { term, subjects } = req.body;

  console.log(`[API] Import request received → term=${term}, subjects=${subjects}`);

  if (typeof term !== "string" || !Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({
      status: "error",
      error: "Invalid request. Expected { term: string, subjects: string[] }.",
    });
  }

  const outputPath = path.join(__dirname, "..", `${term}_courses.json`);

  if (fs.existsSync(outputPath)) {
    console.warn(
      `[API] Import blocked: Catalog for term '${term}' has already been scraped.`
    );
    return res.status(409).json({
      status: "conflict",
      error: `The course catalog for term '${term}' has already been imported and cannot be changed.`,
      path: outputPath,
    });
  }

  try {
    const start = Date.now();
    const data = await scrapeCatalog(term, subjects);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const totalCourses = data.reduce((sum, s) => sum + (s.count || 0), 0);

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    data.forEach((s) =>
      console.log(`[API] ${s.subject}: ${s.count} courses scraped`)
    );

    console.log(
      `[API] Import completed → total=${totalCourses}, duration=${duration}s`
    );
    console.log(`[API] Data for term '${term}' saved to: ${outputPath}`);

    return res.status(200).json({
      status: "success",
      imported: totalCourses,
      subjects,
      term,
      duration: `${duration}s`,
      sample: data[0]?.courses?.slice(0, 3) || [],
      errors: data
        .filter((s) => s.error)
        .map((s) => ({ subject: s.subject, error: s.error })),
    });
  } catch (error) {
    console.error("[API] Import failed:", error);
    return res.status(500).json({
      status: "error",
      error: error.message || "Unexpected server error during catalog import.",
    });
  }
});

router.post("/users", upload.single("file"), async (req, res) => {
  console.log("[API] User import request received");

  // Check if this is initial setup (no registrars exist) - allow import in that case
  // Otherwise, require registrar authentication
  const registrarCheck = await req.db.query(
    `SELECT COUNT(*) as count FROM users WHERE role = 'Registrar'`
  );
  const registrarCount = parseInt(registrarCheck.rows[0]?.count || 0);
  
  if (registrarCount > 0) {
    // Registrars exist, so require authentication
    // TEMPORARILY DISABLED FOR TESTING - Remove this comment and restore auth check after testing
    // if (!req.user || !req.user.roles || !req.user.roles.includes('REGISTRAR')) {
    //   return res.status(403).json({
    //     status: "error",
    //     error: "Only registrars can import users. Please log in as a registrar.",
    //   });
    // }
    console.log("[API] Auth check temporarily disabled for testing");
  } else {
    // No registrars exist - this is initial setup, allow import
    console.log("[API] No registrars found - allowing initial setup import");
  }

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      error: "No file uploaded. Expected form field name: file",
    });
  }

  try {
    const filePath = req.file.path;
    const yamlText = fs.readFileSync(filePath, "utf8");
    const parsed = yaml.load(yamlText);

    try {
      fs.unlinkSync(filePath);
    } catch {}

    if (!parsed || typeof parsed !== "object") {
      return res.status(400).json({
        status: "error",
        error: "YAML parsed but produced no valid data object.",
      });
    }

    // Note: We no longer delete all existing user data.
    // Instead, we only update/insert users that are in the YAML file.
    // Users not in the YAML file will remain unchanged in the database.
    console.log("[API] Importing/updating users from YAML (existing users not in YAML will be preserved)...");

    const {
      registrars = [],
      academic_advisors = [],
      instructors = [],
      students = [],
    } = parsed;

    const results = { inserted: 0, skipped: 0, updated: 0, warnings: [] };

    // Helper function to check if a transfer course is a placement test
    function isPlacementTest(transferCourse) {
      if (!transferCourse || typeof transferCourse !== 'object') return false;
      const className = String(transferCourse.class || '').toLowerCase();
      return className.includes('placement') || className.includes('placement exam');
    }

    // Helper function to filter out placement tests from transfer_courses
    function filterTransferCourses(transferCourses) {
      if (!Array.isArray(transferCourses)) return [];
      return transferCourses.filter(tc => !isPlacementTest(tc));
    }

    async function insertUser(obj, role) {
      const { SBU_ID, first_name, last_name, email, password } = obj;
      
      // Use password from YAML if provided, otherwise default to "password"
      const userPassword = password || "password";

      if (!SBU_ID || !email || !first_name || !last_name) {
        results.skipped++;
        results.warnings.push(`Missing fields for SBU_ID=${SBU_ID ?? "(none)"}`);
        return null;
      }

      // For students, check and filter transfer_courses for placement tests
      if (role === "Student" && obj.transfer_courses) {
        const originalCount = Array.isArray(obj.transfer_courses) ? obj.transfer_courses.length : 0;
        const filtered = filterTransferCourses(obj.transfer_courses);
        const droppedCount = originalCount - filtered.length;
        
        if (droppedCount > 0) {
          // Optionally add a warning (or silently drop as per requirement)
          // The requirement says "with or without warnings", so we'll add a warning for transparency
          results.warnings.push(
            `Student ${SBU_ID}: Dropped ${droppedCount} placement test entry/entries from transfer_courses`
          );
        }
        // Note: We're not storing transfer_courses in the database currently,
        // but we're processing them to meet the requirement
      }

      // Check for existing user by SBU_ID or email (both have unique constraints)
      const check = await req.db.query(
        `SELECT user_id, sbu_id, email FROM users WHERE sbu_id = $1 OR email = $2`,
        [SBU_ID, email]
      );

      if (check.rows.length > 0) {
        const existing = check.rows[0];
        // If SBU_ID matches, update password from YAML if provided
        if (String(existing.sbu_id) === String(SBU_ID)) {
          // Update password from YAML if provided
          try {
            await req.db.query(
              `UPDATE users SET password_hash = $1 WHERE user_id = $2`,
              [userPassword, existing.user_id]
            );
            results.updated++;
          } catch (updateErr) {
            results.warnings.push(`Failed to update password for user ${SBU_ID}: ${updateErr.message}`);
          }
          results.skipped++;
          results.warnings.push(`User already exists: SBU_ID=${SBU_ID}`);
          return existing.user_id;
        }
        // If email matches but SBU_ID is different, skip with warning
        if (existing.email && existing.email.toLowerCase() === email.toLowerCase()) {
          // Update password from YAML if provided
          try {
            await req.db.query(
              `UPDATE users SET password_hash = $1 WHERE user_id = $2`,
              [userPassword, existing.user_id]
            );
            results.updated++;
          } catch (updateErr) {
            results.warnings.push(`Failed to update password for user ${email}: ${updateErr.message}`);
          }
          results.skipped++;
          results.warnings.push(`User with email ${email} already exists with different SBU_ID (existing: ${existing.sbu_id}, new: ${SBU_ID})`);
          return existing.user_id;
        }
      }

      try {
        const r = await req.db.query(
          `INSERT INTO users (sbu_id, first_name, last_name, email, role, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING user_id`,
          [SBU_ID, first_name, last_name, email, role, userPassword]
        );

        results.inserted++;
        return r.rows[0].user_id;
      } catch (insertErr) {
        // Handle any other constraint violations (e.g., race condition)
        if (insertErr.code === '23505') { // Unique violation
          results.skipped++;
          results.warnings.push(`User already exists (duplicate constraint): SBU_ID=${SBU_ID}, email=${email}`);
          // Try to get the existing user and always update password to default
          const existingCheck = await req.db.query(
            `SELECT user_id FROM users WHERE sbu_id = $1 OR email = $2 LIMIT 1`,
            [SBU_ID, email]
          );
          if (existingCheck.rows.length > 0) {
            try {
              await req.db.query(
                `UPDATE users SET password_hash = $1 WHERE user_id = $2`,
                [userPassword, existingCheck.rows[0].user_id]
              );
              results.updated++;
            } catch (updateErr) {
              results.warnings.push(`Failed to update password for existing user: ${updateErr.message}`);
            }
          }
          return existingCheck.rows[0]?.user_id || null;
        }
        throw insertErr;
      }
    }

    /**
     * Get or create a department for a subject code (CSE, AMS, etc).
     */
    async function getOrCreateDepartment(db, subjectCode) {
      const existing = await db.query(
        `SELECT department_id FROM departments WHERE code = $1`,
        [subjectCode]
      );
      if (existing.rows.length > 0) return existing.rows[0].department_id;

      const name = `${subjectCode} Department`;
      const collegeId = 1; // assume CEAS = 1 from seed
      const inserted = await db.query(
        `INSERT INTO departments (college_id, name, code)
         VALUES ($1, $2, $3)
         RETURNING department_id`,
        [collegeId, name, subjectCode]
      );
      return inserted.rows[0].department_id;
    }

    /**
     * Import student majors and minors into student_programs table
     */
    /**
     * Import student class enrollments from YAML classes array
     */
    async function importStudentClasses(db, userId, studentObj, results) {
      try {
        // Clean up old enrollments for this student before importing new ones
        // This ensures the YAML file defines the complete set of enrollments for the student
        await db.query(
          `DELETE FROM enrollments WHERE student_id = $1`,
          [userId]
        );
        
        const { classes = [] } = studentObj;
        
        if (!Array.isArray(classes) || classes.length === 0) {
          return; // No classes to import
        }

        for (const classEntry of classes) {
          const { class_id, department, course_num, section, semester, year, credits, GPNC, grade } = classEntry;
          
          if (!class_id && (!department || !course_num || !section || !semester || !year)) {
            results.warnings.push(
              `Student ${studentObj.SBU_ID}: Skipping class entry with insufficient data: ${JSON.stringify(classEntry)}`
            );
            continue;
          }

          // Find the term
          const termRes = await db.query(
            `SELECT term_id FROM terms WHERE semester = $1 AND year = $2`,
            [semester, year]
          );

          if (termRes.rows.length === 0) {
            results.warnings.push(
              `Student ${studentObj.SBU_ID}: Term not found for ${semester} ${year}. Skipping class.`
            );
            continue;
          }

          const termId = termRes.rows[0].term_id;
          let classSectionId = null;

          // Try to find class_section by class_id first
          if (class_id) {
            const classRes = await db.query(
              `SELECT class_id, course_id FROM class_sections WHERE class_id = $1 AND term_id = $2`,
              [class_id, termId]
            );
            
            if (classRes.rows.length > 0) {
              classSectionId = classRes.rows[0].class_id;
            }
          }

          // If not found by class_id, try to find by course and section
          if (!classSectionId && department && course_num && section) {
            const sectionRes = await db.query(
              `SELECT cs.class_id, cs.course_id
               FROM class_sections cs
               JOIN courses c ON c.course_id = cs.course_id
               WHERE c.subject = $1 
                 AND c.course_num = $2 
                 AND cs.section_num = $3
                 AND cs.term_id = $4`,
              [department, course_num, section, termId]
            );

            if (sectionRes.rows.length > 0) {
              classSectionId = sectionRes.rows[0].class_id;
            }
          }

          if (!classSectionId) {
            results.warnings.push(
              `Student ${studentObj.SBU_ID}: Class section not found for class_id=${class_id || 'N/A'}, ${department} ${course_num} section ${section} in ${semester} ${year}. Skipping.`
            );
            continue;
          }

          // Get course credits if not provided in YAML
          let enrollmentCredits = credits;
          if (!enrollmentCredits) {
            const courseRes = await db.query(
              `SELECT c.credits 
               FROM class_sections cs
               JOIN courses c ON c.course_id = cs.course_id
               WHERE cs.class_id = $1`,
              [classSectionId]
            );
            if (courseRes.rows.length > 0) {
              enrollmentCredits = courseRes.rows[0].credits;
            }
          }

          // Determine enrollment status
          // If grade exists and is not null, status should be 'completed'
          // Otherwise, status should be 'registered'
          const enrollmentStatus = (grade && grade !== null && grade.toUpperCase() !== 'NULL') 
            ? 'completed' 
            : 'registered';

          // Check if enrollment already exists
          // Note: enrollments table may use composite key (student_id, class_id) instead of enrollment_id
          const existingEnrollment = await db.query(
            `SELECT student_id, class_id FROM enrollments 
             WHERE student_id = $1 AND class_id = $2`,
            [userId, classSectionId]
          );

          if (existingEnrollment.rows.length > 0) {
            // Update existing enrollment
            await db.query(
              `UPDATE enrollments 
               SET status = $1, 
                   grade = $2, 
                   gpnc = $3, 
                   credits = $4,
                   updated_at = NOW()
               WHERE student_id = $5 AND class_id = $6`,
              [
                enrollmentStatus,
                grade && grade !== null && grade.toUpperCase() !== 'NULL' ? grade : null,
                GPNC || false,
                enrollmentCredits || 0,
                userId,
                classSectionId
              ]
            );
          } else {
            // Insert new enrollment
            await db.query(
              `INSERT INTO enrollments 
               (student_id, class_id, status, grade, gpnc, credits, enrolled_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [
                userId,
                classSectionId,
                enrollmentStatus,
                grade && grade !== null && grade.toUpperCase() !== 'NULL' ? grade : null,
                GPNC || false,
                enrollmentCredits || 0
              ]
            );
          }
        }
      } catch (err) {
        results.warnings.push(
          `Failed to import classes for student ${studentObj.SBU_ID}: ${err.message}`
        );
        console.error(`[import] Error importing classes for student ${studentObj.SBU_ID}:`, err);
      }
    }

    async function importStudentPrograms(db, userId, studentObj, results) {
      try {
        // Clean up old programs for this student before importing new ones
        // This ensures the YAML file defines the complete set of programs for the student
        await db.query(
          `DELETE FROM student_programs WHERE student_id = $1`,
          [userId]
        );
        
        // Ensure student record exists in students table
        const studentCheck = await db.query(
          `SELECT 1 FROM students WHERE user_id = $1`,
          [userId]
        );

        if (studentCheck.rows.length === 0) {
          // Insert new student record
          // Note: university_entry and transfer_courses columns may not exist in all database schemas
          // Only insert basic user_id for now
          await db.query(
            `INSERT INTO students (user_id) VALUES ($1)`,
            [userId]
          );
          
          // Try to update with optional fields if columns exist
          try {
            if (studentObj.university_entry) {
              const universityEntryJson = typeof studentObj.university_entry === 'string' 
                ? studentObj.university_entry 
                : JSON.stringify(studentObj.university_entry);
              await db.query(
                `UPDATE students SET university_entry = $1::jsonb WHERE user_id = $2`,
                [universityEntryJson, userId]
              );
            }
            
            if (studentObj.transfer_courses && Array.isArray(studentObj.transfer_courses)) {
              const filtered = filterTransferCourses(studentObj.transfer_courses);
              if (filtered.length > 0) {
                const transferCoursesJson = JSON.stringify(filtered);
                await db.query(
                  `UPDATE students SET transfer_courses = $1::jsonb WHERE user_id = $2`,
                  [transferCoursesJson, userId]
                );
              }
            }
          } catch (optionalFieldErr) {
            // Columns don't exist, that's okay - just log a warning
            if (optionalFieldErr.message.includes('university_entry') || 
                optionalFieldErr.message.includes('transfer_courses')) {
              // Silently ignore - these are optional fields
            } else {
              throw optionalFieldErr;
            }
          }
        }

        const { majors = [], minors = [], degrees = [] } = studentObj;

        // Import majors
        if (Array.isArray(majors) && majors.length > 0) {
          for (let i = 0; i < majors.length; i++) {
            const majorCode = majors[i];
            const degreeType = degrees[i] || 'BS'; // Default to BS if not specified

            // Program code format: "CSE-BS", "AMS-BS", etc.
            const programCode = `${majorCode}-${degreeType}`;

            // Try multiple patterns to find the program:
            // 1. Exact match: "CSE-BS", "AMS-BS", etc.
            // 2. Department-based: find by department code
            // 3. Pattern match: code starts with the major code
            // Also check inactive programs and reactivate them if found
            let programRes = await db.query(
              `SELECT p.program_id, p.type, p.code, d.code AS dept_code, p.is_active
               FROM programs p
               LEFT JOIN departments d ON d.department_id = p.department_id
               WHERE p.type = 'MAJOR'
                 AND (p.code = $1 
                      OR p.code LIKE $2 
                      OR d.code = $3
                      OR p.code LIKE $4)
               ORDER BY 
                 CASE WHEN p.code = $1 THEN 1
                      WHEN d.code = $3 THEN 2
                      WHEN p.code LIKE $2 THEN 3
                      ELSE 4 END,
                 p.is_active DESC
               LIMIT 1`,
              [programCode, `${majorCode}-%`, majorCode, `${majorCode}%`]
            );
            
            // If found but inactive, reactivate it
            if (programRes.rows.length > 0 && !programRes.rows[0].is_active) {
              await db.query(
                `UPDATE programs SET is_active = true WHERE program_id = $1`,
                [programRes.rows[0].program_id]
              );
              programRes.rows[0].is_active = true;
            }

            if (programRes.rows.length === 0) {
              // Try to auto-create the program if it doesn't exist
              try {
                const departmentId = await getOrCreateDepartment(db, majorCode);
                const programName = `${majorCode} ${degreeType}`;
                
                const createRes = await db.query(
                  `INSERT INTO programs (code, name, type, department_id, is_active)
                   VALUES ($1, $2, 'MAJOR'::program_type, $3, true)
                   RETURNING program_id, type`,
                  [programCode, programName, departmentId]
                );
                
                const newProgram = createRes.rows[0];
                results.warnings.push(
                  `Student ${studentObj.SBU_ID}: Created missing program ${programCode} for major ${majorCode}.`
                );
                
                // Use the newly created program
                const program = { program_id: newProgram.program_id, type: newProgram.type, code: programCode };
                
                // Check if already declared
                const existingRes = await db.query(
                  `SELECT 1 FROM student_programs WHERE student_id = $1 AND program_id = $2`,
                  [userId, program.program_id]
                );

                if (existingRes.rows.length === 0) {
                  // Insert into student_programs
                  await db.query(
                    `INSERT INTO student_programs (student_id, program_id, kind)
                     VALUES ($1, $2, 'MAJOR'::program_type)`,
                    [userId, program.program_id]
                  );
                }
                continue; // Successfully created and inserted, move to next major
              } catch (createErr) {
                results.warnings.push(
                  `Student ${studentObj.SBU_ID}: Major program not found for ${majorCode} (tried code: ${programCode}) and failed to auto-create: ${createErr.message}. Skipping.`
                );
                continue;
              }
            }

            const program = programRes.rows[0];
            if (program.type !== 'MAJOR') {
              results.warnings.push(
                `Student ${studentObj.SBU_ID}: Program ${program.code} is not a MAJOR. Skipping.`
              );
              continue;
            }

            // Check if already declared
            const existingRes = await db.query(
              `SELECT 1 FROM student_programs WHERE student_id = $1 AND program_id = $2`,
              [userId, program.program_id]
            );

            if (existingRes.rows.length === 0) {
              // Insert into student_programs
              await db.query(
                `INSERT INTO student_programs (student_id, program_id, kind)
                 VALUES ($1, $2, 'MAJOR'::program_type)`,
                [userId, program.program_id]
              );
            }
          }
        }

        // Import minors
        // Note: YAML might have minor_requirement_versions which could help match
        // For now, try to find minor programs by department code
        if (Array.isArray(minors) && minors.length > 0) {
          for (const minorCode of minors) {
            // Try multiple patterns:
            // 1. Exact match: "CSE-Minor" or similar
            // 2. Department-based: find by department code
            // 3. Pattern match: code starts with the department code
            const programRes = await db.query(
              `SELECT p.program_id, p.type, p.code, d.code AS dept_code
               FROM programs p
               LEFT JOIN departments d ON d.department_id = p.department_id
               WHERE p.type = 'MINOR' AND p.is_active = true
                 AND (p.code = $1 
                      OR p.code LIKE $2 
                      OR d.code = $1
                      OR p.code LIKE $3)
               ORDER BY 
                 CASE WHEN p.code = $1 THEN 1
                      WHEN d.code = $1 THEN 2
                      WHEN p.code LIKE $2 THEN 3
                      ELSE 4 END
               LIMIT 1`,
              [minorCode, `${minorCode}-%`, `${minorCode}%`]
            );

            if (programRes.rows.length === 0) {
              results.warnings.push(
                `Student ${studentObj.SBU_ID}: Minor program not found for ${minorCode}. Skipping.`
              );
              continue;
            }

            const program = programRes.rows[0];

            // Check if already declared
            const existingRes = await db.query(
              `SELECT 1 FROM student_programs WHERE student_id = $1 AND program_id = $2`,
              [userId, program.program_id]
            );

            if (existingRes.rows.length === 0) {
              // Insert into student_programs
              await db.query(
                `INSERT INTO student_programs (student_id, program_id, kind)
                 VALUES ($1, $2, 'MINOR'::program_type)`,
                [userId, program.program_id]
              );
            }
          }
        }
      } catch (err) {
        results.warnings.push(
          `Failed to import programs for student ${studentObj.SBU_ID}: ${err.message}`
        );
        console.error(`[import] Error importing programs for student ${studentObj.SBU_ID}:`, err);
      }
    }

    /**
     * Import advisor metadata into advisors table
     */
    async function importAdvisorMetadata(db, advisorObj, userId) {
      if (!userId) return;

      const { level, academic_unit } = advisorObj;
      
      if (!level) {
        results.warnings.push(`Advisor ${advisorObj.SBU_ID} missing level field, skipping advisor metadata import`);
        return;
      }

      let departmentId = null;
      let collegeId = null;

      if (level === 'university') {
        // University-level advisors don't need department_id
        departmentId = null;
        collegeId = null;
      } else if (level === 'college') {
        // College-level advisors: map academic_unit (e.g., "CEAS", "CAS") to a department in that college
        const academicUnits = Array.isArray(academic_unit) ? academic_unit : [academic_unit];
        const collegeName = academicUnits[0]?.toUpperCase();
        
        if (!collegeName) {
          results.warnings.push(`Advisor ${advisorObj.SBU_ID} has college level but no academic_unit, skipping`);
          return;
        }

        // Map college names to college_id (CEAS = 1, CAS = 2, etc.)
        // For now, we'll try to find a department in that college
        // First, try to find the college_id by name or code
        let targetCollegeId = null;
        try {
          const collegeRes = await db.query(
            `SELECT college_id FROM colleges WHERE UPPER(name) = $1 OR UPPER(code) = $1 LIMIT 1`,
            [collegeName]
          );
          if (collegeRes.rows.length > 0) {
            targetCollegeId = collegeRes.rows[0].college_id;
          } else {
            // Fallback: assume CEAS = 1, CAS = 2
            if (collegeName === 'CEAS') {
              targetCollegeId = 1;
            } else if (collegeName === 'CAS') {
              targetCollegeId = 2;
            }
          }
        } catch (err) {
          // If colleges table doesn't exist or query fails, use fallback
          if (collegeName === 'CEAS') {
            targetCollegeId = 1;
          } else if (collegeName === 'CAS') {
            targetCollegeId = 2;
          }
        }

        if (targetCollegeId) {
          collegeId = targetCollegeId;
          // Find any department in this college to use as department_id
          try {
            const deptRes = await db.query(
              `SELECT department_id FROM departments WHERE college_id = $1 LIMIT 1`,
              [targetCollegeId]
            );
            if (deptRes.rows.length > 0) {
              departmentId = deptRes.rows[0].department_id;
            } else {
              results.warnings.push(`Advisor ${advisorObj.SBU_ID}: No departments found for college ${collegeName}, cannot set department_id`);
            }
          } catch (err) {
            results.warnings.push(`Advisor ${advisorObj.SBU_ID}: Error finding department for college ${collegeName}: ${err.message}`);
          }
        } else {
          results.warnings.push(`Advisor ${advisorObj.SBU_ID}: Unknown college ${collegeName}, skipping`);
          return;
        }
      } else if (level === 'department') {
        // Department-level advisors: map academic_unit (e.g., "CSE", "AMS") to department_id
        const academicUnits = Array.isArray(academic_unit) ? academic_unit : [academic_unit];
        const deptCode = academicUnits[0]?.toUpperCase();
        
        if (!deptCode) {
          results.warnings.push(`Advisor ${advisorObj.SBU_ID} has department level but no academic_unit, skipping`);
          return;
        }

        try {
          departmentId = await getOrCreateDepartment(db, deptCode);
        } catch (err) {
          results.warnings.push(`Advisor ${advisorObj.SBU_ID}: Error getting department for ${deptCode}: ${err.message}`);
          return;
        }
      } else {
        results.warnings.push(`Advisor ${advisorObj.SBU_ID}: Unknown level "${level}", skipping`);
        return;
      }

      // Insert or update advisor in advisors table
      try {
        // Try with college_id first (if column exists)
        try {
          await db.query(
            `INSERT INTO advisors (user_id, level, department_id, college_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) 
             DO UPDATE SET level = $2, department_id = $3, college_id = $4`,
            [userId, level, departmentId, collegeId]
          );
        } catch (colErr) {
          // If college_id column doesn't exist, try without it
          if (colErr.code === '42703') { // Undefined column
            await db.query(
              `INSERT INTO advisors (user_id, level, department_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id) 
               DO UPDATE SET level = $2, department_id = $3`,
              [userId, level, departmentId]
            );
          } else {
            throw colErr;
          }
        }
      } catch (err) {
        // If advisors table doesn't exist, log warning but don't fail
        if (err.code === '42P01') { // Table doesn't exist
          results.warnings.push(`Advisors table does not exist, skipping advisor metadata import for ${advisorObj.SBU_ID}`);
        } else if (err.code === '23505') { // Unique violation - try UPDATE instead
          try {
            await db.query(
              `UPDATE advisors SET level = $1, department_id = $2 WHERE user_id = $3`,
              [level, departmentId, userId]
            );
          } catch (updateErr) {
            results.warnings.push(`Failed to update advisor metadata for ${advisorObj.SBU_ID}: ${updateErr.message}`);
          }
        } else {
          results.warnings.push(`Failed to import advisor metadata for ${advisorObj.SBU_ID}: ${err.message}`);
        }
      }
    }

    for (const r of registrars) await insertUser(r, "Registrar");
    for (const a of academic_advisors) {
      const userId = await insertUser(a, "Advisor");
      if (userId) {
        await importAdvisorMetadata(req.db, a, userId);
      }
    }
    for (const i of instructors) await insertUser(i, "Instructor");
    
    // Import students and their majors/minors and classes
    for (const s of students) {
      const userId = await insertUser(s, "Student");
      if (userId) {
        await importStudentPrograms(req.db, userId, s, results);
        await importStudentClasses(req.db, userId, s, results);
      }
    }

    return res.status(200).json({
      status: "success",
      message: "Users imported",
      summary: {
        inserted: results.inserted,
        skipped: results.skipped,
        updated: results.updated,
        warnings: results.warnings,
        counts: {
          registrars: registrars.length,
          academic_advisors: academic_advisors.length,
          instructors: instructors.length,
          students: students.length,
        },
      },
    });
  } catch (err) {
    console.error("[YAML IMPORT ERROR]", err);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unexpected server error during user import.",
    });
  }
});

router.post("/rooms", upload.single("file"), async (req, res) => {
  console.log("[API] Room import request received");

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      error: "No file uploaded. Expected form field name: file",
    });
  }

  try {
    const filePath = req.file.path;
    const yamlText = fs.readFileSync(filePath, "utf8");
    
    // Debug: Log raw YAML text (first 500 chars) for troubleshooting
    console.log("[API] Raw YAML text (first 500 chars):", yamlText.substring(0, 500));
    
    const parsed = yaml.load(yamlText);

    try {
      fs.unlinkSync(filePath);
    } catch {}

    // Debug: Log parsed object structure
    console.log("[API] Parsed YAML type:", typeof parsed);
    console.log("[API] Parsed YAML keys:", parsed && typeof parsed === "object" ? Object.keys(parsed) : "N/A");
    console.log("[API] parsed.rooms type:", typeof parsed?.rooms);
    console.log("[API] parsed.rooms value:", parsed?.rooms);
    console.log("[API] parsed.rooms isArray:", Array.isArray(parsed?.rooms));

    if (!parsed || typeof parsed !== "object") {
      return res.status(400).json({
        status: "error",
        error: "YAML parsed but produced no valid data object.",
      });
    }

    // Check if parsed.rooms exists but is not an array
    if (parsed.rooms !== undefined && parsed.rooms !== null && !Array.isArray(parsed.rooms)) {
      return res.status(400).json({
        status: "error",
        error: `YAML contains "rooms" but it is not an array. Found type: ${typeof parsed.rooms}, value: ${JSON.stringify(parsed.rooms).substring(0, 200)}`,
      });
    }

    const rooms = parsed.rooms || [];
    if (!Array.isArray(rooms) || rooms.length === 0) {
      const availableKeys = Object.keys(parsed).join(", ");
      const roomsType = typeof parsed.rooms;
      const roomsValue = parsed.rooms === undefined ? "undefined" : parsed.rooms === null ? "null" : JSON.stringify(parsed.rooms).substring(0, 200);
      
      return res.status(400).json({
        status: "error",
        error: `YAML must contain a non-empty "rooms" array. Found keys: [${availableKeys}], parsed.rooms type: ${roomsType}, parsed.rooms value: ${roomsValue}`,
      });
    }

    const summary = { inserted: 0, updated: 0, skipped: 0, warnings: [] };

    for (const [idx, roomObj] of rooms.entries()) {
      if (!roomObj || typeof roomObj !== "object") {
        summary.skipped++;
        summary.warnings.push(`Entry ${idx}: not a valid room object`);
        continue;
      }

      const buildingRaw = roomObj.building ?? "";
      const roomRaw = roomObj.room ?? "";
      const building = String(buildingRaw).trim();
      const room = String(roomRaw).trim();
      const capacityRaw = roomObj.capacity;

      if (!building || !room || capacityRaw === undefined || capacityRaw === null) {
        summary.skipped++;
        summary.warnings.push(
          `Entry ${idx}: missing building/room/capacity (building='${buildingRaw}', room='${roomRaw}', capacity='${capacityRaw}')`
        );
        continue;
      }

      const capacity = Number(capacityRaw);
      if (!Number.isFinite(capacity) || capacity <= 0) {
        summary.skipped++;
        summary.warnings.push(
          `Entry ${idx}: invalid capacity '${capacityRaw}' for ${building} ${room}`
        );
        continue;
      }

      const result = await req.db.query(
        `
        INSERT INTO rooms (building, room, capacity)
        VALUES ($1, $2, $3)
        ON CONFLICT (building, room)
        DO UPDATE SET capacity = EXCLUDED.capacity
        RETURNING room_id, (xmax = 0) AS inserted
        `,
        [building, room, capacity]
      );

      const row = result.rows[0];
      if (row.inserted) summary.inserted++;
      else summary.updated++;
    }

    return res.status(200).json({
      status: "success",
      message: "Rooms imported",
      summary,
      logs: [
        `Inserted: ${summary.inserted}`,
        `Updated: ${summary.updated}`,
        `Skipped: ${summary.skipped}`,
        ...summary.warnings,
      ],
    });
  } catch (err) {
    console.error("[ROOM IMPORT ERROR]", err);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unexpected server error during room import.",
    });
  }
});

router.post("/schedule", upload.single("file"), async (req, res) => {
  console.log("[API] Schedule import request received");

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      error: 'No file uploaded. Expected form field name: "file".',
    });
  }

  const db = req.db;
  const termIdRaw = req.body.term_id;
  let termId = termIdRaw ? Number(termIdRaw) : NaN;

  const normalizeMeetingDays = (days) => {
    if (!days) return null;
    const s = String(days).toUpperCase();
    if (s === "TBA" || s === "APPT") return "TBA";
    const out = [];
    const allowed = ["M", "T", "W", "R", "F"];
    for (const ch of s) if (allowed.includes(ch) && !out.includes(ch)) out.push(ch);
    return out.length ? out.join("") : null;
  };

  const extractBuildingRoom = (locationText) => {
    if (!locationText) return { building: null, room: null };
    const s = String(locationText).trim();
    if (!s || /(^|\s)TBA(\s|$)/i.test(s)) return { building: null, room: null };

    const tokens = s.split(/\s+/).filter(Boolean);
    const roomRe = /^[A-Z]{0,3}\d{1,4}[A-Z]?$|^[A-Z]{1,4}\d{1,4}$/i;

    const idx = tokens.findIndex((t) => roomRe.test(t));
    if (idx <= 0) return { building: null, room: null };

    const building = tokens.slice(0, idx).join(" ").trim();
    const room = tokens[idx].trim();

    if (!building || !room) return { building: null, room: null };
    if (building.length > 100) return { building: building.slice(0, 100), room };
    if (room.length > 50) return { building, room: room.slice(0, 50) };

    return { building, room };
  };

  try {
    const filePath = req.file.path;
    const pdfBuffer = fs.readFileSync(filePath);

    let text = "";
    try {
      text = await extractPdfText(pdfBuffer);
    } finally {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    let extracted = null;
    if (!Number.isFinite(termId) || termId <= 0) {
      extracted = extractTermFromPdfText(text);
      if (!extracted) {
        return res.status(400).json({
          status: "error",
          error:
            "Missing term_id, and could not extract a term (e.g., 'Fall 2025') from the PDF.",
        });
      }

      const foundTermId = await lookupTermId(db, extracted.semester, extracted.year);
      if (!foundTermId) {
        return res.status(400).json({
          status: "error",
          error: `Extracted term '${extracted.semester} ${extracted.year}' from PDF, but no matching row exists in terms table.`,
        });
      }

      termId = Number(foundTermId);
      console.log(
        `[API] Term auto-detected from PDF → ${extracted.semester} ${extracted.year} (term_id=${termId})`
      );
    }

    // Debug: log first 2000 chars of PDF text to help diagnose parsing issues
    if (text.length > 0) {
      const sampleText = text.slice(0, 2000);
      console.log(`[API] PDF text sample (first 2000 chars):\n${sampleText}`);
      // Also log a few sample lines
      const sampleLines = text.split(/\r?\n/).slice(0, 20).filter(l => l.trim().length > 0);
      console.log(`[API] Sample PDF lines:\n${sampleLines.join('\n')}`);
    } else {
      console.warn('[API] WARNING: PDF text extraction returned empty string!');
    }

    const parsedSections = parseSocPdfToSections(text);
    console.log(`[API] Parsed ${parsedSections.length} section rows from PDF`);
    
    if (parsedSections.length === 0 && text.length > 100) {
      console.warn('[API] WARNING: No sections parsed but PDF has content. Check regex pattern.');
    }

    // Filter by subjects if provided
    let subjectsFilter = null;
    const subjectsParam = req.body.subjects;
    if (subjectsParam) {
      // Handle both array and comma-separated string
      if (Array.isArray(subjectsParam)) {
        subjectsFilter = subjectsParam.map(s => String(s).trim().toUpperCase()).filter(s => s.length > 0);
      } else if (typeof subjectsParam === 'string') {
        subjectsFilter = subjectsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
      }
      if (subjectsFilter.length > 0) {
        console.log(`[API] Filtering import to subjects: ${subjectsFilter.join(', ')}`);
      } else {
        subjectsFilter = null;
      }
    }

    // Apply subject filter if specified
    let filteredSections = parsedSections;
    if (subjectsFilter && subjectsFilter.length > 0) {
      filteredSections = parsedSections.filter(sec => 
        subjectsFilter.includes(sec.subject.toUpperCase())
      );
      console.log(`[API] Filtered from ${parsedSections.length} to ${filteredSections.length} sections for subjects: ${subjectsFilter.join(', ')}`);
    }

    // Log first few parsed sections for debugging
    if (filteredSections.length > 0) {
      console.log(`[API] Sample parsed sections (first 3):`, filteredSections.slice(0, 3).map(s => ({
        subject: s.subject,
        courseNum: s.courseNum,
        sectionNum: s.sectionNum,
        meetingDays: s.meetingDays,
        meetingTimes: s.meetingTimes
      })));
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const warnings = [];
    const subjectCounts = {};

    for (const sec of filteredSections) {
      const { subject, courseNum, sectionNum, meetingDays, meetingTimes, locationText, instructorName } = sec;

      // Track subjects being processed
      if (!subjectCounts[subject]) subjectCounts[subject] = { total: 0, found: 0, notFound: [] };
      subjectCounts[subject].total++;

      const courseRes = await db.query(
        `
        SELECT course_id
        FROM courses
        WHERE subject = $1
          AND course_num = $2
        LIMIT 1
        `,
        [subject, courseNum]
      );

      if (courseRes.rows.length === 0) {
        skipped++;
        subjectCounts[subject].notFound.push(`${subject} ${courseNum}`);
        warnings.push(
          `No course found for ${subject} ${courseNum} (section ${sectionNum}); skipping.`
        );
        continue;
      }

      subjectCounts[subject].found++;
      const courseId = courseRes.rows[0].course_id;

      const normDays = normalizeMeetingDays(meetingDays);
      // Use building/room/instructorName already extracted by splitLocationTail during parsing
      const building = sec.building || null;
      const room = sec.room || null;
      const instructorNameFromSec = sec.instructorName || null;

      let roomId = null;
      let capacity = 50; // Default capacity if no room

      if (building && room) {
        // First, check if room already exists and get its capacity
        const existingRoomRes = await db.query(
          `
          SELECT room_id, capacity
          FROM rooms
          WHERE building = $1 AND room = $2
          LIMIT 1
          `,
          [building, room]
        );

        if (existingRoomRes.rows.length > 0) {
          // Room exists - use its capacity
          roomId = existingRoomRes.rows[0].room_id;
          capacity = Number(existingRoomRes.rows[0].capacity) || 50;
        } else {
          // Room doesn't exist - insert with default capacity
          await db.query(
            `
            INSERT INTO rooms (building, room, capacity)
            VALUES ($1, $2, $3)
            ON CONFLICT (building, room) DO NOTHING
            `,
            [building, room, capacity]
          );

          // Get the room_id after insert
          const roomRes = await db.query(
            `
            SELECT room_id, capacity
            FROM rooms
            WHERE building = $1 AND room = $2
            LIMIT 1
            `,
            [building, room]
          );

          if (roomRes.rows.length > 0) {
            roomId = roomRes.rows[0].room_id;
            capacity = Number(roomRes.rows[0].capacity) || 50;
          }
        }
      }

      // Try to match instructor by name
      let instructorId = null;
      if (instructorNameFromSec && instructorNameFromSec.toUpperCase() !== 'TBA') {
        // Try to match instructor by first and last name
        // Handle names like "Scott Stoller", "S.N. Sridhar", "Hyun-Kyung Lim"
        const nameParts = instructorNameFromSec.trim().split(/\s+/).filter(p => p.length > 0);
        if (nameParts.length >= 2) {
          // Try exact match first (last name, first name)
          const lastName = nameParts[nameParts.length - 1];
          const firstName = nameParts[0];
          
          const instRes = await db.query(
            `
            SELECT user_id
            FROM users
            WHERE role = 'Instructor'
              AND (
                (LOWER(last_name) = LOWER($1) AND LOWER(first_name) = LOWER($2))
                OR (LOWER(last_name) = LOWER($1) AND LOWER(first_name) LIKE LOWER($2 || '%'))
                OR (LOWER(last_name) LIKE LOWER($1 || '%') AND LOWER(first_name) = LOWER($2))
              )
            LIMIT 1
            `,
            [lastName, firstName]
          );
          
          if (instRes.rows.length > 0) {
            instructorId = instRes.rows[0].user_id;
          }
        }
      }

      // Store location_text: if we have building+room, use that; otherwise keep original (may contain instructor name for later extraction)
      // If instructor was matched, we can clean it. If not matched but we have instructor name, keep it in location_text for display
      const cleanLocationText = (building && room && instructorId) 
        ? `${building} ${room}` 
        : (building && room && !instructorNameFromSec)
          ? `${building} ${room}`
          : locationText; // Keep original if instructor name exists but wasn't matched

      const result = await db.query(
        `
        INSERT INTO class_sections
          (course_id, term_id, section_num, capacity, meeting_days, meeting_times, location_text, room_id, instructor_id)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (course_id, term_id, section_num)
        DO UPDATE SET
          meeting_days   = EXCLUDED.meeting_days,
          meeting_times  = EXCLUDED.meeting_times,
          location_text  = EXCLUDED.location_text,
          capacity       = EXCLUDED.capacity,
          room_id        = EXCLUDED.room_id,
          instructor_id  = EXCLUDED.instructor_id
        RETURNING (xmax = 0) AS inserted, class_id
        `,
        [
          courseId,
          termId,
          sectionNum,
          capacity,
          normDays || null,
          meetingTimes || null,
          cleanLocationText || null,
          roomId,
          instructorId,
        ]
      );

      const wasInserted = result.rows[0]?.inserted;
      const classId = result.rows[0]?.class_id;
      
      // Insert instructor into junction table if matched
      if (instructorId && classId) {
        try {
          await db.query(
            `
            INSERT INTO class_section_instructors (class_id, instructor_id)
            VALUES ($1, $2)
            ON CONFLICT (class_id, instructor_id) DO NOTHING
            `,
            [classId, instructorId]
          );
        } catch (e) {
          // If table doesn't exist yet (migration not run), that's okay - instructor_id is still set
          if (!e.message.includes('class_section_instructors')) {
            console.warn(`[API] Failed to insert instructor into junction table:`, e.message);
          }
        }
      }
      
      if (wasInserted) {
        inserted++;
        console.log(`[API] INSERTED: ${subject} ${courseNum}-${sectionNum} (class_id=${classId})`);
      } else {
        updated++;
        console.log(`[API] UPDATED: ${subject} ${courseNum}-${sectionNum} (class_id=${classId})`);
      }
    }

    // Log summary by subject
    console.log(`[API] Import summary by subject:`);
    Object.keys(subjectCounts).forEach(subj => {
      const stats = subjectCounts[subj];
      console.log(`[API]   ${subj}: ${stats.found}/${stats.total} courses found in DB`);
      if (stats.notFound.length > 0 && stats.notFound.length <= 10) {
        console.log(`[API]     Missing courses: ${stats.notFound.join(', ')}`);
      } else if (stats.notFound.length > 10) {
        console.log(`[API]     Missing courses: ${stats.notFound.slice(0, 10).join(', ')} ... and ${stats.notFound.length - 10} more`);
      }
    });

    return res.status(200).json({
      status: "success",
      message: "Schedule import completed",
      summary: {
        term_id: termId,
        extracted_term: extracted ? `${extracted.semester} ${extracted.year}` : null,
        parsed: parsedSections.length,
        inserted,
        updated,
        skipped,
        warnings,
      },
    });
  } catch (err) {
    console.error("[SCHEDULE IMPORT ERROR]", err);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unexpected server error during schedule import.",
    });
  }
});

/**
 * POST /api/import/users/set-default-passwords
 * Utility route to set default password "password" for all users missing password_hash.
 * This is useful for fixing users imported from users1.yaml (which doesn't have passwords).
 * Only works when ENABLE_AUTH_BYPASS environment variable is set to 'true'
 */
router.post("/users/set-default-passwords", async (req, res) => {
  // Check if bypass authentication is enabled
  if (process.env.ENABLE_AUTH_BYPASS !== 'true') {
    return res.status(403).json({ 
      error: "This utility is only available when ENABLE_AUTH_BYPASS is enabled." 
    });
  }

  try {
    const defaultPassword = "password";
    
    // Update all users with null or empty password_hash
    const result = await req.db.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE password_hash IS NULL OR password_hash = ''
       RETURNING user_id, email, first_name, last_name`,
      [defaultPassword]
    );

    return res.status(200).json({
      status: "success",
      message: `Set default password for ${result.rows.length} user(s)`,
      updated_users: result.rows.map(u => ({
        user_id: u.user_id,
        email: u.email,
        name: `${u.first_name} ${u.last_name}`
      })),
      count: result.rows.length
    });
  } catch (err) {
    console.error("[SET DEFAULT PASSWORDS ERROR]", err);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unexpected server error while setting default passwords.",
    });
  }
});

/**
 * POST /api/import/users/update-password
 * Utility route to update a specific user's password by email.
 * Only works when ENABLE_AUTH_BYPASS environment variable is set to 'true'
 */
router.post("/users/update-password", async (req, res) => {
  // Check if bypass authentication is enabled
  if (process.env.ENABLE_AUTH_BYPASS !== 'true') {
    return res.status(403).json({ 
      error: "This utility is only available when ENABLE_AUTH_BYPASS is enabled." 
    });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      error: "Email and password are required"
    });
  }

  try {
    // Update the user's password
    const result = await req.db.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE LOWER(email) = LOWER($2)
       RETURNING user_id, email, first_name, last_name, role`,
      [password, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        error: `User with email ${email} not found`
      });
    }

    return res.status(200).json({
      status: "success",
      message: `Password updated for ${result.rows[0].email}`,
      user: {
        user_id: result.rows[0].user_id,
        email: result.rows[0].email,
        name: `${result.rows[0].first_name} ${result.rows[0].last_name}`,
        role: result.rows[0].role
      }
    });
  } catch (err) {
    console.error("[UPDATE PASSWORD ERROR]", err);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unexpected server error while updating password.",
    });
  }
});

/**
 * GET /api/import/rooms/check-course/:subject/:courseNum
 * Check all sections of a course for room linkage and capacity status
 */
router.get("/rooms/check-course/:subject/:courseNum", async (req, res) => {
  try {
    const { subject, courseNum } = req.params;
    
    const result = await req.db.query(
      `
      SELECT cs.class_id, cs.section_num, cs.capacity AS section_capacity, cs.location_text, cs.room_id,
             r.building, r.room, r.capacity AS room_capacity,
             c.subject, c.course_num, t.semester, t.year
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON cs.room_id = r.room_id
      WHERE UPPER(c.subject) = UPPER($1) AND c.course_num = $2
      ORDER BY t.year DESC, t.semester ASC, cs.section_num
      `,
      [subject, courseNum]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `No sections found for ${subject} ${courseNum}` });
    }

    // For each section, find matching rooms
    const sectionsWithMatches = await Promise.all(result.rows.map(async (row) => {
      let matchingRooms = [];
      if (row.location_text) {
        const allRooms = await req.db.query(`SELECT room_id, building, room, capacity FROM rooms`);
        for (const room of allRooms.rows) {
          const buildingMatch = row.location_text.toUpperCase().includes(room.building.toUpperCase());
          const roomMatch = row.location_text.includes(room.room);
          if (buildingMatch && roomMatch) {
            matchingRooms.push(room);
          }
        }
      }
      
      return {
        classId: row.class_id,
        sectionNum: row.section_num,
        term: `${row.semester} ${row.year}`,
        sectionCapacity: row.section_capacity,
        locationText: row.location_text,
        currentRoom: row.room_id ? {
          roomId: row.room_id,
          building: row.building,
          room: row.room,
          capacity: row.room_capacity,
        } : null,
        matchingRooms: matchingRooms,
        inSync: row.room_id ? row.section_capacity === row.room_capacity : false,
      };
    }));

    return res.json({
      course: `${subject} ${courseNum}`,
      sections: sectionsWithMatches,
    });
  } catch (err) {
    console.error("[CHECK COURSE ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/import/rooms/check-section/:classId
 * Check a specific class section's room linkage and capacity status
 */
router.get("/rooms/check-section/:classId", async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid classId" });
    }

    const result = await req.db.query(
      `
      SELECT cs.class_id, cs.capacity AS section_capacity, cs.location_text, cs.room_id,
             r.building, r.room, r.capacity AS room_capacity,
             c.subject, c.course_num
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      LEFT JOIN rooms r ON cs.room_id = r.room_id
      WHERE cs.class_id = $1
      `
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Class section not found" });
    }

    const row = result.rows[0];
    
    // Check if there's a room that matches location_text
    let matchingRooms = [];
    if (row.location_text) {
      const roomMatches = await req.db.query(
        `
        SELECT room_id, building, room, capacity
        FROM rooms
        WHERE (
          location_text = building || ' ' || room
          OR location_text = building || room
          OR location_text LIKE building || ' ' || room || '%'
          OR location_text LIKE building || room || '%'
          OR (location_text LIKE '%' || building || '%' AND location_text LIKE '%' || room || '%')
        )
        AND location_text = $1
        `,
        [row.location_text]
      );
      
      // Also try matching by extracting building/room from location_text
      const allRooms = await req.db.query(`SELECT room_id, building, room, capacity FROM rooms`);
      for (const room of allRooms.rows) {
        if (row.location_text.includes(room.building) && row.location_text.includes(room.room)) {
          matchingRooms.push(room);
        }
      }
    }

    return res.json({
      classId: row.class_id,
      course: `${row.subject} ${row.course_num}`,
      sectionCapacity: row.section_capacity,
      locationText: row.location_text,
      currentRoom: row.room_id ? {
        roomId: row.room_id,
        building: row.building,
        room: row.room,
        capacity: row.room_capacity,
      } : null,
      matchingRooms: matchingRooms.length > 0 ? matchingRooms : null,
      inSync: row.room_id ? row.section_capacity === row.room_capacity : false,
    });
  } catch (err) {
    console.error("[CHECK SECTION ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/import/rooms/force-sync-hvy-engr-lab
 * Force sync HVY ENGR LAB 201 sections (specific fix for AMS380)
 */
router.post("/rooms/force-sync-hvy-engr-lab", async (req, res) => {
  try {
    const db = req.db;
    
    // Find the HVY ENGR LAB 201 room
    const roomRes = await db.query(
      `SELECT room_id, building, room, capacity FROM rooms WHERE UPPER(building) LIKE '%HVY ENGR LAB%' AND room = '201' LIMIT 1`
    );
    
    if (roomRes.rows.length === 0) {
      return res.status(404).json({ error: "HVY ENGR LAB 201 room not found" });
    }
    
    const room = roomRes.rows[0];
    
    // Find all sections with location_text containing "HVY ENGR LAB" and "201"
    const sectionsRes = await db.query(
      `
      SELECT cs.class_id, cs.capacity, cs.location_text, cs.room_id, c.subject, c.course_num
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      WHERE cs.location_text LIKE '%HVY ENGR LAB%' AND cs.location_text LIKE '%201%'
      `
    );
    
    const updates = [];
    for (const section of sectionsRes.rows) {
      // Update room_id if not set or wrong
      if (section.room_id !== room.room_id) {
        await db.query(
          `UPDATE class_sections SET room_id = $1 WHERE class_id = $2`,
          [room.room_id, section.class_id]
        );
        updates.push({ classId: section.class_id, action: 'linked', oldRoomId: section.room_id });
      }
      
      // Update capacity if different
      if (section.capacity !== room.capacity) {
        await db.query(
          `UPDATE class_sections SET capacity = $1 WHERE class_id = $2`,
          [room.capacity, section.class_id]
        );
        updates.push({ 
          classId: section.class_id, 
          course: `${section.subject} ${section.course_num}`,
          action: 'capacity updated', 
          oldCapacity: section.capacity, 
          newCapacity: room.capacity 
        });
      }
    }
    
    return res.json({
      status: "success",
      message: `Updated ${updates.length} section(s) for HVY ENGR LAB 201`,
      room: { building: room.building, room: room.room, capacity: room.capacity },
      updates,
    });
  } catch (err) {
    console.error("[FORCE SYNC ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/import/rooms/sync-capacities
 * Utility endpoint to sync class section capacities with their room capacities.
 * 1. Links class sections to rooms based on location_text if not already linked
 * 2. Updates all class sections that have a room_id to use the room's capacity
 */
router.post("/rooms/sync-capacities", async (req, res) => {
  console.log("[API] Syncing class section capacities with room capacities");

  try {
    const db = req.db;
    
    // Step 1: Link class sections to rooms based on location_text if not already linked
    // Extract building and room from location_text and match with rooms table
    // Handle formats like "HVY ENGR LAB201", "HVY ENGR LAB 201", "FREY HALL 317", etc.
    // Also handle cases where location_text contains instructor names: "HVY ENGR LAB201Instructor Name"
    const linkResult = await db.query(
      `
      UPDATE class_sections cs
      SET room_id = r.room_id
      FROM rooms r
      WHERE cs.room_id IS NULL
        AND cs.location_text IS NOT NULL
        AND (
          -- Exact match: "BUILDING ROOM"
          cs.location_text = r.building || ' ' || r.room
          -- Match: "BUILDINGROOM" (no space)
          OR cs.location_text = r.building || r.room
          -- Match: "BUILDING ROOM" with extra text (e.g., instructor name)
          OR cs.location_text LIKE r.building || ' ' || r.room || '%'
          -- Match: "BUILDINGROOM" with extra text (e.g., "HVY ENGR LAB201Instructor")
          OR cs.location_text LIKE r.building || r.room || '%'
          -- Match: building and room anywhere in text (more flexible)
          OR (
            cs.location_text LIKE '%' || r.building || '%' 
            AND cs.location_text LIKE '%' || r.room || '%'
            -- Ensure room number appears after building (to avoid false matches)
            AND POSITION(r.room IN cs.location_text) > POSITION(r.building IN cs.location_text)
          )
        )
      RETURNING cs.class_id, cs.location_text, r.building, r.room, r.room_id, r.capacity AS room_capacity
      `
    );

    const linked = linkResult.rows.length;
    if (linked > 0) {
      console.log(`[API] Linked ${linked} class section(s) to rooms based on location_text`);
      linkResult.rows.forEach(row => {
        console.log(`[API]   - Class ID ${row.class_id}: "${row.location_text}" -> ${row.building} ${row.room} (room_id: ${row.room_id})`);
      });
    } else {
      // Debug: Check if there are sections without room_id that might match
      const unlinkedSections = await db.query(
        `SELECT class_id, location_text FROM class_sections WHERE room_id IS NULL AND location_text IS NOT NULL LIMIT 5`
      );
      if (unlinkedSections.rows.length > 0) {
        console.log(`[API] Found ${unlinkedSections.rows.length} section(s) without room_id (sample):`);
        unlinkedSections.rows.forEach(row => {
          console.log(`[API]   - Class ID ${row.class_id}: location_text="${row.location_text}"`);
        });
      }
      
      // Debug: Check for AMS380 specifically
      const ams380Check = await db.query(
        `
        SELECT cs.class_id, cs.capacity, cs.location_text, cs.room_id, 
               r.building, r.room, r.capacity AS room_capacity
        FROM class_sections cs
        LEFT JOIN rooms r ON cs.room_id = r.room_id
        JOIN courses c ON c.course_id = cs.course_id
        WHERE c.subject = 'AMS' AND c.course_num = '380'
        LIMIT 10
        `
      );
      if (ams380Check.rows.length > 0) {
        console.log(`[API] AMS380 sections found:`);
        ams380Check.rows.forEach(row => {
          console.log(`[API]   - Class ID ${row.class_id}: capacity=${row.capacity}, room_id=${row.room_id}, location_text="${row.location_text}"`);
          if (row.room_id) {
            console.log(`[API]     Room: ${row.building} ${row.room}, capacity=${row.room_capacity}`);
          }
        });
      }
    }

    // Step 2: Get all sections that need capacity updates (including newly linked ones)
    // Also include sections that were just linked
    const sectionsToUpdate = await db.query(
      `
      SELECT cs.class_id, cs.capacity AS old_capacity, r.capacity AS new_capacity, r.building, r.room
      FROM class_sections cs
      JOIN rooms r ON cs.room_id = r.room_id
      WHERE cs.capacity != r.capacity
      ORDER BY cs.class_id
      `
    );

    if (sectionsToUpdate.rows.length === 0) {
      return res.status(200).json({
        status: "success",
        message: linked > 0 
          ? `Linked ${linked} class section(s) to rooms. All capacities are already in sync.`
          : "All class section capacities are already in sync with room capacities.",
        updated: 0,
        linked,
        updates: [],
      });
    }

    // Step 3: Update all class sections that have a room_id to use the room's capacity
    await db.query(
      `
      UPDATE class_sections cs
      SET capacity = r.capacity
      FROM rooms r
      WHERE cs.room_id = r.room_id
        AND cs.capacity != r.capacity
      `
    );

    const result = sectionsToUpdate;

    const updated = result.rows.length;
    const updates = result.rows.map(row => ({
      classId: row.class_id,
      building: row.building,
      room: row.room,
      oldCapacity: row.old_capacity,
      newCapacity: row.new_capacity,
    }));

    console.log(`[API] Updated ${updated} class sections with room capacities`);

    return res.status(200).json({
      status: "success",
      message: `Linked ${linked} section(s) and synced ${updated} class section capacity(ies) with room capacity(ies).`,
      updated,
      linked,
      updates,
    });
  } catch (err) {
    console.error("[ROOM CAPACITY SYNC ERROR]", err);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unexpected server error during capacity sync.",
    });
  }
});


export default router;
