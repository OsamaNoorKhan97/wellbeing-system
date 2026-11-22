import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { errorMessage } from '../api/client';
import { managerService, meetingService } from '../api/services';
import { DateTimeField } from '../components/DateTimeField';
import { MeetingActions } from '../components/MeetingActions';
import { MeetingCard } from '../components/common';
import { RoleGate } from '../components/RoleGate';
import { Banner, Button, Chips, Empty, Input, Screen, Segmented, Sheet, SkeletonList, T } from '../components/ui';
import { usePaged, useRefresh, useApi } from '../hooks/useData';
import { useAuth } from '../store/auth';

type Scope = 'upcoming' | 'past' | 'all';

function Inner() {
  const client = useQueryClient();
  const isManager = useAuth((s) => s.user!.role === 'LINE_MANAGER');
  const [scope, setScope] = useState<Scope>('upcoming');
  const list = usePaged(['meetings', scope], (page, pageSize) => meetingService.list({ scope, page, pageSize }));
  const { refreshing, onRefresh } = useRefresh(list.refetch);
  const [creating, setCreating] = useState(false);
  const team = useApi(['team', ''], () => managerService.team(), { enabled: isManager && creating });
  const [employeeId, setEmployeeId] = useState<string>('');
  const [when, setWhen] = useState(() => new Date(Date.now() + 86_400_000));
  const [duration, setDuration] = useState('30');
  const [purpose, setPurpose] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!employeeId) return setError('Choose an employee.');
    setBusy(true);
    setError(null);
    try {
      await meetingService.create(Number(employeeId), { scheduledAt: when.toISOString(), durationMinutes: Number(duration) || 30, purpose: purpose.trim() || null, location: location.trim() || null });
      setCreating(false);
      setPurpose('');
      setLocation('');
      await client.invalidateQueries({ queryKey: ['meetings'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Segmented value={scope} onChange={setScope} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />
      {isManager ? <Button title="Schedule a meeting" icon="add-circle" onPress={() => { setError(null); setCreating(true); }} testID="meeting-new" /> : null}
      {list.isLoading ? <SkeletonList /> : null}
      {list.error && !list.items.length ? <Banner tone="danger" text={errorMessage(list.error)} /> : null}
      {!list.isLoading && !list.items.length && !list.error ? <Empty icon="calendar-outline" title="No meetings" message={scope === 'upcoming' ? 'Nothing is scheduled.' : 'Nothing to show.'} /> : null}
      {list.items.map((m) => (
        <View key={m.id} style={{ gap: 8 }}>
          <MeetingCard meeting={m} showEmployee={isManager} />
          {isManager ? <MeetingActions meeting={m} /> : null}
        </View>
      ))}
      {list.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}

      <Sheet visible={creating} onClose={() => setCreating(false)} title="Schedule a meeting">
        <T variant="small">Employee</T>
        {team.data?.length ? (
          <Chips value={employeeId} onChange={setEmployeeId} options={team.data.map((t) => ({ value: String(t.id), label: t.fullName }))} />
        ) : (
          <T variant="small">{team.isLoading ? 'Loading your team…' : 'You have no assigned employees.'}</T>
        )}
        <DateTimeField label="Date and time" value={when} onChange={setWhen} minimumDate={new Date()} testID="new-meeting-when" />
        <Input label="Duration (minutes)" value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <Input label="Purpose (optional)" value={purpose} onChangeText={setPurpose} autoCapitalize="sentences" />
        <Input label="Location or link (optional)" value={location} onChangeText={setLocation} />
        {error ? <Banner tone="danger" text={error} /> : null}
        <Button title="Schedule" onPress={create} loading={busy} testID="new-meeting-save" />
      </Sheet>
    </Screen>
  );
}

export function MeetingsScreen() {
  return (
    <RoleGate allow={['LINE_MANAGER', 'EMPLOYEE']}>
      <Inner />
    </RoleGate>
  );
}
