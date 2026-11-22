import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { authService } from '../../src/api/services';
import { Avatar, Badge, Banner, Button, Card, ConfirmDialog, Input, Row, Screen, T } from '../../src/components/ui';
import { colors } from '../../src/constants/theme';
import { formatDate, roleLabels } from '../../src/lib/format';
import { getPermissionState, registerForPush } from '../../src/notifications/push';
import { useAuth } from '../../src/store/auth';

export default function Profile() {
  const router = useRouter();
  const user = useAuth((s) => s.user)!;
  const refreshUser = useAuth((s) => s.refreshUser);
  const logout = useAuth((s) => s.logout);
  const pushToken = useAuth((s) => s.pushToken);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.fullName);
  const [department, setDepartment] = useState(user.department ?? '');
  const [designation, setDesignation] = useState(user.designation ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [perm, setPerm] = useState<string>('…');

  useEffect(() => {
    void getPermissionState().then(setPerm);
  }, [pushToken]);

  // Employees cannot change organisational details (department, designation); HR and Super Admin can.
  const canEditOrg = user.role !== 'EMPLOYEE';

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await authService.updateProfile({ fullName: name.trim(), ...(canEditOrg ? { department: department.trim(), designation: designation.trim() } : {}) });
      await refreshUser();
      setEditing(false);
      setMsg({ tone: 'success', text: 'Profile updated.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const enablePush = async () => {
    const r = await registerForPush();
    setMsg(
      r.ok
        ? { tone: 'success', text: 'Push notifications are on for this device.' }
        : { tone: 'danger', text: r.reason === 'permission-denied' ? 'Notifications are blocked. Turn them on in your phone settings.' : r.reason === 'unsupported' ? 'Push notifications need a physical phone.' : r.reason === 'no-project-id' ? 'This build has no Expo project id yet (see the README).' : r.detail ?? 'Could not enable notifications.' },
    );
    setPerm(await getPermissionState());
  };

  return (
    <Screen>
      {msg ? <Banner tone={msg.tone} text={msg.text} /> : null}
      <Card style={{ alignItems: 'center', gap: 6 }} testID="profile-card">
        <Avatar name={user.fullName} size={72} />
        <T variant="heading">{user.fullName}</T>
        <Badge label={roleLabels[user.role]} tone="info" />
        <T variant="small">{user.email}</T>
      </Card>

      <Card style={{ gap: 6 }}>
        <T variant="subheading">Details</T>
        {editing ? (
          <>
            <Input label="Full name" value={name} onChangeText={setName} autoCapitalize="words" testID="profile-name" />
            {canEditOrg ? (
              <>
                <Input label="Department" value={department} onChangeText={setDepartment} autoCapitalize="words" />
                <Input label="Designation" value={designation} onChangeText={setDesignation} autoCapitalize="words" />
              </>
            ) : null}
            <Row>
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              <Button title="Save" onPress={save} loading={busy} style={{ flex: 1 }} testID="profile-save" />
            </Row>
          </>
        ) : (
          <>
            <T variant="small">Employee ID: {user.employeeId}</T>
            <T variant="small">Department: {user.department ?? '—'}</T>
            <T variant="small">Designation: {user.designation ?? '—'}</T>
            {user.role === 'EMPLOYEE' ? <T variant="small">Line Manager: {user.managerName ?? 'not assigned'}</T> : null}
            {user.role === 'LINE_MANAGER' ? <T variant="small">Team size: {user.teamSize}</T> : null}
            <T variant="caption">Member since {formatDate(user.createdAt)}</T>
            <Button title="Edit profile" variant="secondary" icon="create-outline" onPress={() => { setName(user.fullName); setDepartment(user.department ?? ''); setDesignation(user.designation ?? ''); setEditing(true); }} testID="profile-edit" />
            {!canEditOrg ? <T variant="caption">Department, designation and Line Manager are set by HR.</T> : null}
          </>
        )}
      </Card>

      <Card style={{ gap: 8 }}>
        <T variant="subheading">Notifications</T>
        <T variant="small">Push notifications: {Platform.OS === 'web' ? 'not available in the browser' : perm === 'granted' ? (pushToken ? 'on for this device' : 'allowed (registering…)') : perm === 'denied' ? 'blocked in phone settings' : 'not enabled'}</T>
        {Platform.OS !== 'web' && perm !== 'granted' ? <Button title="Enable push notifications" variant="secondary" icon="notifications-outline" onPress={enablePush} /> : null}
        <T variant="caption">Lock-screen messages never include names, scores or request text.</T>
      </Card>

      <Card onPress={() => router.push('/change-password' as never)} testID="profile-password">
        <Row><Ionicons name="lock-closed-outline" size={22} color={colors.primary} /><T variant="body" style={{ flex: 1, fontWeight: '700' }}>Change password</T><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Row>
      </Card>

      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={() => setConfirmOut(true)} testID="logout" />
      <ConfirmDialog visible={confirmOut} title="Sign out?" message="You will need to sign in again on this device." confirmLabel="Sign out" destructive onCancel={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); void logout(); }} />
    </Screen>
  );
}
