import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FiBell, FiChevronDown, FiHeart, FiLogOut, FiMenu, FiShield, FiUser, FiX } from 'react-icons/fi';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleHome, roleLabels, timeAgo } from '../../lib/format';
import { notificationService } from '../../services';
import type { AppNotification } from '../../types';
import { Avatar } from '../ui';
import { navigation } from './navigation';

const POLL_INTERVAL_MS = 30_000;
export const NOTIFICATIONS_CHANGED_EVENT = 'wellbeing:notifications-changed';

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

/**
 * Unread count is polled; pages that change notifications dispatch NOTIFICATIONS_CHANGED_EVENT for an instant refresh.
 * A WebSocket or SSE subscription can replace the interval here without touching the rest of the app.
 */
function NotificationBell({ basePath }: { basePath: string }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<AppNotification[] | null>(null);
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  const location = useLocation();

  const refresh = useCallback(() => {
    notificationService.unreadCount().then((response) => setUnread(response.data.unread)).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  useEffect(() => {
    setOpen(false);
    refresh();
  }, [location.pathname, refresh]);

  const toggle = () => {
    setOpen((current) => !current);
    if (!open) {
      setRecent(null);
      notificationService.list({ pageSize: 5 }).then((response) => setRecent(response.data)).catch(() => setRecent([]));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <FiBell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread > 0 && <span className="text-xs text-slate-500">{unread} unread</span>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {recent === null ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">You have no notifications yet.</p>
            ) : (
              recent.map((item) => (
                <div key={item.id} className={`border-b border-slate-50 px-4 py-3 last:border-b-0 ${item.isRead ? '' : 'bg-brand-50/50'}`}>
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    {!item.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                    {item.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</p>
                </div>
              ))
            )}
          </div>
          <Link to={`${basePath}/notifications`} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ basePath }: { basePath: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  if (!user) return null;

  const itemClass = 'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100" aria-expanded={open} aria-label="Account menu">
        <Avatar name={user.fullName} />
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm leading-tight font-medium text-ink">{user.fullName}</span>
          <span className="block text-xs leading-tight text-slate-500">{roleLabels[user.role]}</span>
        </span>
        <FiChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link to={`${basePath}/profile`} className={itemClass} onClick={() => setOpen(false)}>
            <FiUser aria-hidden /> Profile
          </Link>
          <Link to={`${basePath}/privacy`} className={itemClass} onClick={() => setOpen(false)}>
            <FiShield aria-hidden /> Privacy notice
          </Link>
          <button
            type="button"
            className={`${itemClass} border-t border-slate-100 text-red-600`}
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            <FiLogOut aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return null;

  const basePath = roleHome[user.role];
  const items = navigation[user.role];
  const current = items.find((item) => item.path === location.pathname);

  const sidebar = (
    <nav className="flex h-full flex-col bg-ink text-slate-300" aria-label="Main navigation">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <FiHeart className="h-5 w-5" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-white">WellBeing Monitor</span>
          <span className="block text-[11px] text-slate-400">{roleLabels[user.role]} portal</span>
        </span>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {items.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-lg" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <p className="shrink-0 border-t border-white/10 px-5 py-3 text-[11px] text-slate-500">Employee Well-Being &amp; Organizational Behavior Monitoring System</p>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            {sidebar}
            <button type="button" onClick={() => setMenuOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close menu">
              <FiX className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
          <FiMenu className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-500">{current?.label ?? 'WellBeing Monitor'}</p>
        <NotificationBell basePath={basePath} />
        <ProfileMenu basePath={basePath} />
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
