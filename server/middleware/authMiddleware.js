/**
 * @file authMiddleware.js
 * @description Middleware functions for authentication and authorization.
 */

/**
 * Middleware to authorize access based on user roles.
 * Assumes `req.user` is populated by an authentication middleware (e.g., JWT verification).
 *
 * @param {Array<string>} allowedRoles - An array of roles that are permitted to access the route.
 * @returns {Function} Express middleware function.
 */
export const authorizeRoles = (allowedRoles) => (req, res, next) => {
  // In a real application, req.user would be populated by an authentication middleware
  // that verifies a session token (e.g., JWT) and retrieves user details from the DB.
  // For this iteration, we'll assume req.user is available after a successful login.

  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Authentication required.' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ ok: false, error: 'Access forbidden: Insufficient permissions.' });
  }

  next();
};

/**
 * Placeholder for an authentication middleware.
 * This would typically verify a JWT or session cookie and populate `req.user`.
 * For now, we'll just pass through, assuming the frontend handles initial authentication.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 */
export const authenticateToken = (req, res, next) => {
  // TODO: Implement actual token verification (e.g., JWT) and user loading from DB.
  // For now, we'll mock req.user for testing authorization.
  // In a real scenario, this would parse a token from headers, verify it,
  // and then fetch user details (including role) from the database.

  // Mock user for development/testing purposes
  // This should be removed or made configurable for production.
  if (process.env.NODE_ENV === 'development' && !req.user) {
    req.user = {
      user_id: 1, // Example user ID
      sbu_id: '123456789',
      email: 'dev@example.com',
      role: 'Registrar', // Mock role: 'Student', 'Instructor', 'Advisor', 'Registrar'
      first_name: 'Dev',
      last_name: 'User',
    };
  }

  next();
};
