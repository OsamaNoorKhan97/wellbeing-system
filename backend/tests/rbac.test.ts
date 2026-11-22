import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, makeUser, startServer, stopServer, type TestUser } from './helpers';

describe('Role-based access control', () => {
  let admin: TestUser, managerA: TestUser, managerB: TestUser, alice: TestUser, bob: TestUser;

  before(async () => {
    await startServer();
    admin = await makeUser('HR');
    managerA = await makeUser('LINE_MANAGER', 'Manager A');
    managerB = await makeUser('LINE_MANAGER', 'Manager B');
    alice = await makeUser('EMPLOYEE', 'Alice');
    bob = await makeUser('EMPLOYEE', 'Bob');
    await assign(admin, alice, managerA);
    await assign(admin, bob, managerB);
  });
  after(stopServer);

  const adminOnly: [string, string][] = [
    ['GET', '/users'],
    ['GET', '/assignments'],
    ['GET', '/settings'],
    ['GET', '/analytics/summary'],
    ['GET', '/analytics/trends'],
    ['GET', '/audit-logs'],
    ['GET', '/surveys/questions?includeInactive=true'],
  ];

  it('rejects unauthenticated access to every protected module', async () => {
    for (const path of ['/users', '/assessments', '/surveys/questions', '/requests', '/meetings', '/notifications', '/settings', '/analytics/summary', '/managers/me/team', '/employees/me/dashboard']) {
      assert.equal((await api('GET', path)).status, 401, path);
    }
  });

  it('keeps administrative endpoints for HR/Admin only', async () => {
    for (const [method, path] of adminOnly.slice(0, 6)) {
      assert.equal((await api(method, path, { token: alice.token })).status, 403, `employee ${path}`);
      assert.equal((await api(method, path, { token: managerA.token })).status, 403, `manager ${path}`);
      assert.equal((await api(method, path, { token: admin.token })).status, 200, `admin ${path}`);
    }
    assert.equal((await api('POST', '/surveys/questions', { token: alice.token, body: { text: 'Is this allowed at all?', category: 'Test' } })).status, 403);
    assert.equal((await api('PUT', '/settings', { token: managerA.token, body: { assessment_interval_hours: 48 } })).status, 403);
    assert.equal((await api('PATCH', `/users/${alice.id}/role`, { token: alice.token, body: { role: 'HR' } })).status, 403);
  });

  it('keeps employee-only and manager-only endpoints to their roles', async () => {
    const ratings = { mood: 4, stress: 2, energy: 4 };
    assert.equal((await api('POST', '/assessments', { token: managerA.token, body: ratings })).status, 403);
    assert.equal((await api('POST', '/assessments', { token: admin.token, body: ratings })).status, 403);
    assert.equal((await api('GET', '/managers/me/team', { token: alice.token })).status, 403);
    assert.equal((await api('GET', '/managers/me/dashboard', { token: admin.token })).status, 403);
    assert.equal((await api('GET', '/employees/me/dashboard', { token: managerA.token })).status, 403);
    assert.equal((await api('POST', '/requests', { token: managerA.token, body: { type: 'BREAK' } })).status, 403);
  });

  it('shows a Line Manager only the employees assigned to them', async () => {
    const teamA = await api('GET', '/managers/me/team', { token: managerA.token });
    assert.deepEqual(teamA.data.map((e: any) => e.fullName), ['Alice']);
    const teamB = await api('GET', '/managers/me/team', { token: managerB.token });
    assert.deepEqual(teamB.data.map((e: any) => e.fullName), ['Bob']);
    // Activity is visible, individual ratings are not.
    assert.equal('mood' in teamA.data[0], false);
    assert.equal('checkedInToday' in teamA.data[0], true);
  });

  it('hides requests and meetings that belong to someone else', async () => {
    const request = await api('POST', '/requests', { token: alice.token, body: { type: 'BREAK', reason: 'Private reason' } });
    assert.equal(request.status, 201);
    const id = request.data.id;

    assert.equal((await api('GET', `/requests/${id}`, { token: bob.token })).status, 404);
    assert.equal((await api('GET', `/requests/${id}`, { token: managerB.token })).status, 404);
    assert.equal((await api('POST', `/requests/${id}/approve`, { token: managerB.token, body: {} })).status, 404);
    assert.equal((await api('POST', `/requests/${id}/cancel`, { token: bob.token })).status, 404);
    assert.equal((await api('GET', '/requests', { token: managerB.token })).data.length, 0);
    assert.equal((await api('GET', '/requests', { token: bob.token })).data.length, 0);
    assert.equal((await api('GET', '/requests', { token: admin.token })).status, 403, 'HR sees request volumes only through analytics');

    const meeting = await api('POST', '/meetings', {
      token: managerB.token,
      body: { employeeId: alice.id, scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    assert.equal(meeting.status, 403, 'cannot schedule with an employee of another manager');
  });

  it('shows an employee only their own check-ins', async () => {
    await api('POST', '/assessments', { token: alice.token, body: { mood: 5, stress: 1, energy: 5 } });
    assert.equal((await api('GET', '/assessments', { token: alice.token })).data.length, 1);
    assert.equal((await api('GET', '/assessments', { token: bob.token })).data.length, 0);
  });

  it('applies a role change immediately', async () => {
    const promoted = await api('PATCH', `/users/${bob.id}/role`, { token: admin.token, body: { role: 'LINE_MANAGER' } });
    assert.equal(promoted.data.role, 'LINE_MANAGER');
    assert.equal(promoted.data.managerId, null, 'old reporting line is closed');
    assert.equal((await api('GET', '/managers/me/team', { token: bob.token })).status, 200);
    assert.equal((await api('POST', '/assessments', { token: bob.token, body: { mood: 3, stress: 3, energy: 3 } })).status, 403);
    assert.equal((await api('PATCH', `/users/${admin.id}/role`, { token: admin.token, body: { role: 'EMPLOYEE' } })).status, 400);
  });
});
