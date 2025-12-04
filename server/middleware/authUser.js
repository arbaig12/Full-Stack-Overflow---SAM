// middleware/authUser.js
export default function authUser(db) {
  return async function (req, res, next) {
    try {
      // pulled from session (set in /api/auth/google)
      const sessionUserId =
        req.session?.user?.user_id ??
        req.session?.userId ??
        null;

      if (!sessionUserId) {
        req.user = null;
        return next();
      }

      // include role from users table
      const { rows: userRows } = await db.query(
        `SELECT user_id, first_name, last_name, email, role
         FROM users
         WHERE user_id = $1`,
        [sessionUserId]
      );

      if (userRows.length === 0) {
        req.user = null;
        return next();
      }

      const user = userRows[0];

      // Build normalized roles array from user.role enum
      const roles = [];

      switch (user.role) {
        case 'Student':
          roles.push('STUDENT');
          break;
        case 'Instructor':
          roles.push('INSTRUCTOR');
          break;
        case 'Registrar':
          roles.push('REGISTRAR');
          break;
        case 'Advisor':
          roles.push('ADVISOR');
          break;
        default:
          // unknown / null role, leave roles = []
          break;
      }

      // Expose BOTH old + new fields so all routes work
      req.user = {
        user_id: user.user_id,     // raw DB id
        userId: user.user_id,      // what dashboardRoutes expects
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,           // 'Student' | 'Instructor' | 'Registrar' | 'Advisor'
        roles                      // ['STUDENT'], ['INSTRUCTOR'], etc.
      };

      return next();
    } catch (err) {
      console.error("AuthUser middleware failed:", err);
      req.user = null;
      return next();
    }
  };
}
