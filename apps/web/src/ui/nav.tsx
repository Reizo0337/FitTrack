import { Activity, BarChart3, Home, Plus, Sparkles, Utensils, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cx, haptic } from './primitives';

export const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/food', label: 'Alimentación', icon: Utensils },
  { to: '/activity', label: 'Actividad', icon: Activity },
  { to: '/progress', label: 'Progreso', icon: BarChart3 },
  { to: '/ai', label: 'IA', icon: Sparkles },
];

/** Barra inferior (móvil): 5 destinos, objetivos táctiles ≥ 44 px y área segura de iOS. */
export function BottomNavigation() {
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-sm lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="mx-auto flex max-w-xl">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end={to === '/'} onClick={() => haptic(6)}
              className={({ isActive }) => cx('flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors', isActive ? 'text-accent' : 'text-ink-3 hover:text-ink-2')}>
              <Icon className="size-[22px]" strokeWidth={2} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Barra lateral (escritorio). */
export function Sidebar({ onQuickAdd }: { onQuickAdd: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
      <div className="mb-6 flex items-center gap-2.5 px-3">
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-accent-ink"><Activity className="size-[18px]" aria-hidden /></span>
        <span className="t-head">FitTrack</span>
      </div>
      <button onClick={onQuickAdd} className="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-ctl bg-accent px-4 font-semibold text-accent-ink transition hover:bg-accent-strong active:scale-[.98]">
        <Plus className="size-[18px]" aria-hidden /> Registrar
      </button>
      <nav aria-label="Principal"><ul className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-ctl px-3 text-[0.9375rem] font-medium transition-colors', isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icon className="size-5" aria-hidden />{label}
            </NavLink>
          </li>
        ))}
      </ul></nav>
    </aside>
  );
}
