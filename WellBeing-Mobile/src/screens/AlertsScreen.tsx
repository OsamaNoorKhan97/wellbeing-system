import { useRouter } from 'expo-router';
import { useState } from 'react';
import { alertService, type AlertFilter } from '../api/services';
import { errorMessage } from '../api/client';
import { RoleGate } from '../components/RoleGate';
import { Badge, Banner, Button, Card, Chips, Empty, Row, Screen, SkeletonList, T } from '../components/ui';
import { usePaged, useRefresh } from '../hooks/useData';
import { alertStatusLabels, alertTone, formatDate } from '../lib/format';

function Inner() {
  const router = useRouter();
  const [status, setStatus] = useState<AlertFilter>('open');
  const [department, setDepartment] = useState('');
  const list = usePaged(['alerts', status], (page, pageSize) => alertService.list({ page, pageSize, status }));
  const { refreshing, onRefresh } = useRefresh(list.refetch);
  const departments = Array.from(new Set(list.items.map((a) => a.department).filter(Boolean) as string[])).sort();
  const items = department ? list.items.filter((a) => a.department === department) : list.items;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Chips<AlertFilter> value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'ACTIVE', label: 'New' }, { value: 'ACKNOWLEDGED', label: 'Acknowledged' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'all', label: 'All' }]} />
      {departments.length > 1 ? (
        <Chips value={department} onChange={setDepartment} options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
      ) : null}
      {list.isLoading ? <SkeletonList /> : null}
      {list.error && !list.items.length ? <Banner tone="danger" text={errorMessage(list.error)} /> : null}
      {!list.isLoading && !items.length && !list.error ? <Empty icon="shield-checkmark-outline" title="No alerts" message="No well-being alerts match this filter." /> : null}
      {items.map((a) => (
        <Card key={a.id} onPress={() => router.push(`/alert/${a.id}` as never)} testID={`alert-${a.id}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="body" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{a.employeeName}</T>
            <Badge label={alertStatusLabels[a.status]} tone={alertTone(a.status)} />
          </Row>
          <T variant="small">{a.department ?? 'No department'} · {a.employeeCode}</T>
          <T variant="small">Raised {formatDate(a.triggeredAt)} · {a.assessmentCount} consecutive assessments · {a.commentCount} comments</T>
          {a.breakRequest ? <T variant="caption">Break request: {a.breakRequest.status.toLowerCase()}</T> : null}
        </Card>
      ))}
      {list.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
    </Screen>
  );
}

export function AlertsScreen() {
  return (
    <RoleGate allow={['LINE_MANAGER', 'HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
