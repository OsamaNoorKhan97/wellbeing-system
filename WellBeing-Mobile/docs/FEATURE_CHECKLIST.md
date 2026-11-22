# Feature checklist (web app is the source of truth)

Legend: Done = implemented and connected to the real backend. N/A = the web app/backend has no such feature, so none was invented.

## Employee
| Feature | Status |
|---|---|
| Login, registration, forgot/reset password, remembered login, logout, session expiry handling | Done (no refresh-token endpoint exists, same as web) |
| Dashboard: welcome, profile line, latest mood/stress/energy, check-in status + next time, survey status + next time, pending break/discussion requests, upcoming meetings, recent notifications, suggestions, mood trend | Done |
| Check-in: 1-5 emoji scales, review, submit, confirmation, history, interval from backend, disabled with next time, duplicate-tap and retry protection | Done |
| OB survey: dynamic questions, five-point scale, progress, answers kept between questions and across restarts, mandatory validation, final review, confirmation, history, cycle from backend | Done |
| Need Help: Take a Break, Discussion with Line Manager, optional message, status, manager comment, history, upcoming meetings, withdraw | Done |
| Automatic recommendation + Request a Break linked to the alert, no duplicates | Done |
| Profile, change password, push permission, logout; organisational fields read-only | Done |
| Per-category notification preferences | N/A (no backend support) |

## Line Manager
| Feature | Status |
|---|---|
| Dashboard counts, attention list, pending requests, upcoming meetings, recent activity | Done |
| Assigned employees: list, search, filters, detail (activity, alerts, requests); only own team | Done (scores are intentionally not exposed by the backend) |
| Alerts: list, detail, acknowledge, notes/follow-up, resolve, history | Done |
| Break requests: approve/reject with comment, history | Done |
| Discussion requests: read message, schedule with date/time/duration/purpose/location, notify | Done. Rejecting a discussion request is not offered by the backend (schedule or leave pending; the employee can withdraw) |
| Meetings: schedule; Actions menu with Reschedule (native picker, reason, history), Reject (confirm, reason, history), Snooze (1 h, 3 h, 1 day, custom; reminder only), Cancel, Complete; history screen | Done |

## HR
| Feature | Status |
|---|---|
| Organization stats, trends, department comparison, survey analytics with privacy minimum | Done |
| Alerts (all, status filter, department filter), acknowledge/resolve/notes | Done |
| User directory with search, role/status/department filters, pagination, create, activate/deactivate, change role, assign manager | Done (cannot touch Super Admins, enforced by backend) |
| Survey questions, activity log | Done |
| Filters by employee/date for reports | Partly: department and period (7/30/90 days) as in the web analytics API |

## Super Admin
| Feature | Status |
|---|---|
| System dashboard (employees, managers, HR users, Super Admins, active users, check-ins, surveys, alerts, requests, trends) | Done |
| User management incl. creating Super Admins | Done |
| Assessment frequency (one interval for mood+stress+energy; presets + custom) | Done |
| Survey frequency (presets + custom) | Done |
| Alert thresholds, indicators required, consecutive assessments, who is notified | Done |
| Administrative settings (privacy minimum), survey questions, activity log | Done |
| Same configuration as web (one database) | Verified |

## Platform
| Feature | Status |
|---|---|
| Role-based tabs, role-protected routes, deep links (`wellbeing://`), Android back button (Expo Router default) | Done |
| Push: device registration, multi-device, invalid-token handling, generic lock-screen text, tap deep links, foreground banner, no duplicates | Implemented; delivery needs credentials (README) |
| Offline banner, retry, timeouts, drafts, privacy cover in app switcher | Done |
| Android project/config, EAS profiles (APK/AAB), iOS bundle id + EAS profiles | Done (iOS project generated on Mac/EAS) |
| Survey-availability push, administrator announcements | N/A (not in the web app) |
