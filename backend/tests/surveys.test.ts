import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, db, makeUser, startServer, stopServer, type TestUser } from './helpers';

describe('Organizational Behavior survey', () => {
  let admin: TestUser, employee: TestUser, questions: any[];

  before(async () => {
    await startServer();
    admin = await makeUser('HR_ADMIN');
    employee = await makeUser('EMPLOYEE');
  });
  after(stopServer);

  it('offers at least six active questions', async () => {
    const result = await api('GET', '/surveys/questions', { token: employee.token });
    assert.equal(result.status, 200);
    questions = result.data;
    assert.ok(questions.length >= 6);
    assert.ok(questions.every((q) => q.isActive && q.text && q.category));
  });

  it('requires an answer to every question', async () => {
    const partial = questions.slice(0, 3).map((q) => ({ questionId: q.id, rating: 4 }));
    const result = await api('POST', '/surveys/submissions', { token: employee.token, body: { answers: partial } });
    assert.equal(result.status, 422);
    assert.equal(result.body.error.details.length, questions.length - 3);
    assert.deepEqual(result.body.error.details.map((d: any) => d.questionId), questions.slice(3).map((q) => q.id));

    const outOfScale = questions.map((q) => ({ questionId: q.id, rating: 7 }));
    assert.equal((await api('POST', '/surveys/submissions', { token: employee.token, body: { answers: outOfScale } })).status, 422);
    assert.equal((await api('GET', '/surveys/status', { token: employee.token })).data.completed, false);
  });

  it('stores one response per question with the submission time', async () => {
    const answers = questions.map((q, index) => ({ questionId: q.id, rating: (index % 5) + 1 }));
    const result = await api('POST', '/surveys/submissions', { token: employee.token, body: { answers } });
    assert.equal(result.status, 201);
    assert.equal(result.data.status.completed, true);
    assert.ok(result.data.submission.submittedAt);

    const stored = await db.query('SELECT question_id, rating FROM survey_responses WHERE submission_id = $1 ORDER BY question_id', [result.data.submission.id]);
    assert.equal(stored.rows.length, questions.length);

    const history = await api('GET', '/surveys/submissions', { token: employee.token });
    assert.equal(history.data.length, 1);
    assert.equal(history.data[0].responses.length, questions.length);
    assert.equal(history.data[0].responses[0].rating, 1);
  });

  it('prevents a second submission in the same survey cycle', async () => {
    const answers = questions.map((q) => ({ questionId: q.id, rating: 3 }));
    const result = await api('POST', '/surveys/submissions', { token: employee.token, body: { answers } });
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, 'SURVEY_ALREADY_COMPLETED');
    assert.ok(result.body.error.details.nextAvailableAt);
  });

  it('lets HR/Admin add, edit and deactivate questions without code changes', async () => {
    const created = await api('POST', '/surveys/questions', { token: admin.token, body: { text: 'I have the tools I need to do my work.', category: 'Work Environment' } });
    assert.equal(created.status, 201);
    assert.equal(created.data.displayOrder, questions.length + 1);

    const edited = await api('PATCH', `/surveys/questions/${created.data.id}`, { token: admin.token, body: { text: 'I have the tools and resources I need to do my work.' } });
    assert.equal(edited.data.text, 'I have the tools and resources I need to do my work.');

    const deactivated = await api('PATCH', `/surveys/questions/${questions[0].id}`, { token: admin.token, body: { isActive: false } });
    assert.equal(deactivated.data.isActive, false);

    const other = await makeUser('EMPLOYEE');
    const visible = (await api('GET', '/surveys/questions', { token: other.token })).data;
    assert.equal(visible.length, questions.length, 'one removed, one added');
    assert.ok(visible.some((q: any) => q.id === created.data.id));
    assert.ok(!visible.some((q: any) => q.id === questions[0].id));
    assert.equal((await api('GET', '/surveys/questions?includeInactive=true', { token: admin.token })).data.length, questions.length + 1);

    // An answer to the deactivated question is ignored; the new question is required.
    const oldSet = questions.map((q) => ({ questionId: q.id, rating: 4 }));
    assert.equal((await api('POST', '/surveys/submissions', { token: other.token, body: { answers: oldSet } })).status, 422);
    const newSet = visible.map((q: any) => ({ questionId: q.id, rating: 4 }));
    assert.equal((await api('POST', '/surveys/submissions', { token: other.token, body: { answers: newSet } })).status, 201);

    assert.equal((await api('POST', '/surveys/questions', { token: admin.token, body: { text: 'Short', category: '' } })).status, 422);
  });

  it('allows the survey again once the cycle has passed', async () => {
    await db.query(`UPDATE survey_submissions SET submitted_at = now() - interval '31 days' WHERE employee_id = $1`, [employee.id]);
    const status = await api('GET', '/surveys/status', { token: employee.token });
    assert.equal(status.data.completed, false);
  });

  it('reports participation to HR/Admin and withholds averages for small groups', async () => {
    const analytics = await api('GET', '/analytics/survey', { token: admin.token });
    assert.equal(analytics.status, 200);
    assert.deepEqual(
      { eligible: analytics.data.participation.eligible, completed: analytics.data.participation.completed },
      { eligible: 2, completed: 1 },
    );
    assert.ok(analytics.data.questions.every((q: any) => q.average === null), 'fewer than 3 respondents, so no averages');
  });
});
