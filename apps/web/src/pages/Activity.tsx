import { Footprints, Flame, Moon, Route as RouteIcon, Timer, Watch } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { PageHeader } from '../components/PageHeader';
import { useApp } from '../ctx';
import { useData } from '../hooks';
import { todayStr, shiftDate } from '../ui/DateSelector';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Card, EmptyState, ErrorState, FormField, LoadingState, Notice, SectionHeader, Segmented, SelectField } from '../ui/primitives';
import { Stat } from '../ui/progress';
import { TrendChart } from '../ui/TrendChart';

type Day = {
  date: string; steps: number | null; activeKcal: number | null; restingKcal: number | null; distanceKm: number | null; exerciseMin: number | null;
  expenditure: { kcal: number; source: 'HEALTH' | 'ESTIMATE' } | null; sleepMin: number | null; sleepSource: string | null; quality: number | null;
};
type Overview = {
  days: Day[]; workouts: { id: string; date: string; type: string; durationMin: number; activeKcal: number | null }[];
  sleepStats: { avgHours7: number | null; avgHoursPrev7: number | null; avgHoursPeriod: number | null; nights: number; bedtimeVariabilityMin: number | null; wakeVariabilityMin: number | null };
  relations: { sleepVsSteps: { r: number | null; n: number }; sleepVsNextWeighInDelta: { r: number | null; n: number }; note: string };
};

const hm = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
const num = (v: number | null, u = '') => (v == null ? '—' : `${Math.round(v).toLocaleString('es')}${u}`);
const iso = (date: string, time: string, offset = 0) => new Date(`${shiftDate(date, offset)}T${time}:00`).toISOString();

function describeR(r: number | null, n: number) {
  if (r == null) return `Aún no hay datos suficientes (${n} de 7 días necesarios).`;
  const a = Math.abs(r);
  return `r = ${r} · relación ${a >= 0.6 ? 'fuerte' : a >= 0.3 ? 'moderada' : 'débil o nula'} ${r >= 0 ? 'positiva' : 'negativa'} (${n} días).`;
}

