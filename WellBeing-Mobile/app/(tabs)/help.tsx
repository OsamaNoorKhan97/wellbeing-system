import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../src/api/client';
import { employeeService, requestService } from '../../src/api/services';
import { MeetingCard, RequestCard } from '../../src/components/common';
import { RoleGate } from '../../src/components/RoleGate';
import { Banner, Button, Card, ConfirmDialog, Empty, Input, Screen, SectionHeader, SkeletonList, T } from '../../src/components/ui';
import { colors, spacing } from '../../src/constants/theme';
import { Boundary, useApi, usePaged, useRefresh } from '../../src/hooks/useData';
import { drafts } from '../../src/storage/drafts';
import { useAuth } from '../../src/store/auth';
import type { RequestType } from '../../src/types';

function Inner() {
  const client = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const dash = useApi(['dashboard', 'employee'], () => employeeService.dashboard());
  const requests = usePaged(['requests', 'mine'], (page, pageSize) => requestService.list({ page, pageSize }));
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([dash.refetch(), requests.refetch()]);
  });
  const [kind, setKind] = useState<RequestType | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);

  // Keep an unsent message so a dropped connection or an app restart does not lose it.
  useEffect(() => {
    if (kind) void drafts.load<string>(user.id, `help-${kind}`).then((d) => setReason(d ?? ''));
  }, [kind, user.id]);
  useEffect(() => {
    if (kind) void drafts.save(user.id, `help-${kind}`, reason);
  }, [reason, kind, user.id]);

  const manager = dash.data?.manager;
  const hasPending = (type: RequestType) => requests.items.some((r) => r.type === type && r.status === 'PENDING');

  const send = async () => {
    if (!kind || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await requestService.create(kind, reason.trim());
      await drafts.clear(user.id, `help-${kind}`);
      setNotice(kind === 'BREAK' ? 'Break request sent to your Line Manager.' : 'Discussion request sent to your Line Manager.');
      setKind(null);
      setReason('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await Promise.all([client.invalidateQueries({ queryKey: ['requests'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {notice ? <Banner tone="success" text={notice} icon="checkmark-circle-outline" /> : null}
      <Card style={{ gap: spacing.md }}>
        <T variant="subheading">How can we help?</T>
        <T variant="small">{manager ? `Your requests go to your Line Manager, ${manager.fullName}.` : 'You have no Line Manager assigned yet. Please contact HR.'}</T>
        <Button title="Take a Break" icon="cafe" onPress={() => { setNotice(null); setError(null); setKind('BREAK'); }} disabled={!manager || hasPending('BREAK')} testID="help-break" />
        {hasPending('BREAK') ? <T variant="caption">You already have a pending break request.</T> : null}
        <Button title="Discussion with Line Manager" icon="chatbubbles" variant="secondary" onPress={() => { setNotice(null); setError(null); setKind('DISCUSSION'); }} disabled={!manager || hasPending('DISCUSSION')} testID="help-discuss" />
        {hasPending('DISCUSSION') ? <T variant="caption">You already have a pending discussion request.</T> : null}
      </Card>

      <SectionHeader title="Upcoming meetings" />
      <Boundary query={dash} skeleton={<SkeletonList count={1} />}>
        {(d) => (d.upcomingMeetings.length ? <>{d.upcomingMeetings.map((m) => <MeetingCard key={m.id} meeting={m} />)}</> : <Empty icon="calendar-outline" title="No upcoming meetings" />)}
      </Boundary>

      <SectionHeader title="My requests" />
      {requests.isLoading ? <SkeletonList /> : null}
      {requests.error && !requests.items.length ? <Banner tone="danger" text={errorMessage(requests.error)} /> : null}
      {!requests.isLoading && !requests.items.length ? <Empty icon="hand-left-outline" title="No requests yet" message="Your break and discussion requests will appear here." /> : null}
      {requests.items.map((r) => <RequestCard key={r.id} request={r} />)}
      {requests.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void requests.fetchNextPage()} loading={requests.isFetchingNextPage} /> : null}

      <ConfirmDialog
        visible={!!kind}
        title={kind === 'BREAK' ? 'Request a break' : 'Request a discussion'}
        message={kind === 'BREAK' ? 'Your Line Manager will review the request. A reason is optional.' : 'Tell your Line Manager what you would like to talk about (optional).'}
        confirmLabel="Send request"
        loading={busy}
        onConfirm={send}
        onCancel={() => setKind(null)}
      >
        <Input label={kind === 'BREAK' ? 'Reason (optional)' : 'Message (optional)'} value={reason} onChangeText={setReason} multiline maxLength={500} style={{ minHeight: 70, textAlignVertical: 'top', color: colors.text, fontSize: 15 }} autoCapitalize="sentences" testID="help-reason" />
        {error ? <Banner tone="danger" text={error} /> : null}
      </ConfirmDialog>
    </Screen>
  );
}

export default function Help() {
  return (
    <RoleGate allow={['EMPLOYEE']}>
      <Inner />
    </RoleGate>
  );
}
