import { useState } from 'react';
import { FiSearch, FiUsers } from 'react-icons/fi';
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, PageLoader } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';
import { useFetch } from '../../hooks/useFetch';
import { formatDate, timeAgo } from '../../lib/format';
import { managerService } from '../../services';
import type { TeamMember } from '../../types';

function activityBadge(member: TeamMember) {
  if (!member.isActive) return <Badge tone="red">Account deactivated</Badge>;
  if (!member.lastActiveAt) return <Badge tone="slate">No activity yet</Badge>;
  const days = (Date.now() - new Date(member.lastActiveAt).getTime()) / 86_400_000;
  if (days < 1) return <Badge tone="green">Active today</Badge>;
  if (days < 7) return <Badge tone="blue">Active this week</Badge>;
  return <Badge tone="amber">Inactive {Math.floor(days)} days</Badge>;
}

export function TeamPage() {
  const [search, setSearch] = useState('');
  const query = useDebounce(search.trim());
  const { data, error, reload } = useFetch(() => managerService.team(query), [query]);

  return (
    <>
      <PageHeader title="Employee Overview" description="Employees assigned to you. You see activity, not individual well-being scores or survey answers." />
      <Card
        padded={false}
        title={data ? `${data.length} employee${data.length === 1 ? '' : 's'}` : 'Employees'}
        actions={
          <div className="relative w-full sm:w-64">
            <FiSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" placeholder="Search name, ID or department" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
          </div>
        }
      >
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<FiUsers className="h-5 w-5" />}
            title={query ? 'No employees match your search' : 'No employees assigned yet'}
            description={query ? 'Try a different name, ID or department.' : 'HR assigns employees to Line Managers. They will appear here once assigned.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Recent activity</th>
                  <th>Last check-in</th>
                  <th>Survey</th>
                  <th>Pending requests</th>
                </tr>
              </thead>
              <tbody>
                {data.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={member.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium whitespace-nowrap text-ink">{member.fullName}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{member.employeeId}</td>
                    <td className="whitespace-nowrap">{member.department ?? '—'}</td>
                    <td className="whitespace-nowrap">{member.designation ?? '—'}</td>
                    <td>{activityBadge(member)}</td>
                    <td className="whitespace-nowrap">{member.checkedInToday ? <Badge tone="green">Today</Badge> : timeAgo(member.lastCheckInAt)}</td>
                    <td className="whitespace-nowrap">
                      {member.surveyCompleted ? <Badge tone="green">Completed {formatDate(member.lastSurveyAt)}</Badge> : <Badge tone="amber">Not completed</Badge>}
                    </td>
                    <td>{member.pendingRequests > 0 ? <Badge tone="amber">{member.pendingRequests} pending</Badge> : <span className="text-slate-400">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
