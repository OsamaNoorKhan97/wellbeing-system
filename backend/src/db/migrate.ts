import fs from 'node:fs';
import path from 'node:path';
import { closePool, pool } from './pool';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export async function runMigrations(log: (message: string) => void = () => undefined): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const applied = new Set((await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
}

if (require.main === module) {
  runMigrations((m) => console.log(m))
    .then(() => console.log('Database is up to date.'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}
