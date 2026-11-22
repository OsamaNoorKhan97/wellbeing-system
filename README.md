# Employee Well-Being and Organizational Behavior Monitoring System

A web application where employees record well-being check-ins, answer an Organizational Behavior survey and ask their Line Manager for support; Line Managers handle requests and meetings for their team; and HR/Admin manages users, assignments, survey questions, settings and organization-wide analytics.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 6 |
| Backend | Node.js (20.12+), Express 4, TypeScript, Zod |
| Database | PostgreSQL 14+ (plain SQL migrations) |
| Auth | JWT bearer tokens, scrypt password hashing, role-based access control |
| Tests | Node's built-in test runner against a real PostgreSQL test database |

Further documentation: [Architecture, assumptions and database design](docs/ARCHITECTURE.md) · [API reference](docs/API.md)

## Prerequisites

- Node.js 20.12 or newer (22 recommended)
- PostgreSQL 14 or newer, or Docker (a `docker-compose.yml` for the database is included)

## Setup

### 1. Database

With Docker:

```bash
docker compose up -d
docker compose exec db createdb -U wellbeing wellbeing_test   # only needed for running the tests
```

Or with an existing PostgreSQL server:

```sql
CREATE ROLE wellbeing LOGIN PASSWORD 'wellbeing';
CREATE DATABASE wellbeing OWNER wellbeing;
CREATE DATABASE wellbeing_test OWNER wellbeing;
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # then set JWT_SECRET (see the comment in the file)
npm run db:migrate          # creates the schema, roles, default settings and survey questions
npm run db:seed             # optional: loads sample users and 30 days of sample data
npm run dev                 # API on http://localhost:4000/api/v1
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                 # app on http://localhost:5173 (API calls are proxied to port 4000)
```

Open http://localhost:5173.

## Sample accounts

After `npm run db:seed`, every sample account uses the password in `SEED_PASSWORD` (default `Password@123`). Change or remove these accounts before any real use.

| Role | Email | Employee ID |
|---|---|---|
| Super Admin | super.admin@example.com | SUPER001 |
| HR | hr.admin@example.com | HR001 |
| Line Manager (Engineering, 5 employees) | bilal.ahmed@example.com | MGR001 |
| Line Manager (Sales & Marketing) | sara.malik@example.com | MGR002 |
| Line Manager (Operations) | omar.farooq@example.com | MGR003 |
| Employee (no check-in yet today, survey not taken) | hassan.raza@example.com | EMP001 |
| Employee (has a pending break request) | fatima.noor@example.com | EMP002 |
| Employee (no Line Manager assigned) | danish.mirza@example.com | EMP013 |

You can sign in with either the email address or the Employee ID. `npm run db:reset` wipes all data and loads the samples again.

Without sample data, create the first Super Admin (use `ADMIN_ROLE=HR` for an HR account) with:

```bash
ADMIN_ROLE=SUPER_ADMIN ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='Choose-a-strong-1' ADMIN_NAME='Your Name' ADMIN_EMPLOYEE_ID=SUPER001 npm run create-admin
```

