import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Chart } from '../components/Chart';
import { shiftDate, todayStr, useApp } from '../ctx';

type Day = {
  date: string; steps: number | null; activeKcal: number | null; restingKcal: number | null; distanceKm: number | null; exerciseMin: number | null;
  expenditure: { kcal: number; source: 'HEALTH' | 'ESTIMATE' } | null; sleepMin: number | null; sleepSource: string | null; quality: number | null; awakenings: number | null;
};
type Overview = {
  days: Day[]; workouts: { id: string; date: string; type: string; durationMin: number; activeKcal: number | null }[];
  sleepStats: { avgHours7: number | null; avgHoursPrev7: number | null; avgHoursPeriod: number | null; nights: number; bedtimeVariabilityMin: number | null; wakeVariabilityMin: number | null };
  relations: { sleepVsSteps: { r: number | null; n: number }; sleepVsNextWeighInDelta: { r: number | null; n: number }; note: string };
};

const hm = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
const num = (v: number | null, u = '') => (v == null ? '—' : `${Math.round(v).toLocaleString('es')}${u}`);
/** Combina un día 'YYYY-MM-DD' y una hora local 'HH:mm' (con desplazamiento de días) en un instante ISO. */
const iso = (date: string, time: string, offset = 0) => new Date(`${shiftDate(date, offset)}T${time}:00`).toISOString();

function describeR(r: number | null, n: number) {
  if (r == null) return `Aún no hay datos suficientes (${n} de 7 días necesarios).`;
  const a = Math.abs(r);
  const s = a >= 0.6 ? 'fuerte' : a >= 0.3 ? 'moderada' : 'débil o nula';
  return `r = ${r} (${s}, ${r >= 0 ? 'positiva' : 'negativa'}), con ${n} días.`;
}

