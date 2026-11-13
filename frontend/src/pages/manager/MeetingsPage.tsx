import { useState } from 'react';
import { FiCalendar, FiCheck, FiEdit2, FiPlus, FiX } from 'react-icons/fi';
import { MeetingFormModal } from '../../components/MeetingFormModal';
import { Button, Card, EmptyState, ErrorState, Field, MeetingStatusBadge, Modal, PageHeader, PageLoader, Pagination, Tabs } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/format';
import { managerService, meetingService } from '../../services';
import type { Meeting } from '../../types';

export function MeetingsPage() {
  const toast = useToast();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const { data, meta, error, reload } = useFetch(() => meetingService.list({ scope, page, pageSize: 10 }), [scope, page]);
  const team = useFetch(() => managerService.team(), []);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [cancelling, setCancelling] = useState<Meeting | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const closeCancel = () => {
    setCancelling(null);
    setReason('');
  };

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await meetingService.cancel(cancelling.id, reason.trim());
      toast.success(`Meeting cancelled. ${cancelling.employeeName} has been notified.`);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
      closeCancel();
      reload();
    }
  };

  const complete = async (meeting: Meeting) => {
    try {
      await meetingService.complete(meeting.id);
      toast.success('Meeting marked as completed');
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
    reload();
  };

  const activeTeam = (team.data ?? []).filter((member) => member.isActive);
  return (
    <>
      <PageHeader
        title="Meeting Management"
        description="Schedule, update and cancel meetings with your team. Employees are notified of every change."
        actions={
          <Button onClick={() => setCreating(true)} icon={<FiPlus aria-hidden />} disabled={activeTeam.length === 0}>
            Schedule meeting
          </Button>
        }
      />
      <div className="mb-4">
        <Tabs
          value={scope}
          onChange={(value) => {
            setScope(value);
            setPage(1);
          }}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past and cancelled' },
          ]}
        />
      </div>

      <Card padded={false}>
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<FiCalendar className="h-5 w-5" />}
            title={scope === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'}
            description={scope === 'upcoming' ? 'Schedule a meeting here or from a discussion request.' : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date and time</th>
                  <th>Employee</th>
                  <th>Purpose</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((meeting) => (
                  <tr key={meeting.id}>
                    <td className="whitespace-nowrap">
                      <p className="font-medium text-ink">{formatDate(meeting.scheduledAt)}</p>
                      <p className="text-xs text-slate-500">
                        {formatTime(meeting.scheduledAt)} · {meeting.durationMinutes} min
                      </p>
                    </td>
                    <td className="whitespace-nowrap">
                      <p className="font-medium text-ink">{meeting.employeeName}</p>
                      <p className="text-xs text-slate-500">{meeting.employeeCode}</p>
                    </td>
                    <td className="max-w-64">
                      <p className="truncate" title={meeting.purpose ?? undefined}>{meeting.purpose || '—'}</p>
                      {meeting.requestId && <p className="text-xs text-slate-400">From a discussion request</p>}
                      {meeting.cancellationReason && <p className="truncate text-xs text-red-600" title={meeting.cancellationReason}>Cancelled: {meeting.cancellationReason}</p>}
                    </td>
                    <td className="whitespace-nowrap">{meeting.location || '—'}</td>
                    <td>
                      <MeetingStatusBadge status={meeting.status} />
                    </td>
                    <td>
                      {meeting.status === 'SCHEDULED' && (
                        <div className="flex justify-end gap-1.5">
                          {new Date(meeting.scheduledAt).getTime() < Date.now() && (
                            <Button size="sm" onClick={() => complete(meeting)} icon={<FiCheck aria-hidden />}>
                              Mark completed
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => setEditing(meeting)} icon={<FiEdit2 aria-hidden />}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(meeting)} icon={<FiX aria-hidden />}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>

      <MeetingFormModal
        open={creating}
        title="Schedule meeting"
        submitLabel="Schedule and notify"
        employees={activeTeam}
        onClose={() => setCreating(false)}
        onSubmit={async ({ employeeId, ...input }) => {
          await meetingService.create(employeeId!, input);
          toast.success('Meeting scheduled. The employee has been notified.');
          setCreating(false);
          setScope('upcoming');
          setPage(1);
          reload();
        }}
      />

      <MeetingFormModal
        open={editing !== null}
        title="Edit meeting"
        submitLabel="Save and notify"
        employeeName={editing?.employeeName}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={async ({ employeeId: _ignored, ...input }) => {
          await meetingService.update(editing!.id, input);
          toast.success(`Meeting updated. ${editing!.employeeName} has been notified.`);
          setEditing(null);
          reload();
        }}
      />

      <Modal
        open={cancelling !== null}
        title="Cancel meeting"
        onClose={closeCancel}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeCancel} disabled={busy}>
              Keep meeting
            </Button>
            <Button variant="danger" onClick={cancel} loading={busy}>
              Cancel meeting
            </Button>
          </>
        }
      >
        {cancelling && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Cancel the meeting with <span className="font-medium text-ink">{cancelling.employeeName}</span> on {formatDate(cancelling.scheduledAt)} at {formatTime(cancelling.scheduledAt)}?
              {cancelling.requestId ? ' Their discussion request will return to your pending list.' : ''}
            </p>
            <Field label="Reason" hint="Optional. Included in the notification to the employee.">
              {(props) => <textarea {...props} className="input min-h-20" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
