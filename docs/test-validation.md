# Test and validation evidence

## Recorded validation

Validation was run against the project on 2026-10-04.

| Check | Result |
|---|---|
| Backend unit and API integration suite | **Passed: 4 tests, 0 failed, 0 skipped.** |
| Frontend production build (`npm run build`) | **Passed** with Vite; production bundle generated. |
| Docker Compose services | PostgreSQL healthy; backend, frontend and Mailpit running. |
| HTTP smoke checks | Frontend `http://localhost:3000` returned 200; API health `http://localhost:4000/api/health` returned 200 with `{"ok":true}`; Mailpit `http://localhost:8025` returned 200. |

The integration run used a newly created isolated PostgreSQL database in the Compose database container. Its database name ended in `_test`; the database was removed after the run. It was not the application's normal `esr` database.

## Coverage exercised by the integration test

`backend/src/app.integration.test.js` verifies:

- Demo administrator login; user creation and password-hash non-disclosure.
- Rejection of invalid authentication and employee access to admin-only data.
- Employee request submission, pagination and dashboard counts.
- Admin assignment to an eligible team agent and rejection of an invalid assignment.
- Scoped SLA breach notifications and delivery to requester and assignee using the test email mode.
- Generic password-reset responses, successful single-use reset, rejection of token reuse and session revocation.
- Account deactivation, blocked access/login, login rate limiting and account audit entries.

`backend/src/sla.test.js` verifies priority deadlines and request input validation.

## Reproduce the unit and integration checks in Docker

Start the Compose services in one terminal:

```powershell
docker compose up --build
```

In a second PowerShell window, create a fresh test database. The example name must end in `_test`:

```powershell
docker compose exec -T db createdb -U esr esr_verify_test
docker compose exec -T -e TEST_DATABASE_URL=postgres://esr:esr_pass@db:5432/esr_verify_test backend npm test
```

Expected summary: 4 tests, 4 passed, 0 failed, 0 skipped. Remove only the temporary test database after the test process has completed:

```powershell
docker compose exec -T db dropdb -U esr esr_verify_test
```

Choose a fresh database name if `createdb` reports that the name already exists. Never point `TEST_DATABASE_URL` at the normal application database or a database containing valuable data: the integration test applies migrations and seeds demo users.

## Reproduce the frontend build

From the repository root:

```powershell
npm run build
```

## Validation boundaries

This evidence demonstrates the current automated checks and local smoke checks; it is not a formal penetration test, accessibility certification, production load test, or proof of production email delivery. Production use still requires deployment-specific secrets, SMTP configuration, HTTPS and operational monitoring.
