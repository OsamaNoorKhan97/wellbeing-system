import '../config/env';
import { insertUser } from '../modules/users/users.service';
import { passwordRule } from '../utils/password';
import { closePool, withTransaction } from './pool';

/** Creates the first HR/Admin account from ADMIN_* environment variables, for installations that do not load the sample data. */
async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_EMPLOYEE_ID, ADMIN_ROLE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME, ADMIN_EMPLOYEE_ID, ADMIN_ROLE).');
  if (!passwordRule.test(ADMIN_PASSWORD)) throw new Error(passwordRule.description);
  const role = (ADMIN_ROLE || 'HR').toUpperCase();
  if (role !== 'HR' && role !== 'SUPER_ADMIN') throw new Error('ADMIN_ROLE must be HR or SUPER_ADMIN.');
  const id = await withTransaction((tx) =>
    insertUser(tx, {
      fullName: ADMIN_NAME || (role === 'SUPER_ADMIN' ? 'Super Administrator' : 'HR Administrator'),
      employeeId: ADMIN_EMPLOYEE_ID || (role === 'SUPER_ADMIN' ? 'SUPER001' : 'HR001'),
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role,
    }),
  );
  console.log(`${role} account created (user id ${id}, ${ADMIN_EMAIL}).`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
