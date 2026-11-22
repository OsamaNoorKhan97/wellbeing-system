import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { EAS_PROJECT_ID } from '../config';

export type PushResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'no-project-id' | 'error'; detail?: string };

/**
 * Foreground behaviour: show the banner so a manager sees a new alert immediately, with no sound or badge change.
 * Set at import time because the handler must exist before the first notification arrives.
 */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function getPermissionState(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Asks for permission (once) and returns this device's Expo push token. Needs a real device and an EAS project id. */
export async function registerForPush(): Promise<PushResult> {
  if (Platform.OS === 'web' || !Device.isDevice) return { ok: false, reason: 'unsupported' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'WellBeing',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'permission-denied' };
    const projectId = EAS_PROJECT_ID ?? (Constants.easConfig?.projectId as string | undefined);
    if (!projectId) return { ok: false, reason: 'no-project-id' };
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: token.data };
  } catch (error) {
    return { ok: false, reason: 'error', detail: error instanceof Error ? error.message : String(error) };
  }
}