Employees register themselves on the sign-up page. Line Managers and HR users are created in **User Management** (or by changing an existing user's role). Only a Super Admin can create or promote another Super Admin.

Upgrading an existing installation: `npm run db:migrate` applies migration 003, which renames the old Admin role to HR (accounts and data are kept), adds the Super Admin role and creates the new settings. Then create a Super Admin with the command above.

## Using the application

**Employee** – Dashboard, Well-Being Check (mood, stress and energy on a 1–5 emoji scale, with history), OB Survey, Need Help (request a break or a discussion, track status, see upcoming meetings), Notifications, Profile.

**Line Manager** – Dashboard, Employee Overview (assigned employees and their activity), Employee Requests (approve or reject breaks with a comment, schedule a meeting for a discussion request), Meetings (schedule, edit, cancel, complete), Notifications, Profile.

**HR** – Dashboard with charts, Well-Being Alerts, User Management (search, filter, create, activate/deactivate, change role, assign manager), Assignments, Survey Management (add, edit, activate, deactivate questions), Analytics, Settings (read-only view of the global configuration), Audit Log, Notifications, Profile.

**Super Admin** – everything HR can do, plus System Configuration (the only place global settings can be changed): well-being assessment frequency (default every 24 hours; 12/24/48/72 hours or a custom interval), OB survey frequency (default 30 days; 7/15/30/45/60 days or custom), well-being alert thresholds, how many indicators and how many consecutive assessments trigger an alert, and who is notified. Also creates and manages HR, Line Manager and other Super Admin accounts and reads the activity and configuration log.

**Well-being alerts** – after every successful check-in the server checks the employee's latest assessments. An assessment is *poor* when at least 2 of 3 indicators cross their thresholds (mood ≤ 2, stress ≥ 4, energy ≤ 2 by default). Two consecutive poor assessments raise one alert, notify the Line Manager and every HR user once, and show the employee a "take a break" recommendation with a **Request a Break** button that creates a break request linked to the alert. Managers, HR and the Super Admin can acknowledge, comment on and resolve alerts. Alerts show dates only, never the scores.

**Meetings** – each meeting has an **Actions** menu: *Reschedule* (new date and time, optional reason; the old schedule is kept in the history), *Reject* (with an optional reason), *Snooze reminder* (1 hour, 3 hours, 1 day or a custom time; the meeting itself never moves and the manager gets one reminder when the snooze ends), *Edit*, *History* and *Cancel*. Statuses: Scheduled, Rescheduled, Rejected, Cancelled, Completed.

A typical walk-through: sign in as EMP001 and request a break → sign in as MGR001, see the notification, approve it with a comment → back as EMP001 the request shows "Approved" and a notification has arrived. As SUPER001, change the assessment frequency in System Configuration and it applies to the employee's next check-in.

## Tests

```bash
cd backend
npm test
```

The tests start the API on a random port and run against `TEST_DATABASE_URL` (its data is erased on every run; the name must contain "test"). They cover authentication, role-based authorization, the configurable assessment interval (including simultaneous submissions), Super Admin-only settings, well-being alerts and their notifications, the break recommendation, meeting reject, reschedule and snooze, the break request workflow, discussion and meeting scheduling, survey submission and HR administration.

## Production notes

- Build the frontend with `npm run build` in `frontend/`. Either serve `frontend/dist` from any static host and set `VITE_API_URL` / `CORS_ORIGIN` accordingly, or set `FRONTEND_DIST=../frontend/dist` in the backend so one Node process serves both the API and the app.
- Set `NODE_ENV=production`, a long random `JWT_SECRET`, and run behind HTTPS.
- **Forgot password** creates a real single-use token that expires after 30 minutes, but no mail server is configured. Outside production the reset link is shown on screen and written to the server log. For production, send the link by email from `requestPasswordReset` in `backend/src/modules/auth/auth.service.ts`.
- The login rate limiter keeps its counters in memory; use a shared store if you run several API instances.
- Notifications are stored in the database and the browser polls for the unread count every 30 seconds. All notifications are emitted on `notificationEvents` (`backend/src/services/notification.service.ts`), which is the place to attach WebSockets, Server-Sent Events or web push later.

## Project structure

```
backend/
  migrations/            SQL migrations (schema, reference data)
  src/
    config/              environment validation
    db/                  connection pool, migration runner, seed, reset, create-admin
    middleware/          authentication, authorization, validation, rate limit, errors
    modules/<name>/      routes (HTTP + validation) and service (business rules, SQL) per API module
    services/            cross-cutting: notifications, audit log, settings, assignments
    utils/               responses, errors, password hashing, date formatting
  tests/                 API tests
frontend/
  src/
    lib/                 API client, formatting, rating scales
    services/            one typed function per API call
    context/             authentication and toast state
    hooks/               data loading
    components/          UI kit, charts, layout, shared widgets
    pages/               auth, employee, manager, admin, shared
docs/                    architecture and API reference
```
