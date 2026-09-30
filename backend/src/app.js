import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { pool, q } from './db.js';
import { dueAt, validateRequest, STATUSES } from './sla.js';
import { emailConfigured, sendEmail } from './mailer.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const app = express();
app.use(cors());
app.use(express.json({ limit: '50kb' }));

const wrap = f => (req, res, next) => f(req, res).catch(next);
const auth = (req, res, next) => {
  let claims;
  try { claims = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); }
  catch { return res.status(401).json({ error: 'Authentication required' }); }
  q('SELECT id, name, role, team, active, token_version FROM users WHERE id=$1', [claims.id]).then(({ rows: [user] }) => {
    if (!user || !user.active || (claims.tokenVersion ?? 0) !== user.token_version) return res.status(401).json({ error: 'Authentication required' });
    req.user = { id: user.id, name: user.name, role: user.role, team: user.team };
    next();
  }).catch(next);
};
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Your role cannot do this' });
const audit = (c, rid, actor, action, detail) =>
  c.query('INSERT INTO audit_log(request_id,actor_id,action,detail) VALUES($1,$2,$3,$4)', [rid, actor, action, detail]);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});
const resetRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const resetPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const hashResetToken = token => createHash('sha256').update(token).digest('hex');

// Role-based data scope: employee = own, agent = own team, admin = all
const scope = u =>
  u.role === 'employee' ? { w: 'WHERE r.requester_id=$1', p: [u.id] }
  : u.role === 'agent' ? { w: 'WHERE r.category=$1', p: [u.team] }
  : { w: '', p: [] };

const BASE = `SELECT r.*, u.name AS requester, a.name AS assignee,
  (r.due_at < now() AND r.status NOT IN ('Resolved','Closed')) AS breached
  FROM requests r JOIN users u ON u.id=r.requester_id LEFT JOIN users a ON a.id=r.assignee_id`;

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const { rows: [u] } = await q('SELECT * FROM users WHERE email=$1', [String(email).toLowerCase()]);
  if (!u || !u.active || !bcrypt.compareSync(String(password), u.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
  const user = { id: u.id, name: u.name, role: u.role, team: u.team };
  res.json({ token: jwt.sign({ ...user, tokenVersion: u.token_version }, SECRET, { expiresIn: '8h' }), user });
}));

