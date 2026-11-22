import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { deviceService } from '../api/services';
import { routeForNotification } from '../lib/links';
import { useAuth } from '../store/auth';
import { registerForPush } from './push';

/**
 * Lives inside the signed-in app. It registers this device for push, refreshes the unread badge when a
 * message arrives in the foreground, and deep links to the right screen when a message is tapped.
 */
export function PushBridge() {
  const user = useAuth((s) => s.user);
  const setPushToken = useAuth((s) => s.setPushToken);
  const router = useRouter();
  const client = useQueryClient();
  const handled = useRef(new Set<number>());

  // 1. register the device for the signed-in user (a user can have several devices)
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    let cancelled = false;
    void registerForPush().then(async (result) => {
      if (cancelled || !result.ok) return;
      try {
        await deviceService.register(result.token, Platform.OS === 'ios' ? 'ios' : 'android', Platform.OS);
        setPushToken(result.token);
      } catch {
        /* registered again on the next start */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, setPushToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. foreground messages and taps
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as { notificationId?: number; type?: string; entityType?: string; entityId?: number } | undefined;
      if (!data) return;
      // The same tap can be delivered twice (cold start + listener); open each notification once.
      if (data.notificationId != null) {
        if (handled.current.has(data.notificationId)) return;
        handled.current.add(data.notificationId);
      }
      const target = routeForNotification(data, user.role);
      void client.invalidateQueries({ queryKey: ['notifications'] });
      if (target) router.push(target as never);
      else router.push((user.role === 'EMPLOYEE' ? '/notifications' : '/inbox') as never);
    };
    const received = Notifications.addNotificationReceivedListener(() => {
      void client.invalidateQueries({ queryKey: ['notifications'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void client.invalidateQueries({ queryKey: ['alerts'] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    open(Notifications.getLastNotificationResponse());
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [user, client, router]);

  return null;
}
