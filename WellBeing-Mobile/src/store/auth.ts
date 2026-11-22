import { create } from 'zustand';
import { ApiError, session } from '../api/client';
import { authService, deviceService } from '../api/services';
import { drafts } from '../storage/drafts';
import { secureStorage } from '../storage/secure';
import type { User } from '../types';

const TOKEN_KEY = 'wellbeing.token';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  token: string | null;
  user: User | null;
  /** Shown on the login screen after the session ended on its own. */
  notice: string | null;
  /** Push token registered for this device, so logout can unregister it. */
  pushToken: string | null;
  restore: () => Promise<void>;
  login: (identifier: string, password: string, remember: boolean) => Promise<User>;
  logout: (notice?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  replaceToken: (token: string) => Promise<void>;
  setPushToken: (token: string | null) => void;
  clearNotice: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  token: null,
  user: null,
  notice: null,
  pushToken: null,

  /** Called once at start-up: reads the remembered token and validates it with the server. */
  async restore() {
    const saved = await secureStorage.get(TOKEN_KEY);
    if (!saved) return set({ status: 'signedOut' });
    set({ token: saved });
    try {
      const { data } = await authService.me();
      set({ user: data, status: 'signedIn' });
    } catch (error) {
      // A rejected token was already handled by onUnauthorized; a network error keeps the user signed out locally
      // but leaves the stored token so the next start can try again.
      if (error instanceof ApiError && error.isNetwork) set({ status: 'signedOut', token: null, notice: 'You are offline. Connect to the internet to sign in.' });
      else if (get().status === 'loading') set({ status: 'signedOut', token: null });
    }
  },

  async login(identifier, password, remember) {
    const { data } = await authService.login(identifier.trim(), password, remember);
    if (remember) await secureStorage.set(TOKEN_KEY, data.token);
    else await secureStorage.remove(TOKEN_KEY);
    set({ token: data.token, user: data.user, status: 'signedIn', notice: null });
    return data.user;
  },

  async logout(notice) {
    const { pushToken, token } = get();
    // Best effort: stop pushing to this device for the account that is leaving.
    if (pushToken && token) await deviceService.unregister(pushToken).catch(() => undefined);
    await secureStorage.remove(TOKEN_KEY);
    await drafts.clearAll();
    set({ token: null, user: null, status: 'signedOut', pushToken: null, notice: notice ?? null });
  },

  async refreshUser() {
    const { data } = await authService.me();
    set({ user: data });
  },

  async replaceToken(token) {
    const remembered = (await secureStorage.get(TOKEN_KEY)) !== null;
    if (remembered) await secureStorage.set(TOKEN_KEY, token);
    set({ token });
  },

  setPushToken: (pushToken) => set({ pushToken }),
  clearNotice: () => set({ notice: null }),
}));

// The API client reads the token and reports expired sessions through these hooks.
session.getToken = () => useAuth.getState().token;
session.onUnauthorized = () => {
  if (useAuth.getState().status === 'signedIn') void useAuth.getState().logout('Your session has expired. Please sign in again.');
};
