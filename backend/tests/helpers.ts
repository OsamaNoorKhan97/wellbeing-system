import './setup-env';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { runMigrations } from '../src/db/migrate';
import { closePool, db, withTransaction } from '../src/db/pool';
import { resetData } from '../src/db/reset';
import { signAccessToken, type Role } from '../src/middleware/authenticate';
import { insertUser } from '../src/modules/users/users.service';

export const PASSWORD = 'Test@12345';
export { db };

let server: Server;
let baseUrl = '';
let counter = 0;

export async function startServer(): Promise<void> {
  await runMigrations();
  await resetData();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
}

export async function stopServer(): Promise<void> {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
}

export interface ApiResult {
  status: number;
  body: any;
  data: any;
}

export async function api(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<ApiResult> {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = (await response.json()) as any;
  return { status: response.status, body, data: body.data };
}

export interface TestUser {
  id: number;
  email: string;
  employeeId: string;
  fullName: string;
  token: string;
}

export async function makeUser(role: Role, fullName?: string): Promise<TestUser> {
  counter += 1;
  const prefix = role === 'EMPLOYEE' ? 'E' : role === 'LINE_MANAGER' ? 'M' : 'H';
  const user = {
    fullName: fullName ?? `${role} ${counter}`,
    employeeId: `${prefix}${String(counter).padStart(4, '0')}`,
    email: `user${counter}@test.local`,
  };
  const id = await withTransaction((tx) =>
    insertUser(tx, { ...user, password: PASSWORD, role, department: 'Engineering', designation: 'Tester' }),
  );
  return { id, ...user, token: signAccessToken(id, 0, false).token };
}

export async function assign(admin: TestUser, employee: TestUser, manager: TestUser): Promise<void> {
  const result = await api('PUT', `/assignments/${employee.id}`, { token: admin.token, body: { managerId: manager.id } });
  if (result.status !== 200) throw new Error(`Assignment failed: ${JSON.stringify(result.body)}`);
}

export async function notificationsOf(user: TestUser): Promise<any[]> {
  return (await api('GET', '/notifications?pageSize=50', { token: user.token })).data;
}

export const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