export function Activity() {
  const { version, bump } = useApp();
  const [days, setDays] = useState(30);
  const [o, setO] = useState<Overview | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api<Overview>(`/activity/overview?date=${todayStr()}&days=${days}`).then(setO).catch(() => setMsg('No se pudieron cargar los datos.')), [days]);
  useEffect(() => { load(); }, [load, version]);

  async function saveActivity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const n = (k: string) => (f.get(k) ? Number(String(f.get(k)).replace(',', '.')) : undefined);
    try {
      await api('/activity/activity', { method: 'POST', body: JSON.stringify({ date: String(f.get('date')), steps: n('steps'), activeKcal: n('activeKcal'), distanceKm: n('distanceKm'), exerciseMin: n('exerciseMin') }) });
      form.reset(); setMsg('Actividad guardada.'); bump();
    } catch { setMsg('Indica al menos un dato válido.'); }
  }
  async function saveSleep(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const date = String(f.get('date')), bed = String(f.get('bed') || ''), sleep = String(f.get('sleep') || ''), wake = String(f.get('wake') || '');
    const body: Record<string, unknown> = { date };
    if (wake) body.wakeAt = iso(date, wake);
    if (sleep && wake) body.sleepAt = iso(date, sleep, sleep > wake ? -1 : 0); // si "dormir" es posterior a "despertar", fue el día anterior
    if (bed && wake) body.bedtime = iso(date, bed, bed > wake ? -1 : 0);
    if (f.get('hours')) body.totalMin = Math.round(Number(String(f.get('hours')).replace(',', '.')) * 60);
    if (f.get('quality')) body.quality = Number(f.get('quality'));
    if (f.get('awakenings')) body.awakenings = Number(f.get('awakenings'));
    try { await api('/activity/sleep', { method: 'POST', body: JSON.stringify(body) }); form.reset(); setMsg('Sueño guardado.'); bump(); }
    catch (er) { setMsg(er instanceof ApiError ? 'Indica las horas de dormir y despertar (o la duración) y comprueba que sean coherentes.' : 'Error'); }
  }

  if (!o) return <p className="text-slate-500">{msg || 'Cargando…'}</p>;
  const withData = (k: keyof Day) => o.days.filter((d) => d[k] != null);
  const last7 = o.days.slice(-7).reverse();
  const s = o.sleepStats;
  const diff = s.avgHours7 != null && s.avgHoursPrev7 != null ? Math.round((s.avgHours7 - s.avgHoursPrev7) * 10) / 10 : null;
  const hasAny = o.days.some((d) => d.steps != null || d.activeKcal != null || d.sleepMin != null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Actividad y sueño</h1>
        <select className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Rango">
          <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option></select></div>
      {msg && <p role="status" className="text-sm text-slate-500">{msg}</p>}
      {!hasAny && <p className="card text-sm text-slate-500">Todavía no hay datos. Conecta Apple Health con el Atajo (Ajustes → Apple Health) o regístralos a mano más abajo. No se muestran valores inventados.</p>}

      <section className="card"><h2 className="mb-2 font-semibold">Pasos</h2>
        <Chart bars series={[{ name: 'Pasos', color: '#38bdf8', pts: withData('steps').map((d) => ({ x: d.date, y: d.steps as number })) }]} /></section>
      <section className="card"><h2 className="mb-2 font-semibold">Gasto energético</h2>
        <Chart unit=" kcal" series={[
          { name: 'Activas', color: '#f59e0b', pts: withData('activeKcal').map((d) => ({ x: d.date, y: Math.round(d.activeKcal as number) })) },
          { name: 'Total (reposo + activa)', color: '#22c55e', pts: o.days.filter((d) => d.expenditure).map((d) => ({ x: d.date, y: d.expenditure!.kcal })) },
        ]} />
        <p className="mt-2 text-xs text-slate-500">Total = energía en reposo + activa (no se suma dos veces). Si falta el reposo de Health se usa el metabolismo basal estimado y el día queda marcado «est.».</p></section>

      <section className="card"><h2 className="mb-2 font-semibold">Sueño</h2>
        <Chart bars unit=" h" series={[{ name: 'Horas', color: '#a78bfa', pts: withData('sleepMin').map((d) => ({ x: d.date, y: Math.round(((d.sleepMin as number) / 60) * 10) / 10 })) }]} />
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-slate-500">Media 7 días</dt><dd className="font-semibold">{s.avgHours7 != null ? `${s.avgHours7} h` : '—'}{diff != null && <span className="ml-1 text-xs text-slate-500">({diff > 0 ? '+' : ''}{diff} vs. semana ant.)</span>}</dd></div>
          <div><dt className="text-xs text-slate-500">Media del periodo ({s.nights} noches)</dt><dd className="font-semibold">{s.avgHoursPeriod != null ? `${s.avgHoursPeriod} h` : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Variación al dormir</dt><dd className="font-semibold">{s.bedtimeVariabilityMin != null ? `± ${s.bedtimeVariabilityMin} min` : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Variación al despertar</dt><dd className="font-semibold">{s.wakeVariabilityMin != null ? `± ${s.wakeVariabilityMin} min` : '—'}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">Cuanto menor la variación, más regular tu horario (desviación típica).</p></section>

      <section className="card"><h2 className="mb-2 font-semibold">Comparación de los últimos 7 días</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Día</th><th>Pasos</th><th>Activas</th><th>Gasto</th><th>Sueño</th></tr></thead>
          <tbody>{last7.map((d) => (<tr key={d.date} className="border-t border-slate-200 dark:border-slate-800">
            <td>{d.date.slice(5)}</td><td>{num(d.steps)}</td><td>{num(d.activeKcal)}</td>
            <td>{d.expenditure ? `${d.expenditure.kcal}${d.expenditure.source === 'ESTIMATE' ? ' est.' : ''}` : '—'}</td><td>{hm(d.sleepMin)}</td></tr>))}</tbody></table></div></section>

      <section className="card text-sm"><h2 className="mb-2 font-semibold">Relaciones en tus datos</h2>
        <p><b>Sueño ↔ pasos:</b> {describeR(o.relations.sleepVsSteps.r, o.relations.sleepVsSteps.n)}</p>
        <p className="mt-1"><b>Sueño ↔ cambio de peso al día siguiente:</b> {describeR(o.relations.sleepVsNextWeighInDelta.r, o.relations.sleepVsNextWeighInDelta.n)}</p>
        <p className="mt-2 text-xs text-slate-500">{o.relations.note}</p></section>

      {o.workouts.length > 0 && (<section className="card"><h2 className="mb-2 font-semibold">Entrenamientos</h2>
        <ul className="text-sm">{o.workouts.slice(0, 10).map((w) => <li key={w.id} className="flex justify-between border-t border-slate-200 py-2 dark:border-slate-800"><span>{w.date.slice(5)} · {w.type}</span><span className="text-slate-500">{Math.round(w.durationMin)} min{w.activeKcal != null ? ` · ${Math.round(w.activeKcal)} kcal` : ''}</span></li>)}</ul></section>)}

      <form onSubmit={saveSleep} className="card flex flex-col gap-2"><h2 className="font-semibold">Registrar sueño</h2>
        <p className="text-xs text-slate-500">La fecha es el día en que te despiertas. Si no sabes las horas, indica solo la duración.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-slate-500">Fecha<input name="date" type="date" className="input mt-1" defaultValue={todayStr()} max={todayStr()} required /></label>
          <label className="text-xs text-slate-500">Me acosté<input name="bed" type="time" className="input mt-1" /></label>
          <label className="text-xs text-slate-500">Me dormí<input name="sleep" type="time" className="input mt-1" /></label>
          <label className="text-xs text-slate-500">Me desperté<input name="wake" type="time" className="input mt-1" /></label>
          <label className="text-xs text-slate-500">…o duración (h)<input name="hours" className="input mt-1" inputMode="decimal" placeholder="7,5" /></label>
          <label className="text-xs text-slate-500">Calidad (1-5)<select name="quality" className="input mt-1" defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map((q) => <option key={q}>{q}</option>)}</select></label>
          <label className="text-xs text-slate-500">Despertares<input name="awakenings" className="input mt-1" inputMode="numeric" placeholder="0" /></label>
        </div><button className="btn">Guardar sueño</button></form>

      <form onSubmit={saveActivity} className="card flex flex-col gap-2"><h2 className="font-semibold">Registrar actividad (si no usas Apple Health)</h2>
        <div className="grid grid-cols-2 gap-2"><input name="date" type="date" className="input col-span-2" defaultValue={todayStr()} max={todayStr()} required />
          <input name="steps" className="input" inputMode="numeric" placeholder="Pasos" /><input name="activeKcal" className="input" inputMode="decimal" placeholder="Kcal activas" />
          <input name="distanceKm" className="input" inputMode="decimal" placeholder="Distancia (km)" /><input name="exerciseMin" className="input" inputMode="decimal" placeholder="Minutos de ejercicio" /></div>
        <button className="btn">Guardar actividad</button>
        <p className="text-xs text-slate-500">Si Health también aporta un dato, prevalece Health; nunca se suman.</p></form>
    </div>
  );
}
