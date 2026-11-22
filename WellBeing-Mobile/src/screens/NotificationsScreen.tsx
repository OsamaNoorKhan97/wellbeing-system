import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { errorMessage } from '../api/client';
import { notificationService } from '../api/services';
import { Banner, Button, Card, Empty, Row, Screen, SkeletonList, T } from '../components/ui';
import { colors } from '../constants/theme';
import { usePaged, useRefresh } from '../hooks/useData';
import { timeAgo } from '../lib/format';
import { routeForNotification } from '../lib/links';
import { useAuth } from '../store/auth';
import type { AppNotification } from '../types';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  WELLBEING_ALERT: 'warning',
  BREAK_REQUESTED: 'cafe',
  BREAK_APPROVED: 'checkmark-circle',
  BREAK_REJECTED: 'close-circle',
  DISCUSSION_REQUESTED: 'chatbubbles',
  MEETING_SCHEDULED: 'calendar',
  MEETING_RESCHEDULED: 'calendar',
  MEETING_REJECTED: 'close-circle',
  MEETING_CANCELLED: 'close-circle',
  MEETING_REMINDER: 'alarm',
  MEETING_UPDATED: 'calendar',
};

export function NotificationsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const role = useAuth((s) => s.user!.role);
  const list = usePaged(['notifications', 'list'], (page, pageSize) => notificationService.list({ page, pageSize }));
  const { refreshing, onRefresh } = useRefresh(list.refetch);
  const unread = list.data?.pages[0]?.meta?.unread ?? 0;

  const open = async (n: AppNotification) => {
    if (!n.isRead) {
      await notificationService.markRead(n.id).catch(() => undefined);
      void client.invalidateQueries({ queryKey: ['notifications'] });
    }
    const target = routeForNotification({ type: n.type, entityType: n.entityType, entityId: n.entityId }, role);
    if (target) router.push(target as never);
  };
  const readAll = async () => {
    await notificationService.markAllRead().catch(() => undefined);
    void client.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {unread > 0 ? <Button title={`Mark all ${unread} as read`} variant="secondary" onPress={readAll} testID="read-all" /> : null}
      {list.isLoading ? <SkeletonList count={4} /> : null}
      {list.error && !list.items.length ? <Banner tone="danger" text={errorMessage(list.error)} /> : null}
      {!list.isLoading && !list.items.length && !list.error ? <Empty icon="notifications-outline" title="No notifications" message="Updates about requests, meetings and alerts appear here." /> : null}
      {list.items.map((n) => (
        <Card key={n.id} onPress={() => void open(n)} testID={`notification-${n.id}`} style={n.isRead ? undefined : { borderColor: colors.primary, backgroundColor: colors.primarySoft }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Ionicons name={icons[n.type] ?? 'notifications'} size={22} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="body" style={{ fontWeight: n.isRead ? '600' : '800' }}>{n.title}</T>
              <T variant="small">{n.message}</T>
              <T variant="caption">{timeAgo(n.createdAt)}</T>
            </View>
            {!n.isRead ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
          </Row>
        </Card>
      ))}
      {list.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
    </Screen>
  );
}
