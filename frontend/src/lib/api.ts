import type { PageMeta } from '../types';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
const TOKEN_KEY = 'wellbeing.token';
export const SESSION_EXPIRED_EVENT = 'wellbeing:session-expired';

export interface FieldError {
  field: string;
  message: string;
  questionId?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field-level messages from a validation or duplicate error, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const result: Record<string, string> = {};
    for (const item of this.details as FieldError[]) if (item.field && !result[item.field]) result[item.field] = item.message;
    return result;
  }
}

/** "Remember me" keeps the token across browser restarts; otherwise it lives only as long as the tab. */
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY),
  set(token: string, remember: boolean) {
    this.clear();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  },
  replace(token: string) {
    this.set(token, localStorage.getItem(TOKEN_KEY) !== null);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },
};

export interface ApiResponse<T> {
  data: T;
  meta?: PageMeta;
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query } = {}): Promise<ApiResponse<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const url = `${BASE_URL}${path}${search.size ? `?${search}` : ''}`;
  const token = tokenStore.get();

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (for example a proxy error page); handled below.
  }

  if (!response.ok || !payload?.success) {
    const error = payload?.error;
    if (response.status === 401 && token && error?.code !== 'INVALID_CREDENTIALS') {
      tokenStore.clear();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, error?.code ?? 'UNKNOWN_ERROR', error?.message ?? 'Unexpected server response. Please try again.', error?.details);
  }
  return { data: payload.data as T, meta: payload.meta };
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.');
