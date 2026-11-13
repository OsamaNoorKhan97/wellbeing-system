import fs from 'node:fs';
import path from 'node:path';

// Must be imported before any application module so the app connects to the test database.
process.env.NODE_ENV = 'test';
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(testUrl)) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated database whose name contains "test". Its data is erased on every run.');
}
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET ||= 'test-only-secret-that-is-long-enough-for-validation';
process.env.FRONTEND_DIST = '';
