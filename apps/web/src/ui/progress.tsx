import type { ReactNode } from 'react';
import { cx } from './primitives';

type Tone = 'accent' | 'warn' | 'protein' | 'carbs' | 'fat' | 'ink';
const toneVar: Record<Tone, string> = { accent: 'var(--accent)', warn: 'var(--warn)', protein: 'var(--m-protein)', carbs: 'var(--m-carbs)', fat: 'var(--m-fat)', ink: 'var(--ink-2)' };

/** `value` = fracción rellena. `deducted` = fracción (del total) que se «resta» y se pinta en gris al final del tramo relleno. */
export function ProgressRing({ value, deducted = 0, size = 132, stroke = 10, tone = 'accent', children, label }: { value: number; deducted?: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode; label: string }) {
  const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = clamp(value);
  const g = Math.min(p, clamp(deducted)); // lo restado nunca supera lo consumido
  const net = p - g;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(p * 100)} %`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {g > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-3)" strokeOpacity={0.55} strokeWidth={stroke}
          strokeDasharray={`${c * g} ${c}`} strokeDashoffset={-c * net} style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1), stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }} />}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneVar[tone]} strokeWidth={stroke} strokeLinecap={g > 0 ? 'butt' : 'round'}
          strokeDasharray={`${c * net} ${c}`} style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'accent', height = 6, label }: { value: number; tone?: Tone; height?: number; label?: string }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="overflow-hidden rounded-full bg-surface-2" style={{ height }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: toneVar[tone], transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />
    </div>
  );
}

/** Un macronutriente: valor consumido, objetivo y barra. El color identifica al macro en toda la app. */
export function MacroIndicator({ name, value, target, tone, unit = 'g' }: { name: string; value: number; target: number; tone: 'protein' | 'carbs' | 'fat'; unit?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: toneVar[tone] }} aria-hidden /><span className="t-meta">{name}</span></div>
      <p className="num t-head leading-none">{Math.round(value)}<span className="t-meta font-normal"> / {Math.round(target)} {unit}</span></p>
      <div className="mt-2"><ProgressBar value={target > 0 ? value / target : 0} tone={tone} label={name} /></div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <p className="t-meta">{label}</p>
      <p className="num t-head mt-0.5 truncate">{value}</p>
      {sub && <p className="t-meta mt-0.5">{sub}</p>}
    </div>
  );
}
