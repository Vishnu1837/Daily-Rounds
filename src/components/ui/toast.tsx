'use client';

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';

type Toast = { id: number; title: string; description?: string; tone: ToastTone };

type ToastApi = {
  toast: (t: { title: string; description?: string; tone?: ToastTone }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

let nextId = 1;

const TONE = {
  success: {
    icon: Check,
    accent: 'bg-success',
    chip: 'bg-success/15 text-success-strong dark:text-success',
  },
  error: { icon: AlertTriangle, accent: 'bg-danger', chip: 'bg-danger/15 text-danger' },
  info: {
    icon: Info,
    accent: 'bg-pulse-500',
    chip: 'bg-pulse-500/15 text-pulse-600 dark:text-pulse-300',
  },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useReducedMotion();

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    ({ title, description, tone = 'info' }) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, title, description, tone }]);
      // Errors linger: they usually ask the reader to do something about them.
      window.setTimeout(() => remove(id), tone === 'error' ? 6500 : 4200);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { icon: Icon, accent, chip } = TONE[t.tone];
            return (
              <motion.div
                key={t.id}
                role="status"
                aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
                layout
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-panel border-border bg-bg-elevated shadow-float pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden border p-4 pl-5"
              >
                {/* A colour bar rather than a coloured border: it survives a dark theme. */}
                <span className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden />
                <span
                  className={cn('grid size-6 shrink-0 place-items-center rounded-full', chip)}
                  aria-hidden
                >
                  <Icon className="size-3.5" strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-sm font-semibold">{t.title}</p>
                  {t.description && <p className="text-fg-muted mt-0.5 text-sm">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="Dismiss"
                  className="tap text-fg-subtle hover:bg-bg-sunken hover:text-fg -mt-1 -mr-1 grid size-7 place-items-center rounded-lg"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
