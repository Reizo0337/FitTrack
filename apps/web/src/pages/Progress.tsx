import { Ruler, Scale, TrendingDown } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Challenges } from '../components/Challenges';
import { PageHeader } from '../components/PageHeader';
import { Photos } from '../components/Photos';
import { WeightChart, type WeightPoint } from '../components/WeightChart';
import { shiftDate, useApp } from '../ctx';
import { useData } from '../hooks';
import type { Profile } from '../types';
import { todayStr } from '../ui/DateSelector';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Card, EmptyState, ErrorState, FormField, LoadingState, Notice, SectionHeader, Segmented } from '../ui/primitives';
import { ProgressBar, Stat } from '../ui/progress';

type Meas = { id: string; date: string; waistCm: number | null; chestCm: number | null; hipCm: number | null; armCm: number | null; thighCm: number | null };
const M: [keyof Meas, string][] = [['waistCm', 'Cintura'], ['chestCm', 'Pecho'], ['hipCm', 'Cadera'], ['armCm', 'Brazo'], ['thighCm', 'Muslo']];
const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('es')}`;

export function Progress() {
  const { openWeight } = useApp();
  const [range, setRange] = useState(90);
  const w = useData<{ series: WeightPoint[] }>(`/weight?days=${range}`);
  const m = useData<{ items: Meas[] }>('/weight/measurements');
  const p = useData<{ profile: Profile }>('/profile');
  const [measOpen, setMeasOpen] = useState(false);

  const series = w.data?.series ?? [];
  const goal = p.data?.profile.goalWeightKg, start = p.data?.profile.startWeightKg;
  const stats = useMemo(() => {
    const last = series.at(-1);
    if (!last) return null;
    const ago = (n: number) => [...series].reverse().find((x) => x.date <= shiftDate(last.date, -n));
    const wk = ago(7), mo = ago(30);
    const pct = goal != null && start != null && start > goal ? Math.max(0, Math.min(100, ((start - last.weightKg) / (start - goal)) * 100)) : 0;
    return { last, weekly: wk ? Math.round((last.avg7 - wk.avg7) * 100) / 100 : null, monthly: mo ? Math.round((last.avg7 - mo.avg7) * 100) / 100 : null, pct };
  }, [series, goal, start]);
  const comp = [...series].reverse().find((x) => x.bodyFatPct != null);

  return (
    <>
      <PageHeader title="Progreso" actions={<Button variant="secondary" size="sm" icon={Scale} onClick={openWeight}>Peso</Button>} />
      {w.loading || p.loading ? <LoadingState rows={2} /> : w.error ? <ErrorState onRetry={w.reload} /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-4">
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="t-head">Peso</h2>
                <Segmented label="Rango" value={range} onChange={setRange} options={[{ value: 30, label: '1 M' }, { value: 90, label: '3 M' }, { value: 180, label: '6 M' }, { value: 365, label: '1 A' }]} /></div>
              {series.length ? <WeightChart series={series} goalKg={goal} /> : (
                <EmptyState icon={Scale} title="Sin pesajes todavía" text="Registra tu peso (3 mañanas a la semana es suficiente) para ver tu tendencia. Importa más la media semanal que un día suelto."
                  action={<Button onClick={openWeight}>Registrar peso</Button>} />
              )}
              {series.length > 0 && <p className="t-meta mt-2">La línea verde es la media de 7 días: úsala como referencia y no te fijes en las subidas y bajadas diarias.</p>}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between"><h2 className="t-head flex items-center gap-2"><Ruler className="size-[18px] text-ink-2" aria-hidden />Medidas corporales</h2><Button variant="secondary" size="sm" onClick={() => setMeasOpen(true)}>Añadir</Button></div>
              {m.data?.items.length ? (
                <div className="-mx-1 overflow-x-auto"><table className="w-full min-w-[26rem] text-sm"><thead><tr className="t-meta text-left"><th className="px-1 pb-2 font-medium">Fecha</th>{M.map(([, l]) => <th key={l} className="pb-2 font-medium">{l}</th>)}</tr></thead>
                  <tbody>{m.data.items.slice(-6).reverse().map((r) => <tr key={r.id} className="num border-t border-line"><td className="px-1 py-2.5">{new Date(`${r.date}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</td>{M.map(([k]) => <td key={k}>{(r[k] as number | null) ?? '—'}</td>)}</tr>)}</tbody></table>
                  {m.data.items.length > 1 && <p className="t-meta mt-2 px-1">Cambio desde la primera medición: {M.map(([k, l]) => { const a = m.data!.items.find((x) => x[k] != null)?.[k] as number | undefined, b = [...m.data!.items].reverse().find((x) => x[k] != null)?.[k] as number | undefined; return a != null && b != null && a !== b ? `${l} ${sign(Math.round((b - a) * 10) / 10)} cm` : null; }).filter(Boolean).join(' · ') || 'sin cambios'}.</p>}</div>
              ) : <p className="t-meta">Aún no hay medidas. Cintura, pecho, cadera, brazo y muslo te dan más información que el peso solo.</p>}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            {stats && goal != null && start != null && (
              <Card>
                <div className="flex items-end justify-between"><div><p className="t-meta">Peso actual</p><p className="num t-display">{stats.last.weightKg.toLocaleString('es')}<span className="t-meta font-normal"> kg</span></p></div>
                  <p className="num flex items-center gap-1 pb-1 text-sm font-semibold text-accent-strong"><TrendingDown className="size-4" aria-hidden />{sign(Math.round((stats.last.weightKg - start) * 10) / 10)} kg</p></div>
                <div className="mt-4"><ProgressBar value={stats.pct / 100} height={8} label="Progreso hacia el objetivo" /></div>
                <div className="mt-2 flex justify-between"><span className="t-meta">{start} kg</span><span className="t-meta">{Math.round(stats.pct)} % · objetivo {goal} kg</span></div>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  <Stat label="Media 7 d" value={`${stats.last.avg7} kg`} />
                  <Stat label="Semana" value={stats.weekly != null ? `${sign(stats.weekly)} kg` : '—'} sub="media vs. ant." />
                  <Stat label="Mes" value={stats.monthly != null ? `${sign(stats.monthly)} kg` : '—'} sub="media vs. ant." />
                </dl>
                <p className="t-meta mt-3 border-t border-line pt-3">Faltan <b className="num text-ink">{Math.max(0, Math.round((stats.last.weightKg - goal) * 10) / 10)} kg</b> para llegar a {goal} kg.</p>
              </Card>
            )}
            <Notice tone="info">{comp ? `Última composición: ${comp.bodyFatPct} % de grasa${comp.muscleKg != null ? ` · ${comp.muscleKg} kg de músculo` : ''}. ` : ''}Perder peso no es lo mismo que perder grasa: solo se puede afirmar pérdida de grasa si hay mediciones de composición corporal.</Notice>
            <Challenges embedded />
            <Photos />
          </div>
        </div>
      )}
      <MeasureSheet open={measOpen} onClose={() => setMeasOpen(false)} />
    </>
  );
}

function MeasureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { date: String(f.get('date')) };
    for (const [k] of M) if (f.get(k as string)) body[k as string] = Number(String(f.get(k as string)).replace(',', '.'));
    setBusy(true); setErr('');
    try { await api('/weight/measurements', { method: 'POST', body: JSON.stringify(body) }); toast('Medidas guardadas'); bump(); onClose(); }
    catch { setErr('Indica al menos una medida válida.'); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Medidas corporales">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <FormField className="col-span-2" label="Fecha" name="date" type="date" defaultValue={todayStr()} max={todayStr()} required />
        {M.map(([k, l]) => <FormField key={k} label={`${l} (cm)`} name={k as string} inputMode="decimal" />)}
        {err && <p role="alert" className="col-span-2 text-sm text-danger">{err}</p>}
        <Button type="submit" loading={busy} block className="col-span-2">Guardar</Button>
      </form>
    </Sheet>
  );
}
