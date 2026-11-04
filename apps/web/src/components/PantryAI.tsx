import { MEAL_LABELS, MEAL_TYPES, type MealTypeId } from '@fittrack/shared';
import { Camera, ChefHat, Clock } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { defaultMeal, todayStr } from '../ctx';
import { useToast } from '../ui/overlays';
import { Button, Card, Notice, SectionHeader, cx } from '../ui/primitives';
import { AIError, chipClass, Estimate } from './ai/shared';

/** Reduce la foto a ≤1280 px y la recomprime a JPEG: ligera para subir y suficiente para reconocer alimentos. */
async function shrink(file: File): Promise<{ mime: 'image/jpeg'; data: string }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.8).split(',')[1]! };
}

type Found = { name: string; quantity?: string | null };

/** Foto de la nevera/despensa → la IA lista lo que ve → tú confirmas → se añade a la despensa. */
export function PantryScan({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const [found, setFound] = useState<Found[] | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setErr(undefined); setFound(null);
    try {
      const images = await Promise.all([...files].slice(0, 4).map(shrink));
      const r = await api<{ items: Found[]; notes: string | null }>('/ai/pantry/scan', { method: 'POST', body: JSON.stringify({ images }) });
      setFound(r.items); setNotes(r.notes); setSel(Object.fromEntries(r.items.map((i) => [i.name, true])));
    } catch (e) { setErr(e); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function save() {
    const names = found?.filter((i) => sel[i.name]).map((i) => i.name) ?? [];
    if (!names.length) return;
    setBusy(true);
    try {
      const r = await api<{ added: number }>('/pantry/bulk', { method: 'POST', body: JSON.stringify({ names }) });
      toast(r.added ? `${r.added} alimento(s) añadidos a tu despensa` : 'Ya los tenías todos'); setFound(null); onAdded();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <section>
      <SectionHeader title="Escanear con foto" />
      <Card className="flex flex-col gap-3">
        <p className="t-meta">Haz una foto a la nevera, la despensa o lo que tengas (hasta 4). La IA te propone la lista y tú decides qué añadir. La foto no se guarda.</p>
        <input ref={input} type="file" accept="image/*" multiple capture="environment" hidden onChange={(e) => pick(e.target.files)} />
        <Button icon={Camera} loading={busy && !found} onClick={() => input.current?.click()}>Hacer o elegir foto</Button>
        <AIError e={err} />
        {found && (found.length === 0 ? <Notice tone="info">{notes ?? 'No he reconocido alimentos en la foto.'}</Notice> : (
          <>
            {notes && <Notice tone="info">{notes}</Notice>}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Alimentos detectados">
              {found.map((i) => <button key={i.name} aria-pressed={!!sel[i.name]} onClick={() => setSel({ ...sel, [i.name]: !sel[i.name] })} className={chipClass(!!sel[i.name])}>{i.name}{i.quantity ? ` · ${i.quantity}` : ''}</button>)}
            </div>
            <p className="t-meta">Toca para quitar lo que no sea correcto. <Estimate /></p>
            <Button loading={busy} onClick={save} disabled={!found.some((i) => sel[i.name])}>Añadir a mi despensa</Button>
          </>
        ))}
      </Card>
    </section>
  );
}

type Option = { title: string; timeMin?: number | null; costEur?: number | null; ingredients: { name: string; grams: number }[]; kcal: number; protein: number; carbs: number; fat: number; fiber: number; steps: string[]; exceedsRemainingKcal?: boolean };

/** Sugerencias de desayuno/comida/cena con lo que hay en la despensa, ajustadas a tu dieta y a lo que te queda hoy. */
export function PantryCook({ empty }: { empty: boolean }) {
  const toast = useToast();
  const [meal, setMeal] = useState<MealTypeId>(defaultMeal());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const [opts, setOpts] = useState<Option[] | null>(null);

  async function go() {
    setBusy(true); setErr(undefined);
    try { setOpts((await api<{ options: Option[] }>('/ai/recommend', { method: 'POST', body: JSON.stringify({ date: todayStr(), meal }) })).options); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function log(o: Option) {
    try {
      await api('/ai/food/confirm', { method: 'POST', body: JSON.stringify({ date: todayStr(), type: meal, items: [{ name: o.title, grams: Math.max(1, Math.round(o.ingredients.reduce((a, i) => a + i.grams, 0))), kcal: o.kcal, protein: o.protein, carbs: o.carbs, fat: o.fat, fiber: o.fiber, satFat: 0, sugars: 0, salt: 0 }] }) });
      toast(`«${o.title}» registrado (estimación)`);
    } catch (e) { setErr(e); }
  }

  return (
    <section>
      <SectionHeader title="¿Qué cocino con lo que tengo?" />
      <Card className="flex flex-col gap-3">
        <p className="t-meta">Opciones sanas con tu despensa que respetan tu dieta, tus alergias y las calorías que te quedan hoy.</p>
        {empty && <Notice tone="info">Tu despensa está vacía: añade alimentos o escanea una foto para mejores resultados.</Notice>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Momento del día">{MEAL_TYPES.map((t) => <button key={t} aria-pressed={meal === t} onClick={() => setMeal(t)} className={chipClass(meal === t)}>{MEAL_LABELS[t]}</button>)}</div>
        <AIError e={err} />
        <Button icon={ChefHat} loading={busy} onClick={go}>Sugerir {MEAL_LABELS[meal].toLowerCase()}</Button>
        {opts?.map((o) => (
          <article key={o.title} className={cx('flex flex-col gap-2 rounded-ctl border border-line p-3')}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="t-head flex flex-wrap items-center gap-2">{o.title}<Estimate /></h3>
              <span className="t-meta flex shrink-0 items-center gap-1">{o.timeMin != null && <><Clock className="size-3.5" aria-hidden />{o.timeMin} min</>}</span>
            </div>
            <p className="num t-body">≈ <b>{Math.round(o.kcal)} kcal</b> · P {Math.round(o.protein)} · C {Math.round(o.carbs)} · G {Math.round(o.fat)}</p>
            {o.exceedsRemainingKcal && <Notice tone="warn">Supera las calorías que te quedan hoy.</Notice>}
            <ul className="list-disc pl-5 text-sm text-ink-2">{o.ingredients.map((i) => <li key={i.name}>{i.name} — {Math.round(i.grams)} g</li>)}</ul>
            {o.steps.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-2">Instrucciones</summary><ol className="mt-1 list-decimal pl-5 text-sm text-ink-2">{o.steps.map((s, k) => <li key={k}>{s}</li>)}</ol></details>}
            <Button variant="secondary" block onClick={() => log(o)}>Registrar en {MEAL_LABELS[meal].toLowerCase()}</Button>
          </article>
        ))}
        <p className="t-meta">¿Quieres planificar la semana? <Link to="/ai" className="font-semibold text-accent-strong underline">Genera un menú semanal</Link> con tu despensa; la lista de la compra se calcula sola.</p>
      </Card>
    </section>
  );
}
