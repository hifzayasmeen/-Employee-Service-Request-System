import { app } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';

let initialized;

export default async function handler(req, res) {
  const route = req.url?.split('?')[0];
  if (route === '/api/health') return app(req, res);

  initialized ||= migrate().then(seed).catch(error => {
    initialized = undefined;
    throw error;
  });
  try { await initialized; }
  catch (error) {
    console.error('API database initialization failed:', error.message);
    return res.status(503).json({ error: 'Service database is not configured or available.' });
  }
  return app(req, res);
}