import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, db, makeUser, startServer, stopServer, type TestUser } from './helpers';

describe('Mobile push devices', () => {
  let alice: TestUser, bob: TestUser;
  const token = 'ExponentPushToken[abcdefghijklmnopqrstuv]';

  before(async () => {
    await startServer();
    alice = await makeUser('EMPLOYEE', 'Alice');
    bob = await makeUser('LINE_MANAGER', 'Bob');
  });
  after(stopServer);

  it('requires authentication', async () => {
    assert.equal((await api('POST', '/devices', { body: { token, platform: 'android' } })).status, 401);
  });

  it('rejects an invalid platform', async () => {
    assert.equal((await api('POST', '/devices', { token: alice.token, body: { token, platform: 'web' } })).status, 422);
  });

  it('registers a device, is idempotent, and lets one user have several devices', async () => {
    assert.equal((await api('POST', '/devices', { token: alice.token, body: { token, platform: 'android', deviceName: 'Pixel' } })).status, 200);
    assert.equal((await api('POST', '/devices', { token: alice.token, body: { token, platform: 'android', deviceName: 'Pixel' } })).status, 200);
    await api('POST', '/devices', { token: alice.token, body: { token: token + 'second', platform: 'ios' } });
    const { rows } = await db.query('SELECT count(*)::int n FROM device_tokens WHERE user_id = $1', [alice.id]);
    assert.equal(rows[0].n, 2);
  });

  it('moves a token to the account that signs in on the device and re-validates it', async () => {
    await db.query('UPDATE device_tokens SET is_valid = false WHERE token = $1', [token]);
    await api('POST', '/devices', { token: bob.token, body: { token, platform: 'android' } });
    const { rows } = await db.query('SELECT user_id, is_valid FROM device_tokens WHERE token = $1', [token]);
    assert.equal(rows[0].user_id, bob.id);
    assert.equal(rows[0].is_valid, true);
  });

  it('only the owner can unregister a token (logout)', async () => {
    assert.equal((await api('POST', '/devices/unregister', { token: alice.token, body: { token } })).data.removed, 0);
    assert.equal((await api('POST', '/devices/unregister', { token: bob.token, body: { token } })).data.removed, 1);
  });
});
