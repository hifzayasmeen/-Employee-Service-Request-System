# User guide

## Start the application

From the repository root, run:

```powershell
docker compose up --build
```

Keep that terminal open while using the app. Open:

- Service Desk: <http://localhost:3000>
- API health check: <http://localhost:4000/api/health>
- Development email inbox (Mailpit): <http://localhost:8025>

The health endpoint should return `{"ok":true}`. Demo accounts use the password `Password@123`:

| Role | Email |
|---|---|
| Employee | `asha@corp.com` or `ravi@corp.com` |
| IT agent | `meera@corp.com` |
| HR agent | `karan@corp.com` |
| Facility agent | `sana@corp.com` |
| Administrator | `admin@corp.com` |

These shared credentials are for local demo use only.

## Employee workflow

1. Sign in with an employee account.
2. In **Raise a request**, choose IT, HR or Facility and a priority.
3. Enter a title (5–80 characters) and details (10–500 characters), then submit.
4. Review **My requests** for status, assignee and SLA time. Employees can only see their own requests.
5. Sign out when finished.

SLA targets are 4 hours for High, 24 hours for Medium and 72 hours for Low priority.

## Agent workflow

1. Sign in with the account for the relevant team.
2. Review the team queue. The API only returns that agent's team's requests.
3. Select **Assign to me** to take ownership.
4. Use the status selector to move a request through Open, In Progress, Resolved or Closed.
5. Review breach alerts and time remaining in the queue.

## Administrator workflow

1. Sign in as `admin@corp.com`.
2. Use the dashboard to review totals, statuses, team and priority breakdowns, and SLA breaches.
3. In the request list, select an eligible active agent from the request's team to assign it, or clear the assignment.
4. Use **User management** to create accounts, change a user's role/team, change a password, or deactivate an account. Agent accounts require a team.
5. Review **Audit log** for recorded request and account changes.

The system prevents demoting/deactivating your own admin account and prevents removal of the last active admin.

## Password recovery

1. On the sign-in screen, choose **Forgot password?** and submit the account email.
2. For the local Docker setup, open Mailpit at <http://localhost:8025> and follow the reset link in the captured email.
3. Choose and confirm a password of at least 8 characters.
4. Sign in again. The link expires after one hour and can only be used once; changing the password revokes existing sessions.

The reset response is intentionally generic so it does not disclose whether an email belongs to an account.

## Stop the services

In the terminal running Compose, press **Ctrl+C**. To stop containers from another terminal without removing database data, run `docker compose stop`. The database uses a named volume so ordinary stops preserve its contents.

## Troubleshooting

- **Docker engine connection error:** open Docker Desktop, wait until its engine is running, then retry `docker compose up --build`.
- **Port already in use:** stop the process/container using port 3000, 4000 or 8025, then retry.
- **Login fails:** verify the correct role email and demo password, and check that backend and database containers are healthy with `docker compose ps`.
- **Email not visible:** open Mailpit at port 8025; the local SMTP inbox captures rather than sends email externally.
