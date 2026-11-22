import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, db, makeUser, startServer, stopServer, type TestUser } from './helpers';

const ratings = { mood: 4, stress: 2, energy: 3 };
const ago = (hours: number) => db.query(`UPDATE wellbeing_assessments SET submitted_at = submitted_at - make_interval(hours => $1)`, [hours]);

describe('Well-being check and configurable interval', () => {
  let hr: TestUser, superAdmin: TestUser, employee: TestUser;

  before(async () => {
    await startServer();
    hr = await makeUser('HR');
    superAdmin = await makeUser('SUPER_ADMIN');
    employee = await makeUser('EMPLOYEE');
  });
  after(stopServer);

  it('validates ratings', async () => {
    for (const body of [{ mood: 0, stress: 2, energy: 3 }, { mood: 6, stress: 2, energy: 3 }, { mood: 2.5, stress: 2, energy: 3 }, { mood: 3, stress: 3 }, {}]) {
      const result = await api('POST', '/assessments', { token: employee.token, body });
      assert.equal(result.status, 422, JSON.stringify(body));
    }
  });

  it('defaults to once every 24 hours and stores mood, stress and energy together', async () => {
    const before = await api('GET', '/assessments/status', { token: employee.token });
    assert.deepEqual([before.data.intervalHours, before.data.canSubmit, before.data.nextAvailableAt], [24, true, null]);

    const result = await api('POST', '/assessments', { token: employee.token, body: ratings });
    assert.equal(result.status, 201);
    assert.deepEqual(
      { mood: result.data.assessment.mood, stress: result.data.assessment.stress, energy: result.data.assessment.energy },
      ratings,
    );
    assert.ok(Math.abs(Date.now() - new Date(result.data.assessment.submittedAt).getTime()) < 60_000);
    assert.equal(result.data.status.canSubmit, false);
    const next = new Date(result.data.status.nextAvailableAt).getTime();
    assert.ok(Math.abs(next - (Date.now() + 24 * 3_600_000)) < 60_000, 'next eligible time is 24 hours after the submission');
  });

  it('rejects an early submission on the server and says when the next one is possible', async () => {
    const result = await api('POST', '/assessments', { token: employee.token, body: ratings });
    assert.equal(result.status, 429);
    assert.equal(result.body.error.code, 'ASSESSMENT_NOT_YET_AVAILABLE');
    assert.equal(result.body.error.details.intervalHours, 24);
    assert.ok(new Date(result.body.error.details.nextAvailableAt).getTime() > Date.now());
    assert.equal((await api('GET', '/assessments', { token: employee.token })).body.meta.total, 1);
  });

  it('lets only the Super Admin change the frequency and applies it immediately', async () => {
    assert.equal((await api('PUT', '/settings', { token: hr.token, body: { assessment_interval_hours: 12 } })).status, 403);
    assert.equal((await api('PUT', '/settings', { token: employee.token, body: { assessment_interval_hours: 12 } })).status, 403);

    // Submitted about 13 hours ago: still blocked at 24 hours ...
    await ago(13);
    assert.equal((await api('GET', '/assessments/status', { token: employee.token })).data.canSubmit, false);
    // ... but eligible as soon as the Super Admin sets 12 hours.
    const updated = await api('PUT', '/settings', { token: superAdmin.token, body: { assessment_interval_hours: 12 } });
    assert.equal(updated.status, 200);
    const status = await api('GET', '/assessments/status', { token: employee.token });
    assert.deepEqual([status.data.intervalHours, status.data.canSubmit], [12, true]);
    assert.equal((await api('POST', '/assessments', { token: employee.token, body: ratings })).status, 201);
    assert.equal((await api('POST', '/assessments', { token: employee.token, body: ratings })).status, 429);
  });

  it('supports 48 hours, 72 hours and a custom interval', async () => {
    for (const hours of [48, 72, 5]) {
      assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { assessment_interval_hours: hours } })).status, 200);
      const status = await api('GET', '/assessments/status', { token: employee.token });
      assert.equal(status.data.intervalHours, hours);
      const expected = new Date(status.data.lastSubmittedAt).getTime() + hours * 3_600_000;
      assert.ok(Math.abs(new Date(status.data.nextAvailableAt ?? expected).getTime() - expected) < 5_000 || status.data.canSubmit);
    }
    await ago(6); // 6 hours since the last check-in: a 5 hour interval has passed
    assert.equal((await api('GET', '/assessments/status', { token: employee.token })).data.canSubmit, true);
    await api('PUT', '/settings', { token: superAdmin.token, body: { assessment_interval_hours: 24 } });
  });

  it('cannot be bypassed with simultaneous submissions', async () => {
    const racer = await makeUser('EMPLOYEE');
    const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/assessments', { token: racer.token, body: ratings })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 429).length, 5);
  });

  it('rejects invalid interval values and unknown settings', async () => {
    for (const value of [0, -3, 5000, 'often', 1.5]) {
      assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { assessment_interval_hours: value } })).status, 422, String(value));
    }
    assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { organization_timezone: 'Mars/Olympus' } })).status, 422);
    assert.equal((await api('PUT', '/settings', { token: superAdmin.token, body: { unknown_setting: 1 } })).status, 422);
  });
});
