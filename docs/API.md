# API reference

Base URL: `/api/v1` · JSON in and out · `Authorization: Bearer <token>` on every endpoint except those marked *public*.

## Conventions

Success:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 10, "total": 42, "totalPages": 5 } }
```

`meta` is present on paginated lists (`?page=1&pageSize=10`, page size up to 100).

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Please correct the highlighted fields", "details": [{ "field": "email", "message": "Enter a valid email address" }] } }
```

| Status | Meaning | Typical `code` |
|---|---|---|
| 400 | Malformed request, invalid id, action not allowed on self | `BAD_REQUEST` |
| 401 | Missing, invalid or expired token; wrong credentials | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | Role not allowed, or account deactivated | `FORBIDDEN` |
| 404 | Not found, or belongs to someone else | `NOT_FOUND` |
| 409 | Conflicts with current state | `DUPLICATE_USER`, `NO_MANAGER_ASSIGNED`, `REQUEST_ALREADY_PENDING`, `REQUEST_NOT_PENDING`, `WRONG_REQUEST_TYPE`, `SURVEY_ALREADY_COMPLETED`, `MEETING_NOT_ACTIVE` |
| 422 | Validation failed (`details` lists fields) | `VALIDATION_ERROR` |
| 429 | Daily check-in limit reached, or too many login attempts | `DAILY_LIMIT_REACHED`, `TOO_MANY_REQUESTS` |

Roles: **E** = Employee, **M** = Line Manager, **A** = HR/Admin.

## Authentication — `/auth`

| Method | Path | Access | Body | Result |
|---|---|---|---|---|
| POST | `/auth/register` | public | `fullName, employeeId, email, department, designation, password, confirmPassword` | 201, the new employee |
| POST | `/auth/login` | public | `identifier` (email or Employee ID), `password`, `rememberMe?` | `{ token, expiresIn, user }` |
| POST | `/auth/forgot-password` | public | `identifier` | Always 200. Outside production also `devResetUrl`. |
| POST | `/auth/reset-password` | public | `token, password, confirmPassword` | 200; all sessions signed out |
| GET | `/auth/me` | any | | Current user with department, designation, manager, team size |
| PATCH | `/auth/me` | any | `fullName, department?, designation?` | Updated user |
| POST | `/auth/change-password` | any | `currentPassword, password, confirmPassword` | `{ token }` (replaces the current one) |

Passwords: at least 8 characters with a letter and a number.

## Users — `/users` (A)

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | Filters: `search`, `role`, `status=active\|inactive`, `department`, `assignment=assigned\|unassigned`; paginated |
| GET | `/users/departments` | Distinct department names |
| POST | `/users` | `fullName, employeeId, email, role, department?, designation?, password` |
| GET | `/users/:id` | Details plus activity counts (no individual scores) |
| PATCH | `/users/:id/status` | `{ isActive }`; not on yourself |
| PATCH | `/users/:id/role` | `{ role }`; not on yourself; ends assignments and cancels upcoming meetings |

## Assignments — `/assignments` (A)

| Method | Path | Notes |
|---|---|---|
| GET | `/assignments` | Every Line Manager with their current team |
| PUT | `/assignments/:employeeId` | `{ managerId }` assigns or reassigns; pending requests follow; both parties notified |
| DELETE | `/assignments/:employeeId` | Ends the current assignment |

## Employees — `/employees` (E)

| Method | Path | Notes |
|---|---|---|
| GET | `/employees/me/dashboard` | Check-in status, recent ratings, survey status, recent requests, upcoming meetings, recent notifications, manager |
| GET | `/employees/me/manager` | Current Line Manager or `null` |

## Line Managers — `/managers` (M)

| Method | Path | Notes |
|---|---|---|
| GET | `/managers/me/dashboard` | Summary counts, recent requests, upcoming meetings, recent team activity |
| GET | `/managers/me/team` | Assigned employees with activity status; `?search=` |

## Well-being assessments — `/assessments` (E)

| Method | Path | Notes |
|---|---|---|
| GET | `/assessments/status` | `{ limit, usedToday, remaining, canSubmit, nextAvailableAt, timezone, latestToday }` |
| GET | `/assessments` | Own history, newest first; paginated |
| POST | `/assessments` | `{ mood, stress, energy }` each an integer 1–5. 201, or 429 `DAILY_LIMIT_REACHED` with `details.nextAvailableAt` |

## Surveys — `/surveys`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/surveys/questions` | E, A | Active questions; A may add `?includeInactive=true` |
| POST | `/surveys/questions` | A | `text, category, displayOrder?, isActive?` |
| PATCH | `/surveys/questions/:id` | A | Any of the above; `isActive` activates or deactivates |
| GET | `/surveys/status` | E | `{ completed, lastSubmittedAt, nextAvailableAt, frequencyDays, activeQuestionCount }` |
| POST | `/surveys/submissions` | E | `{ answers: [{ questionId, rating }] }` with one answer per active question (1 = Strongly Disagree … 5 = Strongly Agree). 422 lists unanswered questions; 409 if already completed this cycle |
| GET | `/surveys/submissions` | E | Own submissions with answers |

## Support requests — `/requests` (E, M)

