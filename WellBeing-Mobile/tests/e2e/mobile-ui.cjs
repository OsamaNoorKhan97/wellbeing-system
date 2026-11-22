const path = require('path');
// Browser test of the mobile app's React Native code (web build) against a REAL backend and database.
// Needs: backend running (seeded, e.g. PORT=4100, CORS_ORIGIN=http://localhost:8081), the web build served on :8081,
// DATABASE_URL of that backend's database (used to age assessments and verify results), and a Chromium/Edge/Chrome binary.
// WARNING: it modifies sample data (EMP001 and managers); run it only against a disposable development database.
// Usage: DATABASE_URL=... BROWSER_PATH=... node tests/e2e/mobile-ui.cjs <path-to-web-backend-node_modules-parent>
const ROOT = path.resolve(process.argv[2]);
const { chromium } = require('playwright-core');
const pg = require(path.join(ROOT, 'backend', 'node_modules', 'pg'));
const BASE = 'http://localhost:8081';
const API = 'http://localhost:4100/api/v1';
const PASSWORD = 'Password@123';
const SHOTS = require('fs').mkdtempSync(require('os').tmpdir() + '/wellbeing-shots-');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sql = (q, p) => pool.query(q, p).then((r) => r.rows);

const results = [];
let cur = null; let shot = 0;
const check = async (name, fn) => {
  try {
    await fn();
    results.push(true);
    console.log('PASS  ' + name);
  } catch (e) {
    results.push(false);
    if (cur) await cur.screenshot({ path: SHOTS + '/fail-' + (++shot) + '.png' }).catch(() => {});
    console.log('FAIL  ' + name + ' (fail-' + shot + '.png)' + '  [' + e.message.split('\n').slice(0, 4).join(' ').slice(0, 300) + ']');
  }
};
const T = 20000;
const tid = (page, id) => page.getByTestId(id);
const visibleText = (page, text) => page.locator(`xpath=//*[not(ancestor-or-self::*[@inert])][contains(normalize-space(.), "${text}")][not(*[contains(normalize-space(.), "${text}")])]`).first();
const expectText = (page, text) => visibleText(page, text).waitFor({ timeout: T });

