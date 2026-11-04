import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Challenges } from '../components/Challenges';
import { Chart } from '../components/Chart';
import { Photos } from '../components/Photos';
import { shiftDate, todayStr, useApp } from '../ctx';

type Pt = { date: string; weightKg: number; avg7: number; bodyFatPct: number | null; muscleKg: number | null; bodyWaterPct: number | null };
type Meas = { id: string; date: string; waistCm: number | null; chestCm: number | null; hipCm: number | null; armCm: number | null; thighCm: number | null };
const M: [keyof Meas, string][] = [['waistCm', 'Cintura'], ['chestCm', 'Pecho'], ['hipCm', 'Cadera'], ['armCm', 'Brazo'], ['thighCm', 'Muslo']];

export function Progress() {
  const { version, bump } = useApp();
  const [series, setSeries] = useState<Pt[]>([]);
  const [meas, setMeas] = useState<Meas[]>([]);
  const [goal, setGoal] = useState<{ start: number; goal: number } | null>(null);
  const [days, setDays] = useState(90);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [w, m, p] = await Promise.all([
      api<{ series: Pt[] }>(`/weight?days=${days}`), api<{ items: Meas[] }>('/weight/measurements'),
      api<{ profile: { startWeightKg: number; goalWeightKg: number } }>('/profile'),
    ]);
    setSeries(w.series); setMeas(m.items); setGoal({ start: p.profile.startWeightKg, goal: p.profile.goalWeightKg });
  }, [days]);
  useEffect(() => { load().catch(() => setMsg('No se pudieron cargar los datos.')); }, [load, version]);

  const stats = useMemo(() => {
    const last = series[series.length - 1];
    if (!last) return null;
    const ago = (n: number) => [...series].reverse().find((p) => p.date <= shiftDate(last.date, -n));
    const w = ago(7), mth = ago(30);
    return {
      last, weekly: w ? Math.round((last.avg7 - w.avg7) * 100) / 100 : null, monthly: mth ? Math.round((last.avg7 - mth.avg7) * 100) / 100 : null,
      pct: goal ? Math.max(0, Math.min(100, ((goal.start - last.weightKg) / (goal.start - goal.goal)) * 100)) : 0,
    };
  }, [series, goal]);

  async function addWeight(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const n = (k: string) => (f.get(k) ? Number(String(f.get(k)).replace(',', '.')) : undefined);
    try {
      await api('/weight', { method: 'POST', body: JSON.stringify({ date: String(f.get('date')), weightKg: n('weightKg'), bodyFatPct: n('bodyFatPct'), muscleKg: n('muscleKg'), bodyWaterPct: n('bodyWaterPct') }) });
      form.reset(); setMsg('Peso guardado.'); bump();
    } catch (er) { setMsg(er instanceof ApiError && er.status === 400 ? 'Revisa los valores (peso 30-400 kg, grasa 2-70 %…).' : 'Error al guardar.'); }
  }
  async function addMeas(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const body: Record<string, unknown> = { date: String(f.get('date')) };
    for (const [k] of M) if (f.get(k as string)) body[k as string] = Number(String(f.get(k as string)).replace(',', '.'));
    try { await api('/weight/measurements', { method: 'POST', body: JSON.stringify(body) }); form.reset(); setMsg('Medidas guardadas.'); bump(); }
    catch { setMsg('Indica al menos una medida válida.'); }
  }

  const hasFat = series.some((p) => p.bodyFatPct != null);
  const dash = (v: number | null, u: string) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v} ${u}`);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Progreso</h1>
      {msg && <p role="status" className="text-sm text-slate-500">{msg}</p>}
      <section className="card">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Peso</h2>
          <select className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Rango">
            <option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option>
          </select></div>
        <Chart unit=" kg" goal={goal ? { y: goal.goal, label: `${goal.goal} kg` } : undefined}
          series={[{ name: 'Peso', color: '#94a3b8', dots: true, pts: series.map((p) => ({ x: p.date, y: p.weightKg })) }, { name: 'Media 7 d', color: '#22c55e', pts: series.map((p) => ({ x: p.date, y: p.avg7 })) }]} />
        {stats && (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div><dt className="text-xs text-slate-500">Media 7 d</dt><dd className="font-semibold">{stats.last.avg7} kg</dd></div>
            <div><dt className="text-xs text-slate-500">vs. semana ant.</dt><dd className="font-semibold">{dash(stats.weekly, 'kg')}</dd></div>
            <div><dt className="text-xs text-slate-500">vs. mes ant.</dt><dd className="font-semibold">{dash(stats.monthly, 'kg')}</dd></div>
          </dl>
        )}
        {stats && goal && (
          <div className="mt-3"><div className="flex justify-between text-xs text-slate-500"><span>{goal.start} kg</span><span>{Math.round(stats.pct)} % hacia {goal.goal} kg</span></div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${stats.pct}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">Faltan {Math.max(0, Math.round((stats.last.weightKg - goal.goal) * 10) / 10)} kg.</p></div>
        )}
        {!hasFat && <p className="mt-3 text-xs text-slate-500">Solo hay datos de peso total: no se puede afirmar cuánta grasa has perdido. Añade % de grasa si tu báscula lo mide.</p>}
        {stats && hasFat && <p className="mt-3 text-xs text-slate-500">Última composición: grasa {series.filter((p) => p.bodyFatPct != null).at(-1)?.bodyFatPct} %{series.some((p) => p.muscleKg != null) ? ` · músculo ${series.filter((p) => p.muscleKg != null).at(-1)?.muscleKg} kg` : ''}.</p>}
      </section>

      <Challenges />

      <form onSubmit={addWeight} className="card flex flex-col gap-2">
        <h2 className="font-semibold">Registrar peso</h2>
        <div className="grid grid-cols-2 gap-2">
          <input name="date" type="date" className="input" defaultValue={todayStr()} max={todayStr()} required />
          <input name="weightKg" className="input" inputMode="decimal" placeholder="Peso (kg)" required />
          <input name="bodyFatPct" className="input" inputMode="decimal" placeholder="% grasa (opc.)" />
          <input name="muscleKg" className="input" inputMode="decimal" placeholder="Músculo kg (opc.)" />
          <input name="bodyWaterPct" className="input col-span-2" inputMode="decimal" placeholder="% agua corporal (opc.)" />
        </div>
        <button className="btn">Guardar</button>
      </form>

      <section className="card">
        <h2 className="mb-2 font-semibold">Medidas corporales (cm)</h2>
        {meas.length ? (
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Fecha</th>{M.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{meas.slice(-6).map((r) => <tr key={r.id} className="border-t border-slate-200 dark:border-slate-800"><td>{r.date.slice(5)}</td>{M.map(([k]) => <td key={k}>{(r[k] as number | null) ?? '—'}</td>)}</tr>)}</tbody></table>
        ) : <p className="text-sm text-slate-500">Aún no hay medidas.</p>}
        <form onSubmit={addMeas} className="mt-3 grid grid-cols-2 gap-2">
          <input name="date" type="date" className="input col-span-2" defaultValue={todayStr()} max={todayStr()} required />
          {M.map(([k, l]) => <input key={k} name={k as string} className="input" inputMode="decimal" placeholder={`${l} (cm)`} />)}
          <button className="btn col-span-2">Guardar medidas</button>
        </form>
      </section>
      <Photos />
    </div>
  );
}
