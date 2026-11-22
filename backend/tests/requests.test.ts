import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, db, makeUser, notificationsOf, startServer, stopServer, type TestUser } from './helpers';

describe('Break request workflow', () => {
  let admin: TestUser, manager: TestUser, employee: TestUser, second: TestUser;

  before(async () => {
    await startServer();
    admin = await makeUser('HR');
    manager = await makeUser('LINE_MANAGER', 'Mona Manager');
    employee = await makeUser('EMPLOYEE', 'Eli Employee');
    second = await makeUser('EMPLOYEE', 'Sam Second');
  });
  after(stopServer);

  it('refuses a request when no Line Manager is assigned', async () => {
    const result = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK' } });
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, 'NO_MANAGER_ASSIGNED');
  });

  it('creates a pending request and notifies the assigned Line Manager', async () => {
    await assign(admin, employee, manager);
    await assign(admin, second, manager);

    const result = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK', reason: 'Need to rest my eyes' } });
    assert.equal(result.status, 201);
    assert.equal(result.data.status, 'PENDING');
    assert.equal(result.data.managerId, manager.id);

    const notification = (await notificationsOf(manager)).find((n) => n.type === 'BREAK_REQUESTED');
    assert.ok(notification, 'manager is notified');
    assert.equal(notification.isRead, false);
    assert.equal(notification.relatedUserName, 'Eli Employee');
    assert.equal(notification.entityId, result.data.id);

    const duplicate = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK' } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'REQUEST_ALREADY_PENDING');
  });

  it('lets the Line Manager approve with a comment and notifies the employee', async () => {
    const pending = (await api('GET', '/requests?status=PENDING&type=BREAK', { token: manager.token })).data;
    assert.equal(pending.length, 1);

    const approved = await api('POST', `/requests/${pending[0].id}/approve`, { token: manager.token, body: { comment: 'Take 30 minutes' } });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.status, 'APPROVED');
    assert.equal(approved.data.managerComment, 'Take 30 minutes');

    const mine = await api('GET', `/requests/${pending[0].id}`, { token: employee.token });
    assert.equal(mine.data.status, 'APPROVED');

    const notification = (await notificationsOf(employee)).find((n) => n.type === 'BREAK_APPROVED');
    assert.ok(notification);
    assert.match(notification.message, /Take 30 minutes/);

    const again = await api('POST', `/requests/${pending[0].id}/reject`, { token: manager.token, body: {} });
    assert.equal(again.status, 409, 'a decided request cannot be decided again');

    const audit = await db.query(`SELECT actor_id FROM audit_logs WHERE action = 'BREAK_APPROVED' AND entity_id = $1`, [pending[0].id]);
    assert.equal(audit.rows[0].actor_id, manager.id);
  });

  it('lets the Line Manager reject and notifies the employee', async () => {
    const request = await api('POST', '/requests', { token: second.token, body: { type: 'BREAK' } });
    const rejected = await api('POST', `/requests/${request.data.id}/reject`, { token: manager.token, body: { comment: 'Deadline today' } });
    assert.equal(rejected.data.status, 'REJECTED');
    const notification = (await notificationsOf(second)).find((n) => n.type === 'BREAK_REJECTED');
    assert.ok(notification);
    assert.match(notification.message, /Deadline today/);
  });

  it('does not allow approving a discussion request', async () => {
    const discussion = await api('POST', '/requests', { token: second.token, body: { type: 'DISCUSSION' } });
    const result = await api('POST', `/requests/${discussion.data.id}/approve`, { token: manager.token, body: {} });
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, 'WRONG_REQUEST_TYPE');
  });

  it('lets an employee withdraw a pending request', async () => {
    const request = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK' } });
    const cancelled = await api('POST', `/requests/${request.data.id}/cancel`, { token: employee.token });
    assert.equal(cancelled.data.status, 'CANCELLED');
    assert.equal((await api('POST', `/requests/${request.data.id}/approve`, { token: manager.token, body: {} })).status, 409);
  });

  it('tracks unread notifications and marks them read', async () => {
    const before = await api('GET', '/notifications/unread-count', { token: manager.token });
    assert.ok(before.data.unread >= 3);
    const list = await notificationsOf(manager);
    const one = await api('POST', `/notifications/${list[0].id}/read`, { token: manager.token });
    assert.equal(one.data.isRead, true);
    assert.equal((await api('GET', '/notifications/unread-count', { token: manager.token })).data.unread, before.data.unread - 1);
    assert.equal((await api('POST', `/notifications/${list[0].id}/read`, { token: employee.token })).status, 404, 'cannot touch others notifications');
    await api('POST', '/notifications/read-all', { token: manager.token });
    assert.equal((await api('GET', '/notifications/unread-count', { token: manager.token })).data.unread, 0);
  });

  it('moves pending requests to the new manager when HR reassigns the employee', async () => {
    const newManager = await makeUser('LINE_MANAGER', 'Nadia New');
    const request = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK' } });
    await assign(admin, employee, newManager);
    assert.equal((await api('GET', `/requests/${request.data.id}`, { token: newManager.token })).status, 200);
    assert.equal((await api('GET', `/requests/${request.data.id}`, { token: manager.token })).status, 404);
  });
});
