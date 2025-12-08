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

/**
 * POST /api/auth/password
 * Password-based authentication bypass endpoint (for testing/demo only)
 * Only works when ENABLE_AUTH_BYPASS environment variable is set to 'true'
 */
router.post("/password", async (req, res) => {
  const db = req.db;
  const { email, password } = req.body;

  // Check if bypass authentication is enabled
  if (process.env.ENABLE_AUTH_BYPASS !== 'true') {
    return res.status(403).json({ 
      error: "Password authentication is disabled. Please use Google authentication." 
    });
  }

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    // Find user by email
    const { rows: users } = await db.query(
      `SELECT user_id, email, password_hash, first_name, last_name
       FROM users 
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];

    // Check if user has a password set
    if (!user.password_hash) {
      return res.status(401).json({ 
        error: "Password not set for this user. Please contact administrator." 
      });
    }

    // For demo/testing: simple plain text comparison
    // In production, this would use bcrypt.compare()
    if (user.password_hash !== password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Set session
    req.session.user = { 
      user_id: user.user_id, 
      email: user.email 
    };

    req.session.save(() => {
      return res.json({ 
        ok: true, 
        user: {
          email: user.email,
          name: `${user.first_name} ${user.last_name}`
        }
      });
    });

  } catch (err) {
    console.error("Password login failed:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

export default router;
