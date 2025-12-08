import express from "express";
import multer from "multer";
import yaml from "js-yaml";

const router = express.Router();
const upload = multer();

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

router.post("/degree-requirements", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const yamlText = req.file.buffer.toString("utf8");
    let data;
    try {
      data = yaml.load(yamlText);
    } catch (e) {
      return res.status(400).json({ error: "Invalid YAML file" });
    }

    const { subject, degree_type, type, effective_term, admission_requirements, degree_requirements } = data;

    if (!subject || !degree_type || !type) {
      return res.status(400).json({ error: "YAML missing required fields: subject, degree_type, type" });
    }

    if (!req.db) return res.status(500).json({ error: "Database connection not found" });

    const db = req.db;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Check if the degree requirement already exists
      const existsQuery = `
        SELECT id FROM degree_requirements
        WHERE subject = $1 AND degree_type = $2
      `;
      const existsResult = await client.query(existsQuery, [subject, degree_type]);

      if (existsResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ 
          error: `Degree program "${subject} ${degree_type}" already exists.` 
        });
      }

      // Get or create department
      const departmentId = await getOrCreateDepartment(client, subject);

      // Insert degree requirements
      const insertQuery = `
        INSERT INTO degree_requirements
        (subject, degree_type, program_type, effective_term, admission_requirements, degree_requirements)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)
        RETURNING id
      `;
      const values = [
        subject,
        degree_type,
        type,
        JSON.stringify(effective_term || {}),
        JSON.stringify(admission_requirements || {}),
        JSON.stringify(degree_requirements || {})
      ];

      const result = await client.query(insertQuery, values);
      const degreeReqId = result.rows[0].id;

      // Create program entry in programs table
      const programType = type.toUpperCase() === 'MAJOR' ? 'MAJOR' : 'MINOR';
      const programCode = `${subject}-${degree_type}`;
      const programName = type === 'major' 
        ? `${subject} ${degree_type}` 
        : `${subject} ${type.charAt(0).toUpperCase() + type.slice(1)}`;

      // Check if program already exists
      const programExists = await client.query(
        `SELECT program_id FROM programs WHERE code = $1`,
        [programCode]
      );

      let programId;
      if (programExists.rows.length > 0) {
        programId = programExists.rows[0].program_id;
        // Update existing program to link to degree requirements
        await client.query(
          `UPDATE programs SET department_id = $1, is_active = true WHERE program_id = $2`,
          [departmentId, programId]
        );
      } else {
        // Create new program
        const programResult = await client.query(
          `INSERT INTO programs (code, name, type, department_id, is_active)
           VALUES ($1, $2, $3::program_type, $4, true)
           RETURNING program_id`,
          [programCode, programName, programType, departmentId]
        );
        programId = programResult.rows[0].program_id;
      }

      await client.query('COMMIT');

      res.json({ 
        message: "Degree requirements imported successfully", 
        id: degreeReqId,
        programId: programId,
        programCode: programCode,
        programName: programName
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error("YAML import error:", err);
    res.status(500).json({ error: "Server error importing YAML file" });
  }
});

export default router;



