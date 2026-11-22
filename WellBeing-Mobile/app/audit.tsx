import { useEffect, useState } from 'react';
import { errorMessage } from '../src/api/client';
import { auditService } from '../src/api/services';
import { RoleGate } from '../src/components/RoleGate';
import { Banner, Button, Card, Chips, Empty, Input, Screen, SkeletonList, T } from '../src/components/ui';
import { usePaged, useRefresh, useApi } from '../src/hooks/useData';
import { formatDateTime } from '../src/lib/format';

function Inner() {
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  const actions = useApi(['audit', 'actions'], () => auditService.actions());
  const list = usePaged(['audit', action, q], (page, pageSize) => auditService.list({ page, pageSize, action: action || undefined, search: q || undefined }));
  const { refreshing, onRefresh } = useRefresh(list.refetch);
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Input label="Search" value={search} onChangeText={setSearch} placeholder="Person or action" />
      {actions.data?.length ? <Chips value={action} onChange={setAction} options={[{ value: '', label: 'All actions' }, ...actions.data.map((a) => ({ value: a, label: a.replace(/_/g, ' ').toLowerCase() }))]} /> : null}
      {list.isLoading ? <SkeletonList /> : null}
      {list.error && !list.items.length ? <Banner tone="danger" text={errorMessage(list.error)} /> : null}
      {!list.isLoading && !list.items.length && !list.error ? <Empty icon="document-text-outline" title="No activity" /> : null}
      {list.items.map((e) => (
        <Card key={e.id}>
          <T variant="body" style={{ fontWeight: '700' }}>{e.action.replace(/_/g, ' ').toLowerCase()}</T>
          <T variant="small">{e.actorName ?? 'System'}{e.entityType ? ` · ${e.entityType}${e.entityId ? ` #${e.entityId}` : ''}` : ''}</T>
          <T variant="caption">{formatDateTime(e.createdAt)}</T>
        </Card>
      ))}
      {list.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
    </Screen>
  );
}

export default function Audit() {
  return (
    <RoleGate allow={['HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
