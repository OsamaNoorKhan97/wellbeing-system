import { FiHeart } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const access = [
  {
    who: 'You (Employee)',
    sees: 'Everything you submit: every well-being check-in with its mood, stress and energy ratings, every survey answer, your requests and your meetings.',
    never: 'Other employees’ data.',
  },
  {
    who: 'Your Line Manager',
    sees: 'Your name, Employee ID, department and designation; whether and when you last completed a check-in or the survey; your break and discussion requests with the reason you wrote; meetings with you.',
    never: 'Your mood, stress or energy ratings and your individual survey answers.',
  },
  {
    who: 'HR / Admin',
    sees: 'Account information needed for administration (name, ID, role, status, assigned manager) and activity counts; organization-wide totals, trends and averages.',
    never: 'Your individual ratings, individual survey answers, or the content of your requests. Averages are hidden whenever a group is too small to keep individuals unidentifiable.',
  },
];

const sections = [
  {
    title: 'What we collect',
    body: 'Account details you provide at registration (name, Employee ID, email, department, designation); well-being check-ins (mood, stress and energy on a 1–5 scale with the time of submission); answers to the Organizational Behavior survey; break and discussion requests; meeting details; and a record of sign-ins and actions for security.',
  },
  {
    title: 'Why we collect it',
    body: 'To help you reflect on your own well-being over time, to route support requests to your Line Manager, and to give the organization an aggregated picture of well-being and workplace behavior so it can improve working conditions. The data is not used for performance evaluation or disciplinary decisions.',
  },
  {
    title: 'How it is protected',
    body: 'Passwords are stored only as salted scrypt hashes. Every request is checked against your role on the server, so changing a web address cannot reveal another person’s data. Administrative and managerial actions are written to an audit log that HR can review.',
  },
  {
    title: 'Your choices',
    body: 'You can review your own check-in and survey history at any time, update your profile, and withdraw a request while it is still pending. To correct or delete your data, or to ask a question about this notice, contact your HR department.',
  },
];

export function PrivacyContent() {
  return (
    <div className="space-y-6">
      <Card title="Who can see what">
        <div className="table-wrap -m-5">
          <table className="table">
            <thead>
              <tr>
                <th>Who</th>
                <th>Can see</th>
                <th>Cannot see</th>
              </tr>
            </thead>
            <tbody>
              {access.map((row) => (
                <tr key={row.who}>
                  <td className="font-medium whitespace-nowrap !text-ink">{row.who}</td>
                  <td>{row.sees}</td>
                  <td>{row.never}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} title={section.title}>
            <p className="text-sm leading-relaxed text-slate-600">{section.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy notice" description="How your data is used in this system and who can access it." />
      <PrivacyContent />
    </>
  );
}

/** The same notice for people who are not signed in yet (linked from registration). */
export function PublicPrivacyPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
            <FiHeart className="h-5 w-5" aria-hidden />
          </span>
          <span className="font-semibold text-ink">WellBeing Monitor</span>
        </span>
        <Link to={user ? '/' : '/login'} className="text-sm font-medium text-brand-700 hover:underline">
          {user ? 'Back to dashboard' : 'Back to sign in'}
        </Link>
      </div>
      <PageHeader title="Privacy notice" description="How your data is used in this system and who can access it." />
      <PrivacyContent />
    </div>
  );
}
