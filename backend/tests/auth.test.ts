import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, db, makeUser, PASSWORD, startServer, stopServer } from './helpers';

const registration = {
  fullName: 'Rida Shah',
  employeeId: 'emp-900',
  email: 'Rida.Shah@Test.Local',
  department: 'Finance',
  designation: 'Accountant',
  password: PASSWORD,
  confirmPassword: PASSWORD,
};

describe('Authentication', () => {
  before(startServer);
  after(stopServer);

  it('registers an employee and never stores the plain password', async () => {
    const result = await api('POST', '/auth/register', { body: registration });
    assert.equal(result.status, 201);
    assert.equal(result.data.role, 'EMPLOYEE');
    assert.equal(result.data.email, 'rida.shah@test.local');
    assert.equal(result.data.employeeId, 'EMP-900');
    assert.equal(result.data.department, 'Finance');
    assert.equal(result.data.passwordHash, undefined);

    const stored = await db.query('SELECT password_hash FROM users WHERE email = $1', ['rida.shah@test.local']);
    assert.match(stored.rows[0].password_hash, /^scrypt\$/);
    assert.ok(!stored.rows[0].password_hash.includes(PASSWORD));
  });

  it('rejects duplicate email addresses and Employee IDs', async () => {
    const sameEmail = await api('POST', '/auth/register', { body: { ...registration, employeeId: 'EMP-901' } });
    assert.equal(sameEmail.status, 409);
    assert.deepEqual(sameEmail.body.error.details.map((d: any) => d.field), ['email']);

    const sameId = await api('POST', '/auth/register', { body: { ...registration, email: 'other@test.local', employeeId: 'EMP-900' } });
    assert.equal(sameId.status, 409);
    assert.deepEqual(sameId.body.error.details.map((d: any) => d.field), ['employeeId']);
  });

  it('validates required fields, email format and password confirmation', async () => {
    const result = await api('POST', '/auth/register', {
      body: { ...registration, fullName: '', email: 'not-an-email', employeeId: 'EMP-902', password: 'short', confirmPassword: 'different' },
    });
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    const fields = result.body.error.details.map((d: any) => d.field);
    for (const field of ['fullName', 'email', 'password', 'confirmPassword']) assert.ok(fields.includes(field), `${field} should be reported`);
  });

  it('logs in with either email or Employee ID', async () => {
    const byEmail = await api('POST', '/auth/login', { body: { identifier: 'rida.shah@test.local', password: PASSWORD } });
    assert.equal(byEmail.status, 200);
    assert.ok(byEmail.data.token);
    assert.equal(byEmail.data.user.role, 'EMPLOYEE');

    const byId = await api('POST', '/auth/login', { body: { identifier: 'emp-900', password: PASSWORD, rememberMe: true } });
    assert.equal(byId.status, 200);
    assert.equal(byId.data.expiresIn, '30d');

    const me = await api('GET', '/auth/me', { token: byId.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.fullName, 'Rida Shah');
  });

  it('rejects wrong credentials without revealing which part was wrong', async () => {
    const wrongPassword = await api('POST', '/auth/login', { body: { identifier: 'rida.shah@test.local', password: 'Wrong@12345' } });
    const unknownUser = await api('POST', '/auth/login', { body: { identifier: 'nobody@test.local', password: PASSWORD } });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.equal(wrongPassword.body.error.message, unknownUser.body.error.message);
  });

  it('requires a valid token for protected routes', async () => {
    assert.equal((await api('GET', '/auth/me')).status, 401);
    assert.equal((await api('GET', '/auth/me', { token: 'not.a.token' })).status, 401);
  });

  it('blocks deactivated accounts at login and on existing sessions', async () => {
    const admin = await makeUser('HR');
    const employee = await makeUser('EMPLOYEE');
    assert.equal((await api('GET', '/auth/me', { token: employee.token })).status, 200);

    const deactivated = await api('PATCH', `/users/${employee.id}/status`, { token: admin.token, body: { isActive: false } });
    assert.equal(deactivated.status, 200);
    assert.equal((await api('GET', '/auth/me', { token: employee.token })).status, 403);
    assert.equal((await api('POST', '/auth/login', { body: { identifier: employee.email, password: PASSWORD } })).status, 403);
  });

  it('resets a forgotten password with a single-use token and signs out old sessions', async () => {
    const login = await api('POST', '/auth/login', { body: { identifier: 'EMP-900', password: PASSWORD } });

    const unknown = await api('POST', '/auth/forgot-password', { body: { identifier: 'nobody@test.local' } });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.data.devResetUrl, undefined);

    const forgot = await api('POST', '/auth/forgot-password', { body: { identifier: 'rida.shah@test.local' } });
    assert.equal(forgot.status, 200);
    const token = new URL(forgot.data.devResetUrl).searchParams.get('token');

    const body = { token, password: 'Brand@New123', confirmPassword: 'Brand@New123' };
    assert.equal((await api('POST', '/auth/reset-password', { body })).status, 200);
    assert.equal((await api('POST', '/auth/reset-password', { body })).status, 400, 'token can only be used once');

    assert.equal((await api('GET', '/auth/me', { token: login.data.token })).status, 401, 'old session is invalidated');
    assert.equal((await api('POST', '/auth/login', { body: { identifier: 'EMP-900', password: PASSWORD } })).status, 401);
    assert.equal((await api('POST', '/auth/login', { body: { identifier: 'EMP-900', password: 'Brand@New123' } })).status, 200);
  });

  it('changes the password only when the current one is correct', async () => {
    const employee = await makeUser('EMPLOYEE');
    const wrong = await api('POST', '/auth/change-password', {
      token: employee.token,
      body: { currentPassword: 'Nope@12345', password: 'Next@12345', confirmPassword: 'Next@12345' },
    });
    assert.equal(wrong.status, 422);

    const changed = await api('POST', '/auth/change-password', {
      token: employee.token,
      body: { currentPassword: PASSWORD, password: 'Next@12345', confirmPassword: 'Next@12345' },
    });
    assert.equal(changed.status, 200);
    assert.equal((await api('GET', '/auth/me', { token: changed.data.token })).status, 200);
    assert.equal((await api('GET', '/auth/me', { token: employee.token })).status, 401);
  });
});