Employees see their own requests; Line Managers see requests addressed to them.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/requests` | E, M | Filters: `type=BREAK\|DISCUSSION`, `status`; paginated |
| POST | `/requests` | E | `{ type, reason? }` → `PENDING`; notifies the Line Manager |
| GET | `/requests/:id` | E, M | Includes meeting details once scheduled |
| POST | `/requests/:id/approve` | M | Break only. `{ comment? }`; notifies the employee |
| POST | `/requests/:id/reject` | M | Break only. `{ comment? }`; notifies the employee |
| POST | `/requests/:id/schedule` | M | Discussion only. `{ scheduledAt, durationMinutes?, purpose?, location? }` creates the meeting, sets `SCHEDULED`, notifies the employee |
| POST | `/requests/:id/cancel` | E | Withdraws a pending request |

## Meetings — `/meetings` (E, M)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/meetings` | E, M | `scope=upcoming\|past\|all` (default upcoming); paginated |
| POST | `/meetings` | M | `{ employeeId, scheduledAt, durationMinutes?, purpose?, location? }`; employee must be assigned to you; future time only |
| PATCH | `/meetings/:id` | M | Any of the fields; notifies the employee |
| POST | `/meetings/:id/cancel` | M | `{ reason? }`; notifies the employee; a linked request returns to `PENDING` |
| POST | `/meetings/:id/complete` | M | Marks the meeting (and a linked request) completed |

`scheduledAt` is an ISO 8601 timestamp, e.g. `2026-11-20T09:30:00.000Z`.

## Notifications — `/notifications` (any)

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Own notifications; `unreadOnly=true`; paginated; `meta.unread` holds the unread count |
| GET | `/notifications/unread-count` | `{ unread }` |
| POST | `/notifications/:id/read` | Marks one as read |
| POST | `/notifications/read-all` | Marks all as read |

Each notification: `id, type, title, message, relatedUserId, relatedUserName, entityType, entityId, isRead, readAt, createdAt`.

## Settings — `/settings` (A)

| Method | Path | Notes |
|---|---|---|
| GET | `/settings` | All settings with label, description, last change |
| PUT | `/settings` | Any subset of the keys below |

| Key | Values | Default |
|---|---|---|
| `daily_assessment_limit` | 1–10 | 1 |
| `survey_frequency_days` | 1–365 | 30 |
| `organization_timezone` | IANA time zone name | Asia/Karachi |
| `analytics_min_group_size` | 1–50 | 3 |

## Analytics — `/analytics` (A)

| Method | Path | Notes |
|---|---|---|
| GET | `/analytics/summary` | Totals for the dashboard cards |
| GET | `/analytics/trends?days=30` | 7–180 days. Per-day check-ins, surveys, break and discussion requests, activity, and average mood/stress/energy (null for small groups); weekly check-ins for 8 weeks; request totals by status; per-department participation and averages |
| GET | `/analytics/survey` | Participation in the current cycle and per-question average and distribution |

## Audit log — `/audit-logs` (A)

| Method | Path | Notes |
|---|---|---|
| GET | `/audit-logs` | Filters: `action`, `search`; paginated, newest first |
| GET | `/audit-logs/actions` | Distinct action names for the filter |

## Health

`GET /health` (public) → `{ status: "ok", time }`.

## Super Admin, well-being alerts and meeting actions

Roles are `EMPLOYEE`, `LINE_MANAGER`, `HR` and `SUPER_ADMIN`. HR-level endpoints (users, assignments, analytics, audit log, survey questions) accept `HR` and `SUPER_ADMIN`.

| Method and path | Roles | Purpose |
|---|---|---|
| `GET /settings` | HR, Super Admin | Read the global configuration |
| `PUT /settings` | **Super Admin only** | Change `assessment_interval_hours`, `survey_frequency_days`, `alert_*` thresholds, notification switches |
| `GET /assessments/status` | Employee | `intervalHours`, `canSubmit`, `nextAvailableAt`, `lastSubmittedAt`. `POST /assessments` returns 429 `ASSESSMENT_NOT_YET_AVAILABLE` before the interval has passed and a `recommendation` when an alert was raised |
| `GET /alerts?status=open\|ACTIVE\|ACKNOWLEDGED\|RESOLVED\|all` | Line Manager (own team), HR, Super Admin | List alerts |
| `GET /alerts/:id` | same | Details and follow-up comments (dates only, never ratings) |
| `POST /alerts/:id/acknowledge`, `/resolve`, `/comments` | same | Handle an alert; `comment` optional (required for `/comments`) |
| `POST /requests` with `alertId` | Employee | Break request linked to the alert behind the recommendation |
| `POST /meetings/:id/reject` `{reason?}` | Line Manager | Status `REJECTED`, employee notified |
| `POST /meetings/:id/reschedule` `{scheduledAt, durationMinutes?, reason?}` | Line Manager | Status `RESCHEDULED`, previous schedule kept in history |
| `POST /meetings/:id/snooze` `{minutes}` or `{until}` | Line Manager | Postpones the reminder only; one reminder is created when it expires |
| `GET /meetings/:id/history` | Line Manager, Employee | Reschedules and rejection (snoozes are visible to the manager only) |
