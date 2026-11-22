# WellBeing Mobile

A native React Native (Expo) app for Android and iOS for the **Employee Well-Being and Organizational Behavior Monitoring System**.
It is a separate project from the web app and talks to the **same backend and database**, so web and mobile always show the same data and use the same settings, roles and permissions.

This is a real native app (React Native components, native navigation, native date/time pickers, push notifications), not a WebView and not a responsive website.

## What is inside

| Role | Tabs | Highlights |
|---|---|---|
| **Employee** | Home, Assessments, Need Help, Notifications, Profile | Mood/Stress/Energy check-in with emoji scales, review step, interval enforcement, OB survey with progress/review/draft saving, break and discussion requests, automatic "take a break" recommendation with **Request a Break** |
| **Line Manager** | Home, Employees, Alerts, Meetings, Profile | Team list and search, alert acknowledge/note/resolve, approve or reject breaks, schedule discussions, meeting **Actions** menu: **Reschedule**, **Reject**, **Snooze reminder** (1 h / 3 h / 1 day / custom), Cancel, Complete, history |
| **HR** | Home, Employees (directory), Alerts, Reports, Profile | Organization stats, alerts with department filter, trends (mood/stress/energy, check-ins, requests), department comparison, survey analytics, user directory and management, activity log |
| **Super Admin** | Home, Users, Analytics, Settings, Profile | Everything HR has plus create/role/status/assign users, and **System Configuration**: assessment frequency (default 24 h), survey frequency (default 30 days), alert thresholds, consecutive-assessment rule, who is notified |

Behaviour comes from the backend, never from constants in the app: the assessment interval, the survey frequency and the alert rules are read from the server on every screen, and the server enforces them (HTTP 429 when a check-in is too early, 409 for a repeated survey).

## Technology

- React Native 0.88 + Expo SDK 58, TypeScript (strict)
- Expo Router (file-based navigation, deep linking, role-protected screens)
- TanStack Query (server state, caching, pagination, pull-to-refresh), Zustand (session)
- React Hook Form + Zod (login and registration forms)
- expo-secure-store (session token in the Keychain/Keystore), AsyncStorage (unsent drafts only)
- expo-notifications (push), @react-native-community/netinfo (offline detection)
- react-native-svg (charts), @react-native-community/datetimepicker (native pickers)

## Folder structure

```
WellBeing-Mobile/
  app/                    Expo Router routes
    (auth)/               login, register, forgot/reset password
    (tabs)/               ONE tab navigator for all roles; each role sees only its own tabs
    alert/[id].tsx  request/[id].tsx  meeting/[id].tsx  team/[id].tsx  user/[id].tsx
    check-in.tsx  survey.tsx  requests.tsx  inbox.tsx  all-alerts.tsx  my-meetings.tsx
    user-new.tsx  change-password.tsx  audit.tsx  survey-questions.tsx
  src/
    api/                  fetch client (token, timeout, error mapping) + one typed function per endpoint
    components/           UI kit, charts, date/time field, meeting actions, role gate
    screens/              role dashboards and shared list screens
    store/                auth session (Zustand)
    notifications/        push registration, tap handling, deep links
    storage/              secure token storage, drafts
    hooks/ lib/ constants/ types/
  tests/                  Jest unit tests
  android/                generated native Android project (expo prebuild)
  eas.json                EAS Build profiles
```

`ios/` is created by `npx expo prebuild --platform ios` on a Mac, or by EAS Build in the cloud (Windows cannot generate it).

## Prerequisites

- Node.js 20.19 or newer (22+ recommended) and npm
- The WellBeing backend reachable over HTTPS (the live one is `https://wellbeing-system.onrender.com`)
- For a physical phone: the **Expo Go** app is enough for the first run; push notifications and store builds need an EAS **development/preview build** (below)
- For emulators: Android Studio (Android SDK + an emulator image) and/or Xcode on a Mac
- For builds: a free Expo account (`npm i -g eas-cli`, `eas login`)

## Run it

```bash
cd WellBeing-Mobile
npm install --legacy-peer-deps
cp .env.example .env          # edit EXPO_PUBLIC_API_URL if you use your own backend
npx expo start                # press a (Android emulator), i (iOS simulator) or scan the QR code in Expo Go
```

`npm run web` / `npx expo export --platform web` also work; the browser build is what the automated UI tests drive.

### Backend address

`EXPO_PUBLIC_API_URL` (in `.env`, or the `env` block of an EAS profile) must include `/api/v1`.

| Where the app runs | Value |
|---|---|
| Live backend | `https://wellbeing-system.onrender.com/api/v1` |
| Android emulator to a backend on your PC | `http://10.0.2.2:4000/api/v1` |
| iOS simulator to a backend on your Mac | `http://localhost:4000/api/v1` |
| Phone to a backend on your PC (same Wi-Fi) | `http://<your-PC-LAN-IP>:4000/api/v1` |

Production builds must use HTTPS. The Render free plan sleeps when idle, so the first request can take 30 to 60 seconds.

### Sign-in accounts

Use the accounts of the web app (there are no separate mobile accounts). Sample IDs after `npm run db:seed` in the backend: `SUPER001` (Super Admin), `HR001`, `MGR001`..`MGR004`, `EMP001`..`EMP013`. Employees can also register in the app; Line Manager, HR and Super Admin accounts are created by an administrator.

## Authentication and session

