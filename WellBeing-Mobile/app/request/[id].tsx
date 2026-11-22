import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { errorMessage } from '../../src/api/client';
import { requestService } from '../../src/api/services';
import { DateTimeField } from '../../src/components/DateTimeField';
import { Badge, Banner, Button, Card, ConfirmDialog, Empty, Input, Row, Screen, Sheet, SkeletonList, T } from '../../src/components/ui';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';
import { formatDateTime, requestStatusLabels, requestTone } from '../../src/lib/format';
import { useAuth } from '../../src/store/auth';
import type { SupportRequest } from '../../src/types';

export default function RequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rid = Number(id);
  const router = useRouter();
  const client = useQueryClient();
  const role = useAuth((s) => s.user!.role);
  // Employees and Line Managers see only their own side of a request (the server answers 404 otherwise).
  const query = useApi<SupportRequest | undefined>(['requests', 'detail', rid], async () => {
    for (let page = 1; page <= 10; page += 1) {
      const res = await requestService.list({ page, pageSize: 100 });
      const found = res.data.find((r) => r.id === rid);
      if (found) return { data: found };
      if (!res.meta || page >= res.meta.totalPages) break;
    }
    return { data: undefined };
  });
  const { refreshing, onRefresh } = useRefresh(query.refetch);
  const [mode, setMode] = useState<'approve' | 'reject' | 'schedule' | 'cancel' | null>(null);
  const [comment, setComment] = useState('');
  const [when, setWhen] = useState(() => new Date(Date.now() + 86_400_000));
  const [duration, setDuration] = useState('30');
  const [purpose, setPurpose] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    setMode(null);
    setComment('');
    await Promise.all(['requests', 'meetings', 'dashboard', 'alerts'].map((k) => client.invalidateQueries({ queryKey: [k] })));
    await query.refetch();
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await done();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Boundary query={query} skeleton={<SkeletonList count={2} height={120} />}>
        {(r) =>
          !r ? (
            <Empty icon="document-outline" title="Request not found" message="It may belong to someone else." />
          ) : (
            <>
              <Card style={{ gap: 6 }} testID="request-detail">
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="heading">{r.type === 'BREAK' ? 'Break request' : 'Discussion request'}</T>
                  <Badge label={requestStatusLabels[r.status]} tone={requestTone(r.status)} />
                </Row>
                <T variant="small">{role === 'LINE_MANAGER' ? `From ${r.employeeName} (${r.employeeCode}${r.employeeDepartment ? `, ${r.employeeDepartment}` : ''})` : `To ${r.managerName}`}</T>
                <T variant="caption">Sent {formatDateTime(r.createdAt)}</T>
                {r.reason ? <T variant="body">“{r.reason}”</T> : <T variant="small">No message.</T>}
                {r.managerComment ? <Banner tone="info" text={`Manager comment: ${r.managerComment}`} /> : null}
                {r.alertId ? <Badge label="Linked to a well-being alert" tone="warning" /> : null}
                {r.meetingAt ? <T variant="small" color="#1D4ED8">Meeting: {formatDateTime(r.meetingAt)} · {r.meetingDurationMinutes} min{r.meetingLocation ? ` · ${r.meetingLocation}` : ''}</T> : null}
              </Card>
              {error ? <Banner tone="danger" text={error} /> : null}

              {r.meetingId ? <Button title="View meeting" variant="secondary" onPress={() => router.push(`/meeting/${r.meetingId}` as never)} /> : null}

              {role === 'LINE_MANAGER' && r.status === 'PENDING' && r.type === 'BREAK' ? (
                <Row>
                  <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => setMode('reject')} testID="request-reject" />
                  <Button title="Approve" style={{ flex: 1 }} onPress={() => setMode('approve')} testID="request-approve" />
                </Row>
              ) : null}
              {role === 'LINE_MANAGER' && r.status === 'PENDING' && r.type === 'DISCUSSION' ? (
                <Button title="Schedule discussion" icon="calendar" onPress={() => setMode('schedule')} testID="request-schedule" />
              ) : null}
              {role === 'EMPLOYEE' && r.status === 'PENDING' ? <Button title="Withdraw request" variant="danger" onPress={() => setMode('cancel')} testID="request-cancel" /> : null}

              <ConfirmDialog visible={mode === 'approve' || mode === 'reject'} title={mode === 'approve' ? 'Approve break request' : 'Reject break request'} confirmLabel={mode === 'approve' ? 'Approve' : 'Reject'} destructive={mode === 'reject'} loading={busy} onCancel={() => setMode(null)} onConfirm={() => run(() => (mode === 'approve' ? requestService.approve(r.id, comment.trim()) : requestService.reject(r.id, comment.trim())))}>
                <Input label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={500} autoCapitalize="sentences" testID="request-comment" />
              </ConfirmDialog>

              <ConfirmDialog visible={mode === 'cancel'} title="Withdraw this request?" message="Your Line Manager will no longer see it as pending." confirmLabel="Withdraw" destructive loading={busy} onCancel={() => setMode(null)} onConfirm={() => run(() => requestService.cancel(r.id))} />

              <Sheet visible={mode === 'schedule'} onClose={() => setMode(null)} title="Schedule discussion">
                <DateTimeField label="Date and time" value={when} onChange={setWhen} minimumDate={new Date()} testID="schedule-when" />
                <Input label="Duration (minutes)" value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" />
                <Input label="Purpose (optional)" value={purpose} onChangeText={setPurpose} autoCapitalize="sentences" />
                <Input label="Location or link (optional)" value={location} onChangeText={setLocation} />
                {error ? <Banner tone="danger" text={error} /> : null}
                <Button title="Schedule" loading={busy} testID="schedule-save" onPress={() => run(() => requestService.schedule(r.id, { scheduledAt: when.toISOString(), durationMinutes: Number(duration) || 30, purpose: purpose.trim() || null, location: location.trim() || null }))} />
              </Sheet>
            </>
          )
        }
      </Boundary>
    </Screen>
  );
}
