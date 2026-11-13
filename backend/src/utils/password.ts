import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Stored format: scrypt$N$r$p$salt$hash, so parameters can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return timingSafeEqual(actual, expected);
}

export const passwordRule = {
  minLength: 8,
  description: 'Password must be at least 8 characters and include a letter and a number',
  test: (value: string) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value),
};