export function Activity() {
  const [days, setDays] = useState(30);
  const [sheet, setSheet] = useState<'sleep' | 'activity' | null>(null);
  const today = todayStr();
  const { data: o, error, loading, reload } = useData<Overview>(`/activity/overview?date=${today}&days=${days}`);

  const has = (o?.days ?? []).some((d) => d.steps != null || d.activeKcal != null || d.sleepMin != null);
  const withData = (k: keyof Day) => (o?.days ?? []).filter((d) => d[k] != null);
  const last = (k: keyof Day) => [...(o?.days ?? [])].reverse().find((d) => d[k] != null);
  const t = o?.days.at(-1);
  const s = o?.sleepStats;
  const diff = s && s.avgHours7 != null && s.avgHoursPrev7 != null ? Math.round((s.avgHours7 - s.avgHoursPrev7) * 10) / 10 : null;

  return (
    <>
      <PageHeader title="Actividad" />
      {loading ? <LoadingState rows={3} /> : error || !o ? <ErrorState onRetry={reload} /> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Periodo" value={days} onChange={setDays} options={[{ value: 7, label: '7 d' }, { value: 30, label: '30 d' }, { value: 90, label: '90 d' }]} />
            <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setSheet('activity')}>Registrar actividad</Button><Button variant="secondary" size="sm" onClick={() => setSheet('sleep')}>Registrar sueño</Button></div>
          </div>

          {!has && (
            <Card>
              <EmptyState icon={Watch} title="Todavía no hay datos de actividad" text="Conecta Apple Health mediante un Atajo de iOS o registra tu actividad y tu sueño a mano. Hasta entonces no se muestran valores."
                action={<Link to="/settings#apple-health" className="inline-flex min-h-11 items-center rounded-ctl bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">Conectar Apple Health</Link>} />
            </Card>
          )}

          {has && (
            <>
              <Card>
                <p className="t-over mb-3">Último día con datos</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { i: Footprints, l: 'Pasos', v: num(last('steps')?.steps ?? null) },
                    { i: RouteIcon, l: 'Distancia', v: last('distanceKm')?.distanceKm != null ? `${last('distanceKm')!.distanceKm!.toLocaleString('es', { maximumFractionDigits: 1 })} km` : '—' },
                    { i: Flame, l: 'Activas', v: num(last('activeKcal')?.activeKcal ?? null, ' kcal') },
                    { i: Flame, l: 'En reposo', v: num(last('restingKcal')?.restingKcal ?? null, ' kcal') },
                    { i: Timer, l: 'Ejercicio', v: num(last('exerciseMin')?.exerciseMin ?? null, ' min') },
                    { i: Moon, l: 'Sueño', v: hm(last('sleepMin')?.sleepMin ?? null) },
                  ].map(({ i: I, l, v }) => <div key={l} className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><I className="size-[18px]" aria-hidden /></span><Stat label={l} value={v} /></div>)}
                </dl>
                {t?.expenditure && <p className="t-meta mt-4 border-t border-line pt-3">Gasto total de hoy: <b className="num text-ink">{t.expenditure.kcal} kcal</b> {t.expenditure.source === 'ESTIMATE' ? '(estimado: sin energía en reposo de Health)' : '(reposo + activa)'}.</p>}
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card><h2 className="t-head mb-2">Pasos</h2><TrendChart kind="bar" label="Pasos diarios" series={[{ name: 'Pasos', color: 'var(--accent)', pts: withData('steps').map((d) => ({ x: d.date, y: d.steps as number })) }]} /></Card>
                <Card><h2 className="t-head mb-2">Gasto energético</h2><TrendChart label="Gasto energético" unit=" kcal" series={[
                  { name: 'Activas', color: 'var(--m-carbs)', pts: withData('activeKcal').map((d) => ({ x: d.date, y: Math.round(d.activeKcal as number) })) },
                  { name: 'Total', color: 'var(--accent)', pts: (o.days.filter((d) => d.expenditure)).map((d) => ({ x: d.date, y: d.expenditure!.kcal })) }]} />
                  <p className="t-meta mt-2">Total = reposo + activa; nunca se suman dos fuentes.</p></Card>
                <Card><h2 className="t-head mb-2">Sueño</h2><TrendChart kind="bar" label="Horas de sueño" unit=" h" decimals={1} series={[{ name: 'Horas', color: 'var(--m-protein)', pts: withData('sleepMin').map((d) => ({ x: d.date, y: Math.round(((d.sleepMin as number) / 60) * 10) / 10 })) }]} /></Card>
                <Card>
                  <h2 className="t-head mb-3">Resumen de sueño</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <Stat label="Media 7 días" value={s?.avgHours7 != null ? `${s.avgHours7} h` : '—'} sub={diff != null ? `${diff > 0 ? '+' : ''}${diff} h vs. semana ant.` : undefined} />
                    <Stat label={`Media del periodo`} value={s?.avgHoursPeriod != null ? `${s.avgHoursPeriod} h` : '—'} sub={`${s?.nights ?? 0} noches`} />
                    <Stat label="Variación al dormir" value={s?.bedtimeVariabilityMin != null ? `± ${s.bedtimeVariabilityMin} min` : '—'} />
                    <Stat label="Variación al despertar" value={s?.wakeVariabilityMin != null ? `± ${s.wakeVariabilityMin} min` : '—'} />
                  </dl>
                  <p className="t-meta mt-3">Cuanto menor la variación, más regular tu horario.</p>
                </Card>
              </div>

              <div>
                <SectionHeader title="Últimos 7 días" />
                <Card className="!p-0 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead><tr className="t-meta text-left"><th className="px-4 py-2.5 font-medium">Día</th><th className="font-medium">Pasos</th><th className="font-medium">Activas</th><th className="font-medium">Gasto</th><th className="pr-4 font-medium">Sueño</th></tr></thead>
                    <tbody>{[...o.days].slice(-7).reverse().map((d) => (
                      <tr key={d.date} className="num border-t border-line"><td className="px-4 py-2.5 capitalize">{new Date(`${d.date}T12:00:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}</td><td>{num(d.steps)}</td><td>{num(d.activeKcal)}</td><td>{d.expenditure ? `${d.expenditure.kcal}${d.expenditure.source === 'ESTIMATE' ? ' est.' : ''}` : '—'}</td><td className="pr-4">{hm(d.sleepMin)}</td></tr>))}</tbody>
                  </table>
                </Card>
              </div>

              <Card>
                <h2 className="t-head mb-2">Relaciones en tus datos</h2>
                <p className="text-sm"><b>Sueño y pasos:</b> {describeR(o.relations.sleepVsSteps.r, o.relations.sleepVsSteps.n)}</p>
                <p className="mt-1 text-sm"><b>Sueño y cambio de peso:</b> {describeR(o.relations.sleepVsNextWeighInDelta.r, o.relations.sleepVsNextWeighInDelta.n)}</p>
                <p className="t-meta mt-2">{o.relations.note}</p>
              </Card>

              {o.workouts.length > 0 && (
                <div><SectionHeader title="Entrenamientos" />
                  <Card className="!py-1"><ul>{o.workouts.slice(0, 8).map((w) => <li key={w.id} className="flex items-center justify-between border-t border-line py-3 first:border-0"><span className="font-medium">{w.type}<span className="t-meta block capitalize">{new Date(`${w.date}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}</span></span><span className="num t-meta text-right">{Math.round(w.durationMin)} min{w.activeKcal != null ? <><br />{Math.round(w.activeKcal)} kcal</> : ''}</span></li>)}</ul></Card></div>
              )}
            </>
          )}
        </div>
      )}
      <ActivitySheet kind={sheet} onClose={() => setSheet(null)} />
    </>
  );
}

