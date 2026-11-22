import { useState, type FormEvent } from 'react';
import { FiPlus, FiSearch } from 'react-icons/fi';
import { PasswordInput } from '../../components/PasswordInput';
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Pagination, inputClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, roleLabels, timeAgo } from '../../lib/format';
import { assignmentService, userService } from '../../services';
import type { Role, User, UserDetail } from '../../types';
import { validatePassword } from '../auth/RegisterPage';

const roles: Role[] = ['EMPLOYEE', 'LINE_MANAGER', 'HR', 'SUPER_ADMIN'];
const roleTones = { EMPLOYEE: 'slate', LINE_MANAGER: 'violet', HR: 'brand', SUPER_ADMIN: 'amber' } as const;

/** Only a Super Admin may create, promote or change Super Admin accounts; the API enforces the same rule. */
const rolesFor = (viewer: Role | undefined): Role[] => (viewer === 'SUPER_ADMIN' ? roles : roles.filter((role) => role !== 'SUPER_ADMIN'));

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { user: viewer } = useAuth();
  const empty = { fullName: '', employeeId: '', email: '', role: 'EMPLOYEE' as Role, department: '', designation: '', password: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needsJob = form.role === 'EMPLOYEE' || form.role === 'LINE_MANAGER';

  const bind = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
    className: inputClass(errors[key]),
  });

  const close = () => {
    setForm(empty);
    setErrors({});
    setFormError(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Full name is required';
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(form.employeeId.trim())) next.employeeId = 'Use 2–30 letters, numbers, hyphens or underscores';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (needsJob && form.department.trim().length < 2) next.department = 'Department is required';
    if (needsJob && form.designation.trim().length < 2) next.designation = 'Designation is required';
    const passwordError = validatePassword(form.password);
    if (passwordError) next.password = passwordError;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const { department, designation, ...rest } = form;
      await userService.create(needsJob ? form : rest);
      toast.success(`${form.fullName.trim()} was added as ${roleLabels[form.role]}.`);
      close();
      onCreated();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) setErrors(error.fieldErrors);
      else setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Add user"
      onClose={close}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="create-user-form" loading={saving}>
            Create user
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && (
          <div className="sm:col-span-2">
            <Alert tone="error">{formError}</Alert>
          </div>
        )}
        <Field label="Full name" error={errors.fullName} required>
          {(props) => <input {...props} {...bind('fullName')} />}
        </Field>
        <Field label="Role" required>
          {(props) => (
            <select {...props} {...bind('role')}>
              {rolesFor(viewer?.role).map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Employee ID" error={errors.employeeId} required>
          {(props) => <input {...props} {...bind('employeeId')} />}
        </Field>
        <Field label="Email address" error={errors.email} required>
          {(props) => <input {...props} {...bind('email')} type="email" />}
        </Field>
        {needsJob && (
          <>
            <Field label="Department" error={errors.department} required>
              {(props) => <input {...props} {...bind('department')} />}
            </Field>
            <Field label="Designation" error={errors.designation} required>
              {(props) => <input {...props} {...bind('designation')} />}
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <Field label="Initial password" error={errors.password} hint="Share it securely; the user can change it from their profile." required>
            {(props) => <PasswordInput {...props} {...bind('password')} autoComplete="new-password" />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function UserDetailModal({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { data, error } = useFetch<UserDetail | null>(() => (userId ? userService.get(userId) : Promise.resolve({ data: null })), [userId]);
  const rows: [string, string][] = data
    ? [
        ['Employee ID', data.employeeId],
        ['Email', data.email],
        ['Role', roleLabels[data.role]],
        ['Department', data.department ?? '—'],
        ['Designation', data.designation ?? '—'],
        ...(data.role === 'EMPLOYEE' ? ([['Line Manager', data.managerName ?? 'Not assigned']] as [string, string][]) : []),
        ...(data.role === 'LINE_MANAGER' ? ([['Team size', String(data.teamSize)]] as [string, string][]) : []),
        ['Status', data.isActive ? 'Active' : 'Deactivated'],
        ['Registered', formatDate(data.createdAt)],
        ['Last sign-in', formatDateTime(data.lastLoginAt)],
      ]
    : [];
  return (
    <Modal open={userId !== null} title="User details" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {error ? (
        <ErrorState message={error} />
      ) : !data || data.id !== userId ? (
        <PageLoader />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={data.fullName} />
            <p className="text-base font-semibold text-ink">{data.fullName}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="break-words text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          {data.role === 'EMPLOYEE' && (
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Participation</p>
              <dl className="grid grid-cols-3 gap-3 text-center text-sm">
                {[
                  ['Check-ins', data.activity.assessmentCount, timeAgo(data.activity.lastAssessmentAt)],
                  ['Surveys', data.activity.surveyCount, timeAgo(data.activity.lastSurveyAt)],
                  ['Requests', data.activity.requestCount, `${data.activity.pendingRequestCount} pending`],
                ].map(([label, count, note]) => (
                  <div key={label}>
                    <dd className="text-xl font-semibold text-ink tabular-nums">{count}</dd>
                    <dt className="text-slate-600">{label}</dt>
                    <p className="text-xs text-slate-400">{note}</p>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-500">Counts only. Individual ratings, answers and request details are not available to HR.</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('');
  const [page, setPage] = useState(1);
  const query = useDebounce(search.trim());
  const { data, meta, error, reload } = useFetch(() => userService.list({ page, pageSize: 10, search: query, role, status }), [page, query, role, status]);
  const managers = useFetch(() => userService.list({ role: 'LINE_MANAGER', status: 'active', pageSize: 100 }), []);

  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<Role>('EMPLOYEE');
  const [assignTarget, setAssignTarget] = useState<User | null>(null);
  const [managerId, setManagerId] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, success: string, done: () => void) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
      done();
      reload();
      managers.reload();
    }
  };

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="User Management"
        description="View, search and manage all accounts."
        actions={
          <Button onClick={() => setCreating(true)} icon={<FiPlus aria-hidden />}>
            Add user
          </Button>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-52 flex-1">
            <FiSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" placeholder="Search by name, email or Employee ID" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} aria-label="Search users" />
          </div>
          <select className="input w-auto" value={role} onChange={(e) => resetPage(setRole)(e.target.value as Role | '')} aria-label="Filter by role">
            <option value="">All roles</option>
            {roles.map((item) => (
              <option key={item} value={item}>
                {roleLabels[item]}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as 'active' | 'inactive' | '')} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>

        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <EmptyState title="No users match these filters" description="Try a different search term or clear the filters." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Employee ID</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Line Manager / Team</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((user) => {
                  const isSelf = user.id === me?.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={user.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium whitespace-nowrap text-ink">
                              {user.fullName}
                              {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                            </p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{user.employeeId}</td>
                      <td>
                        <Badge tone={roleTones[user.role]}>{roleLabels[user.role]}</Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        {user.department ?? '—'}
                        {user.designation && <p className="text-xs text-slate-500">{user.designation}</p>}
                      </td>
                      <td className="whitespace-nowrap">
                        {user.role === 'EMPLOYEE' ? (
                          user.managerName ?? <Badge tone="amber">Unassigned</Badge>
                        ) : user.role === 'LINE_MANAGER' ? (
                          `${user.teamSize} employee${user.teamSize === 1 ? '' : 's'}`
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <Badge tone={user.isActive ? 'green' : 'red'}>{user.isActive ? 'Active' : 'Deactivated'}</Badge>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewingId(user.id)}>
                            View
                          </Button>
                          {user.role === 'EMPLOYEE' && user.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setAssignTarget(user);
                                setManagerId(user.managerId ? String(user.managerId) : '');
                              }}
                            >
                              {user.managerId ? 'Reassign' : 'Assign'}
                            </Button>
                          )}
                          {!isSelf && (user.role !== 'SUPER_ADMIN' || me?.role === 'SUPER_ADMIN') && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRoleTarget(user);
                                  setNewRole(user.role);
                                }}
                              >
                                Role
                              </Button>
                              <Button size="sm" variant="ghost" className={user.isActive ? '!text-red-600' : '!text-emerald-700'} onClick={() => setStatusTarget(user)}>
                                {user.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>

      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={() => { reload(); managers.reload(); }} />
      <UserDetailModal userId={viewingId} onClose={() => setViewingId(null)} />

      <ConfirmDialog
        open={statusTarget !== null}
        title={statusTarget?.isActive ? 'Deactivate account?' : 'Activate account?'}
        message={
          statusTarget?.isActive
            ? `${statusTarget.fullName} will be signed out immediately and will not be able to sign in until the account is activated again. Their data is kept.`
            : `${statusTarget?.fullName} will be able to sign in again.`
        }
        confirmLabel={statusTarget?.isActive ? 'Deactivate' : 'Activate'}
        danger={statusTarget?.isActive}
        loading={busy}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() =>
          run(
            () => userService.setStatus(statusTarget!.id, !statusTarget!.isActive),
            `${statusTarget!.fullName} was ${statusTarget!.isActive ? 'deactivated' : 'activated'}.`,
            () => setStatusTarget(null),
          )
        }
      />

      <Modal
        open={roleTarget !== null}
        title="Change role"
        onClose={() => setRoleTarget(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={newRole === roleTarget?.role}
              onClick={() => run(() => userService.setRole(roleTarget!.id, newRole), `${roleTarget!.fullName} is now ${roleLabels[newRole]}.`, () => setRoleTarget(null))}
            >
              Change role
            </Button>
          </>
        }
      >
        {roleTarget && (
          <div className="space-y-4">
            <Field label={`Role for ${roleTarget.fullName}`}>
              {(props) => (
                <select {...props} className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                  {rolesFor(me?.role).map((item) => (
                    <option key={item} value={item}>
                      {roleLabels[item]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {newRole !== roleTarget.role && (
              <Alert tone="warning">
                Changing the role takes effect immediately. Current manager assignments involving {roleTarget.fullName} will end and their upcoming meetings will be cancelled.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={assignTarget !== null}
        title="Assign Line Manager"
        onClose={() => setAssignTarget(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!managerId || Number(managerId) === assignTarget?.managerId}
              onClick={() => run(() => assignmentService.assign(assignTarget!.id, Number(managerId)), `Line Manager assigned to ${assignTarget!.fullName}.`, () => setAssignTarget(null))}
            >
              Save assignment
            </Button>
          </>
        }
      >
        {assignTarget && (
          <Field label={`Line Manager for ${assignTarget.fullName}`} hint="Pending requests move to the new manager.">
            {(props) => (
              <select {...props} className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Select a Line Manager…</option>
                {(managers.data ?? []).map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName} · {manager.department ?? 'No department'} ({manager.teamSize})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </Modal>
    </>
  );
}
