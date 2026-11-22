import { ApiError, api, session } from '../src/api/client';

const respond = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

describe('API client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    session.getToken = () => null;
    session.onUnauthorized = () => undefined;
  });

  it('sends the bearer token and unwraps data and paging meta', async () => {
    session.getToken = () => 'tok123';
    const fetchMock = jest.fn().mockImplementation(() => respond(200, { success: true, data: [{ id: 1 }], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await api.get<{ id: number }[]>('/alerts', { status: 'open', empty: '', skip: undefined });
    expect(res.data).toEqual([{ id: 1 }]);
    expect(res.meta?.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/alerts?status=open');
    expect(String(url)).not.toContain('empty');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok123' });
  });

  it('does not send a token on public calls', async () => {
    session.getToken = () => 'tok123';
    const fetchMock = jest.fn().mockImplementation(() => respond(200, { success: true, data: {} }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await api.post('/auth/login', { identifier: 'a', password: 'b' }, false);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('turns server errors into ApiError with code and field details', async () => {
    global.fetch = (() => respond(422, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Please correct', details: [{ field: 'email', message: 'Enter a valid email address' }] } })) as unknown as typeof fetch;
    const error = await api.post('/users', {}).catch((e) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fieldErrors).toEqual({ email: 'Enter a valid email address' });
  });

  it('reports a dropped connection as a network error', async () => {
    global.fetch = (() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    const error = await api.get('/health').catch((e) => e as ApiError);
    expect(error.isNetwork).toBe(true);
    expect(error.message).toMatch(/Cannot reach the server/);
  });

  it('signals an expired session on 401, but not for a wrong password', async () => {
    const expired = jest.fn();
    session.onUnauthorized = expired;
    session.getToken = () => 'old';
    global.fetch = (() => respond(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } })) as unknown as typeof fetch;
    await api.get('/auth/me').catch(() => undefined);
    expect(expired).toHaveBeenCalledTimes(1);

    global.fetch = (() => respond(401, { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'bad' } })) as unknown as typeof fetch;
    await api.get('/auth/me').catch(() => undefined);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('copes with a non-JSON answer from a proxy', async () => {
    global.fetch = (() => Promise.resolve({ ok: false, status: 502, json: async () => { throw new Error('html'); } } as unknown as Response)) as unknown as typeof fetch;
    const error = await api.get('/health').catch((e) => e as ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });
});
