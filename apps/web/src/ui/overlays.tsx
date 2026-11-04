import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton, cx } from './primitives';

// ───────────── Sheet: bottom sheet en móvil, modal centrado en escritorio ─────────────
export function Sheet({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    const el = ref.current;
    el?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // bloquea el scroll del fondo
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) { // atrapa el foco dentro del diálogo
        const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; (prevFocus.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center" role="presentation">
      <div className="fade-in absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className={cx('sheet-in relative flex max-h-[92dvh] w-full flex-col rounded-t-[24px] border border-line bg-bg shadow-[var(--shadow-pop)] outline-none md:max-h-[86dvh] md:rounded-[24px]', size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-lg')}>
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong md:hidden" aria-hidden />
        <header className="flex items-center justify-between px-4 pb-1 pt-2 md:pt-4">
          <h2 className="t-title">{title}</h2>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 pb-safe pt-2">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmSheet({ open, title, text, confirmLabel = 'Eliminar', onConfirm, onClose, danger = true }: { open: boolean; title: string; text: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; onClose: () => void; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="t-body text-ink-2">{text}</p>
      <div className="mt-5 flex flex-col gap-2 md:flex-row-reverse">
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} block onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  );
}

// ───────────── Toast ─────────────
type Toast = { id: number; text: string; tone: 'success' | 'error' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);
  const value = useMemo(() => push, [push]);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }} aria-live="polite" role="status">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} className="pop-in pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2.5 text-sm shadow-[var(--shadow-pop)]">
              <I className={cx('size-[18px] shrink-0', t.tone === 'success' ? 'text-accent' : t.tone === 'error' ? 'text-danger' : 'text-ink-2')} aria-hidden />
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
