import express from "express";
import multer from "multer";
import yaml from "js-yaml";

const router = express.Router();
const upload = multer();

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

    //Check if the program already exists
    const existsQuery = `
      SELECT id FROM degree_requirements
      WHERE subject = $1 AND degree_type = $2
    `;
    const existsResult = await req.db.query(existsQuery, [subject, degree_type]);

    if (existsResult.rows.length > 0) {
      return res.status(409).json({ 
        error: `Degree program "${subject} ${degree_type}" already exists.` 
      });
    }

    //insert if not exists
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

    const result = await req.db.query(insertQuery, values);

    res.json({ message: "Degree requirements imported successfully", id: result.rows[0].id });

  } catch (err) {
    console.error("YAML import error:", err);
    res.status(500).json({ error: "Server error importing YAML file" });
  }
});

export default router;



