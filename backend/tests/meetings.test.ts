import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, inDays, makeUser, notificationsOf, startServer, stopServer, type TestUser } from './helpers';

describe('Discussion request and meeting scheduling workflow', () => {
  let admin: TestUser, manager: TestUser, employee: TestUser, outsider: TestUser;
  let requestId: number, meetingId: number;

  before(async () => {
    await startServer();
    admin = await makeUser('HR_ADMIN');
    manager = await makeUser('LINE_MANAGER', 'Mona Manager');
    employee = await makeUser('EMPLOYEE', 'Eli Employee');
    outsider = await makeUser('EMPLOYEE', 'Olga Outsider');
    await assign(admin, employee, manager);
  });
  after(stopServer);

  it('creates a pending discussion request and notifies the Line Manager', async () => {
    const result = await api('POST', '/requests', { token: employee.token, body: { type: 'DISCUSSION', reason: 'Workload' } });
    assert.equal(result.status, 201);
    assert.equal(result.data.status, 'PENDING');
    requestId = result.data.id;
    assert.ok((await notificationsOf(manager)).some((n) => n.type === 'DISCUSSION_REQUESTED' && n.entityId === requestId));
  });

  it('rejects meetings in the past or with invalid input', async () => {
    const past = await api('POST', `/requests/${requestId}/schedule`, { token: manager.token, body: { scheduledAt: inDays(-1) } });
    assert.equal(past.status, 400);
    const invalid = await api('POST', `/requests/${requestId}/schedule`, { token: manager.token, body: { scheduledAt: 'tomorrow-ish', durationMinutes: 2 } });
    assert.equal(invalid.status, 422);
    assert.equal((await api('GET', `/requests/${requestId}`, { token: employee.token })).data.status, 'PENDING');
  });

  it('schedules a meeting from the request and notifies the employee with date, time and purpose', async () => {
    const scheduledAt = inDays(3);
    const result = await api('POST', `/requests/${requestId}/schedule`, {
      token: manager.token,
      body: { scheduledAt, durationMinutes: 45, purpose: 'Workload review', location: 'Room 2' },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'SCHEDULED');
    assert.equal(new Date(result.data.meetingAt).toISOString(), scheduledAt);
    assert.equal(result.data.meetingPurpose, 'Workload review');
    meetingId = result.data.meetingId;

    const notification = (await notificationsOf(employee)).find((n) => n.type === 'MEETING_SCHEDULED');
    assert.ok(notification);
    assert.match(notification.message, /Date: /);
    assert.match(notification.message, /Time: /);
    assert.match(notification.message, /Purpose: Workload review/);

    const upcoming = await api('GET', '/meetings?scope=upcoming', { token: employee.token });
    assert.deepEqual(upcoming.data.map((m: any) => m.id), [meetingId]);
    assert.equal(upcoming.data[0].managerName, 'Mona Manager');

    const twice = await api('POST', `/requests/${requestId}/schedule`, { token: manager.token, body: { scheduledAt: inDays(4) } });
    assert.equal(twice.status, 409);
  });

  it('updates meeting details and notifies the employee', async () => {
    const newTime = inDays(5);
    const updated = await api('PATCH', `/meetings/${meetingId}`, { token: manager.token, body: { scheduledAt: newTime, purpose: 'Workload and priorities' } });
    assert.equal(updated.status, 200);
    assert.equal(new Date(updated.data.scheduledAt).toISOString(), newTime);
    assert.equal(updated.data.durationMinutes, 45, 'unchanged fields are kept');
    const notification = (await notificationsOf(employee)).find((n) => n.type === 'MEETING_UPDATED');
    assert.ok(notification);
    assert.match(notification.message, /Workload and priorities/);

    assert.equal((await api('PATCH', `/meetings/${meetingId}`, { token: employee.token, body: { purpose: 'Hijack' } })).status, 403);
  });

  it('cancels a meeting, notifies the employee and reopens the request', async () => {
    const cancelled = await api('POST', `/meetings/${meetingId}/cancel`, { token: manager.token, body: { reason: 'Out of office' } });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.status, 'CANCELLED');
    const notification = (await notificationsOf(employee)).find((n) => n.type === 'MEETING_CANCELLED');
    assert.ok(notification);
    assert.match(notification.message, /Out of office/);

    assert.equal((await api('GET', '/meetings?scope=upcoming', { token: employee.token })).data.length, 0);
    assert.equal((await api('GET', `/requests/${requestId}`, { token: employee.token })).data.status, 'PENDING');
    assert.equal((await api('PATCH', `/meetings/${meetingId}`, { token: manager.token, body: { purpose: 'x' } })).status, 409);
  });

  it('schedules a meeting directly with an assigned employee only', async () => {
    const direct = await api('POST', '/meetings', { token: manager.token, body: { employeeId: employee.id, scheduledAt: inDays(2), purpose: 'One-to-one' } });
    assert.equal(direct.status, 201);
    assert.equal(direct.data.durationMinutes, 30);
    const notAssigned = await api('POST', '/meetings', { token: manager.token, body: { employeeId: outsider.id, scheduledAt: inDays(2) } });
    assert.equal(notAssigned.status, 403);
    assert.equal((await api('POST', '/meetings', { token: employee.token, body: { employeeId: employee.id, scheduledAt: inDays(2) } })).status, 403);

    const completed = await api('POST', `/meetings/${direct.data.id}/complete`, { token: manager.token });
    assert.equal(completed.data.status, 'COMPLETED');
  });

  it('reflects the workflow on the manager dashboard', async () => {
    const dashboard = await api('GET', '/managers/me/dashboard', { token: manager.token });
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.data.summary, { assignedEmployees: 1, pendingBreakRequests: 0, pendingDiscussionRequests: 1, upcomingMeetings: 0 });
    assert.ok(dashboard.data.recentActivity.length >= 1);
  });
});
