import bcrypt from 'bcryptjs';
import { q } from './db.js';

const USERS = [
  ['Asha', 'asha@corp.com', 'employee', null],
  ['Ravi', 'ravi@corp.com', 'employee', null],
  ['Meera', 'meera@corp.com', 'agent', 'IT'],
  ['Karan', 'karan@corp.com', 'agent', 'HR'],
  ['Sana', 'sana@corp.com', 'agent', 'Facility'],
  ['Admin', 'admin@corp.com', 'admin', null],
];

export async function seed() {
  const { rows } = await q('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  const password = process.env.DEMO_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'Password@123');
  if (password.length < 12) throw new Error('Set DEMO_PASSWORD to at least 12 characters before seeding production users.');
  const hash = bcrypt.hashSync(password, 10);
  for (const [n, e, r, t] of USERS)
    await q('INSERT INTO users(name,email,password_hash,role,team) VALUES($1,$2,$3,$4,$5)', [n, e, hash, r, t]);
  console.log('Seeded demo users.');
}
