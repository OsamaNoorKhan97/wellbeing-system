import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { alertService } from '../../src/api/services';
import { RoleGate } from '../../src/components/RoleGate';
import { Badge, Banner, Button, Card, ConfirmDialog, Input, Row, Screen, SectionHeader, SkeletonList, T } from '../../src/components/ui';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';
import { alertStatusLabels, alertTone, formatDate, formatDateTime, roleLabels } from '../../src/lib/format';

function Inner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const aid = Number(id);
  const client = useQueryClient();
  const query = useApi(['alerts', 'detail', aid], () => alertService.get(aid));
  const { refreshing, onRefresh } = useRefresh(query.refetch);
  const [comment, setComment] = useState('');
  const [confirm, setConfirm] = useState<'acknowledge' | 'resolve' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setConfirm(null);
      setNote('');
      setComment('');
      await client.invalidateQueries({ queryKey: ['alerts'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
      await query.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Boundary query={query} skeleton={<SkeletonList count={2} height={120} />}>
        {(a) => (
          <>
            <Card style={{ gap: 6 }} testID="alert-detail">
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="heading">{a.employeeName}</T>
                <Badge label={alertStatusLabels[a.status]} tone={alertTone(a.status)} />
              </Row>
              <T variant="small">{a.employeeCode} · {a.department ?? 'No department'}{a.managerName ? ` · Manager: ${a.managerName}` : ''}</T>
              <T variant="body">Raised {formatDateTime(a.triggeredAt)}</T>
              <T variant="small">Triggered by {a.assessmentCount} consecutive assessments that may indicate poor well-being. For privacy, individual scores are not shown here.</T>
              <T variant="caption">Assessment dates: {a.assessmentDates.map((d) => formatDate(d)).join(', ')}</T>
              {a.acknowledgedAt ? <T variant="small">Acknowledged {formatDateTime(a.acknowledgedAt)}{a.acknowledgedByName ? ` by ${a.acknowledgedByName}` : ''}</T> : null}
              {a.resolvedAt ? <T variant="small">Resolved {formatDateTime(a.resolvedAt)}{a.resolvedByName ? ` by ${a.resolvedByName}` : ''}</T> : null}
              {a.breakRequest ? <T variant="small">Break request: {a.breakRequest.status.toLowerCase()}</T> : <T variant="small">No break request yet.</T>}
            </Card>

            {a.status !== 'RESOLVED' ? (
              <Row>
                {a.status === 'ACTIVE' ? <Button title="Acknowledge" style={{ flex: 1 }} onPress={() => setConfirm('acknowledge')} testID="alert-ack" /> : null}
                <Button title="Resolve" variant="secondary" style={{ flex: 1 }} onPress={() => setConfirm('resolve')} testID="alert-resolve" />
              </Row>
            ) : null}
            {error ? <Banner tone="danger" text={error} /> : null}

            <SectionHeader title="Follow-up notes" />
            {a.comments.length === 0 ? <T variant="small">No notes yet.</T> : null}
            <View style={{ gap: 8 }}>
              {a.comments.map((c) => (
                <Card key={c.id}>
                  <T variant="small" color="#0F1F1E">{c.comment}</T>
                  <T variant="caption">{c.authorName ?? 'System'}{c.authorRole ? ` (${roleLabels[c.authorRole]})` : ''} · {formatDateTime(c.createdAt)}</T>
                </Card>
              ))}
            </View>
            <Input label="Add a note or follow-up action" value={comment} onChangeText={setComment} multiline maxLength={1000} autoCapitalize="sentences" testID="alert-comment" />
            <Button title="Add note" variant="secondary" disabled={!comment.trim()} loading={busy} onPress={() => run(() => alertService.comment(aid, comment.trim()))} testID="alert-comment-save" />

            <ConfirmDialog
              visible={confirm !== null}
              title={confirm === 'acknowledge' ? 'Acknowledge this alert?' : 'Resolve this alert?'}
              message={confirm === 'resolve' ? 'The employee no longer sees the break suggestion once the alert is resolved.' : 'Other reviewers will see that you have taken it on.'}
              confirmLabel={confirm === 'acknowledge' ? 'Acknowledge' : 'Resolve'}
              loading={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() => run(() => (confirm === 'acknowledge' ? alertService.acknowledge(aid, note.trim()) : alertService.resolve(aid, note.trim())))}
            >
              <Input label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} autoCapitalize="sentences" />
            </ConfirmDialog>
          </>
        )}
      </Boundary>
    </Screen>
  );
}

export default function AlertDetail() {
  return (
    <RoleGate allow={['LINE_MANAGER', 'HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
