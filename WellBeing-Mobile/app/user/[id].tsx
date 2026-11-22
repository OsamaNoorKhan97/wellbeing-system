import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { errorMessage } from '../../src/api/client';
import { assignmentService, userService } from '../../src/api/services';
import { RoleGate } from '../../src/components/RoleGate';
import { Avatar, Badge, Banner, Button, Card, Chips, ConfirmDialog, Row, Screen, Sheet, SkeletonList, T } from '../../src/components/ui';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';
import { formatDate, formatDateTime, roleLabels } from '../../src/lib/format';
import { useAuth } from '../../src/store/auth';
import type { Role } from '../../src/types';

function Inner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = Number(id);
  const client = useQueryClient();
  const me = useAuth((s) => s.user!);
  const query = useApi(['users', 'detail', uid], () => userService.get(uid));
  const managers = useApi(['assignments'], () => assignmentService.overview());
  const { refreshing, onRefresh } = useRefresh(query.refetch);
  const [dialog, setDialog] = useState<'status' | 'role' | 'manager' | null>(null);
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [managerId, setManagerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
      await Promise.all(['users', 'assignments', 'team'].map((k) => client.invalidateQueries({ queryKey: [k] })));
      await query.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const roles: Role[] = me.role === 'SUPER_ADMIN' ? ['EMPLOYEE', 'LINE_MANAGER', 'HR', 'SUPER_ADMIN'] : ['EMPLOYEE', 'LINE_MANAGER', 'HR'];

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Boundary query={query} skeleton={<SkeletonList count={2} height={130} />}>
        {(u) => {
          const self = u.id === me.id;
          const restricted = me.role === 'HR' && u.role === 'SUPER_ADMIN';
          return (
            <>
              <Card style={{ gap: 6 }} testID="user-detail">
                <Row>
                  <Avatar name={u.fullName} size={56} />
                  <T variant="heading" style={{ flex: 1 }}>{u.fullName}</T>
                  <Badge label={u.isActive ? 'Active' : 'Inactive'} tone={u.isActive ? 'success' : 'neutral'} />
                </Row>
                <T variant="small">{u.employeeId} · {roleLabels[u.role]}</T>
                <T variant="small">{u.email}</T>
                <T variant="small">{[u.designation, u.department].filter(Boolean).join(' · ') || 'No department'}</T>
                {u.role === 'EMPLOYEE' ? <T variant="small">Line Manager: {u.managerName ?? 'not assigned'}</T> : null}
                {u.role === 'LINE_MANAGER' ? <T variant="small">Team size: {u.teamSize}</T> : null}
                <T variant="caption">Joined {formatDate(u.createdAt)} · last sign-in {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'never'}</T>
              </Card>
              <Card style={{ gap: 4 }}>
                <T variant="subheading">Activity</T>
                <T variant="small">Check-ins: {u.activity.assessmentCount}{u.activity.lastAssessmentAt ? ` (last ${formatDate(u.activity.lastAssessmentAt)})` : ''}</T>
                <T variant="small">Surveys: {u.activity.surveyCount}{u.activity.lastSurveyAt ? ` (last ${formatDate(u.activity.lastSurveyAt)})` : ''}</T>
                <T variant="small">Requests: {u.activity.requestCount} ({u.activity.pendingRequestCount} pending)</T>
              </Card>

              {restricted ? <Banner tone="info" text="Only a Super Admin can change a Super Admin account." /> : null}
              {self ? <Banner tone="info" text="You cannot change your own status or role." /> : null}
              {!restricted && !self ? (
                <>
                  <Button title={u.isActive ? 'Deactivate account' : 'Activate account'} variant={u.isActive ? 'danger' : 'primary'} onPress={() => { setError(null); setDialog('status'); }} testID="user-status" />
                  <Button title="Change role" variant="secondary" onPress={() => { setError(null); setRole(u.role); setDialog('role'); }} testID="user-role" />
                  {u.role === 'EMPLOYEE' ? <Button title="Assign Line Manager" variant="secondary" onPress={() => { setError(null); setManagerId(u.managerId ? String(u.managerId) : ''); setDialog('manager'); }} testID="user-manager" /> : null}
                </>
              ) : null}

              <ConfirmDialog visible={dialog === 'status'} title={u.isActive ? 'Deactivate this account?' : 'Activate this account?'} message={u.isActive ? 'They will be signed out and unable to sign in.' : 'They will be able to sign in again.'} confirmLabel={u.isActive ? 'Deactivate' : 'Activate'} destructive={u.isActive} loading={busy} onCancel={() => setDialog(null)} onConfirm={() => run(() => userService.setStatus(u.id, !u.isActive))}>
                {error ? <Banner tone="danger" text={error} /> : null}
              </ConfirmDialog>

              <ConfirmDialog visible={dialog === 'role'} title="Change role" message="Changing the role ends current manager assignments and cancels upcoming meetings." confirmLabel="Change role" destructive loading={busy} onCancel={() => setDialog(null)} onConfirm={() => run(() => userService.setRole(u.id, role))}>
                <Chips<Role> value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: roleLabels[r] }))} />
                {error ? <Banner tone="danger" text={error} /> : null}
              </ConfirmDialog>

              <Sheet visible={dialog === 'manager'} onClose={() => setDialog(null)} title="Assign Line Manager">
                {managers.data?.length ? (
                  <Chips value={managerId} onChange={setManagerId} options={managers.data.filter((m) => m.isActive).map((m) => ({ value: String(m.id), label: m.fullName }))} />
                ) : (
                  <T variant="small">No Line Managers available.</T>
                )}
                {error ? <Banner tone="danger" text={error} /> : null}
                <Button title="Save assignment" disabled={!managerId} loading={busy} onPress={() => run(() => assignmentService.assign(u.id, Number(managerId)))} testID="user-manager-save" />
                {u.managerId ? <Button title="Remove assignment" variant="danger" loading={busy} onPress={() => run(() => assignmentService.remove(u.id))} /> : null}
              </Sheet>
            </>
          );
        }}
      </Boundary>
    </Screen>
  );
}

export default function UserDetail() {
  return (
    <RoleGate allow={['HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
