import { MEAL_LABELS, MEAL_TYPES, nutrientsLookInconsistent, parseNutritionText, scaleFromPer100, type FoodItem as FoodData, type MealTypeId } from '@fittrack/shared';
import { Camera, ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { defaultMeal, useApp } from '../ctx';
import { Sheet, useToast } from '../ui/overlays';
import { Button, FormField, Notice, SelectField, Segmented, Skeleton, haptic } from '../ui/primitives';

type Tab = 'search' | 'scan' | 'create';
type Init = { type?: MealTypeId; tab?: Tab };

export function AddFood({ init, onClose }: { init: Init; onClose: () => void }) {
  const { date, bump } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(init.tab ?? 'search');
  const [type, setType] = useState<MealTypeId>(init.type ?? defaultMeal());
  const [item, setItem] = useState<FoodData | null>(null);
  const [prefill, setPrefill] = useState<{ barcode?: string; msg?: string }>({});

  return (
    <Sheet open onClose={onClose} title={item ? item.name : 'Añadir alimento'} size="lg">
      {item ? (
        <FoodDetail item={item} date={date} type={type} setType={setType} onBack={() => setItem(null)} onChanged={setItem}
          onSaved={(name) => { haptic(12); toast(`${name} añadido a ${MEAL_LABELS[type].toLowerCase()}`); bump(); onClose(); }} />
      ) : (
        <div className="flex flex-col gap-3">
          <Segmented<Tab> label="Método" value={tab} onChange={setTab} options={[{ value: 'search', label: 'Buscar' }, { value: 'scan', label: 'Escanear' }, { value: 'create', label: 'Crear' }]} />
          {tab === 'search' && <FoodSearch onPick={setItem} />}
          {tab === 'scan' && <Scan onPick={setItem} onMissing={(barcode, msg) => { setPrefill({ barcode, msg }); setTab('create'); }} />}
          {tab === 'create' && <Create prefill={prefill} onCreated={setItem} />}
        </div>
      )}
    </Sheet>
  );
}

const Row = ({ i, onPick }: { i: FoodData; onPick: (i: FoodData) => void }) => (
  <li className="border-b border-line last:border-0">
    <button onClick={() => onPick(i)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium">{i.isFavorite && <Star className="size-3.5 shrink-0 fill-warn text-warn" aria-label="Favorito" />}<span className="truncate">{i.name}</span></span>
        <span className="t-meta num block truncate">{i.brand ? `${i.brand} · ` : ''}{Math.round(i.per100.kcal)} kcal / 100 g · P {i.per100.protein} g</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
    </button>
  </li>
);

export function FoodSearch({ onPick }: { onPick: (i: FoodData) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FoodData[] | null>(null);
  const [off, setOff] = useState<FoodData[] | null>(null);
  const [offState, setOffState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const seq = useRef(0); // descarta respuestas de búsquedas ya superadas por lo que sigues escribiendo
  const query = q.trim();

  async function searchOff(term: string, n: number) {
    setOffState('loading');
    try {
      const r = await api<{ items: FoodData[] }>(`/foods/off/search?q=${encodeURIComponent(term)}`);
      if (n === seq.current) { setOff(r.items); setOffState('idle'); }
    } catch { if (n === seq.current) setOffState('error'); }
  }

  useEffect(() => {
    const n = ++seq.current;
    setOff(null); setOffState('idle'); setMsg('');
    const t = setTimeout(async () => {
      try {
        const r = await api<{ items: FoodData[] }>(`/foods/search?q=${encodeURIComponent(query)}`);
        if (n !== seq.current) return;
        setItems(r.items);
        // Sin resultados propios: se busca sola en Open Food Facts (con tres letras o más).
        if (query.length >= 3 && r.items.length === 0) searchOff(query, n);
      } catch { if (n === seq.current) setMsg('No se pudo buscar.'); }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-ink-3" aria-hidden />
        <input className="min-h-11 w-full rounded-ctl border border-line-strong bg-surface pl-10 pr-3 placeholder:text-ink-3 focus:border-accent focus:outline-none" placeholder="Buscar un alimento" aria-label="Buscar alimento" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <p className="t-meta mb-1 mt-3">{query ? 'En tus alimentos' : 'Favoritos y recientes'}</p>
      {items === null ? <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : items.length ? <ul>{items.map((i) => <Row key={`${i.kind}${i.id}`} i={i} onPick={onPick} />)}</ul>
          : <p className="t-meta py-3">{query ? 'Nada en tu base de datos.' : 'Aún no tienes favoritos ni alimentos recientes. Busca, escanea o crea uno.'}</p>}

      {query.length >= 2 && (
        <div className="mt-3">
          {offState === 'loading' && <div role="status" aria-label="Buscando en Open Food Facts"><p className="t-over mb-2">Open Food Facts</p><div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div><p className="t-meta mt-2">Buscando «{query}» en Open Food Facts…</p></div>}
          {offState === 'error' && <div className="flex flex-col gap-2"><Notice tone="info">Open Food Facts no está disponible ahora mismo. Puedes reintentarlo o crear el alimento a mano.</Notice><Button variant="secondary" block onClick={() => searchOff(query, seq.current)}>Reintentar</Button></div>}
          {offState === 'idle' && off && (
            <><p className="t-over mb-1">Open Food Facts</p>
              {off.length ? <ul>{off.map((i, n) => <Row key={`off${n}`} i={i} onPick={onPick} />)}</ul> : <p className="t-meta py-2">Sin resultados con datos nutricionales completos. Prueba otro nombre o créalo a mano en la pestaña «Crear».</p>}</>
          )}
          {offState === 'idle' && !off && items !== null && items.length > 0 && <Button variant="secondary" block onClick={() => searchOff(query, seq.current)}>Buscar también «{query}» en Open Food Facts</Button>}
        </div>
      )}
      {msg && <p role="status" className="t-meta mt-2">{msg}</p>}
    </div>
  );
}
function Scan({ onPick, onMissing }: { onPick: (i: FoodData) => void; onMissing: (code: string, msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function lookup(code: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr(''); haptic(15);
    try {
      const r = await api<{ status: string; item?: FoodData }>(`/foods/barcode/${code}`);
      if (r.status === 'found' && r.item) onPick(r.item);
      else onMissing(code, r.status === 'incomplete' ? 'Open Food Facts conoce el producto pero sin datos nutricionales completos. Introdúcelos desde la etiqueta.' : 'Producto no encontrado. Puedes introducirlo y guardarlo.');
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 502 ? 'Open Food Facts no responde. Inténtalo de nuevo.' : 'Código no válido.');
      busyRef.current = false; setBusy(false);
    }
  }

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr('La cámara solo está disponible con HTTPS (o en localhost). Escribe el código a mano.'); return; }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const controls = await new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, video.current!, (res) => { if (res && !cancelled) lookup(res.getText().replace(/\D/g, '')); });
        stop = () => controls.stop();
        if (cancelled) controls.stop();
      } catch { setErr('No se pudo acceder a la cámara (permiso denegado o no disponible). Escribe el código a mano.'); }
    })();
    return () => { cancelled = true; stop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-card bg-black">
        <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Vista de la cámara" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-ctl border-2 border-white/70" aria-hidden />
      </div>
      <p role="status" className="t-meta text-center">{busy ? 'Buscando producto…' : 'Enfoca el código de barras'}</p>
      {err && <Notice tone="warn">{err}</Notice>}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const c = String(new FormData(e.currentTarget).get('code')).replace(/\D/g, ''); if (c) lookup(c); }}>
        <FormField className="flex-1" label="O escribe el código" name="code" inputMode="numeric" placeholder="8431234567890" />
        <Button type="submit">Buscar</Button>
      </form>
    </div>
  );
}

const FIELDS: [string, string, boolean][] = [
  ['kcal', 'Calorías (kcal)', true], ['protein', 'Proteínas (g)', true], ['carbs', 'Carbohidratos (g)', true], ['fat', 'Grasas (g)', true],
  ['satFat', 'Saturadas (g)', false], ['fiber', 'Fibra (g)', false], ['sugars', 'Azúcares (g)', false], ['salt', 'Sal (g)', false],
];

function Create({ prefill, onCreated }: { prefill: { barcode?: string; msg?: string }; onCreated: (i: FoodData) => void }) {
  const [err, setErr] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [rev, setRev] = useState(0);
  const [ocr, setOcr] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: '' });
  const [busy, setBusy] = useState(false);

  // OCR local (Tesseract.js): la foto no sale del dispositivo. El resultado es solo una propuesta editable.
  async function readLabel(file: File) {
    setOcr({ busy: true, msg: 'Leyendo la etiqueta… la primera vez descarga el modelo de idioma.' });
    try {
      const { recognize } = await import('tesseract.js');
      const { data } = await recognize(file, 'spa+eng');
      const { values, per100 } = parseNutritionText(data.text);
      const found = Object.keys(values).length;
      if (!found) { setOcr({ busy: false, msg: 'No se reconoció ninguna tabla nutricional. Prueba con más luz y la etiqueta recta, o introduce los valores a mano.' }); return; }
      setVals(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
      setRev((r) => r + 1);
      setOcr({ busy: false, msg: `Se leyeron ${found} valores${per100 ? '' : ', pero NO se detectó «por 100 g»: comprueba que no sean valores por ración'}. Revísalos antes de guardar: el OCR puede equivocarse.` });
    } catch { setOcr({ busy: false, msg: 'No se pudo leer la imagen (¿sin conexión para descargar el modelo?). Introduce los valores a mano.' }); }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) === '' || f.get(k) == null ? undefined : Number(String(f.get(k)).replace(',', '.')));
    const per100 = Object.fromEntries(FIELDS.map(([k]) => [k, n(k)]).filter(([, v]) => v !== undefined));
    const body = {
      name: String(f.get('name')), brand: String(f.get('brand') || '') || undefined, barcode: String(f.get('barcode') || '') || undefined,
      per100, servingG: n('servingG'), servingName: n('servingG') ? 'ración' : undefined, unitName: n('unitGrams') ? 'unidad' : undefined, unitGrams: n('unitGrams'),
    };
    setBusy(true); setErr('');
    try { onCreated(await api<FoodData>('/foods', { method: 'POST', body: JSON.stringify(body) })); }
    catch (e2) {
      setErr(e2 instanceof ApiError ? (e2.code === 'BARCODE_EXISTS' ? 'Ese código ya existe en tu base de datos.' : 'Revisa los valores por 100 g: proteínas + carbohidratos + grasas ≤ 100, y saturadas/azúcares no pueden superar a grasas/carbohidratos.') : 'No se pudo guardar.');
      setBusy(false);
    }
  }

  return (
    <form key={rev} onSubmit={submit} className="flex flex-col gap-3">
      {prefill.msg && <Notice tone="warn">{prefill.msg}</Notice>}
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface text-sm font-medium text-ink-2 transition hover:bg-surface-2">
        <Camera className="size-5" aria-hidden /> {ocr.busy ? 'Leyendo…' : 'Fotografiar la etiqueta nutricional'}
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={ocr.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) readLabel(f); }} />
      </label>
      {ocr.msg && <Notice tone="info">{ocr.msg}</Notice>}
      <FormField label="Nombre" name="name" required maxLength={120} />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Marca (opcional)" name="brand" />
        <FormField label="Código de barras" name="barcode" inputMode="numeric" defaultValue={prefill.barcode} />
      </div>
      <p className="t-meta">Introduce los valores <b>por 100 g</b> tal como figuran en la etiqueta; no los mezcles con los de «por ración».</p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([k, l, req]) => <FormField key={k} label={l + (req ? ' *' : '')} name={k} inputMode="decimal" required={req} defaultValue={vals[k]} />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="1 ración pesa (g)" name="servingG" inputMode="decimal" />
        <FormField label="1 unidad pesa (g)" name="unitGrams" inputMode="decimal" />
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Button type="submit" loading={busy} block>Guardar producto</Button>
    </form>
  );
}

