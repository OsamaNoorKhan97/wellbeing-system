import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../src/api/client';
import { managerService, userService } from '../../src/api/services';
import { RoleGate } from '../../src/components/RoleGate';
import { Avatar, Badge, Banner, Button, Chips, Empty, Input, ListRow, Screen, SkeletonList, T } from '../../src/components/ui';
import { usePaged, useRefresh, useApi } from '../../src/hooks/useData';
import { roleLabels } from '../../src/lib/format';
import { useAuth } from '../../src/store/auth';
import type { Role } from '../../src/types';

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Team() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [filter, setFilter] = useState<'all' | 'missed' | 'pending'>('all');
  const team = useApi(['team', q], () => managerService.team(q || undefined));
  const { refreshing, onRefresh } = useRefresh(team.refetch);
  const rows = (team.data ?? []).filter((m) => (filter === 'missed' ? !m.checkedInToday : filter === 'pending' ? m.pendingRequests > 0 : true));
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Input label="Search employees" value={search} onChangeText={setSearch} placeholder="Name or Employee ID" testID="team-search" />
      <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'missed', label: 'No check-in today' }, { value: 'pending', label: 'Pending requests' }]} />
      {team.isLoading ? <SkeletonList /> : null}
      {team.error && !team.data ? <Banner tone="danger" text={errorMessage(team.error)} /> : null}
      {!team.isLoading && !rows.length && !team.error ? <Empty icon="people-outline" title="No employees" message="No assigned employees match." /> : null}
      {rows.map((m) => (
        <ListRow
          key={m.id}
          testID={`team-${m.employeeId}`}
          left={<Avatar name={m.fullName} />}
          title={m.fullName}
          subtitle={`${m.employeeId} · ${m.department ?? '—'}${m.checkedInToday ? ' · checked in today' : ' · no check-in today'}`}
          right={m.pendingRequests ? <Badge label={`${m.pendingRequests} pending`} tone="warning" /> : undefined}
          onPress={() => router.push(`/team/${m.id}` as never)}
        />
      ))}
    </Screen>
  );
}

const ROLE_FILTERS: { value: Role | ''; label: string }[] = [
  { value: '', label: 'All roles' },
  { value: 'EMPLOYEE', label: 'Employees' },
  { value: 'LINE_MANAGER', label: 'Line Managers' },
  { value: 'HR', label: 'HR' },
  { value: 'SUPER_ADMIN', label: 'Super Admins' },
];

function Directory() {
  const router = useRouter();
  const role = useAuth((s) => s.user!.role);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [department, setDepartment] = useState('');
  const departments = useApi(['users', 'departments'], () => userService.departments());
  const list = usePaged(['users', q, roleFilter, status, department], (page, pageSize) => userService.list({ page, pageSize, search: q || undefined, role: roleFilter, status, department: department || undefined }));
  const { refreshing, onRefresh } = useRefresh(list.refetch);
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Input label="Search" value={search} onChangeText={setSearch} placeholder="Name, email or Employee ID" testID="user-search" />
      <Chips value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTERS} />
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      {departments.data?.length ? <Chips value={department} onChange={setDepartment} options={[{ value: '', label: 'All departments' }, ...departments.data.map((d) => ({ value: d, label: d }))]} /> : null}
      <Button title="Create user" icon="person-add" onPress={() => router.push('/user-new' as never)} testID="user-new" />
      <T variant="caption">{list.total} {list.total === 1 ? 'person' : 'people'}{role === 'HR' ? ' · HR cannot create or change Super Admins' : ''}</T>
      {list.isLoading ? <SkeletonList /> : null}
      {list.error && !list.items.length ? <Banner tone="danger" text={errorMessage(list.error)} /> : null}
      {!list.isLoading && !list.items.length && !list.error ? <Empty icon="people-outline" title="No users found" /> : null}
      {list.items.map((u) => (
        <ListRow
          key={u.id}
          testID={`user-${u.employeeId}`}
          left={<Avatar name={u.fullName} />}
          title={u.fullName}
          subtitle={`${u.employeeId} · ${roleLabels[u.role]}${u.department ? ` · ${u.department}` : ''}${u.role === 'EMPLOYEE' && !u.managerId ? ' · no manager' : ''}`}
          right={u.isActive ? undefined : <Badge label="Inactive" tone="neutral" />}
          onPress={() => router.push(`/user/${u.id}` as never)}
        />
      ))}
      {list.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
    </Screen>
  );
}

export default function Employees() {
  const role = useAuth((s) => s.user?.role);
  return (
    <RoleGate allow={['LINE_MANAGER', 'HR', 'SUPER_ADMIN']}>{role === 'LINE_MANAGER' ? <Team /> : <Directory />}</RoleGate>
  );
}
