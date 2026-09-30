import { pool, q } from './db.js';
import { emailConfigured, sendEmail } from './mailer.js';

async function enqueueBreachEmails() {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  await q(`
    WITH overdue AS (
      SELECT id, title, category, priority, due_at, requester_id, assignee_id
      FROM requests
      WHERE due_at < now() AND status NOT IN ('Resolved','Closed')
    ), recipients AS (
      SELECT r.id AS request_id, requester.email AS recipient, r.title, r.category, r.priority, r.due_at
      FROM overdue r JOIN users requester ON requester.id=r.requester_id AND requester.active=true
      UNION
      SELECT r.id, agent.email, r.title, r.category, r.priority, r.due_at
      FROM overdue r JOIN users agent ON agent.id=r.assignee_id AND agent.active=true
    )
    INSERT INTO email_outbox(request_id,recipient,event_type,subject,body)
    SELECT request_id, recipient, 'SLA_BREACH',
      'SLA breached for request #' || request_id || ': ' || title,
      'Request #' || request_id || ' has breached its SLA.' || E'\\n\\n' ||
      'Title: ' || title || E'\\n' || 'Team: ' || category || E'\\n' ||
      'Priority: ' || priority || E'\\n' || 'Due: ' || due_at || E'\\n\\n' ||
      'Open Service Desk: ' || $1
    FROM recipients
    ON CONFLICT (request_id,recipient,event_type) DO NOTHING`, [frontendUrl]);
}

async function claimPendingEmails() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT id, recipient, subject, body, attempts
      FROM email_outbox
      WHERE sent_at IS NULL AND attempts < 10 AND available_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - interval '15 minutes')
      ORDER BY id
      LIMIT 20
      FOR UPDATE SKIP LOCKED`);
    if (rows.length) await client.query('UPDATE email_outbox SET locked_at=now(), attempts=attempts+1 WHERE id=ANY($1::bigint[])', [rows.map(row => row.id)]);
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function processEmailNotifications() {
  await enqueueBreachEmails();
  if (!emailConfigured) return;
  const pending = await claimPendingEmails();
  for (const email of pending) {
    try {
      await sendEmail({ to: email.recipient, subject: email.subject, text: email.body });
      await q('UPDATE email_outbox SET sent_at=now(), locked_at=NULL, last_error=NULL WHERE id=$1', [email.id]);
    } catch (error) {
      await q(`UPDATE email_outbox SET locked_at=NULL, last_error=$2,
        available_at=now() + LEAST(attempts,60) * interval '1 minute' WHERE id=$1`, [email.id, String(error.message).slice(0, 500)]);
      console.error(`Email delivery failed for outbox item ${email.id}:`, error.message);
    }
  }
}

export function startEmailNotificationWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processEmailNotifications(); }
    catch (error) { console.error('Email notification worker failed:', error.message); }
    finally { running = false; }
  };
  void run();
  return setInterval(run, 60_000);
}