import { useState } from 'react';
import { FiUserCheck, FiUsers } from 'react-icons/fi';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, PageLoader } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { assignmentService, userService } from '../../services';

interface Person {
  id: number;
  fullName: string;
}

export function AssignmentsPage() {
  const toast = useToast();
  const overview = useFetch(() => assignmentService.overview(), []);
  const unassigned = useFetch(() => userService.list({ role: 'EMPLOYEE', status: 'active', assignment: 'unassigned', pageSize: 100 }), []);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [moving, setMoving] = useState<Record<number, string>>({});
  const [toRemove, setToRemove] = useState<Person | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const managers = (overview.data ?? []).filter((manager) => manager.isActive);
  const reload = () => {
    overview.reload();
    unassigned.reload();
  };

  const assign = async (employee: Person, managerId: string) => {
    if (!managerId) return;
    setBusyId(employee.id);
    try {
      await assignmentService.assign(employee.id, Number(managerId));
      const manager = managers.find((item) => item.id === Number(managerId));
      toast.success(`${employee.fullName} now reports to ${manager?.fullName ?? 'the selected manager'}.`);
      setChoice((current) => ({ ...current, [employee.id]: '' }));
      setMoving((current) => ({ ...current, [employee.id]: '' }));
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setBusyId(toRemove.id);
    try {
      await assignmentService.remove(toRemove.id);
      toast.success(`${toRemove.fullName} is no longer assigned to a Line Manager.`);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusyId(null);
      setToRemove(null);
      reload();
    }
  };

  const error = overview.error ?? unassigned.error;
  return (
    <>
      <PageHeader title="Employee–Manager Assignment" description="Each employee reports to one Line Manager, who receives their break and discussion requests." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !overview.data || !unassigned.data ? (
        <PageLoader />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card
            title="Unassigned employees"
            description="These employees cannot send requests yet"
            className="xl:col-span-1 xl:self-start"
            padded={false}
            actions={unassigned.data.length > 0 ? <Badge tone="amber">{unassigned.data.length}</Badge> : undefined}
          >
            {unassigned.data.length === 0 ? (
              <EmptyState icon={<FiUserCheck className="h-5 w-5" />} title="Everyone is assigned" description="All active employees have a Line Manager." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {unassigned.data.map((employee) => (
                  <li key={employee.id} className="space-y-2.5 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={employee.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{employee.fullName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {employee.employeeId} · {employee.department ?? 'No department'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="input"
                        value={choice[employee.id] ?? ''}
                        onChange={(e) => setChoice((current) => ({ ...current, [employee.id]: e.target.value }))}
                        aria-label={`Line Manager for ${employee.fullName}`}
                      >
                        <option value="">Select a Line Manager…</option>
                        {managers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.fullName} · {manager.department ?? '—'}
                          </option>
                        ))}
                      </select>
                      <Button disabled={!choice[employee.id]} loading={busyId === employee.id} onClick={() => assign(employee, choice[employee.id])}>
                        Assign
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-6 xl:col-span-2">
            {overview.data.length === 0 ? (
              <Card>
                <EmptyState icon={<FiUsers className="h-5 w-5" />} title="No Line Managers yet" description="Create a Line Manager account or change a user's role in User Management." />
              </Card>
            ) : (
              overview.data.map((manager) => (
                <Card
                  key={manager.id}
                  padded={false}
                  title={manager.fullName}
                  description={`${manager.employeeId} · ${manager.designation ?? 'Line Manager'} · ${manager.department ?? 'No department'}`}
                  actions={
                    <span className="flex items-center gap-2">
                      {!manager.isActive && <Badge tone="red">Deactivated</Badge>}
                      <Badge tone="brand">
                        {manager.team.length} employee{manager.team.length === 1 ? '' : 's'}
                      </Badge>
                    </span>
                  }
                >
                  {manager.team.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-500">No employees assigned.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {manager.team.map((employee) => (
                        <li key={employee.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                          <div className="flex min-w-48 flex-1 items-center gap-3">
                            <Avatar name={employee.fullName} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">{employee.fullName}</p>
                              <p className="truncate text-xs text-slate-500">
                                {employee.employeeId} · {employee.designation ?? '—'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              className="input w-44 py-1.5 text-xs"
                              value={moving[employee.id] ?? ''}
                              disabled={busyId === employee.id}
                              onChange={(e) => assign(employee, e.target.value)}
                              aria-label={`Move ${employee.fullName} to another Line Manager`}
                            >
                              <option value="">Move to…</option>
                              {managers
                                .filter((other) => other.id !== manager.id)
                                .map((other) => (
                                  <option key={other.id} value={other.id}>
                                    {other.fullName}
                                  </option>
                                ))}
                            </select>
                            <Button size="sm" variant="ghost" className="!text-red-600" onClick={() => setToRemove(employee)}>
                              Unassign
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toRemove !== null}
        title="Remove assignment?"
        message={`${toRemove?.fullName} will have no Line Manager and will not be able to send break or discussion requests until reassigned.`}
        confirmLabel="Unassign"
        danger
        loading={busyId !== null}
        onConfirm={remove}
        onCancel={() => setToRemove(null)}
      />
    </>
  );
}
