import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { todayStr, useApp } from '../ctx';

type G = {
  kind: string; label: string; unit: string; period: 'DAY' | 'WEEK'; target: number; active: boolean;
  today: { value: number | null; met: boolean | null }; streak: number | null; bestStreak: number | null; compliance30: number | null; last7: (boolean | null)[];
};
type Data = {
  goals: G[]; summary: { activeGoals: number; metToday: number; loggedDays7: number; message: string };
  milestones: { marks: { kg: number; reached: boolean }[]; next: { kg: number } | null; lostKg: number | null };
};

const dot = (m: boolean | null) => (m === true ? 'bg-accent' : m === false ? 'bg-slate-400 dark:bg-slate-600' : 'bg-slate-200 dark:bg-slate-800');

/** Metas y constancia. Sin datos ≠ fallo: los días sin dato no cuentan en contra. */
export function Challenges({ compact = false }: { compact?: boolean }) {
  const { version, bump } = useApp();
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api<Data>(`/goals?date=${todayStr()}`).then(setD).catch(() => undefined), []);
  useEffect(() => { load(); }, [load, version]);
  if (!d) return null;
  const active = d.goals.filter((g) => g.active);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const items = d!.goals.map((g) => ({ kind: g.kind, target: Number(String(f.get(`t-${g.kind}`)).replace(',', '.')), active: f.get(`a-${g.kind}`) === 'on' }));
    try { await api('/goals', { method: 'PUT', body: JSON.stringify({ items }) }); setMsg('Metas guardadas.'); bump(); } catch { setMsg('Revisa los valores.'); }
  }

  return (
    <section className="card flex flex-col gap-3">
      <div><h2 className="font-semibold">Metas de hoy</h2><p className="text-sm text-slate-500">{d.summary.message}</p></div>
      {!active.length && <p className="text-sm text-slate-500">No hay metas activas.</p>}
      <ul className="flex flex-col gap-2">
        {active.map((g) => (
          <li key={g.kind} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>{g.today.met ? '✓ ' : ''}{g.label}</span>
              <span className="text-slate-500">{g.today.value == null ? 'sin dato' : `${g.today.value} / ${g.target} ${g.unit}`}{g.period === 'WEEK' ? ' (7 días)' : ''}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-label={g.label} aria-valuenow={Math.round(Math.min(100, ((g.today.value ?? 0) / g.target) * 100))} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, ((g.today.value ?? 0) / g.target) * 100)}%` }} />
            </div>
            {!compact && (
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span className="flex gap-1" aria-label="Últimos 7 días">{g.last7.map((m, i) => <i key={i} className={`size-2.5 rounded-full ${dot(m)}`} />)}</span>
                <span>{g.streak != null ? `racha ${g.streak} d · mejor ${g.bestStreak}` : ''}{g.compliance30 != null ? ` · ${g.compliance30} % en 30 d` : ''}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!compact && (<>
        <div><h3 className="text-sm font-semibold">Hitos de peso</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">{d.milestones.marks.map((m) => <span key={m.kg} className={`rounded-full px-2 py-0.5 text-xs ${m.reached ? 'bg-accent text-[#052e1d]' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`}>{m.kg} kg</span>)}</div>
          <p className="mt-1 text-xs text-slate-500">{d.milestones.lostKg == null ? 'Registra tu peso para ver tus hitos.' : d.milestones.next ? `Llevas ${d.milestones.lostKg} kg menos. Próximo hito: ${d.milestones.next.kg} kg.` : '¡Objetivo alcanzado!'}</p></div>
        <details><summary className="cursor-pointer text-sm text-slate-500">Ajustar metas</summary>
          <form onSubmit={save} className="mt-2 flex flex-col gap-2">
            {d.goals.map((g) => (<div key={g.kind} className="flex items-center gap-2 text-sm"><label className="flex flex-1 items-center gap-2"><input type="checkbox" name={`a-${g.kind}`} defaultChecked={g.active} className="size-4" />{g.label}</label>
              <input name={`t-${g.kind}`} defaultValue={g.target} inputMode="decimal" className="input w-24 py-1.5" aria-label={`Objetivo de ${g.label}`} /><span className="w-14 text-xs text-slate-500">{g.unit}</span></div>))}
            {msg && <p role="status" className="text-xs text-slate-500">{msg}</p>}
            <button className="btn">Guardar metas</button></form></details>
      </>)}
    </section>
  );
}
