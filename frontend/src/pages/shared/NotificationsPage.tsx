import { useState } from 'react';
import { FiBell, FiCheck } from 'react-icons/fi';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../components/layout/AppLayout';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Tabs } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import { notificationService } from '../../services';

export function NotificationsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch(() => notificationService.list({ page, pageSize: 10, unreadOnly: filter === 'unread' }), [page, filter]);

  const changed = () => {
    reload();
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  };
  const markRead = (id: number) => notificationService.markRead(id).then(changed).catch((e) => toast.error(errorMessage(e)));
  const markAll = () =>
    notificationService
      .markAllRead()
      .then(() => {
        toast.success('All notifications marked as read');
        changed();
      })
      .catch((e) => toast.error(errorMessage(e)));

  const unread = meta?.unread ?? 0;
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}.` : 'You are all caught up.'}
        actions={
          <Button variant="secondary" onClick={markAll} disabled={unread === 0} icon={<FiCheck aria-hidden />}>
            Mark all as read
          </Button>
        }
      />
      <div className="mb-4">
        <Tabs
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread', count: unread },
          ]}
        />
      </div>
      <Card padded={false}>
        {loading && !data ? (
          <PageLoader />
        ) : error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<FiBell className="h-5 w-5" />} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} description="Updates about requests and meetings will appear here." />
        ) : (
          <ul>
            {data.map((item) => (
              <li key={item.id} className={`flex gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 ${item.isRead ? '' : 'bg-brand-50/40'}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.isRead ? 'bg-slate-200' : 'bg-brand-600'}`} aria-label={item.isRead ? 'Read' : 'Unread'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className={`text-sm ${item.isRead ? 'font-medium text-slate-700' : 'font-semibold text-ink'}`}>{item.title}</p>
                    <time className="text-xs text-slate-400" dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                      {timeAgo(item.createdAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 text-sm break-words text-slate-600">{item.message}</p>
                  {item.relatedUserName && <p className="mt-1 text-xs text-slate-400">From {item.relatedUserName}</p>}
                </div>
                {!item.isRead && (
                  <Button variant="ghost" size="sm" onClick={() => markRead(item.id)} className="self-start">
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>
    </>
  );
}