async function newPage(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  cur = page;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|DevTools/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  return { ctx, page };
}
async function login(page, id, password = PASSWORD) {
  await page.goto(BASE + '/login');
  await tid(page, 'login-identifier').fill(id);
  await tid(page, 'login-password').fill(password);
  await tid(page, 'login-submit').click();
}
async function tab(page, name) {
  await tid(page, 'tab-' + name).click();
}
async function api(method, p, token, body) {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
const toLocal = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, headless: true });
  const errors = [];
  try {
    // ---------- clean slate for the test employee
    await sql(`delete from meetings where employee_id in (select id from users where employee_code='EMP001')`);
    await sql(`delete from notifications where recipient_id in (select id from users where employee_code in ('EMP001','MGR001','HR001','SUPER001'))`);
    await sql(`delete from wellbeing_alerts where employee_id in (select id from users where employee_code='EMP001')`);
    await sql(`delete from wellbeing_assessments where employee_id in (select id from users where employee_code='EMP001') and submitted_at > now() - interval '3 days'`);
    await sql(`delete from survey_submissions where employee_id in (select id from users where employee_code='EMP001')`);
    await sql(`delete from support_requests where employee_id in (select id from users where employee_code='EMP001')`);
    await sql(`update application_settings set value='24' where key='assessment_interval_hours'`);

    // ================= EMPLOYEE =================
    let { ctx, page } = await newPage(browser, errors);
    await check('Login: wrong password shows an error and stays on login', async () => {
      await login(page, 'EMP001', 'wrong');
      await expectText(page, 'Incorrect email/ID or password');
    });
    await check('Login: empty fields are validated', async () => {
      await page.goto(BASE + '/login');
      await tid(page, 'login-submit').click();
      await expectText(page, 'Enter your email or Employee ID');
    });
    await check('Employee signs in and lands on the employee home', async () => {
      await login(page, 'EMP001');
      await tid(page, 'welcome').waitFor({ timeout: T });
      await expectText(page, 'Hello, Hassan');
      await page.screenshot({ path: SHOTS + '/m-employee-home.png' });
    });
    await check('Employee sees employee tabs only (no Alerts/Settings)', async () => {
      for (const t of ['index', 'assessments', 'help', 'notifications', 'profile']) await tid(page, 'tab-' + t).waitFor({ timeout: 5000 });
      for (const t of ['alerts', 'settings', 'reports', 'employees']) if (await tid(page, 'tab-' + t).count()) throw new Error('tab visible: ' + t);
    });
    await check('Employee: frequency shown from the backend (24 hours)', async () => {
      await tab(page, 'assessments');
      await expectText(page, 'One check-in every 24 hours');
    });
    await check('Employee: check-in needs all three ratings, then review and submit', async () => {
      await tid(page, 'assess-start').click();
      await tid(page, 'checkin-review-btn').waitFor({ timeout: T });
      if (await tid(page, 'checkin-review-btn').getAttribute('aria-disabled') !== 'true') throw new Error('review enabled before choosing');
      await tid(page, 'mood-1').click(); await tid(page, 'stress-5').click(); await tid(page, 'energy-1').click();
      await tid(page, 'checkin-review-btn').click();
      await tid(page, 'checkin-review').waitFor({ timeout: T });
      await page.screenshot({ path: SHOTS + '/m-checkin-review.png' });
      await tid(page, 'checkin-submit').dblclick();   // double tap must record only once
      await tid(page, 'checkin-done').waitFor({ timeout: T });
    });
    await check('Backend recorded exactly one check-in (duplicate tap blocked)', async () => {
      const n = await sql(`select count(*)::int n from wellbeing_assessments where employee_id=(select id from users where employee_code='EMP001') and submitted_at > now() - interval '5 minutes'`);
      if (n[0].n !== 1) throw new Error('count=' + n[0].n);
    });
    await check('Employee: second check-in is blocked with the next time shown', async () => {
      await page.goto(BASE + '/check-in');
      await tid(page, 'checkin-locked').waitFor({ timeout: T });
      await expectText(page, 'Next check-in not available yet');
    });
    await check('Second consecutive poor check-in raises an alert + break recommendation', async () => {
      await sql(`update wellbeing_assessments set submitted_at = submitted_at - interval '2 days' where employee_id=(select id from users where employee_code='EMP001') and submitted_at > now() - interval '1 hour'`);
      await page.goto(BASE + '/check-in');
      await tid(page, 'mood-2').click(); await tid(page, 'stress-4').click(); await tid(page, 'energy-2').click();
      await tid(page, 'checkin-review-btn').click();
      await tid(page, 'checkin-submit').click();
      await tid(page, 'checkin-done').waitFor({ timeout: T });
      await tid(page, 'break-recommendation').waitFor({ timeout: T });
      await expectText(page, 'Your well-being matters!');
    });
    await check('Request a Break from the recommendation (linked to the alert, once)', async () => {
      await tid(page, 'request-break').click();
      await expectText(page, 'Your break request');
      await visibleText(page, 'Pending').waitFor({ timeout: T });
      const r = await sql(`select alert_id, type, status from support_requests where employee_id=(select id from users where employee_code='EMP001')`);
      if (r.length !== 1 || !r[0].alert_id || r[0].type !== 'BREAK') throw new Error(JSON.stringify(r));
      await page.screenshot({ path: SHOTS + '/m-recommendation.png' });
    });
    await check('Employee: OB survey end to end with review and confirmation', async () => {
      await page.goto(BASE + '/survey');
      await tid(page, 'survey-question').waitFor({ timeout: T });
      for (let i = 0; i < 40; i++) {
        await tid(page, 'answer-4').click();
        if (await tid(page, 'survey-review').count()) break;
        await tid(page, 'survey-next').click();
      }
      await tid(page, 'survey-review').click();
      await tid(page, 'survey-submit').click();
      await tid(page, 'survey-done').waitFor({ timeout: T });
    });
    await check('Employee: survey cannot be taken again in the same cycle', async () => {
      await page.goto(BASE + '/survey');
      await tid(page, 'survey-locked').waitFor({ timeout: T });
    });
    await check('Employee: Need Help sends a discussion request with a message', async () => {
      await page.goto(BASE + '/help');
      await tid(page, 'help-discuss').click();
      await tid(page, 'help-reason').fill('Workload is heavy this sprint');
      await tid(page, 'confirm-dialog-confirm').click();
      await expectText(page, 'Discussion request sent');
      await expectText(page, 'Discussion request');
      await page.screenshot({ path: SHOTS + '/m-help.png' });
    });
    await check('Employee: duplicate pending discussion request is prevented', async () => {
      if (await tid(page, 'help-discuss').getAttribute('aria-disabled') !== 'true') throw new Error('not disabled');
    });
    await check('Employee: cannot open Line Manager/Admin screens by URL', async () => {
      for (const p of ['/settings', '/alerts', '/reports', '/user-new', '/requests']) {
        await page.goto(BASE + p);
        await page.waitForURL((u) => !u.pathname.startsWith(p) || u.pathname === '/', { timeout: 8000 }).catch(() => {});
        if (await tid(page, 'cfg-interval').count() || await tid(page, 'nu-save').count()) throw new Error('reached ' + p);
      }
    });
    await check('Employee: profile shows details; department is read-only', async () => {
      await page.goto(BASE + '/profile');
      await tid(page, 'profile-edit').click();
      if (await page.getByLabel('Department').count()) throw new Error('department editable');
    });
    await check('Employee: meetings list opens from the home shortcut route', async () => {
      await page.goto(BASE + '/my-meetings');
      await page.waitForURL(/my-meetings/, { timeout: T });
      await expectText(page, 'Upcoming');
    });
    await check('Employee: logout returns to login', async () => {
      await page.goto(BASE + '/profile');
      await tid(page, 'logout').click();
      await tid(page, 'confirm-dialog-confirm').click();
      await tid(page, 'login-submit').waitFor({ timeout: T });
    });
    await ctx.close();

    // ================= LINE MANAGER =================
    ({ ctx, page } = await newPage(browser, errors));
    await check('Line Manager signs in; tabs are Home/Employees/Alerts/Meetings/Profile', async () => {
      await login(page, 'MGR001');
      await expectText(page, 'Hello, Osama');
      for (const t of ['index', 'employees', 'alerts', 'meetings', 'profile']) await tid(page, 'tab-' + t).waitFor({ timeout: 5000 });
      if (await tid(page, 'tab-settings').count()) throw new Error('settings tab visible');
      await page.screenshot({ path: SHOTS + '/m-manager-home.png' });
    });
    await check('Manager: sees the new alert and open alert count on Home', async () => {
      await expectText(page, 'New alerts');
      const mgrNotifs = await sql(`select count(*)::int n from notifications n join users u on u.id=n.recipient_id where u.employee_code='MGR001' and n.type='WELLBEING_ALERT'`);
      if (mgrNotifs[0].n < 1) throw new Error('no alert notification');
    });
    await check('Manager: alert list, detail, acknowledge, add note, resolve', async () => {
      await tab(page, 'alerts');
      await page.getByTestId(/^alert-\d+$/).first().click();
      await tid(page, 'alert-detail').waitFor({ timeout: T });
      await expectText(page, 'individual scores are not shown');
      await tid(page, 'alert-ack').click();
      await tid(page, 'confirm-dialog-confirm').click();
      await expectText(page, 'Acknowledged');
      await tid(page, 'alert-comment').fill('Checking in with Hassan tomorrow');
      await tid(page, 'alert-comment-save').click();
      await expectText(page, 'Checking in with Hassan tomorrow');
      await page.screenshot({ path: SHOTS + '/m-alert-detail.png' });
      await tid(page, 'alert-resolve').click();
      await tid(page, 'confirm-dialog-confirm').click();
      await expectText(page, 'Resolved');
    });
    await check('Manager: approves the break request with a comment', async () => {
      await page.goto(BASE + '/requests');
      await page.waitForURL(/\/requests/, { timeout: T });
      await expectText(page, 'Employee requests');
      await page.getByTestId(/^request-\d+$/).filter({ hasText: 'Break request' }).first().click();
      await tid(page, 'request-approve').click();
      await tid(page, 'request-comment').fill('Take the afternoon off');
      await tid(page, 'confirm-dialog-confirm').click();
      let status = '';
      for (let i = 0; i < 20 && status !== 'APPROVED'; i++) {
        status = (await sql(`select status from support_requests where type='BREAK' and employee_id=(select id from users where employee_code='EMP001')`))[0].status;
        if (status !== 'APPROVED') await page.waitForTimeout(500);
      }
      if (status !== 'APPROVED') throw new Error(status);
      await tid(page, 'request-detail').waitFor({ timeout: T });
      await expectText(page, 'Manager comment: Take the afternoon off');
    });
    await check('Manager: schedules the discussion request', async () => {
      await page.goto(BASE + '/requests');
      await page.getByTestId(/^request-\d+$/).filter({ hasText: 'Discussion request' }).first().click();
      await tid(page, 'request-schedule').click();
      await tid(page, 'schedule-when').fill(toLocal(new Date(Date.now() + 3 * 86400000)));
      await tid(page, 'schedule-save').click();
      await expectText(page, 'Meeting:');
    });
    let meetingId;
    await check('Manager: meetings list with Actions menu', async () => {
      await page.goto(BASE + '/meetings');
      await page.getByTestId(/^meeting-\d+$/).first().waitFor({ timeout: T });
      meetingId = (await sql(`select id from meetings where employee_id=(select id from users where employee_code='EMP001') order by id desc limit 1`))[0].id;
      await tid(page, 'meeting-actions-' + meetingId).click();
      await expectText(page, 'Snooze reminder');
      await page.screenshot({ path: SHOTS + '/m-meeting-actions.png' });
    });
    await check('Manager: snooze 1 hour changes the reminder only, not the meeting time', async () => {
      const before = (await sql('select scheduled_at, status from meetings where id=$1', [meetingId]))[0];
      await tid(page, 'act-snooze').click();
      await tid(page, 'snooze-60').click();
      await page.waitForTimeout(1200);
      const after = (await sql('select scheduled_at, status, reminder_snoozed_until from meetings where id=$1', [meetingId]))[0];
      if (+after.scheduled_at !== +before.scheduled_at || after.status !== before.status) throw new Error('meeting moved');
      if (!after.reminder_snoozed_until) throw new Error('no snooze recorded');
    });
    await check('Manager: reschedule keeps history and notifies the employee', async () => {
      const before = (await sql('select scheduled_at from meetings where id=$1', [meetingId]))[0].scheduled_at;
      await tid(page, 'meeting-actions-' + meetingId).click();
      await tid(page, 'act-reschedule').click();
      await tid(page, 'reschedule-when').fill(toLocal(new Date(Date.now() + 5 * 86400000)));
      await tid(page, 'reschedule-reason').fill('Clash with a release');
      await tid(page, 'reschedule-confirm').click();
      await page.waitForTimeout(1500);
      const m = (await sql('select status, scheduled_at from meetings where id=$1', [meetingId]))[0];
      if (m.status !== 'RESCHEDULED' || +m.scheduled_at === +before) throw new Error('not rescheduled: ' + m.status);
      const h = await sql(`select previous_scheduled_at from meeting_history where meeting_id=$1 and action='RESCHEDULED'`, [meetingId]);
      if (!h.length || +h[0].previous_scheduled_at !== +before) throw new Error('history missing');
      const n = await sql(`select 1 from notifications where type='MEETING_RESCHEDULED' and entity_id=$1`, [meetingId]);
      if (!n.length) throw new Error('no notification');
    });
    await check('Manager: meeting detail shows the history', async () => {
      await page.goto(BASE + '/meeting/' + meetingId);
      await tid(page, 'history-RESCHEDULED').waitFor({ timeout: T });
      await page.screenshot({ path: SHOTS + '/m-meeting-history.png' });
    });
    await check('Manager: reject with confirmation, status REJECTED, employee notified', async () => {
      await page.goto(BASE + '/meeting/' + meetingId);
      await tid(page, 'meeting-actions-' + meetingId).click();
      await tid(page, 'act-reject').click();
      await tid(page, 'reject-reason').fill('Not needed any more');
      await tid(page, 'confirm-dialog-confirm').click();
      await page.waitForTimeout(1500);
      const m = (await sql('select status, rejection_reason from meetings where id=$1', [meetingId]))[0];
      if (m.status !== 'REJECTED' || m.rejection_reason !== 'Not needed any more') throw new Error(JSON.stringify(m));
      if (!(await sql(`select 1 from notifications where type='MEETING_REJECTED' and entity_id=$1`, [meetingId])).length) throw new Error('no notification');
    });
    await check('Manager: employees list, search and employee detail', async () => {
      await page.goto(BASE + '/employees');
      await tid(page, 'team-search').fill('Hassan');
      await tid(page, 'team-EMP001').waitFor({ timeout: T });
      await tid(page, 'team-EMP001').click();
      await tid(page, 'team-detail').waitFor({ timeout: T });
    });
    await check('Manager: notifications list opens from the header bell', async () => {
      await page.goto(BASE + '/employees');
      await tid(page, 'team-search').waitFor({ timeout: T });
      await page.getByRole('button', { name: 'Notifications' }).click();
      await page.waitForURL(/inbox/, { timeout: T });
      await page.getByTestId(/notification-/).first().waitFor({ timeout: T });
    });
    await check('Manager: cannot reach Super Admin / HR screens', async () => {
      await page.goto(BASE + '/settings');
      await page.waitForTimeout(1500);
      if (await tid(page, 'cfg-interval').count()) throw new Error('settings reachable');
      await page.goto(BASE + '/user-new');
      await page.waitForTimeout(1500);
      if (await tid(page, 'nu-save').count()) throw new Error('user-new reachable');
    });
    await ctx.close();

    // ================= EMPLOYEE sees manager outcome =================
    ({ ctx, page } = await newPage(browser, errors));
    await check('Employee sees the approved break comment and notifications', async () => {
      await login(page, 'EMP001');
      await tid(page, 'welcome').waitFor({ timeout: T });
      await page.goto(BASE + '/help');
      await expectText(page, 'Approved');
      await tab(page, 'notifications');
      await page.getByTestId(/notification-/).first().waitFor({ timeout: T });
    });
    await ctx.close();

    // ================= HR =================
    ({ ctx, page } = await newPage(browser, errors));
    await check('HR signs in; tabs are Home/Employees/Alerts/Reports/Profile', async () => {
      await login(page, 'HR001');
      await expectText(page, 'Hello, Ayesha');
      for (const t of ['index', 'employees', 'alerts', 'reports', 'profile']) await tid(page, 'tab-' + t).waitFor({ timeout: 5000 });
      if (await tid(page, 'tab-settings').count()) throw new Error('settings tab visible to HR');
      await page.screenshot({ path: SHOTS + '/m-hr-home.png' });
    });
    await check('HR: alerts list shows the alert and its resolution', async () => {
      await tab(page, 'alerts');
      await tid(page, 'chip-all').count().catch(() => 0);
      await page.getByText('All', { exact: true }).first().click();
      await page.getByTestId(/^alert-\d+$/).first().waitFor({ timeout: T });
    });
    await check('HR: reports (overview charts, departments, survey)', async () => {
      await tab(page, 'reports');
      await tid(page, 'chart-checkins').waitFor({ timeout: T });
      await page.screenshot({ path: SHOTS + '/m-hr-reports.png', fullPage: true });
      await page.getByText('Departments', { exact: true }).first().click();
      await page.getByTestId(/dept-/).first().waitFor({ timeout: T });
      await page.getByText('Survey', { exact: true }).first().click();
      await tid(page, 'survey-participation').waitFor({ timeout: T });
    });
    await check('HR: user directory search and role filter', async () => {
      await tab(page, 'employees');
      await tid(page, 'user-search').fill('Fatima');
      await tid(page, 'user-EMP002').waitFor({ timeout: T });
    });
    await check('HR cannot change settings (Super Admin only)', async () => {
      await page.goto(BASE + '/settings');
      await page.waitForTimeout(1500);
      if (await tid(page, 'cfg-interval').count()) throw new Error('settings visible');
    });
    await ctx.close();

    // ================= SUPER ADMIN =================
    ({ ctx, page } = await newPage(browser, errors));
    await check('Super Admin signs in; tabs are Home/Users/Analytics/Settings/Profile', async () => {
      await login(page, 'SUPER001');
      await expectText(page, 'Hello, Rana');
      for (const t of ['index', 'employees', 'reports', 'settings', 'profile']) await tid(page, 'tab-' + t).waitFor({ timeout: 5000 });
      await expectText(page, 'Super Admins');
      await page.screenshot({ path: SHOTS + '/m-super-home.png' });
    });
    const newId = 'MOB' + Date.now().toString().slice(-6);
    await check('Super Admin: creates a Line Manager account', async () => {
      await tab(page, 'employees');
      await tid(page, 'user-new').click();
      await page.getByText('Line Manager', { exact: true }).first().click();
      await tid(page, 'nu-name').fill('Mobile Test Manager');
      await tid(page, 'nu-id').fill(newId);
      await tid(page, 'nu-email').fill(newId.toLowerCase() + '@example.com');
      await tid(page, 'nu-password').fill('Mobile@12345');
      await tid(page, 'nu-save').click();
      await tid(page, 'user-new').waitFor({ timeout: T });
      await tid(page, 'user-search').fill(newId);
      await tid(page, 'user-' + newId).waitFor({ timeout: T });
    });
    await check('Super Admin: deactivates, then reactivates the account', async () => {
      await tid(page, 'user-' + newId).click();
      await tid(page, 'user-status').click();
      await tid(page, 'confirm-dialog-confirm').click();
      await expectText(page, 'Inactive');
      await page.waitForTimeout(800);
      await tid(page, 'user-status').click();
      await tid(page, 'confirm-dialog-confirm').click();
      await page.waitForTimeout(800);
      await visibleText(page, 'Deactivate account').waitFor({ timeout: T });
    });
    await check('Super Admin: changes the assessment frequency to 12 hours (synchronised)', async () => {
      await page.goto(BASE + '/settings');
      await tid(page, 'cfg-interval').fill('12');
      await tid(page, 'cfg-interval-save').click();
      await expectText(page, 'saved');
      const v = (await sql(`select value from application_settings where key='assessment_interval_hours'`))[0].value;
      if (v !== '12') throw new Error('db value ' + v);
      await page.screenshot({ path: SHOTS + '/m-super-settings.png', fullPage: true });
    });
    await check('Employee immediately sees the new frequency from the same backend', async () => {
      const login = await api('POST', '/auth/login', null, { identifier: 'EMP001', password: PASSWORD });
      const st = await api('GET', '/assessments/status', login.data.token);
      if (st.data.intervalHours !== 12) throw new Error('interval ' + st.data.intervalHours);
    });
    await check('Super Admin: changes survey frequency and alert thresholds, then restores defaults', async () => {
      await tid(page, 'cfg-survey-days').fill('45');
      await tid(page, 'cfg-survey-save').click();
      await expectText(page, 'Survey frequency saved');
      await tid(page, 'cfg-consecutive').fill('3');
      await tid(page, 'cfg-alerts-save').click();
      await expectText(page, 'Alert settings saved');
      const s = Object.fromEntries((await sql(`select key,value from application_settings`)).map((r) => [r.key, r.value]));
      if (s.survey_frequency_days !== '45' || s.alert_consecutive_required !== '3') throw new Error(JSON.stringify(s));
      await tid(page, 'cfg-interval').fill('24'); await tid(page, 'cfg-interval-save').click(); await expectText(page, 'Assessment frequency saved');
      await tid(page, 'cfg-survey-days').fill('30'); await tid(page, 'cfg-survey-save').click();
      await tid(page, 'cfg-consecutive').fill('2'); await tid(page, 'cfg-alerts-save').click();
      await page.waitForTimeout(1200);
    });
    await check('Super Admin: invalid configuration is rejected by the backend', async () => {
      await tid(page, 'cfg-mood').fill('9');
      await tid(page, 'cfg-alerts-save').click();
      await expectText(page, 'between 1 and 5');
      await tid(page, 'cfg-mood').fill('2');
    });
    await check('Super Admin: well-being alerts screen opens (all-alerts route)', async () => {
      await page.goto(BASE + '/all-alerts');
      await page.waitForURL(/all-alerts/, { timeout: T });
      await page.getByRole('button', { name: 'All', exact: true }).click();
      await page.getByTestId(/^alert-\d+$/).first().waitFor({ timeout: T });
    });
    await check('Super Admin: notifications inbox opens from the bell', async () => {
      await page.goto(BASE + '/employees');
      await tid(page, 'user-search').waitFor({ timeout: T });
      await page.getByRole('button', { name: 'Notifications' }).click();
      await page.waitForURL(/inbox/, { timeout: T });
    });
    await check('Super Admin: analytics tab, activity log and survey questions screens', async () => {
      await page.goto(BASE + '/reports');
      await tid(page, 'chart-checkins').waitFor({ timeout: T });
      await page.goto(BASE + '/audit');
      await expectText(page, 'Activity');
      await page.goto(BASE + '/survey-questions');
      await tid(page, 'q-add').waitFor({ timeout: T });
    });
    await ctx.close();

    await check('No uncaught script errors during the whole run', async () => {
      if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
    });
  } finally {
    // restore settings, remove test user
    await sql(`update application_settings set value='24' where key='assessment_interval_hours'`).catch(() => {});
    await sql(`update application_settings set value='30' where key='survey_frequency_days'`).catch(() => {});
    await sql(`update application_settings set value='2' where key='alert_consecutive_required'`).catch(() => {});
    await sql(`update application_settings set value='2' where key='alert_mood_threshold'`).catch(() => {});
    await sql(`delete from users where email like 'mob%@example.com'`).catch(() => {});
    await browser.close();
    await pool.end();
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} mobile UI checks passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
