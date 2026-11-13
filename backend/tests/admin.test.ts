import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, makeUser, PASSWORD, startServer, stopServer, type TestUser } from './helpers';

describe('HR/Admin administration', () => {
  let admin: TestUser, manager: TestUser, employees: TestUser[];

  before(async () => {
    await startServer();
    admin = await makeUser('HR_ADMIN', 'Hana Admin');
    manager = await makeUser('LINE_MANAGER', 'Mona Manager');
    employees = [];
    for (const name of ['Adam Zed', 'Bella Young', 'Carl Xavier', 'Dina West']) employees.push(await makeUser('EMPLOYEE', name));
  });
  after(stopServer);

  it('lists users with search, filters and pagination', async () => {
    const all = await api('GET', '/users?pageSize=2', { token: admin.token });
    assert.equal(all.status, 200);
    assert.equal(all.data.length, 2);
    assert.deepEqual(all.body.meta, { page: 1, pageSize: 2, total: 6, totalPages: 3 });

    const search = await api('GET', '/users?search=bella', { token: admin.token });
    assert.deepEqual(search.data.map((u: any) => u.fullName), ['Bella Young']);

    const managers = await api('GET', '/users?role=LINE_MANAGER', { token: admin.token });
    assert.deepEqual(managers.data.map((u: any) => u.fullName), ['Mona Manager']);
    assert.equal(all.data[0].passwordHash, undefined);
  });

  it('creates users of any role', async () => {
    const created = await api('POST', '/users', {
      token: admin.token,
      body: { fullName: 'Lena Lead', employeeId: 'mgr-77', email: 'lena@test.local', role: 'LINE_MANAGER', department: 'Finance', designation: 'Finance Lead', password: PASSWORD },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.role, 'LINE_MANAGER');
    assert.equal(created.data.department, 'Finance');
    assert.equal((await api('POST', '/auth/login', { body: { identifier: 'MGR-77', password: PASSWORD } })).status, 200);
  });

  it('assigns, reassigns and unassigns employees', async () => {
    await assign(admin, employees[0], manager);
    await assign(admin, employees[1], manager);
    const overview = await api('GET', '/assignments', { token: admin.token });
    const mona = overview.data.find((m: any) => m.id === manager.id);
    assert.deepEqual(mona.team.map((e: any) => e.fullName), ['Adam Zed', 'Bella Young']);

    const unassigned = await api('GET', '/users?role=EMPLOYEE&assignment=unassigned', { token: admin.token });
    assert.deepEqual(unassigned.data.map((u: any) => u.fullName), ['Carl Xavier', 'Dina West']);

    assert.equal((await api('PUT', `/assignments/${employees[0].id}`, { token: admin.token, body: { managerId: employees[1].id } })).status, 404, 'target must be a Line Manager');
    assert.equal((await api('PUT', `/assignments/${manager.id}`, { token: admin.token, body: { managerId: manager.id } })).status, 404, 'only employees can be assigned');

    const removed = await api('DELETE', `/assignments/${employees[1].id}`, { token: admin.token });
    assert.equal(removed.data.managerId, null);
    assert.equal((await api('GET', '/managers/me/team', { token: manager.token })).data.length, 1);
  });

  it('shows user details with activity counts but no individual scores', async () => {
    await api('POST', '/assessments', { token: employees[0].token, body: { mood: 1, stress: 5, energy: 1 } });
    const detail = await api('GET', `/users/${employees[0].id}`, { token: admin.token });
    assert.equal(detail.data.managerName, 'Mona Manager');
    assert.equal(detail.data.activity.assessmentCount, 1);
    assert.ok(!JSON.stringify(detail.data).includes('mood'));
    assert.equal((await api('GET', '/users/999999', { token: admin.token })).status, 404);
    assert.equal((await api('GET', '/users/abc', { token: admin.token })).status, 400);
  });

  it('reports organization-wide numbers on the dashboard', async () => {
    await api('POST', '/requests', { token: employees[0].token, body: { type: 'BREAK' } });
    const summary = await api('GET', '/analytics/summary', { token: admin.token });
    assert.deepEqual(
      [summary.data.totalEmployees, summary.data.totalLineManagers, summary.data.todaysAssessments, summary.data.pendingRequests, summary.data.unassignedEmployees],
      [4, 2, 1, 1, 3],
    );
    const trends = await api('GET', '/analytics/trends?days=7', { token: admin.token });
    assert.equal(trends.data.daily.length, 7);
    const today = trends.data.daily[6];
    assert.deepEqual([today.assessments, today.breakRequests, today.discussionRequests], [1, 1, 0]);
    assert.equal(today.avgMood, null, 'a single respondent is never shown as an average');
    assert.equal(trends.data.weekly.length, 8);
  });

  it('records administrative actions in the audit log', async () => {
    await api('PATCH', `/users/${employees[3].id}/status`, { token: admin.token, body: { isActive: false } });
    const log = await api('GET', '/audit-logs?pageSize=100', { token: admin.token });
    const actions = log.data.map((entry: any) => entry.action);
    for (const action of ['USER_CREATED', 'MANAGER_ASSIGNED', 'MANAGER_UNASSIGNED', 'USER_DEACTIVATED']) {
      assert.ok(actions.includes(action), `${action} should be audited`);
    }
    const deactivation = log.data.find((entry: any) => entry.action === 'USER_DEACTIVATED');
    assert.equal(deactivation.actorName, 'Hana Admin');
    assert.equal(deactivation.entityId, employees[3].id);
    assert.equal((await api('PATCH', `/users/${admin.id}/status`, { token: admin.token, body: { isActive: false } })).status, 400);
  });

  it('returns errors in the same envelope as successes', async () => {
    const missing = await api('GET', '/does-not-exist', { token: admin.token });
    assert.equal(missing.status, 404);
    assert.deepEqual(Object.keys(missing.body), ['success', 'error']);
    assert.equal(missing.body.success, false);
    assert.equal((await api('GET', '/health')).body.success, true);
  });
});
