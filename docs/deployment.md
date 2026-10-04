# Public Vercel demo deployment

This repository is linked to two Vercel projects:

- Frontend: `employee-service-request-frontend`
- API: `employee-service-request-api`

The production API requires a hosted PostgreSQL database. A deployment URL alone is not sufficient: configure the variables below before sharing the site. Use a separate demo database with no real employee data.

## Configure production variables

In the Vercel project settings, add these variables to the **Production** environment:

| Project | Variable | Value |
|---|---|---|
| API | `DATABASE_URL` | Neon pooled PostgreSQL connection string (keep private) |
| API | `JWT_SECRET` | Random secret, at least 32 random bytes (keep private) |
| API | `DEMO_PASSWORD` | Random password of at least 12 characters for the seeded demo accounts (keep private) |
| API | `FRONTEND_URL` | `https://employee-service-request-frontend.vercel.app` |
| Frontend | `VITE_API_BASE_URL` | `https://employee-service-request-api.vercel.app` |

Do not paste database/JWT/demo passwords into source code, documentation, issues or chat. Enter them directly into Vercel's sensitive environment-variable form. `DEMO_PASSWORD` is only used when the database is first seeded; changing it later does not change existing users' password hashes.

## Deploy and make the demo reachable

From the linked project folders, deploy the API first and frontend second:

```powershell
Set-Location D:\esr\backend
vercel --prod
Set-Location D:\esr\frontend
vercel --prod
```

Vercel deployment protection must allow public access to the production frontend and API. Disable SSO protection only for these demo projects once production variables are configured. Do not disable protection on projects that contain real/private data.

On the first API request, the service applies migrations and seeds the demo accounts using `DEMO_PASSWORD`. Confirm `https://employee-service-request-api.vercel.app/api/health` returns `{"ok":true}`, then verify login and request flows at `https://employee-service-request-frontend.vercel.app`.

## Uptime and limitations

The Vercel URL remains stable, but free-tier database/service limits and cold starts can delay or temporarily restrict access; this is not a contractual 24/7 SLA. The hosted serverless deployment does not run the long-lived SLA email worker from `backend/src/index.js`. Local Docker Compose remains the full development setup, including Mailpit.

For a public demo, use only seeded sample data. The demo account password is shared among seeded roles, so anyone given it can access the admin account and alter demo data. Never reuse it for a real account.
