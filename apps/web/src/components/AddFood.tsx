import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MEAL_LABELS, MEAL_TYPES, nutrientsLookInconsistent, parseNutritionText, scaleFromPer100, type FoodItem, type MealTypeId } from '@fittrack/shared';
import { api, ApiError } from '../api';
import { defaultMeal, useApp } from '../ctx';

type Tab = 'search' | 'scan' | 'create';
type Init = { type?: MealTypeId; tab?: Tab };

export function AddFood({ init, onClose }: { init: Init; onClose: () => void }) {
  const { date, bump } = useApp();
  const [tab, setTab] = useState<Tab>(init.tab ?? 'search');
  const [type, setType] = useState<MealTypeId>(init.type ?? defaultMeal());
  const [item, setItem] = useState<FoodItem | null>(null);
  const [prefill, setPrefill] = useState<{ barcode?: string; msg?: string }>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" role="dialog" aria-modal="true" aria-label="Añadir alimento">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-t-3xl bg-slate-50 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] dark:bg-[#0b0f14]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{item ? item.name : 'Añadir alimento'}</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-slate-500" aria-label="Cerrar">✕</button>
        </div>
        {item ? (
          <ItemSheet item={item} date={date} type={type} setType={setType} onBack={() => setItem(null)} onSaved={() => { bump(); onClose(); }} onChanged={setItem} />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 text-sm dark:bg-slate-800">
              {([['search', 'Buscar'], ['scan', 'Escanear'], ['create', 'Crear']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 ${tab === k ? 'bg-white font-semibold dark:bg-[#1b2430]' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            {tab === 'search' && <Search onPick={setItem} />}
            {tab === 'scan' && <Scan onPick={setItem} onMissing={(barcode, msg) => { setPrefill({ barcode, msg }); setTab('create'); }} />}
            {tab === 'create' && <Create prefill={prefill} onCreated={setItem} />}
          </>
        )}
      </div>
    </div>
  );
}

function Search({ onPick }: { onPick: (i: FoodItem) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FoodItem[]>([]);
  const [off, setOff] = useState<FoodItem[] | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setOff(null);
    const t = setTimeout(() => {
      api<{ items: FoodItem[] }>(`/foods/search?q=${encodeURIComponent(q)}`).then((r) => setItems(r.items)).catch(() => setMsg('Error al buscar'));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function searchOff() {
    setMsg('Buscando en Open Food Facts…');
    try { setOff((await api<{ items: FoodItem[] }>(`/foods/off/search?q=${encodeURIComponent(q)}`)).items); setMsg(''); }
    catch { setMsg('Open Food Facts no está disponible ahora mismo.'); }
  }
  const row = (i: FoodItem, k: string) => (
    <li key={k}><button onClick={() => onPick(i)} className="flex w-full items-center justify-between gap-2 border-b border-slate-200 py-3 text-left dark:border-slate-800">
      <span className="min-w-0"><b className="block truncate">{i.isFavorite ? '★ ' : ''}{i.name}</b><span className="text-xs text-slate-500">{i.brand ? `${i.brand} · ` : ''}{Math.round(i.per100.kcal)} kcal / 100 g · P {i.per100.protein} g</span></span>
      <span className="text-slate-400">›</span>
    </button></li>
  );
  return (
    <div>
      <input className="input" placeholder="Buscar en tus alimentos…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {!q && <p className="mt-2 text-xs text-slate-500">Favoritos y usados recientemente. Escribe para buscar.</p>}
      <ul>{items.map((i) => row(i, `${i.kind}${i.id}`))}</ul>
      {q && !items.length && <p className="py-3 text-sm text-slate-500">Nada en tu base de datos.</p>}
      {q.length >= 2 && (off ? <><h3 className="mt-3 text-xs font-semibold uppercase text-slate-500">Open Food Facts</h3><ul>{off.map((i, n) => row(i, `off${n}`))}</ul>{!off.length && <p className="text-sm text-slate-500">Sin resultados con datos nutricionales completos.</p>}</> : <button className="mt-3 w-full rounded-xl border border-slate-300 py-3 text-sm dark:border-slate-700" onClick={searchOff}>Buscar “{q}” en Open Food Facts</button>)}
      {msg && <p role="status" className="mt-2 text-sm text-slate-500">{msg}</p>}
    </div>
  );
}

function Scan({ onPick, onMissing }: { onPick: (i: FoodItem) => void; onMissing: (code: string, msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function lookup(code: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr('');
    try {
      const r = await api<{ status: string; item?: FoodItem }>(`/foods/barcode/${code}`);
      if (r.status === 'found' && r.item) onPick(r.item);
      else onMissing(code, r.status === 'incomplete' ? 'Open Food Facts tiene el producto pero sin datos nutricionales completos. Introdúcelos desde la etiqueta.' : 'Producto no encontrado. Puedes introducirlo y guardarlo.');
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 502 ? 'Open Food Facts no responde. Inténtalo de nuevo.' : 'Código no válido.');
      busyRef.current = false; setBusy(false);
    }
  }

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr('Este navegador no permite usar la cámara (se necesita HTTPS o localhost). Escribe el código a mano.'); return; }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video.current!, (res) => { if (res && !cancelled) lookup(res.getText().replace(/\D/g, '')); });
        stop = () => controls.stop();
        if (cancelled) controls.stop();
      } catch { setErr('No se pudo acceder a la cámara (permiso denegado o no disponible). Escribe el código a mano.'); }
    })();
    return () => { cancelled = true; stop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <video ref={video} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />
      <p className="mt-2 text-sm text-slate-500">{busy ? 'Buscando producto…' : 'Enfoca el código de barras.'}</p>
      {err && <p role="alert" className="mt-1 text-sm text-red-500">{err}</p>}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = String(new FormData(e.currentTarget).get('code')).replace(/\D/g, ''); if (c) lookup(c); }}>
        <input name="code" inputMode="numeric" className="input" placeholder="O escribe el código" />
        <button className="btn shrink-0">Buscar</button>
      </form>
    </div>
  );
}

