/**
 * @file registrationRoutes.js
 * @description This file defines the Express router for handling registration operations.
 * It exposes API endpoints for students to register, drop, and withdraw from classes,
 * and for registrars to override enrollment.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires ./registrationModel.js - The model functions for the Registration concept.
 */

import express from "express";
import { register, drop, withdraw, overrideEnroll } from "./registrationModel.js";

const router = express.Router();

/**
 * @route POST /api/registration/register
 * @description Allows a student to register for a class.
 *
 * @param {object} req.body - Request body containing studentId and classId.
 * @returns {object} 200 - Success response with a message.
 * @returns {object} 400 - Error response if parameters are missing.
 * @returns {object} 500 - Server error response.
 */
router.post("/register", async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ error: "Missing studentId or classId." });
    }

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await register(req.db, studentId, classId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ message: result.message, status: result.status });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Server error during registration." });
  }
});

/**
 * @route POST /api/registration/drop
 * @description Allows a student to drop a class.
 *
 * @param {object} req.body - Request body containing studentId and classId.
 * @returns {object} 200 - Success response with a message.
 * @returns {object} 400 - Error response if parameters are missing.
 * @returns {object} 500 - Server error response.
 */
router.post("/drop", async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ error: "Missing studentId or classId." });
    }

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await drop(req.db, studentId, classId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ message: result.message });
  } catch (err) {
    console.error("Drop class error:", err);
    res.status(500).json({ error: "Server error during dropping class." });
  }
});

/**
 * @route POST /api/registration/withdraw
 * @description Allows a student to withdraw from a class.
 *
 * @param {object} req.body - Request body containing studentId and classId.
 * @returns {object} 200 - Success response with a message.
 * @returns {object} 400 - Error response if parameters are missing.
 * @returns {object} 500 - Server error response.
 */
router.post("/withdraw", async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ error: "Missing studentId or classId." });
    }

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await withdraw(req.db, studentId, classId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ message: result.message });
  } catch (err) {
    console.error("Withdraw class error:", err);
    res.status(500).json({ error: "Server error during withdrawing from class." });
  }
});

/**
 * @route POST /api/registration/override-enroll
 * @description Allows a registrar to override enrollment rules and directly enroll a student.
 *
 * @param {object} req.body - Request body containing studentId and classId.
 * @returns {object} 200 - Success response with a message.
 * @returns {object} 400 - Error response if parameters are missing.
 * @returns {object} 500 - Server error response.
 */
router.post("/override-enroll", async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ error: "Missing studentId or classId." });
    }

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await overrideEnroll(req.db, studentId, classId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ message: result.message });
  } catch (err) {
    console.error("Override enrollment error:", err);
    res.status(500).json({ error: "Server error during override enrollment." });
  }
});

export default router;
