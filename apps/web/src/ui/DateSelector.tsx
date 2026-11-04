import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './primitives';

export const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const shiftDate = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function DateSelector({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = todayStr();
  const label = date === today ? 'Hoy' : date === shiftDate(today, -1) ? 'Ayer'
    : new Date(`${date}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="flex items-center justify-between rounded-ctl border border-line bg-surface">
      <IconButton icon={ChevronLeft} label="Día anterior" onClick={() => onChange(shiftDate(date, -1))} />
      <button className="min-h-11 flex-1 text-center font-semibold capitalize" onClick={() => date !== today && onChange(today)} aria-label={date === today ? 'Hoy' : `${label}. Ir a hoy`}>
        {label}{date !== today && <span className="ml-2 text-xs font-medium text-accent">ir a hoy</span>}
      </button>
      <IconButton icon={ChevronRight} label="Día siguiente" disabled={date >= today} onClick={() => onChange(shiftDate(date, 1))} />
    </div>
  );
}
