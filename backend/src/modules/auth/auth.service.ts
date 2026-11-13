import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { db, withTransaction } from '../../db/pool';
import { signAccessToken, type AuthUser } from '../../middleware/authenticate';
import { recordAudit } from '../../services/audit.service';
import { AppError, badRequest, forbidden } from '../../utils/http';
import { hashPassword, verifyPassword } from '../../utils/password';
import { findUserById, insertUser } from '../users/users.service';

const RESET_TOKEN_TTL_MINUTES = 30;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface RegistrationInput {
  fullName: string;
  employeeId: string;
  email: string;
  department: string;
  designation: string;
  password: string;
}

export async function registerEmployee(input: RegistrationInput, ip: string | null) {
  return withTransaction(async (tx) => {
    const userId = await insertUser(tx, { ...input, role: 'EMPLOYEE' });
    await recordAudit(tx, { actorId: userId, action: 'USER_REGISTERED', entityType: 'user', entityId: userId, ip });
    return findUserById(userId, tx);
  });
}

export async function login(identifier: string, password: string, rememberMe: boolean, ip: string | null) {
  const value = identifier.trim();
  const { rows } = await db.query(
    `SELECT id, password_hash AS "passwordHash", is_active AS "isActive", token_version AS "tokenVersion"
       FROM users WHERE email = $1 OR employee_code = $2`,
    [value.toLowerCase(), value.toUpperCase()],
  );
  const account = rows[0];
  const passwordMatches = account ? await verifyPassword(password, account.passwordHash) : false;

  // Same message for an unknown account and a wrong password, so accounts cannot be enumerated.
  if (!account || !passwordMatches) {
    await recordAudit(db, { actorId: account?.id ?? null, action: 'LOGIN_FAILED', entityType: 'user', entityId: account?.id ?? null, ip });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email / Employee ID or password');
  }
  if (!account.isActive) throw forbidden('Your account has been deactivated. Please contact HR.');

  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [account.id]);
  await recordAudit(db, { actorId: account.id, action: 'LOGIN', entityType: 'user', entityId: account.id, ip });
  const { token, expiresIn } = signAccessToken(account.id, account.tokenVersion, rememberMe);
  return { token, expiresIn, user: await findUserById(account.id) };
}

/**
 * Always succeeds from the caller's point of view. No mail transport is configured,
 * so the link is written to the server log, and returned in the response outside production
 * to make local testing possible. Plug an email sender in where the link is logged.
 */
export async function requestPasswordReset(identifier: string, ip: string | null): Promise<{ devResetUrl?: string }> {
  const value = identifier.trim();
  const { rows } = await db.query('SELECT id FROM users WHERE (email = $1 OR employee_code = $2) AND is_active', [
    value.toLowerCase(),
    value.toUpperCase(),
  ]);
  if (rows.length === 0) return {};

  const token = randomBytes(32).toString('hex');
  await withTransaction(async (tx) => {
    await tx.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [rows[0].id]);
    await tx.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [rows[0].id, sha256(token), RESET_TOKEN_TTL_MINUTES],
    );
    await recordAudit(tx, { actorId: rows[0].id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: rows[0].id, ip });
  });

  const resetUrl = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
  if (env.isProduction) return {};
  if (!env.isTest) console.info(`[password-reset] ${resetUrl}`);
  return { devResetUrl: resetUrl };
}

export async function resetPassword(token: string, newPassword: string, ip: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id AS "userId"`,
      [sha256(token)],
    );
    if (rows.length === 0) throw badRequest('This reset link is invalid or has expired. Please request a new one.');
    await tx.query('UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1', [
      rows[0].userId,
      await hashPassword(newPassword),
    ]);
    await recordAudit(tx, { actorId: rows[0].userId, action: 'PASSWORD_RESET', entityType: 'user', entityId: rows[0].userId, ip });
  });
}

export async function changePassword(user: AuthUser, currentPassword: string, newPassword: string, ip: string | null) {
  const { rows } = await db.query('SELECT password_hash AS "passwordHash" FROM users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(currentPassword, rows[0].passwordHash))) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  // Bumping the token version signs out every other session; this one gets a fresh token.
  const updated = await db.query(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING token_version AS "tokenVersion"',
    [user.id, await hashPassword(newPassword)],
  );
  await recordAudit(db, { actorId: user.id, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: user.id, ip });
  return signAccessToken(user.id, updated.rows[0].tokenVersion, false);
}

export async function updateOwnProfile(user: AuthUser, input: { fullName: string; department?: string; designation?: string }) {
  return withTransaction(async (tx) => {
    await tx.query('UPDATE users SET full_name = $2 WHERE id = $1', [user.id, input.fullName]);
    const table = user.role === 'EMPLOYEE' ? 'employee_profiles' : user.role === 'LINE_MANAGER' ? 'line_manager_profiles' : null;
    if (table && input.department && input.designation) {
      await tx.query(`UPDATE ${table} SET department = $2, designation = $3 WHERE user_id = $1`, [
        user.id,
        input.department,
        input.designation,
      ]);
    }
    await recordAudit(tx, { actorId: user.id, action: 'PROFILE_UPDATED', entityType: 'user', entityId: user.id });
    return findUserById(user.id, tx);
  });
}
