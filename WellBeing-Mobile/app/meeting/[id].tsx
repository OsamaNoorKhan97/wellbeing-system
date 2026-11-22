import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { meetingService } from '../../src/api/services';
import { MeetingActions } from '../../src/components/MeetingActions';
import { Badge, Card, Empty, Row, Screen, SectionHeader, SkeletonList, T } from '../../src/components/ui';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';
import { formatDateTime, meetingStatusLabels, meetingTone } from '../../src/lib/format';
import { useAuth } from '../../src/store/auth';
import type { Meeting } from '../../src/types';

const actionLabels: Record<string, string> = {
  RESCHEDULED: 'Rescheduled',
  REJECTED: 'Rejected',
  SNOOZED: 'Reminder snoozed',
  REMINDER_SENT: 'Reminder sent',
};

export default function MeetingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mid = Number(id);
  const role = useAuth((s) => s.user!.role);
  // The API has no single-meeting endpoint, so the meeting is found in the (all-time) list.
  const meeting = useApi<Meeting | undefined>(['meetings', 'detail', mid], async () => {
    for (let page = 1; page <= 10; page += 1) {
      const res = await meetingService.list({ scope: 'all', page, pageSize: 100 });
      const found = res.data.find((m) => m.id === mid);
      if (found) return { data: found };
      if (!res.meta || page >= res.meta.totalPages) break;
    }
    return { data: undefined };
  });
  const history = useApi(['meetings', 'history', mid], () => meetingService.history(mid));
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([meeting.refetch(), history.refetch()]);
  });

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Boundary query={meeting} skeleton={<SkeletonList count={2} height={120} />}>
        {(m) =>
          !m ? (
            <Empty icon="calendar-outline" title="Meeting not found" message="It may belong to someone else or no longer exist." />
          ) : (
            <>
              <Card style={{ gap: 6 }} testID="meeting-detail">
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="heading">{formatDateTime(m.scheduledAt)}</T>
                  <Badge label={meetingStatusLabels[m.status]} tone={meetingTone(m.status)} />
                </Row>
                <T variant="small">{m.durationMinutes} minutes · with {role === 'LINE_MANAGER' ? m.employeeName : m.managerName}</T>
                {m.purpose ? <T variant="body">{m.purpose}</T> : null}
                {m.location ? <T variant="small">Location: {m.location}</T> : null}
                {m.rejectionReason ? <T variant="small">Rejection reason: {m.rejectionReason}</T> : null}
                {m.cancellationReason ? <T variant="small">Cancellation reason: {m.cancellationReason}</T> : null}
                {role === 'LINE_MANAGER' && m.snoozedUntil ? <T variant="small">Reminder snoozed until {formatDateTime(m.snoozedUntil)}</T> : null}
              </Card>
              {role === 'LINE_MANAGER' ? <MeetingActions meeting={m} onChanged={() => void meeting.refetch().then(() => history.refetch())} /> : null}
            </>
          )
        }
      </Boundary>
      <SectionHeader title="History" />
      <Boundary query={history} skeleton={<SkeletonList count={1} />}>
        {(rows) =>
          rows.length === 0 ? (
            <T variant="small">No changes yet.</T>
          ) : (
            <View style={{ gap: 8 }}>
              {rows.map((h) => (
                <Card key={h.id} testID={`history-${h.action}`}>
                  <T variant="body" style={{ fontWeight: '700' }}>{actionLabels[h.action] ?? h.action}</T>
                  <T variant="caption">{formatDateTime(h.createdAt)}{h.actorName ? ` · ${h.actorName}` : ''}</T>
                  {h.previousScheduledAt ? <T variant="small">Previous time: {formatDateTime(h.previousScheduledAt)}</T> : null}
                  {h.newScheduledAt ? <T variant="small">New time: {formatDateTime(h.newScheduledAt)}</T> : null}
                  {h.snoozedUntil ? <T variant="small">Snoozed until: {formatDateTime(h.snoozedUntil)}</T> : null}
                  {h.reason ? <T variant="small">Reason: {h.reason}</T> : null}
                </Card>
              ))}
            </View>
          )
        }
      </Boundary>
    </Screen>
  );
}
