/**
 * @file authRoutes.js
 * @description This file defines the Express router for authentication-related endpoints,
 * specifically for Google OAuth sign-in.
 */

import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

const router = Router();

// Initialize Google OAuth2Client with your CLIENT_ID
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

/**
 * @route POST /api/auth/google-signin
 * @description Handles Google ID token verification and user authentication/registration.
 *
 * Expects a Google ID token in the request body.
 * Verifies the token, extracts user information, checks/creates user in the database,
 * and returns the authenticated user's profile with SAM roles.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing the `id_token` from Google.
 * @returns {object} 200 - Success response with the authenticated user's SAM profile.
 * @returns {object} 400 - Error response if `id_token` is missing or invalid.
 * @returns {object} 500 - Server error response for database or verification issues.
 */
router.post('/google-signin', async (req, res, next) => {
  const { id_token } = req.body;

  if (!id_token) {
    return res.status(400).json({ ok: false, error: 'ID token is missing.' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists in our database
    let userQuery = await req.db.query('SELECT user_id, sbu_id, role, first_name, last_name, email FROM users WHERE email = $1', [email]);
    let user = userQuery.rows[0];

    if (!user) {
      // User does not exist, create a new user with default 'Student' role
      // For SBU_ID, we'll use a placeholder or generate one. In a real system, this would be managed.
      const newSbuId = `TEMP_${googleId.substring(0, 8)}`; // Simplified temporary SBU ID
      const [firstName, ...lastNameParts] = name.split(' ');
      const lastName = lastNameParts.join(' ');

      const insertUserQuery = `
        INSERT INTO users (sbu_id, first_name, last_name, email, role, google_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING user_id, sbu_id, role, first_name, last_name, email;
      `;
      const newUserResult = await req.db.query(insertUserQuery, [newSbuId, firstName, lastName, email, 'Student', googleId]);
      user = newUserResult.rows[0];
      console.log(`[Auth] New user registered: ${email} with SBU ID ${newSbuId}`);
    }

    // Return user profile with SAM roles
    res.json({
      ok: true,
      profile: {
        userId: user.user_id,
        sbuId: user.sbu_id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        picture: picture, // Use picture from Google payload
      },
    });

  } catch (e) {
    console.error('[Auth] Google Sign-In Error:', e);
    // Pass error to centralized error handler
    next(e);
  }
});

export default router;
