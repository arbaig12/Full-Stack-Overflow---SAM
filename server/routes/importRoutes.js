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

  const match =
    /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(AM|PM)$/i.exec(timeStr.trim());
  if (!match) return timeStr;

  let [, h1, m1, h2, m2, suffix] = match;
  let hour1 = parseInt(h1, 10);
  let hour2 = parseInt(h2, 10);
  const isPM = suffix.toUpperCase() === "PM";

  if (isPM && hour1 !== 12) hour1 += 12;
  if (!isPM && hour1 === 12) hour1 = 0;

  if (isPM && hour2 !== 12) hour2 += 12;
  if (!isPM && hour2 === 12) hour2 = 0;

  return `${String(hour1).padStart(2, "0")}:${m1}-${String(hour2).padStart(
    2,
    "0"
  )}:${m2}`;
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
 * Given the tail text (e.g. "FREY HALL 205 Aruna Sharma"),
 * split out building and room. Instructor text is ignored
 * for DB purposes.
 */
function splitLocationTail(tail) {
  if (!tail) {
    return { building: null, room: null };
  }

  const tokens = tail.trim().split(/\s+/);
  if (tokens.length < 2) {
    return { building: null, room: null };
  }

  // Find the first token that "looks like" a room code (205, E4310, N107, etc.)
  const roomIndex = tokens.findIndex((tok) => /^[A-Z0-9]{2,8}$/.test(tok));

  if (roomIndex <= 0) {
    // Either no room-ish token, or it's the first token ("TBA TBA ...").
    return { building: null, room: null };
  }

  const buildingTokens = tokens.slice(0, roomIndex);
  const roomToken = tokens[roomIndex];

  const building = buildingTokens.join(" ");
  const room = roomToken;

  // Treat "TBA" as no real location.
  if (!building || !room || building.toUpperCase() === "TBA" || room.toUpperCase() === "TBA") {
    return { building: null, room: null };
  }

  return { building, room };
}

function parseSocPdfToSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];

  let currentSubject = null;
  let currentCourseNum = null;

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const courseMatch = /^([A-Z]{2,4})\s+(\d{3})\b/.exec(line);
    if (courseMatch) {
      currentSubject = courseMatch[1];
      currentCourseNum = courseMatch[2];
      continue;
    }

    if (!currentSubject || !currentCourseNum) continue;

    const secMatch =
      /^(\d{5})\s+(LEC|REC|LAB|SEM|TUT|CLN|SUP|STU)\s+(\S+)\s+([A-Z]+|APPT)\s+([\d:APM\-]+|TBA)\s+(\d{2}-[A-Z]{3}-\d{4})\s+(\d{2}-[A-Z]{3}-\d{4})\s+(.+)$/.exec(
        line
      );

    if (!secMatch) continue;

    const sectionNum = secMatch[3];
    const days = secMatch[4];
    const times = secMatch[5];
    const tail = secMatch[8];

    const { building, room } = splitLocationTail(tail);

    sections.push({
      subject: currentSubject,
      courseNum: currentCourseNum,
      sectionNum,
      meetingDays: days === "APPT" ? "TBA" : days,
      meetingTimes: toMilitaryTimeRange(times),
      locationText: tail,
      building,
      room,
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

    const {
      registrars = [],
      academic_advisors = [],
      instructors = [],
      students = [],
    } = parsed;

    const results = { inserted: 0, skipped: 0, warnings: [] };

    async function insertUser(obj, role) {
      const { SBU_ID, first_name, last_name, email } = obj;

      if (!SBU_ID || !email || !first_name || !last_name) {
        results.skipped++;
        results.warnings.push(`Missing fields for SBU_ID=${SBU_ID ?? "(none)"}`);
        return null;
      }

      const check = await req.db.query(
        `SELECT user_id FROM users WHERE sbu_id = $1`,
        [SBU_ID]
      );

      if (check.rows.length > 0) {
        results.skipped++;
        results.warnings.push(`User already exists: SBU_ID=${SBU_ID}`);
        return check.rows[0].user_id;
      }

      const r = await req.db.query(
        `INSERT INTO users (sbu_id, first_name, last_name, email, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id`,
        [SBU_ID, first_name, last_name, email, role]
      );

      results.inserted++;
      return r.rows[0].user_id;
    }

    for (const r of registrars) await insertUser(r, "Registrar");
    for (const a of academic_advisors) await insertUser(a, "Advisor");
    for (const i of instructors) await insertUser(i, "Instructor");
    for (const s of students) await insertUser(s, "Student");

    return res.status(200).json({
      status: "success",
      message: "Users imported",
      summary: {
        inserted: results.inserted,
        skipped: results.skipped,
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

    const rooms = parsed.rooms || [];
    if (!Array.isArray(rooms) || rooms.length === 0) {
      return res.status(400).json({
        status: "error",
        error: 'YAML must contain a non-empty "rooms" array.',
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

    const parsedSections = parseSocPdfToSections(text);
    console.log(`[API] Parsed ${parsedSections.length} section rows from PDF`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const warnings = [];

    for (const sec of parsedSections) {
      const { subject, courseNum, sectionNum, meetingDays, meetingTimes, locationText } = sec;

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
        warnings.push(
          `No course found for ${subject} ${courseNum} (section ${sectionNum}); skipping.`
        );
        continue;
      }

      const courseId = courseRes.rows[0].course_id;
      const capacity = 50;

      const normDays = normalizeMeetingDays(meetingDays);
      const { building, room } = extractBuildingRoom(locationText);

      let roomId = null;
      if (building && room) {
        await db.query(
          `
          INSERT INTO rooms (building, room, capacity)
          VALUES ($1, $2, $3)
          ON CONFLICT (building, room) DO NOTHING
          `,
          [building, room, capacity]
        );

        const roomRes = await db.query(
          `
          SELECT room_id
          FROM rooms
          WHERE building = $1 AND room = $2
          LIMIT 1
          `,
          [building, room]
        );

        roomId = roomRes.rows[0]?.room_id ?? null;
      }

      const result = await db.query(
        `
        INSERT INTO class_sections
          (course_id, term_id, section_num, capacity, meeting_days, meeting_times, location_text, room_id)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (course_id, term_id, section_num)
        DO UPDATE SET
          meeting_days   = EXCLUDED.meeting_days,
          meeting_times  = EXCLUDED.meeting_times,
          location_text  = EXCLUDED.location_text,
          capacity       = EXCLUDED.capacity,
          room_id        = EXCLUDED.room_id
        RETURNING (xmax = 0) AS inserted
        `,
        [
          courseId,
          termId,
          sectionNum,
          capacity,
          normDays || null,
          meetingTimes || null,
          locationText || null,
          roomId,
        ]
      );

      if (result.rows[0]?.inserted) inserted++;
      else updated++;
    }

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


export default router;
