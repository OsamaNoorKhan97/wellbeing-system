import { useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';
import { useFetch } from '../../hooks/useFetch';
import { formatDateTime, humanize } from '../../lib/format';
import { auditService } from '../../services';

const toneFor = (action: string) =>
  /FAILED|DEACTIVATED|REJECTED|CANCELLED|UNASSIGNED/.test(action) ? 'red' : /SETTING|ROLE|CREATED|ASSIGNED|ACTIVATED/.test(action) ? 'violet' : /LOGIN|PASSWORD/.test(action) ? 'blue' : 'slate';

function describeDetails(details: Record<string, unknown>): string {
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== '');
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : '—';
}

export function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounce(search.trim());
  const { data, meta, error, reload } = useFetch(() => auditService.list({ page, pageSize: 20, action, search: query }), [page, action, query]);
  const actions = useFetch(() => auditService.actions(), []);

  return (
    <>
      <PageHeader title="Audit Log" description="A permanent record of sign-ins and of every change made by employees, Line Managers and HR." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-52 flex-1">
            <FiSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="input pl-9"
              placeholder="Search by person or action"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search audit log"
            />
          </div>
          <select
            className="input w-auto"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {(actions.data ?? []).map((item) => (
              <option key={item} value={item}>
                {humanize(item)}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <EmptyState title="No entries match these filters" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                    <td className="whitespace-nowrap">{entry.actorName ?? <span className="text-slate-400">Unknown</span>}</td>
                    <td>
                      <Badge tone={toneFor(entry.action)}>{humanize(entry.action)}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{entry.entityType ? `${humanize(entry.entityType)}${entry.entityId ? ` #${entry.entityId}` : ''}` : '—'}</td>
                    <td className="max-w-72 truncate text-xs text-slate-500" title={describeDetails(entry.details)}>
                      {describeDetails(entry.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>
    </>
  );
}
