import { MEAL_LABELS, type MealTypeId } from '@fittrack/shared';
import { ShoppingBasket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useData } from '../../hooks';
import { Button, Card, FormField, LoadingState, Notice } from '../../ui/primitives';
import { AIError } from './shared';

type Menu = { days: { day: string; meals: { type: MealTypeId; title: string; minutes?: number | null; ingredients: { name: string; grams: number }[]; kcal: number; protein: number; carbs: number; fat: number; fiber: number }[] }[] };
type Saved = { menu: Menu | null; warnings?: string[]; createdAt?: string };

export function MenuTab({ preset }: { preset?: { budgetEur?: number } } = {}) {
  const latest = useData<Saved>('/ai/menu/latest');
  const [fresh, setFresh] = useState<Saved | null>(null);
  const [budget, setBudget] = useState(preset?.budgetEur ? String(preset.budgetEur) : '');
  const [avail, setAvail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const data = fresh ?? latest.data;

  async function gen() {
    setBusy(true); setErr(undefined);
    try {
      const b = Number(budget.replace(',', '.'));
      const r = await api<{ menu: Menu; warnings: string[] }>('/ai/menu/weekly', { method: 'POST', body: JSON.stringify({ budgetEur: b > 0 ? b : undefined, available: avail.split(',').map((s) => s.trim()).filter(Boolean) }) });
      setFresh({ menu: r.menu, warnings: r.warnings, createdAt: new Date().toISOString() });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  // Pedido desde el chat: genera solo, como si hubieras pulsado «Generar menú semanal».
  const auto = useRef(false);
  useEffect(() => { if (preset && !auto.current) { auto.current = true; void gen(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <p className="t-body text-ink-2">Genero 7 días ajustados a tus objetivos, evitando tus alergias y alimentos rechazados (se comprueba también en el servidor).</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Presupuesto semanal (€)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <FormField label="Tengo en casa" placeholder="huevos, avena…" value={avail} onChange={(e) => setAvail(e.target.value)} hint="Vacío: uso tu despensa." />
        </div>
        <AIError e={err} />
        <Button loading={busy} block onClick={gen}>{data?.menu ? 'Generar otro menú' : 'Generar menú semanal'}</Button>
        {busy && <p className="t-meta text-center">Generar 7 días puede tardar un poco.</p>}
      </Card>

      {latest.loading && !fresh ? <LoadingState rows={2} /> : data?.menu && (
        <>
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="t-meta">{data.createdAt ? `Generado el ${new Date(data.createdAt).toLocaleString('es')} · ` : ''}valores aproximados</p>
            <Link to="/pantry" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-strong"><ShoppingBasket className="size-4" aria-hidden />Lista de la compra</Link>
          </div>
          {(data.warnings ?? []).map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
          {data.menu.days.map((d) => {
            const k = d.meals.reduce((a, m) => a + m.kcal, 0), p = d.meals.reduce((a, m) => a + m.protein, 0);
            return (
              <Card key={d.day} className="!p-0">
                <details>
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3"><span className="t-head">{d.day}</span><span className="num t-meta">≈ {Math.round(k)} kcal · {Math.round(p)} g prot.</span></summary>
                  <ul className="border-t border-line px-4">{d.meals.map((m, i) => (
                    <li key={i} className="border-t border-line py-3 first:border-0">
                      <p className="text-sm"><b>{MEAL_LABELS[m.type]}:</b> {m.title}</p>
                      <p className="t-meta mt-0.5">{m.ingredients.map((x) => `${x.name} ${Math.round(x.grams)} g`).join(', ')}</p>
                      <p className="num t-meta mt-0.5">≈ {Math.round(m.kcal)} kcal · P {Math.round(m.protein)} · C {Math.round(m.carbs)} · G {Math.round(m.fat)}</p>
                    </li>))}</ul>
                </details>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
