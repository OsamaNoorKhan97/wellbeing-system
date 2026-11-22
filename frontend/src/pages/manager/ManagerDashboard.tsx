import { FiActivity, FiAlertTriangle, FiCalendar, FiCheckSquare, FiClipboard, FiCoffee, FiInbox, FiMessageSquare, FiUsers } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { MeetingItem, RequestTypeLabel } from '../../components/RequestBits';
import { Alert, Card, EmptyState, ErrorState, PageHeader, RequestStatusBadge, Skeleton, StatCard } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { timeAgo } from '../../lib/format';
import { managerService } from '../../services';

const linkClass = 'text-xs font-medium text-brand-700 hover:underline';
const activityIcons = { REQUEST: <FiInbox />, CHECK_IN: <FiCheckSquare />, SURVEY: <FiClipboard /> };

export function ManagerDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => managerService.dashboard(), []);

  return (
    <>
      <PageHeader title={`Welcome, ${user?.fullName.split(' ')[0] ?? ''}`} description="An overview of your team, their requests and your meetings." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          {data.summary.activeAlerts > 0 && (
            <div className="mb-6">
              <Alert tone="warning">
                <span className="inline-flex flex-wrap items-center gap-x-2">
                  <FiAlertTriangle aria-hidden />
                  {data.summary.activeAlerts} employee well-being alert{data.summary.activeAlerts === 1 ? ' needs' : 's need'} your attention.
                  <Link to="/manager/alerts" className="font-medium underline">
                    Review alerts
                  </Link>
                </span>
              </Alert>
            </div>
          )}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total Assigned Employees" value={data.summary.assignedEmployees} icon={<FiUsers />} />
            <StatCard label="Active Well-Being Alerts" value={data.summary.activeAlerts} icon={<FiAlertTriangle />} tone={data.summary.activeAlerts > 0 ? 'red' : 'green'} />
            <StatCard label="Pending Break Requests" value={data.summary.pendingBreakRequests} icon={<FiCoffee />} tone="amber" />
            <StatCard label="Pending Discussion Requests" value={data.summary.pendingDiscussionRequests} icon={<FiMessageSquare />} tone="blue" />
            <StatCard label="Upcoming Meetings" value={data.summary.upcomingMeetings} icon={<FiCalendar />} tone="violet" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Recent employee requests" className="lg:col-span-2" padded={false} actions={<Link to="/manager/requests" className={linkClass}>Manage requests</Link>}>
              {data.recentRequests.length === 0 ? (
                <EmptyState title="No requests yet" description="Break and discussion requests from your team will appear here." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Type</th>
                        <th>Requested</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentRequests.map((request) => (
                        <tr key={request.id}>
                          <td>
                            <p className="font-medium text-ink">{request.employeeName}</p>
                            <p className="text-xs text-slate-500">{request.employeeCode}</p>
                          </td>
                          <td>
                            <RequestTypeLabel type={request.type} />
                          </td>
                          <td className="whitespace-nowrap">{timeAgo(request.createdAt)}</td>
                          <td>
                            <RequestStatusBadge status={request.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Upcoming meetings" actions={<Link to="/manager/meetings" className={linkClass}>View all</Link>}>
              {data.upcomingMeetings.length === 0 ? (
                <EmptyState icon={<FiCalendar className="h-5 w-5" />} title="No upcoming meetings" />
              ) : (
                <ul className="space-y-4">
                  {data.upcomingMeetings.map((meeting) => (
                    <li key={meeting.id}>
                      <MeetingItem meeting={meeting} counterpart="employee" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent activity" description="What your team has been doing. Check-in scores and survey answers stay private." className="lg:col-span-3">
              {data.recentActivity.length === 0 ? (
                <EmptyState icon={<FiActivity className="h-5 w-5" />} title="No recent activity" />
              ) : (
                <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                  {data.recentActivity.map((item, index) => (
                    <li key={index} className="flex items-center gap-3 text-sm">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden>
                        {activityIcons[item.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-600">
                        <span className="font-medium text-ink">{item.employeeName}</span> {item.description}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{timeAgo(item.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
