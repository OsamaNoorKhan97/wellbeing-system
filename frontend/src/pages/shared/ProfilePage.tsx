import { useState, type FormEvent } from 'react';
import { PasswordInput } from '../../components/PasswordInput';
import { Avatar, Badge, Button, Card, Field, PageHeader, inputClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, errorMessage, tokenStore } from '../../lib/api';
import { formatDate, formatDateTime, roleLabels } from '../../lib/format';
import { authService } from '../../services';
import { validatePassword } from '../auth/RegisterPage';

function DetailsForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: user?.fullName ?? '', department: user?.department ?? '', designation: user?.designation ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const hasJobFields = user.role !== 'HR_ADMIN';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Full name is required';
    if (hasJobFields && form.department.trim().length < 2) next.department = 'Department is required';
    if (hasJobFields && form.designation.trim().length < 2) next.designation = 'Designation is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      const payload = hasJobFields ? form : { fullName: form.fullName };
      setUser((await authService.updateProfile(payload)).data);
      toast.success('Profile updated');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.fieldErrors);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const bind = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
    className: inputClass(errors[key]),
  });

  return (
    <Card title="Personal details">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Full name" error={errors.fullName}>
          {(props) => <input {...props} {...bind('fullName')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" hint="Contact HR to change your email">
            {(props) => <input {...props} className="input" value={user.email} disabled />}
          </Field>
          <Field label="Employee ID">{(props) => <input {...props} className="input" value={user.employeeId} disabled />}</Field>
          {hasJobFields && (
            <>
              <Field label="Department" error={errors.department}>
                {(props) => <input {...props} {...bind('department')} />}
              </Field>
              <Field label="Designation" error={errors.designation}>
                {(props) => <input {...props} {...bind('designation')} />}
              </Field>
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const empty = { currentPassword: '', password: '', confirmPassword: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.currentPassword) next.currentPassword = 'Enter your current password';
    const passwordError = validatePassword(form.password);
    if (passwordError) next.password = passwordError;
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      const { data } = await authService.changePassword(form);
      tokenStore.replace(data.token);
      setForm(empty);
      toast.success('Password changed. Other devices have been signed out.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.fieldErrors);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const bind = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
    className: inputClass(errors[key]),
  });

  return (
    <Card title="Change password">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Current password" error={errors.currentPassword}>
          {(props) => <PasswordInput {...props} {...bind('currentPassword')} autoComplete="current-password" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" error={errors.password} hint="At least 8 characters, with a letter and a number">
            {(props) => <PasswordInput {...props} {...bind('password')} autoComplete="new-password" />}
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword}>
            {(props) => <PasswordInput {...props} {...bind('confirmPassword')} autoComplete="new-password" />}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  const facts: [string, string][] = [
    ['Role', roleLabels[user.role]],
    ...(user.role === 'EMPLOYEE' ? ([['Line Manager', user.managerName ?? 'Not assigned yet']] as [string, string][]) : []),
    ...(user.role === 'LINE_MANAGER' ? ([['Team size', String(user.teamSize)]] as [string, string][]) : []),
    ['Member since', formatDate(user.createdAt)],
    ['Last sign-in', formatDateTime(user.lastLoginAt)],
  ];
  return (
    <>
      <PageHeader title="Profile" description="Your account details and password." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 lg:self-start">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{user.fullName}</p>
              <p className="truncate text-sm text-slate-500">{user.designation ?? roleLabels[user.role]}</p>
            </div>
          </div>
          <div className="mt-3">
            <Badge tone="brand">{user.employeeId}</Badge>
          </div>
          <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <DetailsForm />
          <PasswordForm />
        </div>
      </div>
    </>
  );
}
