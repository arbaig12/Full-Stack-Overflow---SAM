import express from "express";
import multer from "multer";
import yaml from "js-yaml";

const router = express.Router();
const upload = multer();

// POST /academic-calendar — upload YAML file
router.post("/academic-calendar", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const yamlText = req.file.buffer.toString("utf8");

    let data;
    try {
      data = yaml.load(yamlText);
    } catch (e) {
      return res.status(400).json({ error: "Invalid YAML file" });
    }

    // Validate required structure
    if (!data.academic_calendar || !data.academic_calendar.term) {
      return res.status(400).json({
        error: "YAML must include academic_calendar with a term field",
      });
    }

    const {
      term,
      major_and_minor_changes_end,
      waitlist,
      waitlist_process_ends,
      late_registration_ends,
      GPNC_selection_ends,
      course_withdrawal_ends,
      major_and_minor_changes_begin,
      advanced_registration_begins,
      semester_end,
    } = data.academic_calendar;

    if (!term.semester || !term.year) {
      return res.status(400).json({ error: "Term must include semester and year" });
    }

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    // Check if the term already exists
    const existsQuery = `
      SELECT id FROM academic_calendar
      WHERE (term->>'semester') = $1 AND (term->>'year') = $2
    `;
    const existsResult = await req.db.query(existsQuery, [term.semester, String(term.year)]);

    if (existsResult.rows.length > 0) {
      return res.status(409).json({
        error: `Academic calendar for ${term.semester} ${term.year} already exists.`,
      });
    }

    // Insert new record
    const insertQuery = `
      INSERT INTO academic_calendar (
        term,
        major_and_minor_changes_end,
        waitlist,
        waitlist_process_ends,
        late_registration_ends,
        GPNC_selection_ends,
        course_withdrawal_ends,
        major_and_minor_changes_begin,
        advanced_registration_begins,
        semester_end
      )
      VALUES (
        $1::jsonb,
        $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      RETURNING id
    `;

    const values = [
      JSON.stringify(term),
      major_and_minor_changes_end || null,
      waitlist || null,
      waitlist_process_ends || null,
      late_registration_ends || null,
      GPNC_selection_ends || null,
      course_withdrawal_ends || null,
      major_and_minor_changes_begin || null,
      advanced_registration_begins || null,
      semester_end || null,
    ];

    const result = await req.db.query(insertQuery, values);

    res.json({
      message: `Academic calendar for ${term.semester} ${term.year} imported successfully`,
      id: result.rows[0].id,
    });
  } catch (err) {
    console.error("YAML import error:", err);
    res.status(500).json({ error: "Server error importing YAML file" });
  }
});

export default router;