const FIELDS: [string, string, boolean][] = [
  ['kcal', 'Calorías (kcal)', true], ['protein', 'Proteínas (g)', true], ['carbs', 'Carbohidratos (g)', true], ['fat', 'Grasas (g)', true],
  ['satFat', 'Grasas saturadas (g)', false], ['fiber', 'Fibra (g)', false], ['sugars', 'Azúcares (g)', false], ['salt', 'Sal (g)', false],
];

function Create({ prefill, onCreated }: { prefill: { barcode?: string; msg?: string }; onCreated: (i: FoodItem) => void }) {
  const [err, setErr] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [rev, setRev] = useState(0);
  const [ocr, setOcr] = useState('');

  // OCR local (Tesseract.js en el navegador): la foto no sale del dispositivo. El resultado es solo una propuesta editable.
  async function readLabel(file: File) {
    setOcr('Leyendo etiqueta… (la primera vez descarga el modelo de idioma)');
    try {
      const { recognize } = await import('tesseract.js');
      const { data } = await recognize(file, 'spa+eng');
      const { values, per100 } = parseNutritionText(data.text);
      const found = Object.keys(values).length;
      if (!found) { setOcr('No se reconoció ninguna tabla nutricional. Prueba con más luz y la etiqueta recta, o introduce los valores a mano.'); return; }
      setVals(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
      setRev((r) => r + 1);
      setOcr(`Se leyeron ${found} valores${per100 ? '' : ', pero NO se detectó “por 100 g”: comprueba que no sean valores por ración'}. Revísalos antes de guardar: el OCR puede equivocarse.`);
    } catch { setOcr('No se pudo leer la imagen (¿sin conexión para descargar el modelo?). Introduce los valores a mano.'); }
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
    try { onCreated(await api<FoodItem>('/foods', { method: 'POST', body: JSON.stringify(body) })); }
    catch (e2) { setErr(e2 instanceof ApiError ? (e2.code === 'BARCODE_EXISTS' ? 'Ese código ya existe en tu base.' : 'Revisa los valores (por 100 g): proteínas+carbohidratos+grasas ≤ 100 y saturadas/azúcares no pueden superar a grasas/carbohidratos.') : 'Error'); }
  }
  return (
    <form key={rev} onSubmit={submit} className="flex flex-col gap-2">
      {prefill.msg && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">{prefill.msg}</p>}
      <label className="rounded-xl border border-dashed border-slate-400 p-3 text-center text-sm text-slate-500">
        📷 Fotografiar la etiqueta nutricional (OCR)
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) readLabel(f); }} />
      </label>
      {ocr && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">{ocr}</p>}
      <p className="text-xs text-slate-500">Introduce los valores <b>por 100 g</b> tal como figuran en la etiqueta. No los mezcles con los de “por ración”.</p>
      <input name="name" className="input" placeholder="Nombre" required maxLength={120} />
      <div className="grid grid-cols-2 gap-2"><input name="brand" className="input" placeholder="Marca (opcional)" /><input name="barcode" className="input" placeholder="Código de barras" inputMode="numeric" defaultValue={prefill.barcode} /></div>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([k, l, req]) => <label key={k} className="text-xs text-slate-500">{l}{req && ' *'}<input name={k} className="input mt-1" inputMode="decimal" required={req} defaultValue={vals[k]} /></label>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">Peso de 1 ración (g)<input name="servingG" className="input mt-1" inputMode="decimal" /></label>
        <label className="text-xs text-slate-500">Peso de 1 unidad (g)<input name="unitGrams" className="input mt-1" inputMode="decimal" /></label>
      </div>
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
      <button className="btn">Guardar producto</button>
    </form>
  );
}