function FoodDetail({ item, date, type, setType, onBack, onSaved, onChanged }: {
  item: FoodData; date: string; type: MealTypeId; setType: (t: MealTypeId) => void; onBack: () => void; onSaved: (name: string) => void; onChanged: (i: FoodData) => void;
}) {
  const unitSize = item.servingG ?? item.unitGrams ?? null;
  const unitLabel = item.servingG ? (item.servingName?.replace(/\(.*?\)/g, '').replace(/^\s*[\d.,]+\s*/, '').trim() || 'ración') : (item.unitName ?? 'unidad');
  const [mode, setMode] = useState<'g' | 'u'>(unitSize ? 'u' : 'g');
  const [qty, setQty] = useState(unitSize ? '1' : '100');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const q = Number(qty.replace(',', '.'));
  const grams = mode === 'u' && unitSize ? q * unitSize : q;
  const valid = Number.isFinite(grams) && grams > 0 && grams <= 5000;
  const n = useMemo(() => (valid ? scaleFromPer100(item.per100, grams) : null), [item, grams, valid]);
  const plural = (u: number) => (u > 1 && !unitLabel.endsWith('s') ? `${unitLabel}s` : unitLabel);

  async function add() {
    setBusy(true); setErr('');
    try {
      let id = item.id;
      if (!id) {
        const created = await api<FoodData>('/foods', { method: 'POST', body: JSON.stringify({ name: item.name, brand: item.brand ?? undefined, barcode: item.barcode ?? undefined, per100: item.per100, servingG: item.servingG ?? undefined, servingName: item.servingName ?? undefined, source: 'OPEN_FOOD_FACTS' }) });
        id = created.id;
      }
      await api('/diary/entries', { method: 'POST', body: JSON.stringify({ date, type, kind: item.kind, id, grams: Math.round(grams * 10) / 10 }) });
      onSaved(item.name);
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'BARCODE_EXISTS' ? 'Este producto ya está guardado; búscalo en «Buscar».' : 'No se pudo añadir.');
      setBusy(false);
    }
  }
  async function fav() {
    if (!item.id) return;
    await api(`/foods/${item.kind}/${item.id}/favorite`, { method: 'PATCH', body: JSON.stringify({ isFavorite: !item.isFavorite }) });
    onChanged({ ...item, isFavorite: !item.isFavorite });
  }
  const rows: [string, string, boolean][] = n ? [['Proteínas', `${n.protein} g`, true], ['Carbohidratos', `${n.carbs} g`, true], ['Grasas', `${n.fat} g`, true], ['Saturadas', `${n.satFat} g`, false], ['Fibra', `${n.fiber} g`, false], ['Azúcares', `${n.sugars} g`, false], ['Sal', `${n.salt} g`, false]] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-2"><ChevronLeft className="size-4" aria-hidden />Volver</button>
        {item.id && <button onClick={fav} aria-pressed={!!item.isFavorite} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-2"><Star className={`size-[18px] ${item.isFavorite ? 'fill-warn text-warn' : ''}`} aria-hidden />{item.isFavorite ? 'Favorito' : 'Marcar favorito'}</button>}
      </div>
      <p className="t-meta">{item.brand ? `${item.brand} · ` : ''}{Math.round(item.per100.kcal)} kcal por 100 g{item.source === 'OPEN_FOOD_FACTS' ? ' · fuente: Open Food Facts' : ''}</p>
      {item.missing?.length ? <Notice tone="warn">Open Food Facts no aporta: {item.missing.join(', ')}. Se guardan como 0 (desconocido, no medido).</Notice> : null}
      {nutrientsLookInconsistent(item.per100) && <Notice tone="warn">Las calorías no cuadran con los macronutrientes; revisa la etiqueta.</Notice>}

      {unitSize && (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((u) => (
            <button key={u} onClick={() => { setMode('u'); setQty(String(u)); }} className="min-h-11 rounded-ctl border border-line-strong bg-surface text-sm font-medium transition hover:bg-surface-2 active:scale-[.98]">
              {u} {plural(u)} <span className="text-ink-3">· {Math.round(u * unitSize)} g</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <FormField label="Cantidad" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={!valid ? 'Indica una cantidad entre 0 y 5000 g.' : undefined} />
        <SelectField label="Unidad" value={mode} className="w-40" onChange={(e) => { const m = e.target.value as 'g' | 'u'; if (m === 'g' && unitSize && valid) setQty(String(Math.round(grams))); if (m === 'u' && unitSize) setQty('1'); setMode(m); }}>
          <option value="g">gramos</option>
          {unitSize && <option value="u">{unitLabel} ({unitSize} g)</option>}
        </SelectField>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <p className="t-meta">{valid ? `Para ${Math.round(grams * 10) / 10} g consumidos` : 'Cantidad no válida'}</p>
        <p className="num t-display mt-1">{n ? n.kcal : '—'}<span className="t-meta font-normal"> kcal</span></p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-3">
          {rows.map(([k, v, strong]) => <div key={k} className="flex justify-between"><dt className={strong ? 'text-sm' : 't-meta'}>{k}</dt><dd className={`num text-sm ${strong ? 'font-semibold' : 'text-ink-2'}`}>{v}</dd></div>)}
        </dl>
      </div>

      <SelectField label="Añadir a" value={type} onChange={(e) => setType(e.target.value as MealTypeId)}>
        {MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_LABELS[t]}</option>)}
      </SelectField>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Button loading={busy} disabled={!valid} onClick={add} block>Añadir a {MEAL_LABELS[type].toLowerCase()}</Button>
    </div>
  );
}

