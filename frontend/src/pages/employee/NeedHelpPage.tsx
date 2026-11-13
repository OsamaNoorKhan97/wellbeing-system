import { useEffect, useState, type ReactNode } from 'react';
import { FiCalendar, FiCoffee, FiMessageSquare } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { MeetingItem, RequestOutcome, RequestTypeLabel } from '../../components/RequestBits';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Pagination, RequestStatusBadge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { authService, meetingService, requestService } from '../../services';
import type { RequestType, SupportRequest } from '../../types';

const options: Record<RequestType, { title: string; text: string; icon: ReactNode; accent: string; button: string; placeholder: string }> = {
  BREAK: {
    title: 'Take a Break',
    text: 'Feeling overloaded? Ask your Line Manager for a short break. You will be notified as soon as they respond.',
    icon: <FiCoffee />,
    accent: 'bg-amber-50 text-amber-600',
    button: 'Request a break',
    placeholder: 'Optional: add a short note for your Line Manager',
  },
  DISCUSSION: {
    title: 'Discussion with Line Manager',
    text: 'Want to talk something through? Request a one-to-one and your Line Manager will schedule a meeting with you.',
    icon: <FiMessageSquare />,
    accent: 'bg-sky-50 text-sky-600',
    button: 'Request a discussion',
    placeholder: 'Optional: what would you like to talk about?',
  },
};

export function NeedHelpPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const requests = useFetch(() => requestService.list({ page, pageSize: 8 }), [page]);
  const meetings = useFetch(() => meetingService.list({ scope: 'upcoming', pageSize: 20 }), []);

  const [dialog, setDialog] = useState<RequestType | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toCancel, setToCancel] = useState<SupportRequest | null>(null);
  const hasManager = Boolean(user?.managerId);

  // HR may have assigned or changed the Line Manager since sign-in.
  useEffect(() => {
    authService.me().then((response) => setUser(response.data)).catch(() => undefined);
  }, [setUser]);

  // Dashboard quick actions link here with ?action=break or ?action=discussion to open the form directly.
  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    if (!action) return;
    if (hasManager) setDialog(action === 'discussion' ? 'DISCUSSION' : 'BREAK');
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, hasManager, navigate]);

  const close = () => {
    setDialog(null);
    setReason('');
  };

  const submit = async () => {
    if (!dialog) return;
    setSubmitting(true);
    try {
      await requestService.create(dialog, reason.trim());
      toast.success(`${dialog === 'BREAK' ? 'Break' : 'Discussion'} request sent to ${user?.managerName ?? 'your Line Manager'}.`);
      close();
      setPage(1);
      requests.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!toCancel) return;
    setSubmitting(true);
    try {
      await requestService.cancel(toCancel.id);
      toast.success('Request withdrawn');
      requests.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
      setToCancel(null);
    }
  };

  return (
    <>
      <PageHeader title="Need Help" description={hasManager ? `Your requests go to your Line Manager, ${user?.managerName}.` : 'Ask your Line Manager for support.'} />

      {!hasManager && (
        <div className="mb-6">
          <Alert tone="warning">You do not have a Line Manager assigned yet, so requests cannot be routed. Please contact HR.</Alert>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(options) as RequestType[]).map((type) => (
          <div key={type} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <span className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl ${options[type].accent}`} aria-hidden>
              {options[type].icon}
            </span>
            <h2 className="mt-4 text-lg font-semibold">{options[type].title}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">{options[type].text}</p>
            <Button className="mt-5 self-start" onClick={() => setDialog(type)} disabled={!hasManager}>
              {options[type].button}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card title="My requests" description="Track the status of your requests" className="lg:col-span-2" padded={false}>
          {requests.error ? (
            <div className="p-5">
              <ErrorState message={requests.error} onRetry={requests.reload} />
            </div>
          ) : !requests.data ? (
            <PageLoader />
          ) : requests.data.length === 0 ? (
            <EmptyState title="No requests yet" description="When you request a break or a discussion, you can follow its progress here." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
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
                  {requests.data.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <RequestTypeLabel type={request.type} />
                        {request.reason && <p className="mt-1 max-w-xs truncate text-xs text-slate-500" title={request.reason}>{request.reason}</p>}
                      </td>
                      <td className="whitespace-nowrap">{formatDateTime(request.createdAt)}</td>
                      <td>
                        <RequestStatusBadge status={request.status} />
                      </td>
                      <td>
                        <RequestOutcome request={request} />
                      </td>
                      <td className="text-right">
                        {request.status === 'PENDING' && (
                          <Button variant="ghost" size="sm" onClick={() => setToCancel(request)}>
                            Withdraw
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination meta={requests.meta} onPageChange={setPage} />
        </Card>

        <Card title="Upcoming meetings">
          {meetings.error ? (
            <ErrorState message={meetings.error} onRetry={meetings.reload} />
          ) : !meetings.data ? (
            <PageLoader />
          ) : meetings.data.length === 0 ? (
            <EmptyState icon={<FiCalendar className="h-5 w-5" />} title="No upcoming meetings" description="Meetings scheduled by your Line Manager will appear here." />
          ) : (
            <ul className="space-y-4">
              {meetings.data.map((meeting) => (
                <li key={meeting.id}>
                  <MeetingItem meeting={meeting} counterpart="manager" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={dialog !== null}
        title={dialog ? options[dialog].title : ''}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting}>
              Send request
            </Button>
          </>
        }
      >
        {dialog && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Your request will be sent to <span className="font-medium text-ink">{user?.managerName}</span> with the status <strong>Pending</strong>.
            </p>
            <Field label="Note" hint={`${reason.length}/1000 characters. Visible to you and your Line Manager only.`}>
              {(props) => <textarea {...props} className="input min-h-24" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={options[dialog].placeholder} />}
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toCancel !== null}
        title="Withdraw this request?"
        message="Your Line Manager will be told that you no longer need it."
        confirmLabel="Withdraw request"
        danger
        loading={submitting}
        onConfirm={cancel}
        onCancel={() => setToCancel(null)}
      />
    </>
  );
}
