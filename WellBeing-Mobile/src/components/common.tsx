import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, spacing } from '../constants/theme';
import { formatDateTime, meetingStatusLabels, meetingTone, requestStatusLabels, requestTone } from '../lib/format';
import type { Meeting, SupportRequest } from '../types';
import { Badge, Card, Row, T } from './ui';

export function RequestCard({ request, showEmployee = false }: { request: SupportRequest; showEmployee?: boolean }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/request/${request.id}` as never)} testID={`request-${request.id}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flex: 1 }}>
          <Ionicons name={request.type === 'BREAK' ? 'cafe-outline' : 'chatbubbles-outline'} size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <T variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
              {request.type === 'BREAK' ? 'Break request' : 'Discussion request'}
              {showEmployee ? ` · ${request.employeeName}` : ''}
            </T>
            <T variant="caption">{formatDateTime(request.createdAt)}</T>
          </View>
        </Row>
        <Badge label={requestStatusLabels[request.status]} tone={requestTone(request.status)} />
      </Row>
      {request.reason ? <T variant="small" style={{ marginTop: spacing.sm }} numberOfLines={2}>{request.reason}</T> : null}
      {request.meetingAt ? <T variant="small" color={colors.info} style={{ marginTop: 4 }}>Meeting: {formatDateTime(request.meetingAt)}</T> : null}
    </Card>
  );
}

export function MeetingCard({ meeting, showEmployee = false, right }: { meeting: Meeting; showEmployee?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/meeting/${meeting.id}` as never)} testID={`meeting-${meeting.id}`}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="body" style={{ fontWeight: '700' }}>{formatDateTime(meeting.scheduledAt)}</T>
          <T variant="small">{showEmployee ? `With ${meeting.employeeName}` : `With ${meeting.managerName}`} · {meeting.durationMinutes} min</T>
          {meeting.purpose ? <T variant="small" numberOfLines={1}>{meeting.purpose}</T> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Badge label={meetingStatusLabels[meeting.status]} tone={meetingTone(meeting.status)} />
          {right}
        </View>
      </Row>
    </Card>
  );
}
