import { API_URL, REQUEST_TIMEOUT_MS } from '../config';
import type { PageMeta } from '../types';

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

  /** True when the server could not be reached at all (no connection, timeout). */
  get isNetwork() {
    return this.status === 0;
  }

  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const item of this.details as FieldError[]) if (item.field && !out[item.field]) out[item.field] = item.message;
    return out;
  }
}

export interface ApiResponse<T> {
  data: T;
  meta?: PageMeta;
}
type Query = Record<string, string | number | boolean | undefined | null>;

/** The auth store plugs itself in here, which keeps this module free of a circular import. */
export const session = {
  getToken: (): string | null => null,
  onUnauthorized: (): void => undefined,
};

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query; auth?: boolean } = {},
): Promise<ApiResponse<T>> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const qs = search.toString();
  const url = `${API_URL}${path}${qs ? `?${qs}` : ''}`;
  const token = options.auth === false ? null : session.getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your internet connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    /* non-JSON answer from a proxy */
  }

  if (!response.ok || !payload?.success) {
    const error = payload?.error;
    if (response.status === 401 && token && error?.code !== 'INVALID_CREDENTIALS') session.onUnauthorized();
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? 'Unexpected server response. Please try again.',
      error?.details,
    );
  }
  return { data: payload.data as T, meta: payload.meta };
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>('POST', path, { body: body ?? {}, auth }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
