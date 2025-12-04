import express from "express";
import pkg from "pg";
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

    // STEP 2: find or create user
    const { rows: existing } = await db.query(
      `SELECT user_id FROM users WHERE email = $1`,
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

    // STEP 3: save into session
    req.session.user = { user_id: userId, email };

    req.session.save(() => {
      return res.json({ ok: true });
    });

  } catch (err) {
    console.error("Google login failed:", err);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

export default router;
