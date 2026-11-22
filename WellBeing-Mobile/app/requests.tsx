import { useState } from 'react';
import { errorMessage } from '../src/api/client';
import { requestService } from '../src/api/services';
import { RequestCard } from '../src/components/common';
import { RoleGate } from '../src/components/RoleGate';
import { Banner, Button, Chips, Empty, Screen, SkeletonList } from '../src/components/ui';
import { usePaged, useRefresh } from '../src/hooks/useData';
import type { RequestStatus, RequestType } from '../src/types';

type TypeFilter = RequestType | 'ALL';
type StatusFilter = RequestStatus | 'ALL';

function Inner() {
  const [type, setType] = useState<TypeFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const list = usePaged(['requests', 'manager', type, status], (page, pageSize) =>
    requestService.list({ page, pageSize, type: type === 'ALL' ? undefined : type, status: status === 'ALL' ? undefined : status }),
  );
  const { refreshing, onRefresh } = useRefresh(list.refetch);
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Chips<TypeFilter> value={type} onChange={setType} options={[{ value: 'ALL', label: 'All types' }, { value: 'BREAK', label: 'Break' }, { value: 'DISCUSSION', label: 'Discussion' }]} />
      <Chips<StatusFilter>
        value={status}
        onChange={setStatus}
        options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'SCHEDULED', label: 'Scheduled' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'ALL', label: 'All' }]}
      />
      {list.isLoading ? <SkeletonList /> : null}
      {list.error && !list.items.length ? <Banner tone="danger" text={errorMessage(list.error)} /> : null}
      {!list.isLoading && !list.items.length && !list.error ? <Empty icon="checkmark-done-outline" title="Nothing here" message="No requests match these filters." /> : null}
      {list.items.map((r) => <RequestCard key={r.id} request={r} showEmployee />)}
      {list.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
    </Screen>
  );
}

export default function Requests() {
  return (
    <RoleGate allow={['LINE_MANAGER']}>
      <Inner />
    </RoleGate>
  );
}
