import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../src/api/client';
import { userService } from '../src/api/services';
import { RoleGate } from '../src/components/RoleGate';
import { Banner, Button, Chips, Input, Screen, T } from '../src/components/ui';
import { roleLabels } from '../src/lib/format';
import { useAuth } from '../src/store/auth';
import type { Role } from '../src/types';

function Inner() {
  const router = useRouter();
  const client = useQueryClient();
  const me = useAuth((s) => s.user!);
  const [form, setForm] = useState({ fullName: '', employeeId: '', email: '', department: '', designation: '', password: '' });
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const roles: Role[] = me.role === 'SUPER_ADMIN' ? ['EMPLOYEE', 'LINE_MANAGER', 'HR', 'SUPER_ADMIN'] : ['EMPLOYEE', 'LINE_MANAGER', 'HR'];

  const save = async () => {
    setErrors({});
    setServerError(null);
    const missing: Record<string, string> = {};
    if (form.fullName.trim().length < 2) missing.fullName = 'Enter a full name';
    if (!form.employeeId.trim()) missing.employeeId = 'Enter an Employee ID';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) missing.email = 'Enter a valid email address';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) missing.password = 'At least 8 characters with a letter and a number';
    if (Object.keys(missing).length) return setErrors(missing);
    setBusy(true);
    try {
      const input: Record<string, string> = { ...form, role };
      for (const k of ['department', 'designation'] as const) if (!input[k]) delete input[k];
      await userService.create(input);
      await client.invalidateQueries({ queryKey: ['users'] });
      router.back();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {serverError ? <Banner tone="danger" text={serverError} icon="alert-circle-outline" /> : null}
      <T variant="small">Role</T>
      <Chips<Role> value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: roleLabels[r] }))} />
      <Input label="Full name" value={form.fullName} onChangeText={set('fullName')} error={errors.fullName} autoCapitalize="words" testID="nu-name" />
      <Input label="Employee ID" value={form.employeeId} onChangeText={set('employeeId')} error={errors.employeeId} autoCapitalize="characters" testID="nu-id" />
      <Input label="Email" value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" testID="nu-email" />
      <Input label="Department (optional)" value={form.department} onChangeText={set('department')} error={errors.department} autoCapitalize="words" />
      <Input label="Designation (optional)" value={form.designation} onChangeText={set('designation')} error={errors.designation} autoCapitalize="words" />
      <Input label="Temporary password" secure value={form.password} onChangeText={set('password')} error={errors.password} testID="nu-password" />
      <Button title="Create user" onPress={save} loading={busy} testID="nu-save" />
    </Screen>
  );
}

export default function UserNew() {
  return (
    <RoleGate allow={['HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