- Login with email or Employee ID; "Keep me signed in" stores the JWT in the OS keychain (expo-secure-store). Without it the token lives only in memory.
- On start the stored token is validated with `GET /auth/me`; every foreground resume re-checks the account.
- Any 401 (expired token, password changed elsewhere, deactivated account) signs the user out with a message.
- Logout deletes the token and unsent drafts and unregisters this device from push.
- The backend has **no refresh-token endpoint** (same as the web app): a session ends when the JWT expires (the "remember me" token lives longer) and the user signs in again.
- Forgot password creates a single-use token on the server. Outside production the server returns the link, so the app offers it directly; in production the backend must send it by email (see the web README).

## Push notifications

How it works:

1. After sign-in the app asks for notification permission and gets an Expo push token (`registerForPush`).
2. It sends the token to the backend (`POST /devices`). A user can have several devices; a token moves to whoever signed in last on that device; logout calls `POST /devices/unregister`.
3. Whenever the backend creates a notification (`notify()`), `push.service.ts` sends one push message per registered device through the Expo push service, then marks tokens the gateway reports as `DeviceNotRegistered` invalid.
4. Lock-screen text is generic ("A well-being alert needs attention."). It never contains names, scores or request text. The payload carries only ids, so tapping a message opens the right screen (alert, request or meeting) through deep links.
5. In the foreground the message is shown as a banner and the lists refresh; each tapped notification is opened only once.

Events covered (all already created by the backend): well-being alerts, break requested/approved/rejected, discussion requested, meeting scheduled/updated/rescheduled/rejected/cancelled/reminder (including the reminder created when a snooze ends), manager/team assignments.
Not available because the web app has no such feature: survey-availability reminders and administrator announcements.

**What you still have to provide** (the app cannot do this for you):

- An Expo/EAS project id: run `eas init`, then put it in `app.json` -> `expo.extra.eas.projectId` or `EXPO_PUBLIC_EAS_PROJECT_ID`.
- **Android:** a Firebase project; add the Android app `com.wellbeing.mobile`, download `google-services.json`, reference it in `app.json` (`android.googleServicesFile`), and upload the FCM v1 service-account key with `eas credentials`.
- **iOS:** an Apple Developer account; EAS creates the APNs key for you during `eas build`.
- Deploy the backend change (migration `004_device_tokens.sql` and the `/devices` routes) to the live server. Until then the live API answers 404 to `/devices` and the app simply runs without push.
- Push only works on physical devices with a development/preview/production build (not in Expo Go on recent SDKs, not on simulators or the web).

## Offline and unstable networks

- A banner appears when the device is offline; queries pause and resume automatically when the connection returns.
- Requests time out after 25 s and are reported as "Cannot reach the server".
- Nothing is reported as successful until the server confirms it. Submit buttons lock while a request is running (including a double tap), and the server enforces the check-in interval and the survey cycle, so a retry after a lost response cannot create a duplicate: the app shows "already recorded" instead.
- Unsent survey answers and request messages are kept per user on the device and removed after a confirmed submit or logout.
- When the app goes to the background a privacy cover hides the screen in the OS app switcher.

## Tests

```bash
npm run typecheck            # TypeScript, strict
npm test                     # Jest: deep links, formatting, API client, auth store
npx expo-doctor              # dependency/config checks
npx expo export --platform android --platform ios   # compiles the native Hermes bundles
```

A full browser-driven test of all four roles against a real backend is described in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) (48 checks at 390x844). The backend has 95 automated tests (`cd backend && npm test`), including the device-registration and push tests.

## Building

Android (cloud build, no Android SDK needed on your PC):

```bash
npm i -g eas-cli && eas login
eas init                                       # once: creates the project id
eas build --platform android --profile preview       # installable .apk for testing
eas build --platform android --profile production    # .aab for Google Play
```

Android locally (needs JDK 17 and the Android SDK): `npx expo prebuild --platform android` then `cd android && ./gradlew assembleRelease`.

Release signing: with EAS, `eas credentials` creates and stores the upload keystore for you. For a local release build create a keystore (`keytool -genkeypair ...`), keep it out of git, and reference it in `android/app/build.gradle` `signingConfigs`.

iOS (needs an Apple Developer account, $99/year):

```bash
eas build --platform ios --profile preview       # ad-hoc build for registered devices
eas build --platform ios --profile production    # App Store / TestFlight
eas submit --platform ios
```

EAS creates the bundle identifier registration (`com.wellbeing.mobile`), certificates and provisioning profiles when you sign in with your Apple ID. To change the identifiers edit `ios.bundleIdentifier` / `android.package` in `app.json` **before** the first store upload.

App icon and splash: `assets/` still contains the Expo placeholder artwork. Replace `icon.png` (1024x1024), the three `android-icon-*.png` files and `splash-icon.png` with the WellBeing brand artwork before publishing.

## Known limitations

- Not run on a real device or emulator in the environment where this was built (no Android SDK, no Mac). Verified instead by: TypeScript, Jest, the Hermes bundles for Android and iOS, `expo-doctor`, an Android prebuild, and an automated browser test of the same React Native code against the real backend. Run it on a phone/emulator before release.
- iOS: the native project is generated on a Mac or by EAS (Windows cannot generate it).
- Push notifications cannot be exercised end to end until the EAS project id, FCM/APNs credentials and the backend deployment above exist.
- Features the web app/backend do not have are not invented: per-category notification preferences, administrator announcements, survey-availability push, a refresh-token flow, rejecting a *discussion* request (the backend only lets a manager schedule it; an employee can withdraw it), and individual assessment scores for managers/HR (alerts intentionally show dates only).
- Notifications are fetched with a 30-second poll plus push; there is no websocket.
- The icons are placeholders (see above).

## New backend endpoints

See [docs/API-ADDITIONS.md](docs/API-ADDITIONS.md). They are additive (migration 004, one router, one service) and do not change any existing endpoint.
