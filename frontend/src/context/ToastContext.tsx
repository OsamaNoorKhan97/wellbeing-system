import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from 'react-icons/fi';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { box: string; icon: ReactNode }> = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <FiCheckCircle className="h-5 w-5 text-emerald-600" aria-hidden /> },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: <FiAlertCircle className="h-5 w-5 text-red-600" aria-hidden /> },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: <FiInfo className="h-5 w-5 text-sky-600" aria-hidden /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg sm:w-96 ${toneStyles[toast.tone].box}`}
          >
            <span className="mt-0.5 shrink-0">{toneStyles[toast.tone].icon}</span>
            <p className="min-w-0 flex-1 break-words">{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
