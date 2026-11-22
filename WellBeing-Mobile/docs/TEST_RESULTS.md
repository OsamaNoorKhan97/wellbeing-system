# Test results

Run on 2026-11-22 (Windows 11, Node 26). What was and was not tested is stated plainly.

## Automated results

| Check | Result |
|---|---|
| Backend test suite (`cd backend && npm test`) incl. new device + push tests | **95 / 95 passed** |
| `npm run typecheck` (strict TypeScript) | no errors |
| `npm test` (Jest: deep links, formatting, API client, auth store) | **19 / 19 passed** |
| `npx expo-doctor` | **20 / 20 checks passed** |
| `npx expo export --platform android --platform ios` | both Hermes bundles compiled (4.5 MB each) |
| `npx expo prebuild --platform android` | native Android project generated (`com.wellbeing.mobile`, POST_NOTIFICATIONS) |
| Browser end-to-end (`npm run test:e2e`) | **48 / 48 passed**, 390x844 touch viewport, real backend + PostgreSQL |

## What the 48 end-to-end checks cover

The app's React Native code, built for the web, was driven in Microsoft Edge against a real backend and database. Database state was verified directly, not only the screen.

**Authentication** wrong password message; empty-field validation; sign-in for all four roles; role-specific tabs; logout.

**Employee** frequency read from the backend (24 h); all three ratings required; review step; double-tap records exactly one check-in; a second check-in is blocked with the next time shown; a second consecutive poor check-in raises an alert and shows the break recommendation; "Request a Break" creates one request linked to the alert; full survey with review and confirmation; survey blocked in the same cycle; discussion request with a message; duplicate pending request blocked; employee cannot reach manager/admin screens; department read-only; meetings list.

**Line Manager** sees the alert; alert detail (dates only, no scores), acknowledge, note, resolve; approves a break with a comment (employee sees it); schedules a discussion; meeting Actions menu; **snooze** changes the reminder only and not the meeting time; **reschedule** sets RESCHEDULED, keeps the old time in history and notifies the employee; **reject** sets REJECTED with the reason and notifies the employee; employee list/search/detail; notification inbox; cannot open Super Admin/HR screens.

**HR** tabs; alerts list; reports (check-in chart, wellbeing averages, departments, survey participation); user directory search; cannot open settings.

**Super Admin** tabs; creates a Line Manager; deactivates and reactivates it; changes assessment frequency to 12 h and the employee API immediately reports 12 h (same database); changes survey frequency and alert thresholds and restores the defaults; invalid thresholds are rejected with the backend's message; alerts, inbox, analytics, activity log and survey-question screens.

**Plus** no uncaught script errors during the whole run.

## Bugs found by this testing and fixed

1. Disabled buttons did not expose a disabled state (assistive technology and the browser could still treat them as active).
2. Screens that were a tab for one role but not another (requests, the notification bell for non-employees, Super Admin alerts, an employee's meetings) could not be opened: navigation bounced to Home. They are now stack routes (`requests`, `inbox`, `all-alerts`, `my-meetings`).
3. After "Request a Break" the recommendation card did not show the new request as pending.
4. Settings: a background refresh could overwrite an unsaved edit in another section, and a validation error was shown generically and off-screen. Edits are now protected and the backend's field message is shown inside the section.

## Not tested (cannot be claimed)

- No physical device, Android emulator or iOS simulator was available (no Android SDK or JDK, and no Mac). Native look, native date/time dialogs, hardware back button, keyboard behaviour on devices and different phone sizes still need a pass on a phone.
- **Push notifications were not delivered to a device.** The sender logic is tested against a stubbed gateway; real delivery needs the EAS project id, FCM/APNs credentials and the backend deployed (see README).
- Network interruption was verified at unit level (API client, auth store) and by server-side duplicate prevention, not by pulling the network on a device.
- iOS: the native project could not be generated on Windows.
