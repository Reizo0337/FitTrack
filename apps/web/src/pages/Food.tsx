import { Droplets, Search, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { CalorieSummary, MealCard, NutritionDetail } from '../components/nutrition';
import { PageHeader } from '../components/PageHeader';
import { shiftDate, useApp } from '../ctx';
import { useData } from '../hooks';
import type { Diary, Entry } from '../types';
import { DateSelector } from '../ui/DateSelector';
import { ConfirmSheet, Sheet, useToast } from '../ui/overlays';
import { Button, Card, ErrorState, FormField, LoadingState, Notice, SectionHeader } from '../ui/primitives';
import { ProgressBar } from '../ui/progress';

export function Food() {
  const { date, setDate, bump, openAdd } = useApp();
  const toast = useToast();
  const { data: d, error, loading, reload } = useData<Diary>(`/diary?date=${date}`);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);

  async function repeat(type: string) {
    const r = await api<{ copied: number }>('/diary/copy', { method: 'POST', body: JSON.stringify({ fromDate: shiftDate(date, -1), toDate: date, type }) });
    toast(r.copied ? 'Comida repetida del día anterior' : 'El día anterior no tiene esta comida', r.copied ? 'success' : 'info');
    bump();
  }
  async function water(ml: number) { await api('/diary/water', { method: 'POST', body: JSON.stringify({ date, ml }) }); bump(); }
  async function undoWater() { await api(`/diary/water/last?date=${date}`, { method: 'DELETE' }).catch(() => undefined); bump(); }

  return (
    <>
      <PageHeader title="Alimentación" />
      <div className="mb-4 flex flex-col gap-3">
        <DateSelector date={date} onChange={setDate} />
        <button onClick={() => openAdd({})} className="flex min-h-12 items-center gap-3 rounded-ctl border border-line bg-surface px-4 text-left text-ink-3 transition hover:bg-surface-2">
          <Search className="size-[18px]" aria-hidden /> Buscar o añadir un alimento
        </button>
      </div>

      {loading ? <LoadingState rows={4} /> : error || !d ? <ErrorState onRetry={reload} /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-2.5">
            <SectionHeader title="Comidas" />
            {d.meals.map((m) => <MealCard key={m.type} meal={m} onAdd={() => openAdd({ type: m.type })} onRepeat={() => repeat(m.type)} onEdit={setEditing} onDelete={setDeleting} />)}
          </div>

          <div className="flex flex-col gap-4">
            <CalorieSummary d={d} />
            {d.productAlerts.map((a) => (
              <Notice key={a.productId} tone={a.level === 'warn' ? 'warn' : 'info'}>
                <b className="block">{a.name}: {a.servings} de {a.max} raciones</b>
                {a.messages.map((m) => <span key={m} className="mt-1 block">{m}</span>)}
              </Notice>
            ))}
            <Card>
              <h2 className="t-head mb-3">Detalle nutricional</h2>
              <NutritionDetail d={d} />
              <p className="t-meta mt-3 border-t border-line pt-3">Vitaminas y minerales: aún no se registran. Open Food Facts no los aporta de forma fiable y no se muestran valores inventados.</p>
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="t-head flex items-center gap-2"><Droplets className="size-[18px] text-ink-2" aria-hidden />Agua</h2>
                <span className="num t-meta">{d.waterMl} / {d.targets.waterMl} ml</span>
              </div>
              <ProgressBar value={d.waterMl / d.targets.waterMl} height={8} label="Agua" />
              <div className="mt-3 flex gap-2">
                {[250, 500].map((ml) => <Button key={ml} variant="secondary" size="sm" className="flex-1" onClick={() => water(ml)}>+{ml} ml</Button>)}
                <Button variant="ghost" size="sm" icon={Undo2} onClick={undoWater} aria-label="Deshacer último registro de agua" />
              </div>
            </Card>
          </div>
        </div>
      )}

      <EditEntry entry={editing} onClose={() => setEditing(null)} />
      <ConfirmSheet open={!!deleting} title="Eliminar registro" text={deleting ? `Se eliminará «${deleting.name}» (${deleting.grams} g) de este día.` : ''}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await api(`/diary/entries/${deleting!.id}`, { method: 'DELETE' }); setDeleting(null); toast('Registro eliminado'); bump(); }} />
    </>
  );
}

function EditEntry({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const g = Number(String(new FormData(e.currentTarget).get('grams')).replace(',', '.'));
    if (!(g > 0 && g <= 5000)) return;
    setBusy(true);
    try { await api(`/diary/entries/${entry!.id}`, { method: 'PATCH', body: JSON.stringify({ grams: g }) }); toast('Cantidad actualizada'); bump(); onClose(); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry?.name ?? ''}>
      {entry && (
        <form onSubmit={submit} className="flex flex-col gap-3" key={entry.id}>
          <FormField label="Cantidad (g)" name="grams" inputMode="decimal" defaultValue={entry.grams} autoFocus required />
          <p className="t-meta">Los nutrientes se recalculan proporcionalmente a la nueva cantidad.</p>
          <Button type="submit" loading={busy} block>Guardar</Button>
        </form>
      )}
    </Sheet>
  );
}
