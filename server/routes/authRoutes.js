import express from "express";
import { OAuth2Client } from "google-auth-library";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/google", async (req, res) => {
  const db = req.db;
  const { credential } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const given = payload.given_name;
    const family = payload.family_name;

    const { rows: existing } = await db.query(
      `SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    let userId;
    if (existing.length === 0) {
      const insert = await db.query(
        `INSERT INTO users (first_name, last_name, email)
         VALUES ($1, $2, $3)
         RETURNING user_id`,
        [given, family, email]
      );
      userId = insert.rows[0].user_id;
    } else {
      userId = existing[0].user_id;
    }

    const { rows: userRows } = await db.query(
      `SELECT user_id, first_name, last_name, email, role
       FROM users
       WHERE user_id = $1`,
      [userId]
    );

    const user = userRows[0] || { user_id: userId, email, role: null, first_name: given, last_name: family };

    req.session.user = { user_id: user.user_id, email: user.email };

    req.session.save(() => {
      return res.json({
        ok: true,
        user: {
          userId: user.user_id,
          email: user.email,
          name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
          role: user.role || null,
        },
      });
    });
  } catch (err) {
    console.error("Google login failed:", err);
    return res.status(500).json({ ok: false, error: "Google authentication failed" });
  }
});

router.post("/password", async (req, res) => {
  const db = req.db;
  const { email, password } = req.body;

  if (process.env.ENABLE_AUTH_BYPASS !== "true") {
    return res.status(403).json({
      ok: false,
      error: "Password authentication is disabled. Please use Google authentication.",
    });
  }

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required" });
  }

  try {
    const { rows: users } = await db.query(
      `SELECT user_id, email, password_hash, first_name, last_name, role
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const user = users[0];

    if (!user.password_hash) {
      return res.status(401).json({
        ok: false,
        error: "Password not set for this user. Please contact administrator.",
      });
    }

    if (user.password_hash !== password) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    req.session.user = {
      user_id: user.user_id,
      email: user.email,
    };

    req.session.save(() => {
      return res.json({
        ok: true,
        user: {
          userId: user.user_id,
          email: user.email,
          name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
          role: user.role || null,
        },
      });
    });
  } catch (err) {
    console.error("Password login failed:", err);
    return res.status(500).json({ ok: false, error: "Authentication failed" });
  }
});

export default router;