function ItemSheet({ item, date, type, setType, onBack, onSaved, onChanged }: {
  item: FoodItem; date: string; type: MealTypeId; setType: (t: MealTypeId) => void; onBack: () => void; onSaved: () => void; onChanged: (i: FoodItem) => void;
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

  async function add() {
    setBusy(true); setErr('');
    try {
      let id = item.id;
      if (!id) {
        const created = await api<FoodItem>('/foods', { method: 'POST', body: JSON.stringify({ name: item.name, brand: item.brand ?? undefined, barcode: item.barcode ?? undefined, per100: item.per100, servingG: item.servingG ?? undefined, servingName: item.servingName ?? undefined, source: 'OPEN_FOOD_FACTS' }) });
        id = created.id;
      }
      await api('/diary/entries', { method: 'POST', body: JSON.stringify({ date, type, kind: item.kind, id, grams: Math.round(grams * 10) / 10 }) });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'BARCODE_EXISTS' ? 'Este producto ya está guardado; búscalo en “Buscar”.' : 'No se pudo añadir.');
      setBusy(false);
    }
  }
  async function fav() {
    if (!item.id) return;
    await api(`/foods/${item.kind}/${item.id}/favorite`, { method: 'PATCH', body: JSON.stringify({ isFavorite: !item.isFavorite }) });
    onChanged({ ...item, isFavorite: !item.isFavorite });
  }
  const rows: [string, string][] = n ? [['Calorías', `${n.kcal} kcal`], ['Proteínas', `${n.protein} g`], ['Carbohidratos', `${n.carbs} g`], ['Grasas', `${n.fat} g`], ['· saturadas', `${n.satFat} g`], ['Fibra', `${n.fiber} g`], ['Azúcares', `${n.sugars} g`], ['Sal', `${n.salt} g`]] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <button onClick={onBack}>‹ Volver</button>
        {item.id && <button onClick={fav} aria-pressed={!!item.isFavorite}>{item.isFavorite ? '★ Favorito' : '☆ Favorito'}</button>}
      </div>
      <p className="text-sm text-slate-500">{item.brand ? `${item.brand} · ` : ''}{Math.round(item.per100.kcal)} kcal por 100 g{item.source === 'OPEN_FOOD_FACTS' ? ' · fuente: Open Food Facts' : ''}</p>
      {item.missing?.length ? <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">Open Food Facts no aporta: {item.missing.join(', ')}. Se guardan como 0 (desconocido, no medido).</p> : null}
      {nutrientsLookInconsistent(item.per100) && <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">Las calorías no cuadran con los macronutrientes; revisa la etiqueta.</p>}
      {unitSize && (
        <div className="flex gap-2">
          {[1, 2].map((u) => <button key={u} className="flex-1 rounded-xl border border-slate-300 py-2 text-sm dark:border-slate-700" onClick={() => { setMode('u'); setQty(String(u)); }}>{u} {unitLabel}{u > 1 && !unitLabel.endsWith('s') ? 's' : ''} ({Math.round(u * unitSize)} g)</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Cantidad" />
        <select className="input w-40" value={mode} onChange={(e) => { const m = e.target.value as 'g' | 'u'; if (m === 'g' && unitSize && valid) setQty(String(Math.round(grams))); if (m === 'u' && unitSize) setQty('1'); setMode(m); }}>
          <option value="g">gramos</option>
          {unitSize && <option value="u">{unitLabel} ({unitSize} g)</option>}
        </select>
      </div>
      {!valid && <p className="text-sm text-red-500">Indica una cantidad entre 0 y 5000 g.</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-white p-3 text-sm dark:bg-[#141b24]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        {valid && <p className="col-span-2 mt-1 text-xs text-slate-500">Para {Math.round(grams * 10) / 10} g consumidos.</p>}
      </dl>
      <select className="input" value={type} onChange={(e) => setType(e.target.value as MealTypeId)} aria-label="Comida">
        {MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_LABELS[t]}</option>)}
      </select>
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
      <button className="btn" disabled={!valid || busy} onClick={add}>{busy ? 'Añadiendo…' : `Añadir a ${MEAL_LABELS[type].toLowerCase()}`}</button>
    </div>
  );
}
