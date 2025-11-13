import express from "express";
import multer from "multer";
import yaml from "js-yaml";
import { importAcademicCalendar } from "./academicCalendarModel.js";

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

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await importAcademicCalendar(req.db, data);

    if (result.error) {
      return res.status(409).json({ error: result.error });
    }

    res.json({
      message: `Academic calendar for ${result.term.semester} ${result.term.year} imported successfully`,
      id: result.id,
    });
  } catch (err) {
    console.error("YAML import error:", err);
    res.status(500).json({ error: "Server error importing YAML file" });
  }
});

export default router;
