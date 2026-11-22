import Constants from 'expo-constants';

/**
 * API base URL. EXPO_PUBLIC_API_URL (set in .env or the EAS build profile) wins; otherwise the value from app.json.
 * Never put secrets here: everything in the app bundle is readable by the user.
 */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  ''
).replace(/\/+$/, '');

export const EAS_PROJECT_ID: string | undefined =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID || (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) || undefined;

/** Requests that take longer than this are aborted and reported as a network problem. */
export const REQUEST_TIMEOUT_MS = 25_000;
