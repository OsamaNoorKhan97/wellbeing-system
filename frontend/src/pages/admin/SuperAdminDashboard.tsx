import { FiAlertTriangle, FiSliders } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { describeHours, formatDateTime, timeAgo } from '../../lib/format';
import { alertService, settingsService } from '../../services';
import { AdminDashboard } from './AdminDashboard';

const linkClass = 'text-xs font-medium text-brand-700 hover:underline';

/** The Super Admin's home: the same organization-wide figures as HR, plus the live configuration and open alerts. */
export function SuperAdminDashboard() {
  const settings = useFetch(() => settingsService.list(), []);
  const alerts = useFetch(() => alertService.list({ status: 'open', page: 1, pageSize: 5 }), []);

  const value = (key: string) => settings.data?.find((setting) => setting.key === key)?.value ?? '';
  const rows: [string, string][] = settings.data
    ? [
        ['Well-being assessment', `Every ${describeHours(Number(value('assessment_interval_hours')))}`],
        ['OB survey', `Every ${Number(value('survey_frequency_days'))} days`],
        [
          'Alert rule',
          `${value('alert_consecutive_required')} poor assessments in a row (${value('alert_indicators_required')} of 3 indicators: mood ≤ ${value('alert_mood_threshold')}, stress ≥ ${value('alert_stress_threshold')}, energy ≤ ${value('alert_energy_threshold')})`,
        ],
        ['Alert recipients', [value('alert_notify_line_manager') === 'true' ? 'Line Manager' : null, value('alert_notify_hr') === 'true' ? 'HR' : null].filter(Boolean).join(' and ') || 'Nobody'],
      ]
    : [];

  const top = (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card title="System configuration" description="What is in force right now" actions={<Link to="/super-admin/configuration" className={linkClass}>Change settings</Link>}>
        {!settings.data ? (
          <Skeleton className="h-32" />
        ) : (
          <dl className="space-y-3 text-sm">
            {rows.map(([label, text]) => (
              <div key={label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <dt className="w-40 shrink-0 text-slate-500">{label}</dt>
                <dd className="font-medium text-ink">{text}</dd>
              </div>
            ))}
          </dl>
        )}
        <Link to="/super-admin/configuration" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          <FiSliders aria-hidden /> Open System Configuration
        </Link>
      </Card>

      <Card title="Open well-being alerts" description="Employees with consecutive poor check-ins" padded={false} actions={<Link to="/super-admin/alerts" className={linkClass}>View all</Link>}>
        {!alerts.data ? (
          <div className="p-5">
            <Skeleton className="h-32" />
          </div>
        ) : alerts.data.length === 0 ? (
          <EmptyState icon={<FiAlertTriangle className="h-5 w-5" />} title="No open alerts" description="Nobody is currently flagged." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {alerts.data.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {alert.employeeName} <span className="font-normal text-slate-400">· {alert.employeeCode}</span>
                  </p>
                  <p className="text-xs text-slate-500" title={formatDateTime(alert.triggeredAt)}>
                    {alert.department ?? 'No department'} · raised {timeAgo(alert.triggeredAt)}
                  </p>
                </div>
                <Badge tone={alert.status === 'ACTIVE' ? 'red' : 'amber'}>{alert.status === 'ACTIVE' ? 'Active' : 'Acknowledged'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  return <AdminDashboard title="Super Admin Dashboard" base="/super-admin" top={top} />;
}
