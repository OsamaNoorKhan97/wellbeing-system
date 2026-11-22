import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, db, inDays, makeUser, notificationsOf, startServer, stopServer, type TestUser } from './helpers';

describe('Line Manager meeting actions: reject, reschedule and snooze', () => {
  let hr: TestUser, manager: TestUser, otherManager: TestUser, employee: TestUser;

  before(async () => {
    await startServer();
    hr = await makeUser('HR');
    manager = await makeUser('LINE_MANAGER', 'Mona Manager');
    otherManager = await makeUser('LINE_MANAGER', 'Omar Other');
    employee = await makeUser('EMPLOYEE', 'Eli Employee');
    await assign(hr, employee, manager);
  });
  after(stopServer);

  const schedule = async (days = 5) =>
    (await api('POST', '/meetings', { token: manager.token, body: { employeeId: employee.id, scheduledAt: inDays(days), durationMinutes: 30, purpose: 'Check-in' } })).data;

  describe('reject', () => {
    it('marks the meeting rejected with an optional reason, notifies the employee and records it', async () => {
      const meeting = await schedule();
      const result = await api('POST', `/meetings/${meeting.id}/reject`, { token: manager.token, body: { reason: 'Clashes with a client call' } });
      assert.equal(result.status, 200);
      assert.equal(result.data.status, 'REJECTED');
      assert.equal(result.data.rejectionReason, 'Clashes with a client call');

      const note = (await notificationsOf(employee)).find((n) => n.type === 'MEETING_REJECTED' && n.entityId === meeting.id);
      assert.ok(note);
      assert.match(note.message, /Clashes with a client call/);

      const history = await api('GET', `/meetings/${meeting.id}/history`, { token: employee.token });
      assert.deepEqual(history.data.map((h: any) => h.action), ['REJECTED']);
      assert.ok((await db.query(`SELECT 1 FROM audit_logs WHERE action = 'MEETING_REJECTED' AND entity_id = $1`, [meeting.id])).rows.length === 1);
    });

    it('works without a reason and cannot be repeated', async () => {
      const meeting = await schedule();
      assert.equal((await api('POST', `/meetings/${meeting.id}/reject`, { token: manager.token, body: {} })).status, 200);
      assert.equal((await api('POST', `/meetings/${meeting.id}/reject`, { token: manager.token, body: {} })).status, 409);
      assert.equal((await api('POST', `/meetings/${meeting.id}/complete`, { token: manager.token })).status, 409);
    });

    it('moves a rejected meeting out of the upcoming list and reopens its discussion request', async () => {
      const request = (await api('POST', '/requests', { token: employee.token, body: { type: 'DISCUSSION', reason: 'Talk' } })).data;
      const scheduled = await api('POST', `/requests/${request.id}/schedule`, { token: manager.token, body: { scheduledAt: inDays(2) } });
      await api('POST', `/meetings/${scheduled.data.meetingId}/reject`, { token: manager.token, body: { reason: 'Sick day' } });
      assert.equal((await api('GET', `/requests/${request.id}`, { token: employee.token })).data.status, 'PENDING');
      const upcoming = (await api('GET', '/meetings?scope=upcoming&pageSize=50', { token: manager.token })).data;
      assert.ok(!upcoming.some((m: any) => m.id === scheduled.data.meetingId));
      const past = (await api('GET', '/meetings?scope=past&pageSize=50', { token: manager.token })).data;
      assert.ok(past.some((m: any) => m.id === scheduled.data.meetingId && m.status === 'REJECTED'));
    });
  });

  describe('reschedule', () => {
    it('saves the new time, keeps the previous details in the history and notifies the employee', async () => {
      const meeting = await schedule(5);
      const newTime = inDays(9);
      const result = await api('POST', `/meetings/${meeting.id}/reschedule`, {
        token: manager.token,
        body: { scheduledAt: newTime, reason: 'Moved because of a release' },
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.status, 'RESCHEDULED');
      assert.equal(new Date(result.data.scheduledAt).toISOString(), newTime);
      assert.equal(result.data.rescheduleCount, 1);

      const note = (await notificationsOf(employee)).find((n) => n.type === 'MEETING_RESCHEDULED' && n.entityId === meeting.id);
      assert.ok(note);
      assert.match(note.message, /moved your meeting from/);
      assert.match(note.message, /Moved because of a release/);

      const history = (await api('GET', `/meetings/${meeting.id}/history`, { token: manager.token })).data;
      assert.equal(history.length, 1);
      assert.equal(history[0].action, 'RESCHEDULED');
      assert.equal(new Date(history[0].previousScheduledAt).toISOString(), meeting.scheduledAt);
      assert.equal(new Date(history[0].newScheduledAt).toISOString(), newTime);
      assert.equal(history[0].previousDurationMinutes, 30);
    });

    it('can be repeated, stays upcoming and can still be completed', async () => {
      const meeting = await schedule(4);
      await api('POST', `/meetings/${meeting.id}/reschedule`, { token: manager.token, body: { scheduledAt: inDays(6) } });
      const second = await api('POST', `/meetings/${meeting.id}/reschedule`, { token: manager.token, body: { scheduledAt: inDays(7), durationMinutes: 60 } });
      assert.equal(second.data.rescheduleCount, 2);
      assert.equal(second.data.durationMinutes, 60);
      assert.equal((await api('GET', `/meetings/${meeting.id}/history`, { token: manager.token })).data.length, 2);
      const upcoming = (await api('GET', '/meetings?scope=upcoming&pageSize=50', { token: employee.token })).data;
      assert.ok(upcoming.some((m: any) => m.id === meeting.id && m.status === 'RESCHEDULED'));
      assert.equal((await api('POST', `/meetings/${meeting.id}/complete`, { token: manager.token })).data.status, 'COMPLETED');
    });

    it('rejects past dates, unchanged times and invalid input', async () => {
      const meeting = await schedule();
      assert.equal((await api('POST', `/meetings/${meeting.id}/reschedule`, { token: manager.token, body: { scheduledAt: inDays(-1) } })).status, 400);
      assert.equal((await api('POST', `/meetings/${meeting.id}/reschedule`, { token: manager.token, body: { scheduledAt: meeting.scheduledAt } })).status, 400);
      assert.equal((await api('POST', `/meetings/${meeting.id}/reschedule`, { token: manager.token, body: { scheduledAt: 'soon' } })).status, 422);
      assert.equal((await api('GET', `/meetings/${meeting.id}/history`, { token: manager.token })).data.length, 0);
    });
  });

  describe('snooze', () => {
    it('postpones only the reminder: the meeting date, time and status stay exactly as they were', async () => {
      const meeting = await schedule(5);
      for (const minutes of [60, 180, 1440]) {
        const result = await api('POST', `/meetings/${meeting.id}/snooze`, { token: manager.token, body: { minutes } });
        assert.equal(result.status, 200);
        assert.equal(result.data.scheduledAt, meeting.scheduledAt, 'scheduled time unchanged');
        assert.equal(result.data.status, 'SCHEDULED', 'status unchanged');
        assert.equal(result.data.durationMinutes, meeting.durationMinutes);
        assert.ok(Math.abs(new Date(result.data.snoozedUntil).getTime() - (Date.now() + minutes * 60_000)) < 10_000);
      }
      const custom = new Date(Date.now() + 2 * 86_400_000).toISOString();
      const result = await api('POST', `/meetings/${meeting.id}/snooze`, { token: manager.token, body: { until: custom } });
      assert.equal(new Date(result.data.snoozedUntil).toISOString(), custom);
      assert.equal(result.data.scheduledAt, meeting.scheduledAt);
      assert.equal(result.data.snoozeCount, 4);
      // The employee is not told about the manager's private snooze.
      assert.equal((await notificationsOf(employee)).filter((n) => /snooze/i.test(n.message)).length, 0);
      assert.deepEqual((await api('GET', `/meetings/${meeting.id}/history`, { token: employee.token })).data, []);
    });

    it('rejects snooze times in the past, missing options and both options at once', async () => {
      const meeting = await schedule();
      const past = await api('POST', `/meetings/${meeting.id}/snooze`, { token: manager.token, body: { until: inDays(-1) } });
      assert.equal(past.status, 400);
      for (const body of [{}, { minutes: 60, until: inDays(1) }, { minutes: 0 }, { until: 'whenever' }]) {
        assert.equal((await api('POST', `/meetings/${meeting.id}/snooze`, { token: manager.token, body })).status, 422, JSON.stringify(body));
      }
    });

    it('creates exactly one reminder for the manager when the snooze period expires', async () => {
      const meeting = await schedule(5);
      await api('POST', `/meetings/${meeting.id}/snooze`, { token: manager.token, body: { minutes: 60 } });
      assert.equal((await notificationsOf(manager)).filter((n) => n.type === 'MEETING_REMINDER').length, 0, 'no reminder before the snooze ends');

      await db.query(`UPDATE meetings SET reminder_snoozed_until = now() - interval '1 minute' WHERE id = $1`, [meeting.id]);
      for (let i = 0; i < 3; i += 1) await api('GET', '/notifications/unread-count', { token: manager.token });
      const reminders = (await notificationsOf(manager)).filter((n) => n.type === 'MEETING_REMINDER' && n.entityId === meeting.id);
      assert.equal(reminders.length, 1, 'refreshing never duplicates the reminder');
      assert.match(reminders[0].message, /Eli Employee/);

      const after = (await api('GET', '/meetings?scope=upcoming&pageSize=50', { token: manager.token })).data.find((m: any) => m.id === meeting.id);
      assert.equal(after.snoozedUntil, null);
      assert.equal(after.scheduledAt, meeting.scheduledAt, 'the meeting itself never moved');
      const history = (await api('GET', `/meetings/${meeting.id}/history`, { token: manager.token })).data;
      assert.deepEqual(history.map((h: any) => h.action), ['SNOOZED', 'REMINDER_SENT']);
      assert.equal((await notificationsOf(employee)).filter((n) => n.type === 'MEETING_REMINDER').length, 0);
    });

    it('creates no reminder for a meeting that was cancelled or completed while snoozed', async () => {
      const meeting = await schedule(5);
      await api('POST', `/meetings/${meeting.id}/snooze`, { token: manager.token, body: { minutes: 60 } });
      await api('POST', `/meetings/${meeting.id}/cancel`, { token: manager.token, body: { reason: 'Not needed' } });
      await db.query(`UPDATE meetings SET reminder_snoozed_until = now() - interval '1 minute' WHERE id = $1`, [meeting.id]);
      await api('GET', '/notifications/unread-count', { token: manager.token });
      assert.equal((await notificationsOf(manager)).filter((n) => n.type === 'MEETING_REMINDER' && n.entityId === meeting.id).length, 0);
    });
  });

  describe('permissions', () => {
    it('restricts the actions to the meeting\'s own Line Manager', async () => {
      const meeting = await schedule();
      const actions: [string, unknown][] = [
        ['reject', {}],
        ['reschedule', { scheduledAt: inDays(8) }],
        ['snooze', { minutes: 60 }],
      ];
      for (const [action, body] of actions) {
        assert.equal((await api('POST', `/meetings/${meeting.id}/${action}`, { token: otherManager.token, body })).status, 404, `other manager ${action}`);
        assert.equal((await api('POST', `/meetings/${meeting.id}/${action}`, { token: employee.token, body })).status, 403, `employee ${action}`);
        assert.equal((await api('POST', `/meetings/${meeting.id}/${action}`, { token: hr.token, body })).status, 403, `hr ${action}`);
      }
      assert.equal((await api('GET', `/meetings/${meeting.id}/history`, { token: otherManager.token })).status, 404);
      assert.equal((await api('GET', '/meetings?scope=upcoming', { token: manager.token })).data.find((m: any) => m.id === meeting.id).status, 'SCHEDULED');
    });
  });
});
