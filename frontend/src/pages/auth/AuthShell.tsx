import type { ReactNode } from 'react';
import { FiBarChart2, FiHeart, FiLifeBuoy, FiShield } from 'react-icons/fi';

const highlights = [
  { icon: <FiHeart />, title: 'Daily well-being check-ins', text: 'Record mood, stress and energy in under a minute.' },
  { icon: <FiLifeBuoy />, title: 'Support when you need it', text: 'Request a break or a conversation with your Line Manager.' },
  { icon: <FiBarChart2 />, title: 'Insight for the organization', text: 'HR sees trends and participation, not individual answers.' },
  { icon: <FiShield />, title: 'Private by design', text: 'Your detailed responses are visible only to you.' },
];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-slate-300 lg:flex">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand-700/40 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <FiHeart className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold text-white">WellBeing Monitor</span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-3xl leading-tight font-semibold text-white">Employee Well-Being and Organizational Behavior Monitoring</h2>
          <ul className="mt-8 space-y-5">
            {highlights.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200" aria-hidden>
                  {item.icon}
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{item.title}</span>
                  <span className="block text-sm text-slate-400">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Internal use only. Access is restricted to authorized staff.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <FiHeart className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-base font-semibold text-ink">WellBeing Monitor</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const linkClass = 'font-medium text-brand-700 hover:text-brand-800 hover:underline';
