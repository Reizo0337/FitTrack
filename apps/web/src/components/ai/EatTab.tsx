import { MEAL_LABELS, MEAL_TYPES, type MealTypeId } from '@fittrack/shared';
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { defaultMeal, todayStr, useApp } from '../../ctx';
import { useToast } from '../../ui/overlays';
import { Button, Card, FormField, Notice, SelectField } from '../../ui/primitives';
import { AIError, chipClass, Estimate } from './shared';

type Option = { title: string; category: string; timeMin?: number | null; costEur?: number | null; ingredients: { name: string; grams: number }[]; kcal: number; protein: number; carbs: number; fat: number; fiber: number; steps: string[]; exceedsRemainingKcal?: boolean };
type Res = { options: Option[]; removedForRestrictions: number; cached: boolean; remaining: Record<string, number> };
const CATS: [string, string][] = [['', 'Cualquiera'], ['economica', 'Económica'], ['rapida', 'Rápida'], ['facil', 'Fácil'], ['alta_proteina', 'Alta en proteína'], ['baja_caloria', 'Baja en calorías'], ['receta', 'Receta completa']];

export function EatTab() {
  const { bump } = useApp();
  const toast = useToast();
  const [cat, setCat] = useState('');
  const [budget, setBudget] = useState('');
  const [avail, setAvail] = useState('');
  const [type, setType] = useState<MealTypeId>(defaultMeal());
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();

  async function go() {
    setBusy(true); setErr(undefined);
    try {
      const b = Number(budget.replace(',', '.'));
      setRes(await api<Res>('/ai/recommend', { method: 'POST', body: JSON.stringify({ date: todayStr(), category: cat || undefined, budgetEur: b > 0 ? b : undefined, available: avail.split(',').map((s) => s.trim()).filter(Boolean) }) }));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function log(o: Option) {
    try {
      await api('/ai/food/confirm', { method: 'POST', body: JSON.stringify({ date: todayStr(), type, items: [{ name: o.title, grams: Math.max(1, Math.round(o.ingredients.reduce((a, i) => a + i.grams, 0))), kcal: o.kcal, protein: o.protein, carbs: o.carbs, fat: o.fat, fiber: o.fiber, satFat: 0, sugars: 0, salt: 0 }] }) });
      toast(`«${o.title}» registrado en ${MEAL_LABELS[type].toLowerCase()} (estimación)`); bump();
    } catch (e) { setErr(e); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <p className="t-body text-ink-2">Te propongo opciones según lo que te queda hoy (calorías, proteína, carbohidratos, grasas y fibra), tus preferencias y alergias.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de comida">{CATS.map(([k, l]) => <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)} className={chipClass(cat === k)}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Presupuesto (€)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <FormField label="Tengo en casa" placeholder="pollo, arroz…" value={avail} onChange={(e) => setAvail(e.target.value)} hint="Si lo dejas vacío, uso tu despensa." />
        </div>
        <AIError e={err} />
        <Button loading={busy} block onClick={go}>Sugerir</Button>
      </Card>

      {res && (
        <>
          <p className="t-meta px-1">Te quedan ≈ {Math.round(res.remaining.kcal ?? 0)} kcal y {Math.round(res.remaining.protein ?? 0)} g de proteína. {res.cached && 'Respuesta reutilizada (sin coste). '}{res.removedForRestrictions > 0 && `Se descartaron ${res.removedForRestrictions} opción(es) por tus restricciones.`}</p>
          <SelectField label="Registrar en" value={type} onChange={(e) => setType(e.target.value as MealTypeId)}>{MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_LABELS[t]}</option>)}</SelectField>
          {res.options.map((o) => (
            <Card key={o.title} as="article" className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="t-head flex flex-wrap items-center gap-2">{o.title}<Estimate /></h3>
                <span className="t-meta flex shrink-0 items-center gap-1">{o.timeMin != null && <><Clock className="size-3.5" aria-hidden />{o.timeMin} min</>}{o.costEur != null && ` · ≈${o.costEur} €`}</span>
              </div>
              <p className="num t-body">≈ <b>{Math.round(o.kcal)} kcal</b> · P {Math.round(o.protein)} · C {Math.round(o.carbs)} · G {Math.round(o.fat)} · fibra {Math.round(o.fiber)}</p>
              {o.exceedsRemainingKcal && <Notice tone="warn">Supera las calorías que te quedan hoy.</Notice>}
              <ul className="list-disc pl-5 text-sm text-ink-2">{o.ingredients.map((i) => <li key={i.name}>{i.name} — {Math.round(i.grams)} g</li>)}</ul>
              {o.steps.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-2">Instrucciones</summary><ol className="mt-1 list-decimal pl-5 text-sm text-ink-2">{o.steps.map((s, k) => <li key={k}>{s}</li>)}</ol></details>}
              <Button variant="secondary" block onClick={() => log(o)}>Registrar esto</Button>
            </Card>
          ))}
          {!res.options.length && <Notice tone="info">No hay opciones válidas con tus restricciones. Prueba de nuevo.</Notice>}
        </>
      )}
    </div>
  );
}
