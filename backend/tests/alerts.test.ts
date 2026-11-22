import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, db, makeUser, notificationsOf, startServer, stopServer, type TestUser } from './helpers';

const POOR = { mood: 2, stress: 4, energy: 2 }; // 3 of 3 indicators
const POOR_TWO = { mood: 1, stress: 5, energy: 3 }; // exactly 2 of 3 indicators
const ONE_POOR_INDICATOR = { mood: 2, stress: 2, energy: 4 }; // 1 of 3: not poor
const GOOD = { mood: 4, stress: 2, energy: 4 };

/** Submits one assessment, first moving the previous ones back in time so the 24 hour interval has passed. */
async function checkIn(employee: TestUser, ratings: { mood: number; stress: number; energy: number }) {
  await db.query(`UPDATE wellbeing_assessments SET submitted_at = submitted_at - interval '2 days' WHERE employee_id = $1`, [employee.id]);
  const result = await api('POST', '/assessments', { token: employee.token, body: ratings });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result;
}

describe('Super Admin configuration and automatic well-being alerts', () => {
  let superAdmin: TestUser, hr: TestUser, hr2: TestUser, manager: TestUser, otherManager: TestUser, employee: TestUser, noManager: TestUser;

  before(async () => {
    await startServer();
    superAdmin = await makeUser('SUPER_ADMIN', 'Sam Super');
    hr = await makeUser('HR', 'Hana HR');
    hr2 = await makeUser('HR', 'Hugo HR');
    manager = await makeUser('LINE_MANAGER', 'Maya Manager');
    otherManager = await makeUser('LINE_MANAGER', 'Omar Other');
    employee = await makeUser('EMPLOYEE', 'Eli Employee');
    noManager = await makeUser('EMPLOYEE', 'Nora Nomanager');
    await assign(hr, employee, manager);
  });
  after(stopServer);

  describe('roles and global settings', () => {
    it('gives the Super Admin the configuration screen and the monitoring screens', async () => {
      for (const path of ['/settings', '/users', '/analytics/summary', '/audit-logs', '/assignments', '/alerts']) {
        assert.equal((await api('GET', path, { token: superAdmin.token })).status, 200, path);
      }
    });

    it('lets HR read but never change the global settings', async () => {
      assert.equal((await api('GET', '/settings', { token: hr.token })).status, 200);
      for (const body of [{ assessment_interval_hours: 12 }, { survey_frequency_days: 7 }, { alert_mood_threshold: 3 }, { alert_consecutive_required: 3 }]) {
        assert.equal((await api('PUT', '/settings', { token: hr.token, body })).status, 403, JSON.stringify(body));
      }
      assert.equal((await api('PUT', '/settings', { token: manager.token, body: { alert_mood_threshold: 3 } })).status, 403);
      assert.equal((await api('GET', '/settings', { token: employee.token })).status, 403);
    });

    it('stores the survey frequency (default 30 days) and applies it to the employee status', async () => {
      assert.equal((await api('GET', '/surveys/status', { token: employee.token })).data.frequencyDays, 30);
      for (const days of [7, 15, 45, 60, 21]) {
        assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { survey_frequency_days: days } })).status, 200);
        assert.equal((await api('GET', '/surveys/status', { token: employee.token })).data.frequencyDays, days);
      }
      await api('PUT', '/settings', { token: superAdmin.token, body: { survey_frequency_days: 30 } });
    });

    it('validates and records every configuration change', async () => {
      assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { alert_mood_threshold: 6 } })).status, 422);
      assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { alert_indicators_required: 4 } })).status, 422);
      assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { alert_consecutive_required: 0 } })).status, 422);
      const saved = await api('PUT', '/settings', { token: superAdmin.token, body: { alert_mood_threshold: 3 } });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.find((s: any) => s.key === 'alert_mood_threshold').value, '3');
      await api('PUT', '/settings', { token: superAdmin.token, body: { alert_mood_threshold: 2 } });
      const log = await api('GET', '/audit-logs?action=SETTING_UPDATED', { token: superAdmin.token });
      assert.ok(log.data.length >= 2, 'configuration changes appear in the configuration log');
    });

    it('lets only a Super Admin create or promote Super Admin accounts', async () => {
      const body = { fullName: 'New Super', employeeId: 'SUPNEW1', email: 'supnew@test.local', role: 'SUPER_ADMIN', password: 'Strong@12345' };
      assert.equal((await api('POST', '/users', { token: hr.token, body })).status, 403);
      assert.equal((await api('PATCH', `/users/${noManager.id}/role`, { token: hr.token, body: { role: 'SUPER_ADMIN' } })).status, 403);
      assert.equal((await api('PATCH', `/users/${superAdmin.id}/status`, { token: hr.token, body: { isActive: false } })).status, 403);
      const created = await api('POST', '/users', { token: superAdmin.token, body });
      assert.equal(created.status, 201);
      assert.equal(created.data.role, 'SUPER_ADMIN');
      const hrAccount = await api('POST', '/users', { token: superAdmin.token, body: { ...body, employeeId: 'HRNEW1', email: 'hrnew@test.local', role: 'HR' } });
      assert.equal(hrAccount.data.role, 'HR');
    });

    it('has exactly the four roles', async () => {
      const { rows } = await db.query('SELECT name FROM roles ORDER BY name');
      assert.deepEqual(rows.map((r) => r.name), ['EMPLOYEE', 'HR', 'LINE_MANAGER', 'SUPER_ADMIN']);
    });
  });

  describe('alert rule', () => {
    it('does not alert after a single poor assessment', async () => {
      const result = await checkIn(employee, POOR);
      assert.equal(result.data.recommendation, null);
      assert.equal((await api('GET', '/alerts', { token: manager.token })).data.length, 0);
      assert.equal((await api('GET', '/alerts', { token: hr.token })).data.length, 0);
    });

    it('does not alert when a good assessment sits between two poor ones', async () => {
      await checkIn(employee, GOOD);
      const result = await checkIn(employee, POOR);
      assert.equal(result.data.recommendation, null);
      assert.equal((await api('GET', '/alerts?status=all', { token: hr.token })).data.length, 0);
    });

    it('requires at least two of the three indicators to count an assessment as poor', async () => {
      await checkIn(employee, ONE_POOR_INDICATOR);
      const result = await checkIn(employee, POOR);
      assert.equal(result.data.recommendation, null);
      assert.equal((await api('GET', '/alerts?status=all', { token: hr.token })).data.length, 0);
    });

    it('triggers an alert on the second consecutive poor assessment and notifies the Line Manager and HR', async () => {
      const result = await checkIn(employee, POOR_TWO);
      assert.ok(result.data.recommendation, 'the submission response carries the recommendation');
      const alerts = await api('GET', '/alerts', { token: manager.token });
      assert.equal(alerts.data.length, 1);
      const alert = alerts.data[0];
      assert.deepEqual(
        { status: alert.status, employeeName: alert.employeeName, department: alert.department, count: alert.assessmentCount },
        { status: 'ACTIVE', employeeName: 'Eli Employee', department: 'Engineering', count: 2 },
      );
      assert.equal(alert.assessmentDates.length, 2);

      for (const recipient of [manager, hr, hr2]) {
        const notes = (await notificationsOf(recipient)).filter((n) => n.type === 'WELLBEING_ALERT');
        assert.equal(notes.length, 1, `${recipient.fullName} is notified exactly once`);
        assert.match(notes[0].message, /two consecutive well-being assessments indicating potentially poor well-being/);
        assert.match(notes[0].message, /Please review the alert and consider providing appropriate support\./);
        assert.match(notes[0].message, /Eli Employee/);
        assert.match(notes[0].message, new RegExp(employee.employeeId));
        assert.match(notes[0].message, /Engineering/);
        assert.match(notes[0].message, /Alert type/);
        assert.match(notes[0].message, /Assessments:/);
        assert.match(notes[0].message, /Alert created:/);
      }
      assert.equal((await notificationsOf(otherManager)).filter((n) => n.type === 'WELLBEING_ALERT').length, 0);
      assert.equal((await notificationsOf(employee)).filter((n) => n.type === 'WELLBEING_ALERT').length, 0);
    });

    it('does not duplicate the alert or its notifications when dashboards are refreshed', async () => {
      for (let i = 0; i < 3; i += 1) {
        await api('GET', '/alerts', { token: manager.token });
        await api('GET', '/alerts/open-count', { token: hr.token });
        await api('GET', '/managers/me/dashboard', { token: manager.token });
        await api('GET', '/employees/me/dashboard', { token: employee.token });
      }
      assert.equal((await db.query('SELECT count(*)::int AS n FROM wellbeing_alerts')).rows[0].n, 1);
      assert.equal((await notificationsOf(manager)).filter((n) => n.type === 'WELLBEING_ALERT').length, 1);
    });

    it('does not raise a second alert while one is open, even if poor check-ins continue', async () => {
      await checkIn(employee, POOR);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM wellbeing_alerts')).rows[0].n, 1);
    });

    it('never counts a missing assessment as poor', async () => {
      const lonely = await makeUser('EMPLOYEE');
      await assign(hr, lonely, manager);
      await checkIn(lonely, POOR);
      assert.equal((await api('GET', '/alerts?status=all', { token: hr.token })).data.filter((a: any) => a.employeeId === lonely.id).length, 0);
    });

    it('applies thresholds and counts changed by the Super Admin without a restart', async () => {
      const subject = await makeUser('EMPLOYEE', 'Tia Threshold');
      await assign(hr, subject, manager);
      const mild = { mood: 3, stress: 3, energy: 3 };
      await checkIn(subject, mild);
      assert.equal((await checkIn(subject, mild)).data.recommendation, null, 'mild ratings are not poor by default');

      // Stricter rule: poor means mood <= 3, stress >= 3, energy <= 3, and one indicator is enough; three in a row alert.
      await api('PUT', '/settings', {
        token: superAdmin.token,
        body: { alert_mood_threshold: 3, alert_stress_threshold: 3, alert_energy_threshold: 3, alert_indicators_required: 1, alert_consecutive_required: 3 },
      });
      const third = await checkIn(subject, mild);
      assert.ok(third.data.recommendation, 'three consecutive poor assessments under the new rule');
      const notes = (await notificationsOf(manager)).filter((n) => n.type === 'WELLBEING_ALERT' && /Tia Threshold/.test(n.message));
      assert.equal(notes.length, 1);
      assert.match(notes[0].message, /three consecutive well-being assessments/);
      await api('PUT', '/settings', {
        token: superAdmin.token,
        body: { alert_mood_threshold: 2, alert_stress_threshold: 4, alert_energy_threshold: 2, alert_indicators_required: 2, alert_consecutive_required: 2 },
      });
    });

    it('still raises the alert, for HR only, when the employee has no Line Manager', async () => {
      await checkIn(noManager, POOR);
      await checkIn(noManager, POOR);
      const alerts = (await api('GET', '/alerts', { token: hr.token })).data.filter((a: any) => a.employeeId === noManager.id);
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].managerId, null);
    });
  });

  describe('alert handling', () => {
    let alertId: number;
    before(async () => {
      alertId = (await api('GET', '/alerts', { token: manager.token })).data.find((a: any) => a.employeeId === employee.id).id;
    });

    it('shows alert details to the assigned Line Manager and to HR, but hides it from other managers', async () => {
      const detail = await api('GET', `/alerts/${alertId}`, { token: manager.token });
      assert.equal(detail.status, 200);
      assert.deepEqual(detail.data.comments, []);
      assert.equal((await api('GET', `/alerts/${alertId}`, { token: hr.token })).status, 200);
      assert.equal((await api('GET', `/alerts/${alertId}`, { token: otherManager.token })).status, 404);
      assert.equal((await api('GET', '/alerts', { token: otherManager.token })).data.length, 0);
      assert.equal((await api('GET', '/alerts', { token: employee.token })).status, 403);
      // Individual ratings stay private: the alert shows dates and counts, not scores.
      assert.equal(detail.data.mood, undefined);
    });

    it('lets the Line Manager acknowledge once with a follow-up comment', async () => {
      const acknowledged = await api('POST', `/alerts/${alertId}/acknowledge`, { token: manager.token, body: { comment: 'Will talk to Eli tomorrow.' } });
      assert.equal(acknowledged.status, 200);
      assert.equal(acknowledged.data.status, 'ACKNOWLEDGED');
      assert.equal(acknowledged.data.acknowledgedByName, 'Maya Manager');
      assert.equal(acknowledged.data.comments.length, 1);
      assert.equal((await api('POST', `/alerts/${alertId}/acknowledge`, { token: hr.token, body: {} })).status, 409);
    });

    it('lets HR add follow-up comments that both parties see', async () => {
      const commented = await api('POST', `/alerts/${alertId}/comments`, { token: hr.token, body: { comment: 'HR support line offered.' } });
      assert.equal(commented.status, 200);
      assert.equal(commented.data.comments.length, 2);
      assert.equal((await api('POST', `/alerts/${alertId}/comments`, { token: hr.token, body: { comment: '   ' } })).status, 422);
      assert.equal((await api('POST', `/alerts/${alertId}/comments`, { token: otherManager.token, body: { comment: 'Not mine' } })).status, 404);
      assert.equal((await api('GET', `/alerts/${alertId}`, { token: manager.token })).data.comments.length, 2);
    });

    it('lets the Line Manager mark the alert resolved, and a new streak can raise a new alert afterwards', async () => {
      const resolved = await api('POST', `/alerts/${alertId}/resolve`, { token: manager.token, body: { comment: 'Spoke with Eli, workload adjusted.' } });
      assert.equal(resolved.status, 200);
      assert.equal(resolved.data.status, 'RESOLVED');
      assert.equal((await api('POST', `/alerts/${alertId}/resolve`, { token: manager.token, body: {} })).status, 409);
      const mine = (list: any[]) => list.filter((a) => a.employeeId === employee.id);
      assert.equal(mine((await api('GET', '/alerts', { token: manager.token })).data).length, 0, 'resolved alerts leave the open list');
      assert.equal(mine((await api('GET', '/alerts?status=RESOLVED', { token: manager.token })).data).length, 1);

      // A resolved alert is never re-raised from the same check-ins: after a good day, a single poor assessment is not enough ...
      assert.equal((await checkIn(employee, GOOD)).data.recommendation, null);
      assert.equal((await checkIn(employee, POOR)).data.recommendation, null);
      // ... but a second consecutive poor one starts a new alert.
      assert.ok((await checkIn(employee, POOR_TWO)).data.recommendation);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM wellbeing_alerts WHERE employee_id = $1`, [employee.id])).rows[0].n, 2);
    });
  });

  describe('take a break recommendation', () => {
    it('shows the recommendation on the employee dashboard while an alert is open', async () => {
      const dashboard = await api('GET', '/employees/me/dashboard', { token: employee.token });
      assert.ok(dashboard.data.breakRecommendation);
      assert.equal(dashboard.data.breakRecommendation.request, null);
      const other = await api('GET', '/employees/me/dashboard', { token: (await makeUser('EMPLOYEE')).token });
      assert.equal(other.data.breakRecommendation, null);
    });

    it('creates a break request linked to the alert, notifies the Line Manager and shows the status', async () => {
      const { alertId } = (await api('GET', '/employees/me/dashboard', { token: employee.token })).data.breakRecommendation;
      const created = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK', alertId } });
      assert.equal(created.status, 201);
      assert.deepEqual([created.data.type, created.data.status, created.data.alertId], ['BREAK', 'PENDING', alertId]);

      const note = (await notificationsOf(manager)).find((n) => n.type === 'BREAK_REQUESTED');
      assert.ok(note, 'the Line Manager is notified');
      assert.match(note.message, /Eli Employee/);

      const dashboard = await api('GET', '/employees/me/dashboard', { token: employee.token });
      assert.deepEqual([dashboard.data.breakRecommendation.request.status], ['PENDING']);
      assert.equal((await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK', alertId } })).status, 409);
    });

    it('lets the Line Manager approve it through the existing request workflow', async () => {
      const pending = (await api('GET', '/requests?status=PENDING&type=BREAK', { token: manager.token })).data.find((r: any) => r.alertId);
      assert.ok(pending);
      const approved = await api('POST', `/requests/${pending.id}/approve`, { token: manager.token, body: { comment: 'Take the day.' } });
      assert.equal(approved.data.status, 'APPROVED');
      const dashboard = await api('GET', '/employees/me/dashboard', { token: employee.token });
      assert.equal(dashboard.data.breakRecommendation.request.status, 'APPROVED');
    });

    it('does not force or auto-approve a break and rejects foreign or invalid alert links', async () => {
      const stranger = await makeUser('EMPLOYEE');
      await assign(hr, stranger, manager);
      assert.equal((await api('POST', '/requests', { token: stranger.token, body: { type: 'BREAK', alertId: 999999 } })).status, 404);
      const { alertId } = (await api('GET', '/employees/me/dashboard', { token: employee.token })).data.breakRecommendation;
      assert.equal((await api('POST', '/requests', { token: stranger.token, body: { type: 'BREAK', alertId } })).status, 404);
      assert.equal((await api('POST', '/requests', { token: employee.token, body: { type: 'DISCUSSION', alertId } })).status, 409);
    });

    it('hides the recommendation once the alert is resolved', async () => {
      const open = (await api('GET', '/alerts', { token: manager.token })).data.find((a: any) => a.employeeId === employee.id);
      await api('POST', `/alerts/${open.id}/resolve`, { token: hr.token, body: {} });
      assert.equal((await api('GET', '/employees/me/dashboard', { token: employee.token })).data.breakRecommendation, null);
    });
  });
});
