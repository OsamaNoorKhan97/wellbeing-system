import { useState } from 'react';
import { FiCalendar, FiCheck, FiEye, FiX } from 'react-icons/fi';
import { MeetingFormModal } from '../../components/MeetingFormModal';
import { RequestOutcome, RequestTypeLabel } from '../../components/RequestBits';
import { Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Pagination, RequestStatusBadge, Tabs } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import { requestService } from '../../services';
import type { RequestType, SupportRequest } from '../../types';

type Decision = { request: SupportRequest; approve: boolean };

export function RequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [type, setType] = useState<RequestType | ''>('');
  const [page, setPage] = useState(1);
  const { data, meta, error, reload } = useFetch(
    () => requestService.list({ page, pageSize: 10, status: tab === 'pending' ? 'PENDING' : undefined, type: type || undefined }),
    [page, tab, type],
  );

  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [scheduling, setScheduling] = useState<SupportRequest | null>(null);
  const [viewing, setViewing] = useState<SupportRequest | null>(null);

  const closeDecision = () => {
    setDecision(null);
    setComment('');
  };

  const decide = async () => {
    if (!decision) return;
    setDeciding(true);
    try {
      await (decision.approve ? requestService.approve : requestService.reject)(decision.request.id, comment.trim());
      toast.success(`Break request ${decision.approve ? 'approved' : 'rejected'}. ${decision.request.employeeName} has been notified.`);
      closeDecision();
    } catch (caught) {
      toast.error(errorMessage(caught));
      closeDecision();
    } finally {
      setDeciding(false);
      reload();
    }
  };

  const actions = (request: SupportRequest) => (
    <div className="flex justify-end gap-1.5">
      {request.status === 'PENDING' && request.type === 'BREAK' && (
        <>
          <Button size="sm" onClick={() => setDecision({ request, approve: true })} icon={<FiCheck aria-hidden />}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDecision({ request, approve: false })} icon={<FiX aria-hidden />}>
            Reject
          </Button>
        </>
      )}
      {request.status === 'PENDING' && request.type === 'DISCUSSION' && (
        <Button size="sm" onClick={() => setScheduling(request)} icon={<FiCalendar aria-hidden />}>
          Schedule meeting
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setViewing(request)} icon={<FiEye aria-hidden />} aria-label={`View request from ${request.employeeName}`}>
        View
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Employee Requests" description="Respond to break requests and schedule meetings for discussion requests." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value);
            setPage(1);
          }}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'all', label: 'All requests' },
          ]}
        />
        <select
          className="input w-auto"
          value={type}
          onChange={(e) => {
            setType(e.target.value as RequestType | '');
            setPage(1);
          }}
          aria-label="Filter by request type"
        >
          <option value="">All types</option>
          <option value="BREAK">Break requests</option>
          <option value="DISCUSSION">Discussion requests</option>
        </select>
      </div>

      <Card padded={false}>
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <EmptyState title={tab === 'pending' ? 'No pending requests' : 'No requests found'} description={tab === 'pending' ? 'You are all caught up.' : 'Requests from your team will be listed here.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th>Outcome</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <p className="font-medium whitespace-nowrap text-ink">{request.employeeName}</p>
                      <p className="text-xs text-slate-500">
                        {request.employeeCode}
                        {request.employeeDepartment ? ` · ${request.employeeDepartment}` : ''}
                      </p>
                    </td>
                    <td>
                      <RequestTypeLabel type={request.type} />
                      {request.reason && <p className="mt-1 max-w-56 truncate text-xs text-slate-500" title={request.reason}>{request.reason}</p>}
                    </td>
                    <td className="whitespace-nowrap" title={formatDateTime(request.createdAt)}>{timeAgo(request.createdAt)}</td>
                    <td>
                      <RequestStatusBadge status={request.status} />
                    </td>
                    <td>
                      <RequestOutcome request={request} />
                    </td>
                    <td>{actions(request)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>

      <Modal
        open={decision !== null}
        title={decision?.approve ? 'Approve break request' : 'Reject break request'}
        onClose={closeDecision}
        footer={
          <>
            <Button variant="secondary" onClick={closeDecision} disabled={deciding}>
              Cancel
            </Button>
            <Button variant={decision?.approve ? 'primary' : 'danger'} onClick={decide} loading={deciding}>
              {decision?.approve ? 'Approve request' : 'Reject request'}
            </Button>
          </>
        }
      >
        {decision && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-ink">{decision.request.employeeName}</span> requested a break {timeAgo(decision.request.createdAt).toLowerCase()}.
            </p>
            {decision.request.reason && <blockquote className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">“{decision.request.reason}”</blockquote>}
            <Field label="Comment" hint="Optional. Included in the notification to the employee.">
              {(props) => <textarea {...props} className="input min-h-20" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />}
            </Field>
          </div>
        )}
      </Modal>

      <MeetingFormModal
        open={scheduling !== null}
        title="Schedule meeting"
        submitLabel="Schedule and notify"
        employeeName={scheduling?.employeeName}
        initial={{ purpose: scheduling?.reason ?? '' }}
        onClose={() => setScheduling(null)}
        onSubmit={async (values) => {
          await requestService.schedule(scheduling!.id, values);
          toast.success(`Meeting scheduled. ${scheduling!.employeeName} has been notified.`);
          setScheduling(null);
          reload();
        }}
      />

      <Modal open={viewing !== null} title="Request details" onClose={() => setViewing(null)} footer={<Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>}>
        {viewing && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-slate-500">Employee</dt>
            <dd className="font-medium text-ink">
              {viewing.employeeName} ({viewing.employeeCode})
            </dd>
            <dt className="text-slate-500">Type</dt>
            <dd>
              <RequestTypeLabel type={viewing.type} />
            </dd>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <RequestStatusBadge status={viewing.status} />
            </dd>
            <dt className="text-slate-500">Requested</dt>
            <dd>{formatDateTime(viewing.createdAt)}</dd>
            <dt className="text-slate-500">Employee's note</dt>
            <dd className="break-words">{viewing.reason || '—'}</dd>
            {viewing.managerComment && (
              <>
                <dt className="text-slate-500">Your comment</dt>
                <dd className="break-words">{viewing.managerComment}</dd>
              </>
            )}
            {viewing.meetingAt && (
              <>
                <dt className="text-slate-500">Meeting</dt>
                <dd>
                  {formatDateTime(viewing.meetingAt)} · {viewing.meetingDurationMinutes} min
                  {viewing.meetingLocation ? ` · ${viewing.meetingLocation}` : ''}
                  {viewing.meetingPurpose && <span className="block text-slate-500">{viewing.meetingPurpose}</span>}
                </dd>
              </>
            )}
            {viewing.resolvedAt && (
              <>
                <dt className="text-slate-500">Handled</dt>
                <dd>{formatDateTime(viewing.resolvedAt)}</dd>
              </>
            )}
          </dl>
        )}
      </Modal>
    </>
  );
}