function ActivitySheet({ kind, onClose }: { kind: 'sleep' | 'activity' | null; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = todayStr();

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) ? Number(String(f.get(k)).replace(',', '.')) : undefined);
    const date = String(f.get('date'));
    setBusy(true); setErr('');
    try {
      if (kind === 'activity') {
        await api('/activity/activity', { method: 'POST', body: JSON.stringify({ date, steps: n('steps'), activeKcal: n('activeKcal'), distanceKm: n('distanceKm'), exerciseMin: n('exerciseMin') }) });
      } else {
        const bed = String(f.get('bed') || ''), sleep = String(f.get('sleep') || ''), wake = String(f.get('wake') || '');
        const body: Record<string, unknown> = { date };
        if (wake) body.wakeAt = iso(date, wake);
        if (sleep && wake) body.sleepAt = iso(date, sleep, sleep > wake ? -1 : 0);
        if (bed && wake) body.bedtime = iso(date, bed, bed > wake ? -1 : 0);
        if (n('hours')) body.totalMin = Math.round(n('hours')! * 60);
        if (n('quality')) body.quality = n('quality');
        if (n('awakenings') != null) body.awakenings = n('awakenings');
        await api('/activity/sleep', { method: 'POST', body: JSON.stringify(body) });
      }
      toast(kind === 'activity' ? 'Actividad guardada' : 'Sueño guardado'); bump(); onClose();
    } catch (er) {
      setErr(er instanceof ApiError ? 'Revisa los datos: indica al menos un valor válido (en sueño, horas coherentes o la duración).' : 'No se pudo guardar.');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={!!kind} onClose={onClose} title={kind === 'sleep' ? 'Registrar sueño' : 'Registrar actividad'}>
      <form onSubmit={save} className="flex flex-col gap-3" key={kind}>
        <FormField label={kind === 'sleep' ? 'Día en que te despiertas' : 'Fecha'} name="date" type="date" defaultValue={today} max={today} required />
        {kind === 'sleep' ? (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3"><FormField label="Me acosté" name="bed" type="time" /><FormField label="Me dormí" name="sleep" type="time" /><FormField label="Me desperté" name="wake" type="time" /></div>
            <FormField label="…o solo la duración (h)" name="hours" inputMode="decimal" placeholder="7,5" />
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Calidad" name="quality" defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map((q) => <option key={q}>{q}</option>)}</SelectField>
              <FormField label="Despertares" name="awakenings" inputMode="numeric" placeholder="0" />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3"><FormField label="Pasos" name="steps" inputMode="numeric" /><FormField label="Kcal activas" name="activeKcal" inputMode="decimal" /><FormField label="Distancia (km)" name="distanceKm" inputMode="decimal" /><FormField label="Ejercicio (min)" name="exerciseMin" inputMode="decimal" /></div>
            <Notice tone="info">Si Apple Health también aporta un dato, prevalece Health; nunca se suman.</Notice>
          </>
        )}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" loading={busy} block>Guardar</Button>
      </form>
    </Sheet>
  );
}
