import { MEAL_LABELS, MEAL_TYPES, type MealTypeId } from '@fittrack/shared';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { defaultMeal, todayStr, useApp } from '../../ctx';
import { useToast } from '../../ui/overlays';
import { Button, Card, FormField, IconButton, Notice, SelectField, TextAreaField } from '../../ui/primitives';
import { AIError, Estimate } from './shared';

type Item = { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; satFat: number; fiber: number; sugars: number; salt: number; confidence?: string; assumption?: string | null; inconsistent?: boolean };
const FIELDS: ['kcal' | 'protein' | 'carbs' | 'fat', string][] = [['kcal', 'kcal'], ['protein', 'Prot. g'], ['carbs', 'Carb. g'], ['fat', 'Grasa g']];
const n = (v: string) => Number(v.replace(',', '.')) || 0;

/** Registro por lenguaje natural: la IA estima, tú revisas y confirmas. Nada se guarda antes. */
export function LogTab({ initialText }: { initialText?: string } = {}) {
  const { bump } = useApp();
  const toast = useToast();
  const [text, setText] = useState(initialText ?? '');
  const [type, setType] = useState<MealTypeId>(defaultMeal());
  const [items, setItems] = useState<Item[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();

  async function parse() {
    setBusy(true); setErr(undefined);
    try { const r = await api<{ items: Item[]; notes: string | null }>('/ai/food/parse', { method: 'POST', body: JSON.stringify({ text, date: todayStr() }) }); setItems(r.items); setNotes(r.notes); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  // Pedido desde el chat: se interpreta solo, como si hubieras pulsado «Interpretar».
  const auto = useRef(false);
  useEffect(() => { if (initialText && !auto.current) { auto.current = true; void parse(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (i: number, patch: Partial<Item>) => setItems((xs) => xs!.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const regram = (i: number, g: number) => setItems((xs) => xs!.map((x, k) => {
    if (k !== i) return x;
    if (!(g > 0) || !(x.grams > 0)) return { ...x, grams: g };
    const f = g / x.grams, r = (v: number) => Math.round(v * f * 10) / 10;
    return { ...x, grams: g, kcal: Math.round(x.kcal * f), protein: r(x.protein), carbs: r(x.carbs), fat: r(x.fat), satFat: r(x.satFat), fiber: r(x.fiber), sugars: r(x.sugars), salt: r(x.salt) };
  }));
  async function confirm() {
    setBusy(true); setErr(undefined);
    try {
      await api('/ai/food/confirm', { method: 'POST', body: JSON.stringify({ date: todayStr(), type, items: items!.map(({ confidence: _c, assumption: _a, inconsistent: _i, ...rest }) => rest) }) });
      toast(`Guardado en ${MEAL_LABELS[type].toLowerCase()} como estimación`); setItems(null); setText(''); bump();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const total = items?.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein }), { kcal: 0, p: 0 });

  if (!items) {
    return (
      <Card className="flex flex-col gap-3">
        <TextAreaField label="Cuéntame qué has comido" value={text} onChange={(e) => setText(e.target.value)} maxLength={1500}
          placeholder="He comido 200 gramos de pechuga de pollo, 150 gramos de arroz cocido y una cucharada de aceite." hint="Solo se envía el texto que escribes. Nada se guarda hasta que lo confirmes." />
        <SelectField label="Comida" value={type} onChange={(e) => setType(e.target.value as MealTypeId)}>{MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_LABELS[t]}</option>)}</SelectField>
        <AIError e={err} />
        <Button loading={busy} disabled={text.trim().length < 3} block onClick={parse}>Interpretar</Button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="warn">Estas cifras son <b>estimaciones</b>, no valores exactos. Corrige lo que no cuadre antes de guardar.{notes ? ` ${notes}` : ''}</Notice>
      {items.map((it, i) => (
        <Card key={i} as="article" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><h3 className="t-head flex min-w-0 items-center gap-2"><span className="truncate">{it.name}</span><Estimate /></h3>
            <IconButton icon={X} label={`Quitar ${it.name}`} onClick={() => setItems((xs) => xs!.filter((_, k) => k !== i))} /></div>
          {it.assumption && <p className="t-meta">Suposición: {it.assumption} · confianza {it.confidence}</p>}
          {it.inconsistent && <Notice tone="warn">Las calorías no cuadran con los macros; revísalo.</Notice>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <FormField label="Gramos" inputMode="decimal" value={it.grams} onChange={(e) => regram(i, n(e.target.value))} />
            {FIELDS.map(([k, l], idx) => <FormField key={k} label={l} inputMode="decimal" value={it[k]} onChange={(e) => upd(i, { [k]: n(e.target.value) })} className={idx === FIELDS.length - 1 ? 'col-span-2 sm:col-span-1' : undefined} />)}
          </div>
        </Card>
      ))}
      <p className="num t-body px-1">Total ≈ <b>{Math.round(total!.kcal)} kcal</b> · {Math.round(total!.p)} g de proteína</p>
      <AIError e={err} />
      <div className="flex gap-2"><Button block loading={busy} disabled={!items.length} onClick={confirm}>Guardar en {MEAL_LABELS[type].toLowerCase()}</Button><Button variant="secondary" onClick={() => setItems(null)}>Descartar</Button></div>
    </div>
  );
}
