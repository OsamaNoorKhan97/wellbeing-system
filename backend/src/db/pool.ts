import pg from 'pg';
import { env } from '../config/env';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

/** Anything that can run a query: the pool itself or a transaction client. */
export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db: Db = {
  query: (text, params) => pool.query(text, params as any[]) as Promise<QueryResult<any>>,
};

export async function withTransaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work({ query: (text, params) => client.query(text, params as any[]) as Promise<QueryResult<any>> });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const closePool = () => pool.end();
