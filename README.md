# Employee Service Request System (Arrowstack Project 2)

Internal portal where employees raise IT / HR / Facility requests, requests are routed to the right team, SLAs are tracked, and admins manage accounts, assignments, dashboard reporting, and the audit log.

**Stack:** React (Vite) · Node.js + Express REST API · PostgreSQL (SQL migrations) · JWT role-based access · Docker Compose.

## Run
```bash
docker compose up --build
# App: http://localhost:3000    API health: http://localhost:4000/api/health
# Local email inbox: http://localhost:8025
```
Demo accounts (password `Password@123`): asha@corp.com, ravi@corp.com (employees), meera@corp.com (IT), karan@corp.com (HR), sana@corp.com (Facility), admin@corp.com (admin).
The shared password is for local development only. Production seeding requires a private `DEMO_PASSWORD` value of at least 12 characters; never publish it in the frontend or source code.

Local development: start PostgreSQL, then run the backend from `backend` with `DATABASE_URL` set and run the frontend from `frontend` with `npm run dev`.

## Project documentation
- [Requirements, design and architecture](docs/requirements-and-design.md)
- [Employee, agent and admin user guide](docs/user-guide.md)
- [Test and validation evidence](docs/test-validation.md)
- [Presentation and live demo script](docs/demo-presentation.md)
- [Public Vercel demo deployment](docs/deployment.md)

## Tests
Run the backend unit tests with `npm test` from the repository root. The API integration test is opt-in and needs a disposable PostgreSQL database whose name ends in `_test`. To run the full suite against a temporary database in the Docker Compose stack, see [Test and validation evidence](docs/test-validation.md).

## Roles
| Role | Can do |
|---|---|
| employee | Create requests, see only own requests |
| agent | See and update own team's requests, assign to self |
| admin | See everything, manage users and assignments, dashboard, audit log |

## API
| Method | Path | Access |
|---|---|---|
| POST | /api/auth/login | public |
| POST | /api/auth/forgot-password | public; sends a one-hour reset link without revealing whether an email exists |
| POST | /api/auth/reset-password | public; consumes a one-time token and revokes existing sessions |
| GET | /api/requests?page=1&pageSize=20 | scoped by role; paginated |
| POST | /api/requests | employee |
| PATCH | /api/requests/:id | agent (own team), admin |
| GET | /api/dashboard | scoped by role |
| GET | /api/notifications | scoped SLA breach alerts |
| GET, POST | /api/users | admin; list and create accounts |
| PATCH | /api/users/:id | admin; update or deactivate account |
| GET | /api/agents | agent or admin; active agents for assignment |
| GET | /api/audit | admin |

## Requirement mapping
- Role-based access: JWT + `allow()` middleware + per-role data scope (`backend/src/app.js`)
- REST API integration: React calls `/api` via `frontend/src/api.js`
- Relational DB with migrations: `backend/migrations/*.sql`, runner in `migrate.js` (tracked in `schema_migrations`)
- Validation and error handling: `sla.js` validation, 400/401/403/404 responses, central 500 handler, DB CHECK constraints
- Audit-friendly records: `audit_log` written in the same transaction as each change
- Request operations: paginated queues, admin assignment to an active agent on the matching team, and scoped SLA breach alerts that refresh while the app is open
- Account administration: create, edit, deactivate, and reset passwords for users; account role and active status are checked on authenticated API requests, and account changes are audited
- Login abuse protection: failed login attempts are rate-limited per client
- Email notifications: overdue SLA emails are queued for the requester and assigned agent, then retried on temporary SMTP failures
- Password recovery: single-use, hashed reset tokens expire after one hour; password changes revoke existing JWT sessions
- Deployment-ready: Dockerfiles, compose with DB healthcheck, secrets via env (`JWT_SECRET`)

## Limitations and next steps
The seeded demo accounts use shared demo passwords. Docker Compose includes Mailpit, a local SMTP inbox at `http://localhost:8025`, so reset and SLA messages can be inspected without sending real email. For real delivery, override the default Mailpit host/port and configure SMTP credentials. For 10x load: indexes exist; add dashboard caching and scale the API horizontally.

SMTP settings for Docker Compose are read from the environment: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`. They default to the local Mailpit service. Set `FRONTEND_URL` to the deployed frontend origin so reset links point to the right page.

Integration tests are opt-in and require a disposable PostgreSQL database whose name ends in `_test`:
```powershell
$env:TEST_DATABASE_URL = 'postgres://postgres@localhost:5432/esr_test'
npm test
```
The integration test applies migrations and removes its temporary accounts and requests when finished.

## Week plan
W1 requirements, schema, design · W2 API and auth · W3 React UI, validation, tests · W4 QA, docs, demo, submission.
