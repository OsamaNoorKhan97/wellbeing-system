import { useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiEye } from 'react-icons/fi';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Pagination, RequestStatusBadge, Tabs } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { alertStatusLabels, formatDate, formatDateTime, roleLabels, timeAgo } from '../../lib/format';
import { alertService, type AlertFilter } from '../../services';
import type { AlertStatus, WellbeingAlert } from '../../types';

const statusTones = { ACTIVE: 'red', ACKNOWLEDGED: 'amber', RESOLVED: 'green' } as const;
const StatusBadge = ({ status }: { status: AlertStatus }) => <Badge tone={statusTones[status]}>{alertStatusLabels[status]}</Badge>;

function AlertDetailModal({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, error, reload } = useFetch(() => (id ? alertService.get(id) : Promise.reject(new Error('No alert selected'))), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'acknowledge' | 'resolve' | 'comment' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    setNote('');
    setFormError(null);
    onClose();
  };

  const act = async (kind: 'acknowledge' | 'resolve' | 'comment') => {
    setFormError(null);
    if (kind === 'comment' && !note.trim()) {
      setFormError('Write a comment first.');
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'acknowledge') await alertService.acknowledge(id!, note.trim());
      else if (kind === 'resolve') await alertService.resolve(id!, note.trim());
      else await alertService.comment(id!, note.trim());
      toast.success(kind === 'acknowledge' ? 'Alert acknowledged.' : kind === 'resolve' ? 'Alert marked as resolved.' : 'Comment added.');
      setNote('');
      reload();
      onChanged();
    } catch (caught) {
      setFormError(errorMessage(caught));
      reload();
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const alert = data && data.id === id ? data : null;
  const open = alert && alert.status !== 'RESOLVED';
  return (
    <Modal
      open={id !== null}
      title="Well-being alert"
      onClose={close}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          {open && (
            <Button variant="secondary" onClick={() => act('comment')} loading={busy === 'comment'} disabled={busy !== null && busy !== 'comment'}>
              Add comment
            </Button>
          )}
          {alert?.status === 'ACTIVE' && (
            <Button variant="secondary" icon={<FiEye aria-hidden />} onClick={() => act('acknowledge')} loading={busy === 'acknowledge'} disabled={busy !== null && busy !== 'acknowledge'}>
              Acknowledge
            </Button>
          )}
          {open && (
            <Button icon={<FiCheckCircle aria-hidden />} onClick={() => act('resolve')} loading={busy === 'resolve'} disabled={busy !== null && busy !== 'resolve'}>
              Mark resolved
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !alert ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">{alert.employeeName}</p>
              <p className="text-sm text-slate-500">
                {alert.employeeCode} · {alert.department ?? 'No department'}
              </p>
            </div>
            <StatusBadge status={alert.status} />
          </div>

          <Alert tone="warning">
            This employee submitted {alert.assessmentCount} consecutive well-being assessments indicating potentially poor well-being. Please review the alert and consider providing appropriate support.
          </Alert>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Alert type', 'Consecutive poor well-being assessments'],
              ['Alert created', formatDateTime(alert.triggeredAt)],
              ['Assessment dates', alert.assessmentDates.map((d) => formatDateTime(d)).join(' → ')],
              ['Line Manager', alert.managerName ?? 'None assigned'],
              ['Acknowledged', alert.acknowledgedAt ? `${formatDateTime(alert.acknowledgedAt)} by ${alert.acknowledgedByName ?? 'unknown'}` : 'Not yet'],
              ['Resolved', alert.resolvedAt ? `${formatDateTime(alert.resolvedAt)} by ${alert.resolvedByName ?? 'unknown'}` : 'Not yet'],
            ].map(([label, text]) => (
              <div key={label} className={label === 'Assessment dates' ? 'sm:col-span-2' : ''}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="font-medium text-ink">{text}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Break recommendation</dt>
              <dd className="font-medium text-ink">
                {alert.breakRequest ? (
                  <span className="inline-flex items-center gap-2">
                    The employee requested a break <RequestStatusBadge status={alert.breakRequest.status} />
                  </span>
                ) : (
                  'The employee has been recommended to take a break and has not requested one yet'
                )}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">Individual ratings are private to the employee and are not shown here.</p>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Follow-up comments</h3>
            {alert.comments.length === 0 ? (
              <p className="text-sm text-slate-500">No comments yet.</p>
            ) : (
              <ul className="space-y-3">
                {alert.comments.map((comment) => (
                  <li key={comment.id} className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <p className="whitespace-pre-wrap text-slate-700">{comment.comment}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {comment.authorName ?? 'Unknown'}
                      {comment.authorRole ? ` (${roleLabels[comment.authorRole]})` : ''} · {formatDateTime(comment.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {open && (
            <Field label="Add a follow-up comment" hint="Optional with Acknowledge or Mark resolved. Visible to the Line Manager, HR and Super Admin." error={formError ?? undefined}>
              {(props) => <textarea {...props} className="input min-h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: spoke with the employee, adjusted workload, offered a break." />}
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

export function AlertsPage() {
  const [status, setStatus] = useState<Extract<AlertFilter, 'open' | 'RESOLVED' | 'all'>>('open');
  const [page, setPage] = useState(1);
  const { data, meta, error, reload } = useFetch(() => alertService.list({ status, page, pageSize: 10 }), [status, page]);
  const [selected, setSelected] = useState<number | null>(null);

  const open = (alert: WellbeingAlert) => setSelected(alert.id);
  return (
    <>
      <PageHeader title="Employee Well-Being Alerts" description="Raised automatically when an employee submits consecutive check-ins that indicate poor well-being. Each alert is created once." />
      <div className="mb-4">
        <Tabs
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: 'open', label: 'Active alerts' },
            { value: 'RESOLVED', label: 'Resolved' },
            { value: 'all', label: 'All' },
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
          <EmptyState icon={<FiAlertTriangle className="h-5 w-5" />} title={status === 'open' ? 'No active alerts' : 'No alerts to show'} description="Alerts appear here when an employee submits consecutive poor check-ins." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Assessment dates</th>
                  <th>Raised</th>
                  <th>Status</th>
                  <th>Break</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((alert) => (
                  <tr key={alert.id}>
                    <td className="whitespace-nowrap">
                      <p className="font-medium text-ink">{alert.employeeName}</p>
                      <p className="text-xs text-slate-500">{alert.employeeCode}</p>
                    </td>
                    <td className="whitespace-nowrap">{alert.department ?? '—'}</td>
                    <td className="text-sm whitespace-nowrap text-slate-600">{alert.assessmentDates.map((d) => formatDate(d)).join(' → ')}</td>
                    <td className="whitespace-nowrap" title={formatDateTime(alert.triggeredAt)}>
                      {timeAgo(alert.triggeredAt)}
                    </td>
                    <td>
                      <StatusBadge status={alert.status} />
                      {alert.commentCount > 0 && <p className="mt-0.5 text-xs text-slate-400">{alert.commentCount} comment{alert.commentCount === 1 ? '' : 's'}</p>}
                    </td>
                    <td>{alert.breakRequest ? <RequestStatusBadge status={alert.breakRequest.status} /> : <span className="text-slate-400">—</span>}</td>
                    <td>
                      <div className="flex justify-end">
                        <Button size="sm" variant={alert.status === 'RESOLVED' ? 'ghost' : 'secondary'} onClick={() => open(alert)}>
                          {alert.status === 'ACTIVE' ? 'Review' : 'View details'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>

      <AlertDetailModal id={selected} onClose={() => setSelected(null)} onChanged={reload} />
    </>
  );
}
