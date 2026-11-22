import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assign, db, makeUser, startServer, stopServer, type TestUser } from './helpers';
import { startPushService } from '../src/services/push.service';

interface Sent {
  to: string;
  title: string;
  body: string;
  data: { notificationId: number; type: string; entityType: string; entityId: number };
}

describe('Push notifications for the mobile app', () => {
  let admin: TestUser, manager: TestUser, employee: TestUser;
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  let deadToken = '';

  before(async () => {
    await startServer();
    admin = await makeUser('HR');
    manager = await makeUser('LINE_MANAGER', 'Manager Pushable');
    employee = await makeUser('EMPLOYEE', 'Secret Employee Name');
    await assign(admin, employee, manager);

    // Stand in for the Expo push gateway; everything else (the API under test) still uses the real fetch.
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input).includes('exp.host')) {
        const messages = JSON.parse(init.body) as Sent[];
        sent.push(...messages);
        return new Response(JSON.stringify({ data: messages.map((m) => (m.to === deadToken ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }), { status: 200 });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    startPushService();
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await stopServer();
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('sends one generic message per registered device and never includes names or request text', async () => {
    const phone = 'ExponentPushToken[manager-phone-aaaaaaaaaa]';
    const tablet = 'ExponentPushToken[manager-tablet-bbbbbbbbb]';
    await api('POST', '/devices', { token: manager.token, body: { token: phone, platform: 'android' } });
    await api('POST', '/devices', { token: manager.token, body: { token: tablet, platform: 'ios' } });

    const created = await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK', reason: 'private health reason' } });
    assert.equal(created.status, 201);
    await wait(2500);

    assert.equal(sent.length, 2, 'one message for each device');
    assert.deepEqual(sent.map((m) => m.to).sort(), [phone, tablet].sort());
    for (const message of sent) {
      assert.equal(message.title, 'WellBeing');
      assert.equal(message.data.type, 'BREAK_REQUESTED');
      assert.equal(message.data.entityType, 'support_request');
      assert.equal(message.data.entityId, created.data.id);
      const text = JSON.stringify(message);
      assert.ok(!text.includes('Secret Employee Name'), 'no employee name on the lock screen');
      assert.ok(!text.includes('private health reason'), 'no request text on the lock screen');
    }
  });

  it('pushes each notification once per device, and nothing to users without a device', async () => {
    const before = sent.length;
    await api('POST', `/requests/${(await api('GET', '/requests', { token: employee.token })).data[0].id}/cancel`, { token: employee.token });
    await wait(2500);
    const added = sent.slice(before);
    assert.equal(added.length, 2, 'the manager (2 devices) is told once each; the employee has no device');
    assert.ok(added.every((m) => m.data.type === 'REQUEST_CANCELLED'));
    assert.equal(new Set(added.map((m) => m.data.notificationId)).size, 1, 'both messages carry the same single notification');
  });

  it('marks a token the gateway reports as unregistered as invalid and stops using it', async () => {
    deadToken = 'ExponentPushToken[employee-dead-cccccccccc]';
    await api('POST', '/devices', { token: employee.token, body: { token: deadToken, platform: 'android' } });
    await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK' } });
    // the manager answers, which notifies the employee
    const list = (await api('GET', '/requests', { token: manager.token })).data;
    await api('POST', `/requests/${list[0].id}/approve`, { token: manager.token, body: { comment: 'ok' } });
    await wait(2500);
    const { rows } = await db.query('SELECT is_valid FROM device_tokens WHERE token = $1', [deadToken]);
    assert.equal(rows[0].is_valid, false);

    const count = sent.length;
    const second = (await api('POST', '/requests', { token: employee.token, body: { type: 'BREAK' } })).data;
    await api('POST', `/requests/${second.id}/reject`, { token: manager.token, body: { comment: 'no' } });
    await wait(2500);
    assert.equal(sent.filter((m) => m.to === deadToken).length, 1, 'the dead token received nothing after being invalidated');
    assert.ok(sent.length >= count);
  });
});
