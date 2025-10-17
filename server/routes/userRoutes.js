// server/routes/userRoutes.js
import { Router } from 'express';
const router = Router();

router.get('/registrars', async (req, res) => {
  try {
    const sql = `
      SELECT user_id, sbu_id, first_name, last_name, email, role::text AS role
      FROM users
      WHERE lower(role::text) = lower($1)
      ORDER BY last_name, first_name
    `;
    const r = await req.db.query(sql, ['Registrar']);

    const registrars = r.rows.map(u => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'registrar',
      status: 'active',
      lastLogin: null,
      department: 'Administration',
    }));

    res.json({ ok: true, users: registrars });
  } catch (e) {
    console.error('[users] /registrars failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
