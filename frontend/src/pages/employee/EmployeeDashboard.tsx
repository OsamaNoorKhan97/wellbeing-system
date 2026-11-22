import { FiCalendar, FiCheckCircle, FiClipboard, FiClock, FiCoffee, FiHeart, FiMessageSquare } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { BreakRecommendationCard } from '../../components/BreakRecommendationCard';
import { RatingChip } from '../../components/RatingPicker';
import { MeetingItem, RequestOutcome, RequestTypeLabel } from '../../components/RequestBits';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, RequestStatusBadge, Skeleton } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { describeHours, formatDate, formatDateTime, timeAgo } from '../../lib/format';
import { ratingOption, ratingScales, type RatingCategory } from '../../lib/ratings';
import { employeeService } from '../../services';

const categories: RatingCategory[] = ['mood', 'stress', 'energy'];

const quickActions = [
  { to: '/employee/well-being', label: 'Complete Well-Being Check', icon: <FiHeart />, style: 'bg-brand-700 text-white hover:bg-brand-800' },
  { to: '/employee/survey', label: 'Complete Survey', icon: <FiClipboard />, style: 'bg-white text-ink border border-slate-200 hover:bg-slate-50' },
  { to: '/employee/help?action=break', label: 'Request a Break', icon: <FiCoffee />, style: 'bg-white text-ink border border-slate-200 hover:bg-slate-50' },
  { to: '/employee/help?action=discussion', label: 'Request Discussion with Line Manager', icon: <FiMessageSquare />, style: 'bg-white text-ink border border-slate-200 hover:bg-slate-50' },
];

const linkClass = 'text-xs font-medium text-brand-700 hover:underline';

export function EmployeeDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => employeeService.dashboard(), []);
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader title={`${greeting}, ${firstName}`} description={`Here is your overview for ${formatDate(new Date())}.`} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.to} to={action.to} className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium shadow-xs transition-colors ${action.style}`}>
            <span className="text-lg" aria-hidden>
              {action.icon}
            </span>
            {action.label}
          </Link>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-56 lg:col-span-2" />
          <Skeleton className="h-56" />
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {!data.manager && (
            <div className="lg:col-span-3">
              <Alert tone="warning">You do not have a Line Manager assigned yet, so break and discussion requests are unavailable. Please contact HR.</Alert>
            </div>
          )}

          {data.breakRecommendation && (
            <div className="lg:col-span-3">
              <BreakRecommendationCard recommendation={data.breakRecommendation} canRequest={Boolean(data.manager)} onRequested={reload} />
            </div>
          )}

          <Card
            title="Latest well-being check"
            className="lg:col-span-2"
            actions={
              <Badge tone={data.assessmentStatus.canSubmit ? 'amber' : 'green'}>{data.assessmentStatus.canSubmit ? 'Check-in available' : 'Checked in'}</Badge>
            }
          >
            {data.assessmentStatus.latest ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {categories.map((category) => {
                  const value = data.assessmentStatus.latest![category];
                  const option = ratingOption(category, value);
                  return (
                    <div key={category} className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                      <span className="text-3xl" aria-hidden>
                        {option.emoji}
                      </span>
                      <div>
                        <p className="text-xs text-slate-500">{ratingScales[category].title}</p>
                        <p className="text-sm font-semibold text-ink">
                          {option.label} <span className="font-normal text-slate-400">· {value}/5</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<FiHeart className="h-5 w-5" />} title="How are you today?" description="Your check-in takes less than a minute and is visible only to you." action={<Link to="/employee/well-being" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">Start check-in</Link>} />
            )}
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <FiClock className="shrink-0 text-slate-400" aria-hidden />
              {data.assessmentStatus.canSubmit ? (
                <span>
                  <span className="font-medium text-ink">Your next check-in is available now.</span> Check-ins are allowed every {describeHours(data.assessmentStatus.intervalHours)}.
                </span>
              ) : (
                <span>
                  Next well-being check available on <span className="font-medium text-ink">{formatDateTime(data.assessmentStatus.nextAvailableAt)}</span>. Check-ins are allowed every {describeHours(data.assessmentStatus.intervalHours)}.
                </span>
              )}
            </p>
          </Card>

          <Card title="Survey status">
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl ${data.surveyStatus.completed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`} aria-hidden>
                {data.surveyStatus.completed ? <FiCheckCircle /> : <FiClipboard />}
              </span>
              <div className="text-sm">
                <p className="font-semibold text-ink">{data.surveyStatus.completed ? 'Completed' : 'Waiting for your answers'}</p>
                <p className="mt-0.5 text-slate-500">
                  {data.surveyStatus.completed
                    ? `Submitted ${formatDate(data.surveyStatus.lastSubmittedAt)}. Next survey available on ${formatDateTime(data.surveyStatus.nextAvailableAt)}.`
                    : `${data.surveyStatus.activeQuestionCount} short questions about your work experience. Available now; the survey repeats every ${data.surveyStatus.frequencyDays} days.`}
                </p>
                {!data.surveyStatus.completed && (
                  <Link to="/employee/survey" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
                    Take the survey
                  </Link>
                )}
              </div>
            </div>
          </Card>

          <Card title="Recent ratings" description="Your last check-ins" className="lg:col-span-2" padded={false} actions={<Link to="/employee/well-being" className={linkClass}>View history</Link>}>
            {data.recentAssessments.length === 0 ? (
              <EmptyState title="No check-ins yet" description="Your recent mood, stress and energy ratings will appear here." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Submitted</th>
                      <th>Mood</th>
                      <th>Stress</th>
                      <th>Energy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAssessments.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap">{formatDateTime(item.submittedAt)}</td>
                        {categories.map((category) => (
                          <td key={category}>
                            <RatingChip category={category} value={item[category]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Upcoming meetings" actions={<Link to="/employee/help" className={linkClass}>View all</Link>}>
            {data.upcomingMeetings.length === 0 ? (
              <EmptyState icon={<FiCalendar className="h-5 w-5" />} title="No upcoming meetings" />
            ) : (
              <ul className="space-y-4">
                {data.upcomingMeetings.map((meeting) => (
                  <li key={meeting.id}>
                    <MeetingItem meeting={meeting} counterpart="manager" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent support requests" className="lg:col-span-2" padded={false} actions={<Link to="/employee/help" className={linkClass}>View all</Link>}>
            {data.recentRequests.length === 0 ? (
              <EmptyState title="No requests yet" description="Break and discussion requests you make will be tracked here." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Requested</th>
                      <th>Status</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <RequestTypeLabel type={request.type} />
                        </td>
                        <td className="whitespace-nowrap">{timeAgo(request.createdAt)}</td>
                        <td>
                          <RequestStatusBadge status={request.status} />
                        </td>
                        <td>
                          <RequestOutcome request={request} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Recent notifications" actions={<Link to="/employee/notifications" className={linkClass}>View all</Link>}>
            {data.recentNotifications.length === 0 ? (
              <EmptyState title="No notifications yet" />
            ) : (
              <ul className="space-y-3">
                {data.recentNotifications.map((item) => (
                  <li key={item.id} className="flex gap-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-slate-200' : 'bg-brand-600'}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{item.title}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{item.message}</p>
                      <p className="text-[11px] text-slate-400">{timeAgo(item.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