app.post('/api/auth/forgot-password', resetRequestLimiter, wrap(async (req, res) => {
  const message = 'If an active account exists for that email, a reset link will be sent.';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { rows: [user] } = email ? await q('SELECT id,email,name FROM users WHERE email=$1 AND active=true', [email]) : { rows: [] };
  const response = { message };
  if (user) {
    const token = randomBytes(32).toString('base64url');
    await q('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [user.id]);
    await q('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now() + interval \'1 hour\')', [hashResetToken(token), user.id]);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const resetUrl = `${frontendUrl}/?reset=${encodeURIComponent(token)}`;
    if (emailConfigured) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Service Desk password',
          text: `Hello ${user.name},\n\nUse this one-time link to reset your password within one hour:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
        });
      } catch (error) { console.error('Password reset email delivery failed:', error.message); }
    }
    if (process.env.DEV_RESET_LINKS === 'true' && process.env.NODE_ENV !== 'production') response.developmentResetUrl = resetUrl;
  }
  res.json(response);
}));

app.post('/api/auth/reset-password', resetPasswordLimiter, wrap(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'A valid reset link and a password of at least 8 characters are required.' });
  }
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [reset] } = await c.query(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',
      [hashResetToken(token)]);
    if (!reset) {
      await c.query('ROLLBACK');
      return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new link.' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    await c.query('UPDATE users SET password_hash=$1, token_version=token_version+1 WHERE id=$2', [passwordHash, reset.user_id]);
    await c.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [reset.user_id]);
    await audit(c, null, reset.user_id, 'PASSWORD_RESET', 'Self-service password reset');
    await c.query('COMMIT');
    res.json({ message: 'Password reset successfully. Sign in with your new password.' });
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
}));

app.get('/api/users', auth, allow('admin'), wrap(async (_, res) => {
  res.json((await q('SELECT id, name, email, role, team, active FROM users ORDER BY name')).rows);
}));

app.get('/api/agents', auth, allow('agent', 'admin'), wrap(async (req, res) => {
  const params = req.user.role === 'agent' ? [req.user.team] : [];
  const teamFilter = params.length ? 'AND team=$1' : '';
  res.json((await q(`SELECT id, name, email, role, team FROM users WHERE role='agent' AND active=true ${teamFilter} ORDER BY name`, params)).rows);
}));

app.post('/api/users', auth, allow('admin'), wrap(async (req, res) => {
  const { name, email, password, role, team } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Name must be 2-80 characters.' });
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!['employee', 'agent', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be employee, agent or admin.' });
  if ((role === 'agent' && !['IT', 'HR', 'Facility'].includes(team)) || (role !== 'agent' && team != null)) return res.status(400).json({ error: 'Agents require a valid team; other roles cannot have a team.' });
  const normalizedEmail = email.trim().toLowerCase();
  if ((await q('SELECT 1 FROM users WHERE email=$1', [normalizedEmail])).rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });
  const hash = bcrypt.hashSync(password, 10);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [created] } = await c.query(
      'INSERT INTO users(name,email,password_hash,role,team) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,team,active',
      [name.trim(), normalizedEmail, hash, role, team || null]);
    await audit(c, null, req.user.id, 'USER_CREATED', `${created.email} (${created.role}${created.team ? `, ${created.team}` : ''})`);
    await c.query('COMMIT');
    res.status(201).json(created);
  } catch (e) {
    await c.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw e;
  } finally { c.release(); }
}));

app.patch('/api/users/:id', auth, allow('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id.' });
  const { rows: [existing] } = await q('SELECT * FROM users WHERE id=$1', [id]);
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const { name = existing.name, role = existing.role, team = existing.team, active = existing.active, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Name must be 2-80 characters.' });
  if (!['employee', 'agent', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be employee, agent or admin.' });
  if ((role === 'agent' && !['IT', 'HR', 'Facility'].includes(team)) || (role !== 'agent' && team != null)) return res.status(400).json({ error: 'Agents require a valid team; other roles cannot have a team.' });
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'Active must be true or false.' });
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (id === req.user.id && (!active || role !== 'admin')) return res.status(400).json({ error: 'You cannot deactivate or demote your own account.' });
  if (existing.active && existing.role === 'admin' && (!active || role !== 'admin')) {
    const { rows: [admins] } = await q("SELECT count(*)::int AS n FROM users WHERE active=true AND role='admin'");
    if (admins.n <= 1) return res.status(409).json({ error: 'At least one active admin account must remain.' });
  }
  const hash = password === undefined ? existing.password_hash : bcrypt.hashSync(password, 10);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [updated] } = await c.query(
      'UPDATE users SET name=$1, role=$2, team=$3, active=$4, password_hash=$5, token_version=token_version+$6 WHERE id=$7 RETURNING id,name,email,role,team,active',
      [name.trim(), role, team || null, active, hash, password === undefined ? 0 : 1, id]);
    await audit(c, null, req.user.id, 'USER_UPDATED', `${updated.email}: role ${updated.role}, ${updated.active ? 'active' : 'inactive'}`);
    await c.query('COMMIT');
    res.json(updated);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

app.get('/api/requests', auth, wrap(async (req, res) => {
  const s = scope(req.user);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const [{ rows }, { rows: [count] }] = await Promise.all([
    q(`${BASE} ${s.w} ORDER BY r.created_at DESC LIMIT $${s.p.length + 1} OFFSET $${s.p.length + 2}`, [...s.p, pageSize, (page - 1) * pageSize]),
    q(`SELECT count(*)::int AS total FROM requests r ${s.w}`, s.p),
  ]);
  res.json({ items: rows, page, pageSize, total: count.total, pages: Math.ceil(count.total / pageSize) });
}));

app.post('/api/requests', auth, allow('employee'), wrap(async (req, res) => {
  const errs = validateRequest(req.body || {});
  if (errs.length) return res.status(400).json({ error: errs.join(' ') });
  const { title, description, category, priority } = req.body;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [r] } = await c.query(
      'INSERT INTO requests(title,description,category,priority,requester_id,due_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [title.trim(), description.trim(), category, priority, req.user.id, dueAt(priority)]);
    await audit(c, r.id, req.user.id, 'CREATED', `${category}/${priority}, routed to ${category} team`);
    await c.query('COMMIT');
    res.status(201).json(r);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

app.patch('/api/requests/:id', auth, allow('agent', 'admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request id.' });
  const { status, assign_to_me, assignee_id } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const { rows: [r] } = await q('SELECT * FROM requests WHERE id=$1', [id]);
  if (!r) return res.status(404).json({ error: 'Request not found.' });
  if (req.user.role === 'agent' && r.category !== req.user.team) return res.status(403).json({ error: 'This request belongs to another team.' });
  let asg = r.assignee_id;
  if (assign_to_me && req.user.role === 'agent') asg = req.user.id;
  else if (assignee_id !== undefined && req.user.role === 'admin') {
    if (assignee_id !== null) {
      const { rows: [agent] } = await q('SELECT id FROM users WHERE id=$1 AND role=\'agent\' AND team=$2 AND active=true', [Number(assignee_id), r.category]);
      if (!agent) return res.status(400).json({ error: 'Choose an active agent from the request team.' });
      asg = agent.id;
    } else asg = null;
  }
  const ns = status ?? r.status;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [u] } = await c.query('UPDATE requests SET status=$1, assignee_id=$2, updated_at=now() WHERE id=$3 RETURNING *', [ns, asg, id]);
    if (ns !== r.status) await audit(c, id, req.user.id, 'STATUS_CHANGED', `${r.status} -> ${ns}`);
    if (asg !== r.assignee_id) await audit(c, id, req.user.id, 'ASSIGNED', `Assignee id ${asg}`);
    await c.query('COMMIT');
    res.json(u);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const s = scope(req.user);
  const by = col => q(`SELECT r.${col} AS k, count(*)::int AS n FROM requests r ${s.w} GROUP BY r.${col}`, s.p).then(x => x.rows);
  const { rows: [b] } = await q(`SELECT count(*)::int AS n FROM requests r ${s.w} ${s.w ? 'AND' : 'WHERE'} r.due_at < now() AND r.status NOT IN ('Resolved','Closed')`, s.p);
  res.json({ byStatus: await by('status'), byCategory: await by('category'), byPriority: await by('priority'), breached: b.n });
}));

app.get('/api/notifications', auth, wrap(async (req, res) => {
  const s = scope(req.user);
  const { rows } = await q(
    `SELECT r.id, r.title, r.category, r.priority, r.due_at, u.name AS requester
     FROM requests r JOIN users u ON u.id=r.requester_id
     ${s.w} ${s.w ? 'AND' : 'WHERE'} r.due_at < now() AND r.status NOT IN ('Resolved','Closed')
     ORDER BY r.due_at ASC LIMIT 50`, s.p);
  res.json(rows);
}));

app.get('/api/audit', auth, allow('admin'), wrap(async (_, res) => {
  res.json((await q(`SELECT l.*, u.name AS actor FROM audit_log l JOIN users u ON u.id=l.actor_id ORDER BY l.created_at DESC LIMIT 100`)).rows);
}));

app.use('/api', (_, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong on the server.' }); });
