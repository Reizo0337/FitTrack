import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Bar, Chart, Ring } from '../components/Chart';
import { todayStr, useApp } from '../ctx';
import type { Diary } from './Food';

type Dash = {
  date: string; diary: Diary;
  weight: { currentKg: number | null; startKg: number; goalKg: number; lostKg: number | null; remainingKg: number | null; progressPct: number | null; avg7Kg: number | null; weeklyChangeKg: number | null; note: string };
  activity: { steps: number | null; activeKcal: number | null; restingKcal: number | null; distanceKm: number | null; exerciseMin: number | null; source: string } | null;
  sleep: { totalMin: number | null; source: string } | null;
  history: { date: string; kcal: number; protein: number; carbs: number; fat: number }[];
};
type Derived = { bmr: number; tdee: number; expectedWeeklyLossKg: number; weeksToGoal: number | null; pace: { message: string }; warnings: string[] };

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-xl bg-slate-100 p-3 dark:bg-[#1b2430]"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold">{value}</p>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
);

export function Home() {
  const { version, bump, openAdd } = useApp();
  const [d, setD] = useState<Dash | null>(null);
  const [der, setDer] = useState<Derived | null>(null);
  const [err, setErr] = useState(false);
  const [trend, setTrend] = useState<{ status: string; message: string } | null>(null);
  const date = todayStr();
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api<Dash>(`/dashboard?date=${date}`), api<{ derived: Derived }>('/profile')]);
    setD(a); setDer(b.derived);
    api<{ trend: { status: string; message: string } }>(`/insights/status?date=${date}`).then((r) => setTrend(r.trend)).catch(() => undefined);
  }, [date]);
  useEffect(() => { load().catch(() => setErr(true)); }, [load, version]);

  async function water(ml: number) { await api('/diary/water', { method: 'POST', body: JSON.stringify({ date, ml }) }); bump(); }
  async function undoWater() { await api(`/diary/water/last?date=${date}`, { method: 'DELETE' }).catch(() => undefined); bump(); }

  if (err) return <p role="alert" className="text-red-500">No se pudo cargar el panel.</p>;
  if (!d) return <p className="text-slate-500">Cargando…</p>;
  const { diary: y, weight: w } = d;
  const left = Math.round(y.remaining.kcal ?? 0);
  const proteinLeft = Math.max(0, Math.round(y.remaining.protein ?? 0));
  const hist = d.history;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Hoy</h1>

      <section className="card flex items-center gap-4">
        <Ring pct={w.progressPct != null ? w.progressPct / 100 : 0} size={110} color="#22c55e">
          <b className="text-xl">{w.progressPct != null ? `${w.progressPct}%` : '—'}</b><span className="text-[10px] text-slate-500">hacia {w.goalKg} kg</span>
        </Ring>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Stat label="Peso actual" value={w.currentKg != null ? `${w.currentKg} kg` : 'Sin registro'} sub={w.avg7Kg != null ? `media 7 d: ${w.avg7Kg}` : undefined} />
          <Stat label="Objetivo" value={`${w.goalKg} kg`} sub={w.remainingKg != null ? `faltan ${w.remainingKg} kg` : undefined} />
          <Stat label="Perdidos" value={w.lostKg != null ? `${w.lostKg} kg` : '—'} sub={w.weeklyChangeKg != null ? `${w.weeklyChangeKg > 0 ? '+' : ''}${w.weeklyChangeKg} kg vs sem. ant.` : undefined} />
        </div>
      </section>
      {w.currentKg == null && <p className="text-sm text-slate-500">Registra tu primer peso en <b>Progreso</b> para ver tu avance.</p>}
      {trend && trend.status !== 'insufficient_data' && (
        <p role="note" className={`rounded-xl p-3 text-sm ${trend.status === 'stalled' || trend.status === 'too_fast' || trend.status === 'gaining' ? 'bg-amber-500/10' : 'bg-accent/10'}`}>{trend.message}</p>
      )}

      <section className="card">
        <div className="flex items-center gap-4">
          <Ring pct={y.totals.kcal / y.targets.kcal} size={110} color={left < 0 ? '#f59e0b' : '#22c55e'}>
            <b className="text-xl">{Math.abs(left)}</b><span className="text-[10px] text-slate-500">{left >= 0 ? 'kcal restantes' : 'kcal de más'}</span>
          </Ring>
          <div className="grid flex-1 gap-2"><Bar label="Proteínas" value={y.totals.protein} target={y.targets.protein} color="#60a5fa" /><Bar label="Carbohidratos" value={y.totals.carbs} target={y.targets.carbs} color="#fbbf24" /><Bar label="Grasas" value={y.totals.fat} target={y.targets.fat} color="#f472b6" /><Bar label="Fibra" value={y.totals.fiber} target={y.targets.fiber} color="#a78bfa" /></div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {y.totals.kcal === 0 ? 'Aún no has registrado comidas hoy.' : `Consumidas ${Math.round(y.totals.kcal)} de ${y.targets.kcal} kcal. ${proteinLeft > 0 ? `Te faltan ${proteinLeft} g de proteína.` : 'Proteína del día cubierta.'}`}
        </p>
        <button className="btn mt-3 w-full" onClick={() => openAdd({})}>+ Registrar comida</button>
      </section>

      {y.productAlerts.filter((a) => a.level === 'warn').map((a) => <p key={a.productId} role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">{a.messages[0]}</p>)}

      <section className="card">
        <h2 className="mb-2 font-semibold">Agua</h2>
        <Bar label="Hoy" value={y.waterMl} target={y.targets.waterMl} color="#38bdf8" unit="ml" />
        <div className="mt-3 flex gap-2 text-sm">
          {[250, 500].map((ml) => <button key={ml} className="flex-1 rounded-xl border border-slate-300 py-2 dark:border-slate-700" onClick={() => water(ml)}>+{ml} ml</button>)}
          <button className="rounded-xl px-3 text-slate-500" onClick={undoWater} aria-label="Deshacer último vaso">↶</button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Actividad y sueño</h2>
        {d.activity || d.sleep ? (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Pasos" value={d.activity?.steps?.toLocaleString('es') ?? '—'} />
            <Stat label="Calorías activas" value={d.activity?.activeKcal != null ? `${Math.round(d.activity.activeKcal)} kcal` : '—'} />
            <Stat label="Ejercicio" value={d.activity?.exerciseMin != null ? `${Math.round(d.activity.exerciseMin)} min` : '—'} />
            <Stat label="Sueño" value={d.sleep?.totalMin != null ? `${Math.floor(d.sleep.totalMin / 60)} h ${d.sleep.totalMin % 60} min` : '—'} />
          </div>
        ) : <p className="text-sm text-slate-500">Sin datos de actividad ni sueño: aún no están conectados (Apple Health y registro manual llegan en la siguiente fase). No se muestran valores inventados.</p>}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Calorías (14 días)</h2>
        <Chart bars unit=" kcal" goal={{ y: y.targets.kcal, label: 'objetivo' }} series={[{ name: 'Consumidas', color: '#22c55e', pts: hist.map((h) => ({ x: h.date, y: Math.round(h.kcal) })) }]} />
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Macronutrientes (14 días)</h2>
        <Chart unit=" g" series={[
          { name: 'Proteínas', color: '#60a5fa', pts: hist.map((h) => ({ x: h.date, y: Math.round(h.protein) })) },
          { name: 'Carbohidratos', color: '#fbbf24', pts: hist.map((h) => ({ x: h.date, y: Math.round(h.carbs) })) },
          { name: 'Grasas', color: '#f472b6', pts: hist.map((h) => ({ x: h.date, y: Math.round(h.fat) })) },
        ]} />
      </section>

      {der && (
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Plan <span className="text-xs font-normal text-amber-500">(estimaciones por fórmula, no valores médicos)</span></h2>
          <p>Basal ≈ {der.bmr} kcal · gasto estimado ≈ {der.tdee} kcal · pérdida esperada ≈ {der.expectedWeeklyLossKg} kg/sem{der.weeksToGoal != null ? ` · ≈ ${(der.weeksToGoal / 4.345).toFixed(1)} meses hasta ${w.goalKg} kg` : ''}.</p>
          <p className="mt-1 text-slate-500">{der.pace.message}</p>
          {der.warnings.map((x) => <p key={x} className="mt-1 text-amber-500">⚠ {x}</p>)}
        </section>
      )}
      <p className="text-xs text-slate-500">{w.note}</p>
    </div>
  );
}
