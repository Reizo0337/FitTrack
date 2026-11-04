import { Scale, ScanBarcode, Sparkles, Utensils } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ActivitySummary } from '../components/ActivitySummary';
import { Challenges } from '../components/Challenges';
import { FastingCard } from '../components/Fasting';
import { CalorieSummary, MealCard } from '../components/nutrition';
import { greeting, PageHeader } from '../components/PageHeader';
import { shiftDate, todayStr, useApp } from '../ctx';
import { useData } from '../hooks';
import type { Dash, Profile } from '../types';
import { useToast } from '../ui/overlays';
import { Button, Card, ErrorState, LoadingState, Notice, SectionHeader, cx } from '../ui/primitives';
import { ProgressBar, Stat } from '../ui/progress';

const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('es')}`;

export function Home() {
  const { openAdd, openWeight, bump } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const today = todayStr();
  const dash = useData<Dash>(`/dashboard?date=${today}`);
  const prof = useData<{ profile: Profile }>('/profile');
  const trend = useData<{ trend: { status: string; message: string } }>(`/insights/status?date=${today}`);

  if (dash.loading) return <><PageHeader title="Inicio" /><LoadingState /></>;
  if (dash.error || !dash.data) return <><PageHeader title="Inicio" /><ErrorState onRetry={dash.reload} /></>;
  const { diary: d, weight: w } = dash.data;
  const name = prof.data?.profile.displayName?.trim();
  const date = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  async function repeat(type: string) {
    const r = await api<{ copied: number }>('/diary/copy', { method: 'POST', body: JSON.stringify({ fromDate: shiftDate(today, -1), toDate: today, type }) });
    toast(r.copied ? 'Comida repetida de ayer' : 'Ayer no registraste esta comida', r.copied ? 'success' : 'info');
    bump();
  }

  const quick = [
    { icon: Utensils, label: 'Comida', run: () => openAdd({}) },
    { icon: ScanBarcode, label: 'Escanear', run: () => openAdd({ tab: 'scan' }) },
    { icon: Scale, label: 'Peso', run: openWeight },
    { icon: Sparkles, label: 'IA', run: () => nav('/ai') },
  ];

  return (
    <>
      <PageHeader title={`${greeting()}${name ? `, ${name}` : ''}`} overline={date} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <CalorieSummary d={d} burned={dash.data.activity?.activeKcal} />
          <FastingCard />
          {d.productAlerts.filter((a) => a.level === 'warn').map((a) => <Notice key={a.productId} tone="warn">{a.messages[0]}</Notice>)}
          {trend.data && trend.data.trend.status !== 'insufficient_data' && <Notice tone={['stalled', 'too_fast', 'gaining'].includes(trend.data.trend.status) ? 'warn' : 'accent'}>{trend.data.trend.message}</Notice>}
          <div>
            <SectionHeader title="Comidas de hoy" action={<Link to="/food" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong">Ver diario</Link>} />
            <div className="flex flex-col gap-2.5">
              {d.meals.filter((m) => m.type !== 'SNACKS' || m.entries.length).map((m) => (
                <MealCard key={m.type} meal={m} onAdd={() => openAdd({ type: m.type })} onRepeat={() => repeat(m.type)} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <ul className="grid grid-cols-4 gap-2" aria-label="Acciones rápidas">
            {quick.map(({ icon: I, label, run }) => (
              <li key={label}>
                <button onClick={run} className="flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-surface text-[0.8125rem] font-medium transition hover:bg-surface-2 active:scale-[.97]">
                  <I className="size-5 text-accent-strong" aria-hidden />{label}
                </button>
              </li>
            ))}
          </ul>

          <div>
            <SectionHeader title="Actividad" action={<Link to="/activity" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong">Ver más</Link>} />
            <ActivitySummary activity={dash.data.activity} sleep={dash.data.sleep} />
          </div>

          <Challenges compact />

          <div>
            <SectionHeader title="Progreso" action={<Link to="/progress" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong">Ver evolución</Link>} />
            <Card>
              {w.currentKg == null ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="t-body">Aún no has registrado tu peso. Cuando lo hagas verás aquí tu avance hacia {w.goalKg} kg.</p>
                  <Button onClick={openWeight}>Registrar peso</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div><p className="t-meta">Peso actual</p><p className="num t-display">{w.currentKg.toLocaleString('es')}<span className="t-meta font-normal"> kg</span></p></div>
                    {w.lostKg != null && <p className={cx('num pb-1 text-sm font-semibold', w.lostKg > 0 ? 'text-accent-strong' : 'text-ink-2')}>{sign(-w.lostKg)} kg</p>}
                  </div>
                  <div className="mt-4"><ProgressBar value={(w.progressPct ?? 0) / 100} height={8} label="Progreso hacia el objetivo" /></div>
                  <div className="mt-2 flex justify-between"><span className="t-meta">{w.startKg} kg</span><span className="t-meta">{w.progressPct}% · objetivo {w.goalKg} kg</span></div>
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                    <Stat label="Faltan" value={`${w.remainingKg} kg`} />
                    <Stat label="Media 7 d" value={w.avg7Kg != null ? `${w.avg7Kg} kg` : '—'} />
                    <Stat label="Semana" value={w.weeklyChangeKg != null ? `${sign(w.weeklyChangeKg)} kg` : '—'} />
                  </div>
                </>
              )}
            </Card>
            <p className="t-meta mt-2 px-1">{w.note}</p>
          </div>
        </div>
      </div>
    </>
  );
}
