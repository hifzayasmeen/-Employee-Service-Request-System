# Project presentation and live demo

This document is a presentation outline and reproducible demo script for the Employee Service Request System.

## Slide 1 — Employee Service Request System

**Project 2 · Arrowstack**

An internal portal for routing IT, HR and Facility requests, tracking service levels, and giving employees, agents and administrators the tools appropriate to their roles.

**Presenter:** ESR project team · **Prepared:** 2026-10-04

## Slide 2 — The problem

- Service requests can be scattered across email and informal channels.
- Employees need a clear way to submit and follow up on work.
- Support teams need queues that match their responsibilities.
- Managers need visibility into workload, overdue items and changes.

## Slide 3 — Users and workflow

1. An employee submits a categorized and prioritized request.
2. The system calculates a due time and routes it by team.
3. A team agent takes ownership and updates its status.
4. An administrator can assign work, manage accounts and monitor reports.
5. Changes are recorded; overdue work raises alerts and queues email.

## Slide 4 — Main features

- Role-based login and data scoping.
- Request creation, team queues, assignment and status changes.
- SLA deadlines, breach notifications and dashboard summaries.
- Admin account management and audit log.
- Password recovery with expiring, single-use tokens.

## Slide 5 — Architecture and technology

- **Frontend:** React and Vite, served by Nginx in the Docker image.
- **API:** Node.js and Express REST endpoints.
- **Database:** PostgreSQL with versioned SQL migrations.
- **Security:** JWT role checks, hashed passwords, input validation and rate limits.
- **Email:** SMTP outbox/retries; Mailpit captures local development mail.
- **Run:** Docker Compose coordinates the services.

## Slide 6 — Data and controls

The relational model connects users to requests as requesters or assignees; audit entries record actions. Password reset tokens and queued email are stored separately. The server applies role scope on every relevant API query, rather than relying only on hidden UI controls.

## Slide 7 — Validation

- Backend unit and integration suite: 4 passed, 0 failed, 0 skipped.
- Frontend production build passed.
- Docker frontend, health endpoint and Mailpit smoke checks returned HTTP 200.
- The integration test checks authorization, assignments, SLA alerts, password resets, audit entries and login rate limiting.

See [test and validation evidence](test-validation.md) for commands and scope.

## Slide 8 — Live demonstration

1. Open <http://localhost:3000> and sign in as `asha@corp.com`.
2. Submit an IT request at High priority; show its calculated 4-hour SLA.
3. Sign out and sign in as `meera@corp.com`; show the IT queue and assign the request to the agent.
4. Update its status to In Progress.
5. Sign out and sign in as `admin@corp.com`; show the dashboard, assign the request to a matching team agent, and inspect account management and audit log.
6. If time allows, demonstrate reset email capture at <http://localhost:8025>.

Use the local demo password `Password@123`. Do not use these shared demo credentials in a production environment.

## Slide 9 — Limitations and next steps

- Demo accounts use a shared password; replace seeded accounts and secrets for deployment.
- Production deployment needs HTTPS, managed secrets, real SMTP, backup and monitoring plans.
- Dashboard caching and horizontal API scaling are future improvements.
- Follow [the user guide](user-guide.md) for detailed operation steps.

## Slide 10 — Close

The project demonstrates an end-to-end request lifecycle with role-specific workflows, relational persistence, SLA reporting, auditable changes and repeatable local deployment.

**Questions**
