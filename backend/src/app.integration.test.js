import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('API manages users, scopes paginated requests, reports SLAs and assignments', { skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to run API integration tests' }, async () => {
  assert.match(new URL(testDatabaseUrl).pathname, /_test$/, 'TEST_DATABASE_URL must target a database ending in _test');
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = 'integration-test-secret';
  process.env.MAIL_MODE = 'json';
  process.env.EMAIL_FROM = 'service-desk@example.test';
  process.env.DEV_RESET_LINKS = 'true';

  const [{ app }, { migrate }, { seed }, { pool }, { processEmailNotifications }] = await Promise.all([
    import('./app.js'), import('./migrate.js'), import('./seed.js'), import('./db.js'), import('./emailNotifications.js'),
  ]);
  await migrate();
  await seed();

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };

  const suffix = randomUUID();
  const emails = [`employee-${suffix}@example.test`, `agent-a-${suffix}@example.test`, `agent-b-${suffix}@example.test`];
  try {
    const adminLogin = await call('/auth/login', { method: 'POST', body: { email: 'admin@corp.com', password: 'Password@123' } });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createUser = (email, role, team = null) => call('/users', {
      method: 'POST', token: adminToken,
      body: { name: role === 'employee' ? 'Test Employee' : 'Test Agent', email, password: 'TestPass@123', role, team },
    });
    const employee = await createUser(emails[0], 'employee');
    const agentA = await createUser(emails[1], 'agent', 'IT');
    const agentB = await createUser(emails[2], 'agent', 'IT');
    assert.deepEqual([employee.status, agentA.status, agentB.status], [201, 201, 201]);
    assert.equal('password_hash' in employee.data, false);

    const deniedUsers = await call('/users', { token: 'invalid-token' });
    assert.equal(deniedUsers.status, 401);
    const employeeLogin = await call('/auth/login', { method: 'POST', body: { email: emails[0], password: 'TestPass@123' } });
    let employeeToken = employeeLogin.data.token;
    const forbiddenUsers = await call('/users', { token: employeeToken });
    assert.equal(forbiddenUsers.status, 403);

    const submitted = await call('/requests', {
      method: 'POST', token: employeeToken,
      body: { title: 'Laptop screen broken', description: 'The screen flickers during work calls.', category: 'IT', priority: 'High' },
    });
    assert.equal(submitted.status, 201);
    const requestId = submitted.data.id;

    const page = await call('/requests?page=1&pageSize=1', { token: employeeToken });
    assert.equal(page.status, 200);
    assert.equal(page.data.total, 1);
    assert.equal(page.data.items[0].id, requestId);
    const dashboard = await call('/dashboard', { token: employeeToken });
    assert.equal(dashboard.data.byPriority.find(item => item.k === 'High').n, 1);

    const assigned = await call(`/requests/${requestId}`, {
      method: 'PATCH', token: adminToken, body: { assignee_id: agentB.data.id },
    });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.data.assignee_id, agentB.data.id);
    const invalidAssignment = await call(`/requests/${requestId}`, {
      method: 'PATCH', token: adminToken, body: { assignee_id: 99999999 },
    });
    assert.equal(invalidAssignment.status, 400);

    await pool.query('UPDATE requests SET due_at=now() - interval \'1 minute\' WHERE id=$1', [requestId]);
    const agentLogin = await call('/auth/login', { method: 'POST', body: { email: emails[2], password: 'TestPass@123' } });
    const notifications = await call('/notifications', { token: agentLogin.data.token });
    assert.equal(notifications.status, 200);
    assert.equal(notifications.data.some(item => item.id === requestId), true);
    await processEmailNotifications();
    const deliveredEmails = await pool.query('SELECT recipient,sent_at FROM email_outbox WHERE request_id=$1', [requestId]);
    assert.equal(deliveredEmails.rows.length, 2);
    assert.equal(deliveredEmails.rows.every(email => email.sent_at !== null), true);

    const forgot = await call('/auth/forgot-password', { method: 'POST', body: { email: emails[0] } });
    const unknownForgot = await call('/auth/forgot-password', { method: 'POST', body: { email: 'unknown@example.test' } });
    assert.equal(forgot.status, 200);
    assert.equal(forgot.data.message, unknownForgot.data.message);
    assert.ok(forgot.data.developmentResetUrl);
    const resetToken = new URL(forgot.data.developmentResetUrl).searchParams.get('reset');
    const reset = await call('/auth/reset-password', { method: 'POST', body: { token: resetToken, password: 'Fresh-TestPass@123' } });
    assert.equal(reset.status, 200);
    const reusedReset = await call('/auth/reset-password', { method: 'POST', body: { token: resetToken, password: 'Another-TestPass@123' } });
    assert.equal(reusedReset.status, 400);
    assert.equal((await call('/dashboard', { token: employeeToken })).status, 401);
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: emails[0], password: 'TestPass@123' } })).status, 401);
    const freshLogin = await call('/auth/login', { method: 'POST', body: { email: emails[0], password: 'Fresh-TestPass@123' } });
    assert.equal(freshLogin.status, 200);
    employeeToken = freshLogin.data.token;

    const deactivated = await call(`/users/${employee.data.id}`, { method: 'PATCH', token: adminToken, body: { active: false } });
    assert.equal(deactivated.status, 200);
    const revokedToken = await call('/dashboard', { token: employeeToken });
    assert.equal(revokedToken.status, 401);
    const blockedLogin = await call('/auth/login', { method: 'POST', body: { email: emails[0], password: 'TestPass@123' } });
    assert.equal(blockedLogin.status, 401);
    for (let attempt = 0; attempt < 8; attempt++) {
      const failedLogin = await call('/auth/login', { method: 'POST', body: { email: 'missing@example.test', password: 'wrong-password' } });
      assert.equal(failedLogin.status, 401);
    }
    const limitedLogin = await call('/auth/login', { method: 'POST', body: { email: 'missing@example.test', password: 'wrong-password' } });
    assert.equal(limitedLogin.status, 429);
    const accountAudit = await call('/audit', { token: adminToken });
    assert.equal(accountAudit.data.some(entry => entry.action === 'USER_CREATED' && entry.detail.includes(emails[0])), true);
    assert.equal(accountAudit.data.some(entry => entry.action === 'USER_UPDATED' && entry.detail.includes(emails[0])), true);
    assert.equal(accountAudit.data.some(entry => entry.action === 'PASSWORD_RESET' && entry.actor === 'Test Employee'), true);
  } finally {
    const { rows: cleanupUsers } = await pool.query('SELECT id FROM users WHERE email=ANY($1::text[])', [emails]);
    const ids = cleanupUsers.map(user => user.id);
    await pool.query('DELETE FROM audit_log WHERE request_id IN (SELECT id FROM requests WHERE requester_id=ANY($1::int[])) OR actor_id=ANY($1::int[]) OR detail LIKE ANY($2::text[])', [ids, emails.map(email => `%${email}%`)]);
    await pool.query('DELETE FROM requests WHERE requester_id=ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});