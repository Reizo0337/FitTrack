import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { todayStr } from '../../ctx';
import { useData } from '../../hooks';
import { Button, Card, ErrorState, LoadingState, Notice, SectionHeader } from '../../ui/primitives';
import { AIError } from './shared';

type Stats = {
  desde: string; hasta: string; registro: { diasConComidas: number; de: number };
  nutricion: { kcalMedia: number | null; kcalObjetivo: number; proteinaMediaG: number | null; proteinaObjetivoG: number; fibraMediaG: number | null; aguaMediaMl: number | null };
  cumplimiento: { diasProteinaObjetivo: number; diasDentroDeKcal: number; diasConAgua: number };
  actividad: { pasosMedios: number | null; kcalActivasMedias: number | null; diasConDatosPasos: number };
  sueno: { horasMedias: number | null; nochesConDato: number };
  peso: { pesajesEstaSemana: number; primeroKg: number | null; ultimoKg: number | null; mediaSemanaKg: number | null; cambioMediaSemanalKg: number | null };
  tendencia: { status: string; message: string };
};
type Narrative = { summary: string; wins: string[]; concerns: string[]; suggestions: string[] };
const v = (x: number | null, u = '', dec = 1) => (x == null ? 'sin datos' : `${(Math.round(x * 10 ** dec) / 10 ** dec).toLocaleString('es')}${u}`);
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' });

/** Informe semanal: las cifras se calculan en el servidor con tus datos reales; la IA solo redacta sobre ellas. */
export function ReportTab({ aiReady, autoAnalyse = false }: { aiReady: boolean; autoAnalyse?: boolean }) {
  const s = useData<Stats>(`/insights/weekly?end=${todayStr()}`);
  const [nar, setNar] = useState<Narrative | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  // Pedido desde el chat: redacta el análisis solo, como si hubieras pulsado el botón.
  const auto = useRef(false);
  useEffect(() => { if (autoAnalyse && aiReady && !auto.current) { auto.current = true; void analyse(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function analyse() {
    setBusy(true); setErr(undefined);
    try { setNar((await api<{ narrative: Narrative }>('/ai/weekly-analysis', { method: 'POST', body: JSON.stringify({ end: todayStr() }) })).narrative); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  if (s.loading) return <LoadingState rows={2} />;
  if (s.error || !s.data) return <ErrorState onRetry={s.reload} />;
  const d = s.data;
  const rows: [string, string][] = [
    ['Días con comidas registradas', `${d.registro.diasConComidas} de ${d.registro.de}`],
    ['Calorías (media de días registrados)', `${v(d.nutricion.kcalMedia)} / ${d.nutricion.kcalObjetivo}`],
    ['Proteína media', `${v(d.nutricion.proteinaMediaG, ' g')} / ${d.nutricion.proteinaObjetivoG} g`],
    ['Fibra media', v(d.nutricion.fibraMediaG, ' g')], ['Agua media', v(d.nutricion.aguaMediaMl, ' ml', 0)],
    ['Días con proteína cumplida', String(d.cumplimiento.diasProteinaObjetivo)], ['Días dentro del objetivo calórico', String(d.cumplimiento.diasDentroDeKcal)],
    ['Pasos medios', `${v(d.actividad.pasosMedios)} (${d.actividad.diasConDatosPasos} días con dato)`], ['Kcal activas medias', v(d.actividad.kcalActivasMedias, '', 0)],
    ['Sueño medio', `${v(d.sueno.horasMedias, ' h')} (${d.sueno.nochesConDato} noches)`],
    ['Peso: primero → último de la semana', `${v(d.peso.primeroKg, ' kg')} → ${v(d.peso.ultimoKg, ' kg')}`],
    ['Media de peso vs. semana anterior', d.peso.cambioMediaSemanalKg == null ? 'sin datos' : `${d.peso.cambioMediaSemanalKg > 0 ? '+' : ''}${d.peso.cambioMediaSemanalKg} kg`],
  ];
  const tone = d.tendencia.status === 'stalled' || d.tendencia.status === 'too_fast' || d.tendencia.status === 'gaining' ? 'warn' : d.tendencia.status === 'progressing' ? 'accent' : 'info';
  const list = (title: string, xs: string[]) => xs.length > 0 && <div><h3 className="t-head mb-1">{title}</h3><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{xs.map((x) => <li key={x}>{x}</li>)}</ul></div>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader title={`Semana del ${day(d.desde)} al ${day(d.hasta)}`} />
        <Card>
          <p className="t-meta mb-2">Calculado con tus datos reales. «Sin datos» significa que no hay registro, no que sea cero.</p>
          <dl>{rows.map(([k, val]) => <div key={k} className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 first:border-0"><dt className="t-meta">{k}</dt><dd className="num text-right text-sm font-medium">{val}</dd></div>)}</dl>
        </Card>
      </div>
      <div><SectionHeader title="Tendencia del peso" /><Notice tone={tone}>{d.tendencia.message}</Notice></div>
      {aiReady ? <Button loading={busy} block onClick={analyse}>Análisis con IA de esta semana</Button> : <Notice tone="info">Para el análisis redactado por IA configura el consentimiento y una clave en Ajustes.</Notice>}
      <AIError e={err} />
      {nar && <Card className="flex flex-col gap-4"><p className="t-body">{nar.summary}</p>{list('Lo bueno', nar.wins)}{list('A vigilar', nar.concerns)}{list('Para la próxima semana', nar.suggestions)}</Card>}
    </div>
  );
}
