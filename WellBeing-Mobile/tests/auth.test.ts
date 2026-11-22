const store: Record<string, string> = {};
jest.mock('../src/storage/secure', () => ({
  secureStorage: {
    get: jest.fn(async (k: string) => store[k] ?? null),
    set: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    remove: jest.fn(async (k: string) => { delete store[k]; }),
  },
}));
jest.mock('../src/storage/drafts', () => ({ drafts: { clearAll: jest.fn(async () => undefined) } }));
jest.mock('../src/api/services', () => ({
  authService: { login: jest.fn(), me: jest.fn() },
  deviceService: { unregister: jest.fn(async () => ({ data: { removed: 1 } })) },
}));

import { ApiError, session } from '../src/api/client';
import { authService, deviceService } from '../src/api/services';
import { drafts } from '../src/storage/drafts';
import { useAuth } from '../src/store/auth';

const user = { id: 1, fullName: 'Hassan Raza', role: 'EMPLOYEE' } as never;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  useAuth.setState({ status: 'loading', token: null, user: null, notice: null, pushToken: null });
  jest.clearAllMocks();
});

describe('auth store', () => {
  it('signs in and remembers the token only when asked', async () => {
    (authService.login as jest.Mock).mockResolvedValue({ data: { token: 'T1', user } });
    await useAuth.getState().login('EMP001', 'pw', true);
    expect(store['wellbeing.token']).toBe('T1');
    expect(useAuth.getState().status).toBe('signedIn');
    expect(session.getToken()).toBe('T1');

    delete store['wellbeing.token'];
    await useAuth.getState().login('EMP001', 'pw', false);
    expect(store['wellbeing.token']).toBeUndefined();
    expect(useAuth.getState().token).toBe('T1'); // kept in memory for this run only
  });

  it('restores a remembered session after validating it with the server', async () => {
    store['wellbeing.token'] = 'T2';
    (authService.me as jest.Mock).mockResolvedValue({ data: user });
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe('signedIn');
    expect(useAuth.getState().user).toBe(user);
  });

  it('goes to signed-out when nothing is stored, or when the server is unreachable', async () => {
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe('signedOut');

    store['wellbeing.token'] = 'T3';
    (authService.me as jest.Mock).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe('signedOut');
    expect(useAuth.getState().notice).toMatch(/offline/i);
    expect(store['wellbeing.token']).toBe('T3'); // kept so the next start can try again
  });

  it('logout clears the token, drafts and the push registration of this device', async () => {
    (authService.login as jest.Mock).mockResolvedValue({ data: { token: 'T4', user } });
    await useAuth.getState().login('EMP001', 'pw', true);
    useAuth.getState().setPushToken('ExponentPushToken[x]');
    await useAuth.getState().logout();
    expect(deviceService.unregister).toHaveBeenCalledWith('ExponentPushToken[x]');
    expect(drafts.clearAll).toHaveBeenCalled();
    expect(store['wellbeing.token']).toBeUndefined();
    expect(useAuth.getState()).toMatchObject({ status: 'signedOut', token: null, user: null });
  });

  it('an expired session (401) signs the user out with a message', async () => {
    (authService.login as jest.Mock).mockResolvedValue({ data: { token: 'T5', user } });
    await useAuth.getState().login('EMP001', 'pw', true);
    session.onUnauthorized();
    await new Promise((r) => setTimeout(r, 10));
    expect(useAuth.getState().status).toBe('signedOut');
    expect(useAuth.getState().notice).toMatch(/session has expired/i);
  });
});
