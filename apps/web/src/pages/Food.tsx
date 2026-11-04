import { useCallback, useEffect, useState } from 'react';
import { MEAL_LABELS, type MealTypeId, type Nutrients } from '@fittrack/shared';
import { api } from '../api';
import { Bar } from '../components/Chart';
import { shiftDate, todayStr, useApp } from '../ctx';

export type Entry = { id: string; name: string; grams: number; isEstimate: boolean; nutrients: Nutrients };
export type Diary = {
  date: string; meals: { type: MealTypeId; entries: Entry[]; totals: Nutrients }[]; totals: Nutrients;
  targets: { kcal: number; protein: number; fat: number; carbs: number; fiber: number; waterMl: number };
  remaining: Record<string, number>; waterMl: number;
  productAlerts: { productId: string; name: string; servings: number; max: number; level: 'ok' | 'warn'; messages: string[] }[];
};

export function Food() {
  const { date, setDate, version, bump, openAdd } = useApp();
  const [d, setD] = useState<Diary | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api<Diary>(`/diary?date=${date}`).then((r) => { setD(r); setErr(''); }).catch(() => setErr('No se pudo cargar el diario.')), [date]);
  useEffect(() => { load(); }, [load, version]);

  async function del(id: string) { await api(`/diary/entries/${id}`, { method: 'DELETE' }); bump(); }
  async function edit(e: Entry) {
    const v = prompt(`Gramos de ${e.name}`, String(e.grams));
    const g = v == null ? NaN : Number(v.replace(',', '.'));
    if (g > 0 && g <= 5000) { await api(`/diary/entries/${e.id}`, { method: 'PATCH', body: JSON.stringify({ grams: g }) }); bump(); }
  }
  async function repeatYesterday(type: MealTypeId) {
    const r = await api<{ copied: number }>('/diary/copy', { method: 'POST', body: JSON.stringify({ fromDate: shiftDate(date, -1), toDate: date, type }) });
    if (!r.copied) alert('Ayer no registraste esta comida.');
    bump();
  }

  if (err) return <p role="alert" className="text-red-500">{err}</p>;
  if (!d) return <p className="text-slate-500">Cargando…</p>;
  const left = Math.round(d.remaining.kcal ?? 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button className="rounded-lg px-3 py-2" onClick={() => setDate(shiftDate(date, -1))} aria-label="Día anterior">‹</button>
        <div className="text-center"><b>{date === todayStr() ? 'Hoy' : date}</b>{date !== todayStr() && <button className="ml-2 text-xs text-accent" onClick={() => setDate(todayStr())}>ir a hoy</button>}</div>
        <button className="rounded-lg px-3 py-2 disabled:opacity-30" disabled={date >= todayStr()} onClick={() => setDate(shiftDate(date, 1))} aria-label="Día siguiente">›</button>
      </div>

      <section className="card">
        <div className="flex items-baseline justify-between"><span className="text-2xl font-bold">{Math.round(d.totals.kcal)} <span className="text-sm font-normal text-slate-500">/ {d.targets.kcal} kcal</span></span><span className={left < 0 ? 'text-amber-500' : 'text-slate-500'}>{left >= 0 ? `${left} restantes` : `${-left} por encima`}</span></div>
        <div className="mt-3 grid gap-2">
          <Bar label="Proteínas" value={d.totals.protein} target={d.targets.protein} color="#60a5fa" />
          <Bar label="Carbohidratos" value={d.totals.carbs} target={d.targets.carbs} color="#fbbf24" />
          <Bar label="Grasas" value={d.totals.fat} target={d.targets.fat} color="#f472b6" />
          <Bar label="Fibra" value={d.totals.fiber} target={d.targets.fiber} color="#a78bfa" />
        </div>
      </section>

      {d.productAlerts.map((a) => (
        <div key={a.productId} role="note" className={`rounded-xl border-l-4 p-3 text-sm ${a.level === 'warn' ? 'border-amber-500 bg-amber-500/10' : 'border-sky-500 bg-sky-500/10'}`}>
          <b>{a.name}: {a.servings} / {a.max} raciones</b>
          {a.messages.map((m) => <p key={m} className="mt-1 text-slate-600 dark:text-slate-300">{m}</p>)}
        </div>
      ))}

      {d.meals.map((m) => (
        <section key={m.type} className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{MEAL_LABELS[m.type]} <span className="text-sm font-normal text-slate-500">{m.entries.length ? `${Math.round(m.totals.kcal)} kcal` : ''}</span></h2>
            <div className="flex gap-1 text-sm">
              <button className="rounded-lg px-2 py-1 text-slate-500" onClick={() => repeatYesterday(m.type)}>↺ ayer</button>
              <button className="rounded-lg bg-accent px-3 py-1 font-semibold text-[#052e1d]" onClick={() => openAdd({ type: m.type })}>+ Añadir</button>
            </div>
          </div>
          <ul>
            {m.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 border-t border-slate-200 py-2 text-sm dark:border-slate-800">
                <button className="min-w-0 flex-1 text-left" onClick={() => edit(e)} aria-label={`Editar cantidad de ${e.name}`}>
                  <b className="block truncate">{e.name}{e.isEstimate && <span className="ml-1 rounded bg-amber-500/20 px-1 text-xs text-amber-500">estimado</span>}</b>
                  <span className="text-xs text-slate-500">{e.grams} g · P {e.nutrients.protein} · C {e.nutrients.carbs} · G {e.nutrients.fat}</span>
                </button>
                <span className="tabular-nums">{Math.round(e.nutrients.kcal)}</span>
                <button className="px-2 text-slate-400" onClick={() => del(e.id)} aria-label={`Eliminar ${e.name}`}>🗑</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
