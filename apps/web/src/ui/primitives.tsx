import { Loader2, AlertTriangle, type LucideIcon } from 'lucide-react';
import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/** Vibración corta cuando la plataforma la permite (no existe en Safari/iOS: se ignora). */
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* sin háptica */ } };

// ───────────── Button / IconButton ─────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; icon?: LucideIcon; block?: boolean };

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, block, className, children, disabled, onClick, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => { haptic(); onClick?.(e); }}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-ctl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:active:scale-100',
        size === 'md' ? 'min-h-11 px-4 text-[0.9375rem]' : 'min-h-9 px-3 text-sm',
        variants[variant], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-[18px]" aria-hidden />}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: 'default' | 'danger' | 'accent' }>(
  function IconButton({ icon: Icon, label, tone = 'default', className, onClick, ...rest }, ref) {
    return (
      <button ref={ref} aria-label={label} title={label} onClick={(e) => { haptic(); onClick?.(e); }}
        className={cx('inline-flex size-11 items-center justify-center rounded-full transition hover:bg-surface-2 active:scale-95 disabled:opacity-40',
          tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-ink-2 hover:text-ink', className)} {...rest}>
        <Icon className="size-5" aria-hidden />
      </button>
    );
  });

// ───────────── Card ─────────────
export function Card({ className, children, as: Tag = 'section', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'li' }) {
  return <Tag className={cx('rounded-card border border-line bg-surface p-4 shadow-[var(--shadow)]', className)} {...rest}>{children}</Tag>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="mb-2 flex items-center justify-between px-1"><h2 className="t-head">{title}</h2>{action}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warn' | 'danger'; children: ReactNode }) {
  const t = { neutral: 'bg-surface-2 text-ink-2', accent: 'bg-accent-soft text-accent-strong', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger' }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

// ───────────── Formularios ─────────────
type FieldProps = { label: string; hint?: string; error?: string; className?: string };
export const FormField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function FormField({ label, hint, error, className, ...rest }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[0.8125rem] font-medium text-ink-2">{label}</label>
      <input id={id} ref={ref} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-d` : undefined}
        className={cx('min-h-11 w-full rounded-ctl border bg-surface px-3 text-ink placeholder:text-ink-3 transition focus:border-accent focus:outline-none disabled:opacity-50', error ? 'border-danger' : 'border-line-strong')} {...rest} />
      {(error || hint) && <p id={`${id}-d`} className={cx('mt-1 text-xs', error ? 'text-danger' : 'text-ink-3')}>{error ?? hint}</p>}
    </div>
  );
});

export function SelectField({ label, className, children, ...rest }: { label: string; className?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[0.8125rem] font-medium text-ink-2">{label}</label>
      <select id={id} className="min-h-11 w-full rounded-ctl border border-line-strong bg-surface px-3 text-ink focus:border-accent focus:outline-none" {...rest}>{children}</select>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-ctl bg-surface-2 p-1">
      {options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cx('min-h-9 rounded-[9px] px-3 text-sm font-medium transition', o.value === value ? 'bg-surface text-ink shadow-[var(--shadow)]' : 'text-ink-2 hover:text-ink')}>{o.label}</button>
      ))}
    </div>
  );
}

// ───────────── Estados: carga, vacío, error ─────────────
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} aria-hidden />;

export function LoadingState({ rows = 3, label = 'Cargando' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-40 w-full !rounded-card" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-20 w-full !rounded-card" />)}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-2"><Icon className="size-6" aria-hidden /></div>
      <h3 className="t-head">{title}</h3>
      <p className="t-meta max-w-sm">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ text = 'No se pudieron cargar los datos.', onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-8 text-center">
      <AlertTriangle className="size-6 text-warn" aria-hidden />
      <p className="t-body">{text}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'info' | 'danger' | 'accent'; children: ReactNode }) {
  const t = { warn: 'bg-warn-soft text-ink', info: 'bg-surface-2 text-ink-2', danger: 'bg-danger-soft text-ink', accent: 'bg-accent-soft text-ink' }[tone];
  return <div role="note" className={cx('rounded-ctl px-3 py-2.5 text-sm leading-snug', t)}>{children}</div>;
}
