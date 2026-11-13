import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, db, makeUser, startServer, stopServer, type TestUser } from './helpers';

const ratings = { mood: 4, stress: 2, energy: 3 };

describe('Well-being check and daily limit', () => {
  let admin: TestUser, employee: TestUser;

  before(async () => {
    await startServer();
    admin = await makeUser('HR_ADMIN');
    employee = await makeUser('EMPLOYEE');
  });
  after(stopServer);

  it('validates ratings', async () => {
    for (const body of [{ mood: 0, stress: 2, energy: 3 }, { mood: 6, stress: 2, energy: 3 }, { mood: 2.5, stress: 2, energy: 3 }, { mood: 3, stress: 3 }, {}]) {
      const result = await api('POST', '/assessments', { token: employee.token, body });
      assert.equal(result.status, 422, JSON.stringify(body));
    }
  });

  it('stores a check-in with its ratings and submission time', async () => {
    const before = await api('GET', '/assessments/status', { token: employee.token });
    assert.deepEqual([before.data.limit, before.data.usedToday, before.data.canSubmit], [1, 0, true]);

    const result = await api('POST', '/assessments', { token: employee.token, body: ratings });
    assert.equal(result.status, 201);
    assert.deepEqual(
      { mood: result.data.assessment.mood, stress: result.data.assessment.stress, energy: result.data.assessment.energy },
      ratings,
    );
    assert.ok(Math.abs(Date.now() - new Date(result.data.assessment.submittedAt).getTime()) < 60_000);
    assert.equal(result.data.status.canSubmit, false);
  });

  it('rejects submissions over the daily limit and says when the next one is possible', async () => {
    const result = await api('POST', '/assessments', { token: employee.token, body: ratings });
    assert.equal(result.status, 429);
    assert.equal(result.body.error.code, 'DAILY_LIMIT_REACHED');
    const next = new Date(result.body.error.details.nextAvailableAt).getTime();
    assert.ok(next > Date.now() && next <= Date.now() + 24 * 3_600_000, 'next slot is the coming midnight in the organization time zone');
  });

  it('applies a new limit set by HR/Admin immediately', async () => {
    const updated = await api('PUT', '/settings', { token: admin.token, body: { daily_assessment_limit: 3 } });
    assert.equal(updated.status, 200);

    assert.equal((await api('POST', '/assessments', { token: employee.token, body: ratings })).status, 201);
    assert.equal((await api('POST', '/assessments', { token: employee.token, body: ratings })).status, 201);
    assert.equal((await api('POST', '/assessments', { token: employee.token, body: ratings })).status, 429);

    const status = await api('GET', '/assessments/status', { token: employee.token });
    assert.deepEqual([status.data.limit, status.data.usedToday, status.data.remaining], [3, 3, 0]);

    await api('PUT', '/settings', { token: admin.token, body: { daily_assessment_limit: 1 } });
    assert.equal((await api('GET', '/assessments/status', { token: employee.token })).data.canSubmit, false);
  });

  it('counts only today, so the limit resets on the next day', async () => {
    const other = await makeUser('EMPLOYEE');
    await db.query(
      `INSERT INTO wellbeing_assessments (employee_id, mood_rating, stress_rating, energy_rating, submitted_at)
       VALUES ($1, 3, 3, 3, now() - interval '1 day'), ($1, 3, 3, 3, now() - interval '2 days')`,
      [other.id],
    );
    assert.equal((await api('GET', '/assessments/status', { token: other.token })).data.usedToday, 0);
    assert.equal((await api('POST', '/assessments', { token: other.token, body: ratings })).status, 201);
    const history = await api('GET', '/assessments', { token: other.token });
    assert.equal(history.body.meta.total, 3);
  });

  it('cannot be bypassed with simultaneous submissions', async () => {
    const racer = await makeUser('EMPLOYEE');
    const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/assessments', { token: racer.token, body: ratings })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 429).length, 5);
  });

  it('rejects invalid limit values', async () => {
    for (const value of [0, 11, 'many', 1.5]) {
      assert.equal((await api('PUT', '/settings', { token: admin.token, body: { daily_assessment_limit: value } })).status, 422, String(value));
    }
    assert.equal((await api('PUT', '/settings', { token: admin.token, body: { organization_timezone: 'Mars/Olympus' } })).status, 422);
    assert.equal((await api('PUT', '/settings', { token: admin.token, body: { unknown_setting: 1 } })).status, 422);
  });
});
