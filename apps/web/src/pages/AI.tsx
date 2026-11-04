import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MEAL_LABELS, MEAL_TYPES, type MealTypeId } from '@fittrack/shared';
import { api, ApiError } from '../api';
import { defaultMeal, todayStr, useApp } from '../ctx';

type Sec = 'chat' | 'log' | 'eat' | 'menu' | 'report';
const SECS: [Sec, string][] = [['chat', 'Nutricionista'], ['log', 'Registrar'], ['eat', 'Qué comer'], ['menu', 'Menú semanal'], ['report', 'Informe']];

/** Mensaje amigable para errores de IA, con enlace a Ajustes cuando falta algo por configurar. */
function ErrBox({ e }: { e: unknown }) {
  if (!e) return null;
  const code = e instanceof ApiError ? e.code : '';
  const msg = e instanceof ApiError ? (e.detail ?? e.code) : 'Error de conexión.';
  const toSettings = code === 'AI_CONSENT_REQUIRED' || code === 'AI_KEY_MISSING' || code === 'AI_PROVIDER_AUTH';
  return <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{msg} {toSettings && <Link to="/settings" className="underline">Ir a Ajustes</Link>}</p>;
}
const Est = () => <span className="ml-1 rounded bg-amber-500/20 px-1 text-xs text-amber-500">estimado</span>;

export function AI() {
  const [sec, setSec] = useState<Sec>('chat');
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">IA</h1>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200 p-1 text-sm dark:bg-slate-800" role="tablist">
        {SECS.map(([k, l]) => <button key={k} role="tab" aria-selected={sec === k} onClick={() => setSec(k)} className={`shrink-0 rounded-lg px-3 py-2 ${sec === k ? 'bg-white font-semibold dark:bg-[#1b2430]' : 'text-slate-500'}`}>{l}</button>)}
      </div>
      <p className="text-xs text-slate-500">Orientación nutricional, no consejo médico. Las cifras de la IA son estimaciones aproximadas; para dudas de salud consulta a un profesional.</p>
      {sec === 'chat' && <Chat />}{sec === 'log' && <LogText />}{sec === 'eat' && <Eat />}{sec === 'menu' && <Menu />}{sec === 'report' && <Report />}
    </div>
  );
}

const QUESTIONS = ['¿Qué puedo cenar hoy?', '¿Cuántas proteínas me faltan?', '¿Estoy perdiendo peso demasiado rápido?', '¿Por qué llevo dos semanas sin bajar de peso?', '¿Cuántas calorías he consumido esta semana?', '¿Cómo ha afectado dormir poco a mi actividad?'];

function Chat() {
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [convo, setConvo] = useState<string>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  async function send(m: string) {
    if (!m.trim() || busy) return;
    setErr(undefined); setBusy(true); setText('');
    setMsgs((x) => [...x, { role: 'user', content: m }]);
    try {
      const r = await api<{ conversationId: string; reply: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ conversationId: convo, message: m, date: todayStr() }) });
      setConvo(r.conversationId); setMsgs((x) => [...x, { role: 'assistant', content: r.reply }]);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex min-h-48 flex-col gap-2">
        {!msgs.length && <><p className="text-sm text-slate-500">Pregúntame sobre tu alimentación, tu progreso o tus hábitos. Uso tus datos registrados (sin tu nombre ni email) y te diré qué es dato y qué es estimación.</p>
          <div className="flex flex-wrap gap-2">{QUESTIONS.map((q) => <button key={q} className="rounded-full border border-slate-300 px-3 py-1 text-xs dark:border-slate-700" onClick={() => send(q)}>{q}</button>)}</div></>}
        {msgs.map((m, i) => <div key={i} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'self-end bg-accent text-[#052e1d]' : 'self-start bg-slate-100 dark:bg-[#1b2430]'}`}>{m.content}</div>)}
        {busy && <p className="text-sm text-slate-500" role="status">Pensando…</p>}
        <div ref={end} />
      </div>
      <ErrBox e={err} />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu pregunta…" maxLength={2000} aria-label="Mensaje" />
        <button className="btn shrink-0" disabled={busy || !text.trim()}>Enviar</button>
      </form>
      {msgs.length > 0 && <button className="text-xs text-slate-500" onClick={() => { setMsgs([]); setConvo(undefined); }}>Nueva conversación</button>}
    </div>
  );
}

type Item = { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; satFat: number; fiber: number; sugars: number; salt: number; confidence?: string; assumption?: string | null; inconsistent?: boolean };
const NUM_FIELDS: ['kcal' | 'protein' | 'carbs' | 'fat', string][] = [['kcal', 'kcal'], ['protein', 'P g'], ['carbs', 'C g'], ['fat', 'G g']];

function LogText() {
  const { bump } = useApp();
  const [text, setText] = useState('');
  const [type, setType] = useState<MealTypeId>(defaultMeal());
  const [items, setItems] = useState<Item[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const [ok, setOk] = useState('');

  async function parse() {
    setBusy(true); setErr(undefined); setOk('');
    try { const r = await api<{ items: Item[]; notes: string | null }>('/ai/food/parse', { method: 'POST', body: JSON.stringify({ text, date: todayStr() }) }); setItems(r.items); setNotes(r.notes); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const upd = (i: number, patch: Partial<Item>) => setItems((xs) => xs!.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const regram = (i: number, g: number) => setItems((xs) => xs!.map((x, k) => {
    if (k !== i || !(g > 0) || !(x.grams > 0)) return k === i ? { ...x, grams: g } : x;
    const f = g / x.grams, r = (v: number) => Math.round(v * f * 10) / 10;
    return { ...x, grams: g, kcal: Math.round(x.kcal * f), protein: r(x.protein), carbs: r(x.carbs), fat: r(x.fat), satFat: r(x.satFat), fiber: r(x.fiber), sugars: r(x.sugars), salt: r(x.salt) };
  }));
  async function confirm() {
    setBusy(true); setErr(undefined);
    try {
      await api('/ai/food/confirm', { method: 'POST', body: JSON.stringify({ date: todayStr(), type, items: items!.map(({ confidence: _c, assumption: _a, inconsistent: _i, ...n }) => n) }) });
      setOk(`Guardado en ${MEAL_LABELS[type].toLowerCase()} como estimación.`); setItems(null); setText(''); bump();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const total = items?.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein }), { kcal: 0, p: 0 });

  return (
    <div className="flex flex-col gap-3">
      {!items && <div className="card flex flex-col gap-2">
        <label className="text-xs text-slate-500" htmlFor="t">Cuéntame qué has comido</label>
        <textarea id="t" className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder="He comido 200 gramos de pechuga de pollo, 150 gramos de arroz cocido y una cucharada de aceite." />
        <select className="input" value={type} onChange={(e) => setType(e.target.value as MealTypeId)} aria-label="Comida">{MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_LABELS[t]}</option>)}</select>
        <button className="btn" disabled={busy || text.trim().length < 3} onClick={parse}>{busy ? 'Interpretando…' : 'Interpretar'}</button>
        <p className="text-xs text-slate-500">Solo se envía el texto que escribes. Nada se guarda hasta que lo confirmes.</p>
      </div>}
      {ok && <p role="status" className="rounded-xl bg-accent/20 p-3 text-sm">{ok}</p>}
      <ErrBox e={err} />
      {items && <>
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">Estas cifras son <b>estimaciones</b>, no valores exactos. Corrige lo que no cuadre antes de guardar.{notes ? ` ${notes}` : ''}</p>
        {items.map((it, i) => (
          <div key={i} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between"><b>{it.name}<Est /></b><button className="text-slate-400" aria-label={`Quitar ${it.name}`} onClick={() => setItems((xs) => xs!.filter((_, k) => k !== i))}>✕</button></div>
            {it.assumption && <p className="text-xs text-slate-500">Suposición: {it.assumption} · confianza {it.confidence}</p>}
            {it.inconsistent && <p className="text-xs text-amber-500">Las calorías no cuadran con los macros; revísalo.</p>}
            <div className="grid grid-cols-5 gap-2">
              <label className="text-xs text-slate-500">g<input className="input mt-1 px-2" inputMode="decimal" value={it.grams} onChange={(e) => regram(i, Number(e.target.value.replace(',', '.')))} /></label>
              {NUM_FIELDS.map(([k, l]) => <label key={k} className="text-xs text-slate-500">{l}<input className="input mt-1 px-2" inputMode="decimal" value={it[k]} onChange={(e) => upd(i, { [k]: Number(e.target.value.replace(',', '.')) || 0 })} /></label>)}
            </div>
          </div>
        ))}
        <p className="text-sm">Total ≈ <b>{Math.round(total!.kcal)} kcal</b>, {Math.round(total!.p)} g de proteína</p>
        <div className="flex gap-2"><button className="btn flex-1" disabled={busy || !items.length} onClick={confirm}>Guardar en {MEAL_LABELS[type].toLowerCase()}</button><button className="rounded-xl border border-slate-300 px-4 dark:border-slate-700" onClick={() => setItems(null)}>Descartar</button></div>
      </>}
    </div>
  );
}

type Option = { title: string; category: string; timeMin?: number | null; costEur?: number | null; ingredients: { name: string; grams: number }[]; kcal: number; protein: number; carbs: number; fat: number; fiber: number; steps: string[]; exceedsRemainingKcal?: boolean };
const CATS: [string, string][] = [['', 'Cualquiera'], ['economica', 'Económica'], ['rapida', 'Rápida'], ['facil', 'Fácil'], ['alta_proteina', 'Alta en proteína'], ['baja_caloria', 'Baja en calorías'], ['receta', 'Receta completa']];

function Eat() {
  const { bump } = useApp();
  const [cat, setCat] = useState('');
  const [budget, setBudget] = useState('');
  const [avail, setAvail] = useState('');
  const [type, setType] = useState<MealTypeId>(defaultMeal());
  const [res, setRes] = useState<{ options: Option[]; removedForRestrictions: number; cached: boolean; remaining: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  const [ok, setOk] = useState('');
  async function go() {
    setBusy(true); setErr(undefined); setOk('');
    try {
      const b = Number(budget.replace(',', '.'));
      setRes(await api('/ai/recommend', { method: 'POST', body: JSON.stringify({ date: todayStr(), category: cat || undefined, budgetEur: b > 0 ? b : undefined, available: avail.split(',').map((s) => s.trim()).filter(Boolean) }) }));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function log(o: Option) {
    try {
      await api('/ai/food/confirm', { method: 'POST', body: JSON.stringify({ date: todayStr(), type, items: [{ name: o.title, grams: Math.max(1, Math.round(o.ingredients.reduce((a, i) => a + i.grams, 0))), kcal: o.kcal, protein: o.protein, carbs: o.carbs, fat: o.fat, fiber: o.fiber, satFat: 0, sugars: 0, salt: 0 }] }) });
      setOk(`«${o.title}» registrado en ${MEAL_LABELS[type].toLowerCase()} (estimación).`); bump();
    } catch (e) { setErr(e); }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">Te propongo opciones según lo que te queda hoy (calorías, proteína, carbohidratos, grasas y fibra), tus preferencias y alergias.</p>
        <div className="flex flex-wrap gap-2">{CATS.map(([k, l]) => <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)} className={`rounded-full px-3 py-1 text-xs ${cat === k ? 'bg-accent text-[#052e1d]' : 'bg-slate-200 dark:bg-slate-800'}`}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-2"><input className="input" inputMode="decimal" placeholder="Presupuesto (€)" value={budget} onChange={(e) => setBudget(e.target.value)} /><input className="input" placeholder="Tengo: pollo, arroz…" value={avail} onChange={(e) => setAvail(e.target.value)} /></div>
        <button className="btn" disabled={busy} onClick={go}>{busy ? 'Buscando ideas…' : 'Sugerir'}</button>
      </div>
      <ErrBox e={err} />{ok && <p role="status" className="rounded-xl bg-accent/20 p-3 text-sm">{ok}</p>}
      {res && <>
        <p className="text-xs text-slate-500">Te quedan ≈ {Math.round(res.remaining.kcal ?? 0)} kcal y {Math.round(res.remaining.protein ?? 0)} g de proteína. {res.cached && 'Respuesta reutilizada (sin coste). '}{res.removedForRestrictions > 0 && `Se descartaron ${res.removedForRestrictions} opción(es) por tus restricciones.`}</p>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as MealTypeId)} aria-label="Registrar en">{MEAL_TYPES.map((t) => <option key={t} value={t}>Registrar en: {MEAL_LABELS[t]}</option>)}</select>
        {res.options.map((o) => (
          <article key={o.title} className="card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{o.title}<Est /></h3><span className="shrink-0 text-xs text-slate-500">{o.timeMin != null ? `${o.timeMin} min` : ''}{o.costEur != null ? ` · ≈${o.costEur} €` : ''}</span></div>
            <p className="text-sm">≈ {Math.round(o.kcal)} kcal · P {Math.round(o.protein)} · C {Math.round(o.carbs)} · G {Math.round(o.fat)} · fibra {Math.round(o.fiber)}</p>
            {o.exceedsRemainingKcal && <p className="text-xs text-amber-500">Supera lo que te queda hoy.</p>}
            <ul className="list-disc pl-5 text-sm">{o.ingredients.map((i) => <li key={i.name}>{i.name} — {Math.round(i.grams)} g</li>)}</ul>
            {o.steps.length > 0 && <details><summary className="text-sm text-slate-500">Instrucciones</summary><ol className="mt-1 list-decimal pl-5 text-sm">{o.steps.map((s, k) => <li key={k}>{s}</li>)}</ol></details>}
            <button className="rounded-xl border border-slate-300 py-2 text-sm dark:border-slate-700" onClick={() => log(o)}>Registrar esto</button>
          </article>
        ))}
        {!res.options.length && <p className="text-sm text-slate-500">No hay opciones válidas con tus restricciones. Prueba de nuevo.</p>}
      </>}
    </div>
  );
}

type Menu = { days: { day: string; meals: { type: MealTypeId; title: string; minutes?: number | null; ingredients: { name: string; grams: number }[]; kcal: number; protein: number; carbs: number; fat: number; fiber: number }[] }[] };

function MenuView({ menu, warnings }: { menu: Menu; warnings: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">Valores aproximados (estimaciones).</p>
      {warnings.map((w) => <p key={w} role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">⚠ {w}</p>)}
      {menu.days.map((d) => { const k = d.meals.reduce((a, m) => a + m.kcal, 0), p = d.meals.reduce((a, m) => a + m.protein, 0); return (
        <details key={d.day} className="card"><summary className="cursor-pointer font-semibold">{d.day} <span className="text-sm font-normal text-slate-500">≈ {Math.round(k)} kcal · {Math.round(p)} g prot.</span></summary>
          <ul className="mt-2 text-sm">{d.meals.map((m, i) => <li key={i} className="border-t border-slate-200 py-2 dark:border-slate-800"><b>{MEAL_LABELS[m.type]}:</b> {m.title}<span className="block text-xs text-slate-500">{m.ingredients.map((x) => `${x.name} ${Math.round(x.grams)} g`).join(', ')} · ≈{Math.round(m.kcal)} kcal · P {Math.round(m.protein)}</span></li>)}</ul></details>
      ); })}
    </div>
  );
}

function Menu() {
  const [data, setData] = useState<{ menu: Menu | null; warnings?: string[]; createdAt?: string } | null>(null);
  const [budget, setBudget] = useState('');
  const [avail, setAvail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  useEffect(() => { api<{ menu: Menu | null; warnings?: string[]; createdAt?: string }>('/ai/menu/latest').then(setData).catch(() => undefined); }, []);
  async function gen() {
    setBusy(true); setErr(undefined);
    try {
      const b = Number(budget.replace(',', '.'));
      const r = await api<{ menu: Menu; warnings: string[] }>('/ai/menu/weekly', { method: 'POST', body: JSON.stringify({ budgetEur: b > 0 ? b : undefined, available: avail.split(',').map((s) => s.trim()).filter(Boolean) }) });
      setData({ menu: r.menu, warnings: r.warnings, createdAt: new Date().toISOString() });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">Genero 7 días ajustados a tus objetivos, evitando tus alergias y alimentos rechazados (se comprueba además en el servidor).</p>
        <div className="grid grid-cols-2 gap-2"><input className="input" inputMode="decimal" placeholder="Presupuesto semanal (€)" value={budget} onChange={(e) => setBudget(e.target.value)} /><input className="input" placeholder="Tengo: huevos, avena…" value={avail} onChange={(e) => setAvail(e.target.value)} /></div>
        <button className="btn" disabled={busy} onClick={gen}>{busy ? 'Generando menú (puede tardar)…' : data?.menu ? 'Generar otro menú' : 'Generar menú semanal'}</button>
      </div>
      <ErrBox e={err} />
      {data?.menu && <>{data.createdAt && <p className="text-xs text-slate-500">Generado el {new Date(data.createdAt).toLocaleString('es')}</p>}<MenuView menu={data.menu} warnings={data.warnings ?? []} /></>}
    </div>
  );
}

type Stats = {
  desde: string; hasta: string; registro: { diasConComidas: number; de: number };
  nutricion: { kcalMedia: number | null; kcalObjetivo: number; proteinaMediaG: number | null; proteinaObjetivoG: number; fibraMediaG: number | null; aguaMediaMl: number | null };
  cumplimiento: { diasProteinaObjetivo: number; diasDentroDeKcal: number; diasConAgua: number };
  actividad: { pasosMedios: number | null; kcalActivasMedias: number | null; diasConDatosPasos: number };
  sueno: { horasMedias: number | null; nochesConDato: number };
  peso: { pesajesEstaSemana: number; primeroKg: number | null; ultimoKg: number | null; mediaSemanaKg: number | null; cambioMediaSemanalKg: number | null };
  tendencia: { status: string; message: string };
};
const v = (x: number | null, u = '') => (x == null ? 'sin datos' : `${Math.round(x * 10) / 10}${u}`);

function Report() {
  const [s, setS] = useState<Stats | null>(null);
  const [nar, setNar] = useState<{ summary: string; wins: string[]; concerns: string[]; suggestions: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  useEffect(() => { api<Stats>(`/insights/weekly?end=${todayStr()}`).then(setS).catch(() => undefined); }, []);
  async function analyse() {
    setBusy(true); setErr(undefined);
    try { setNar((await api<{ narrative: typeof nar }>('/ai/weekly-analysis', { method: 'POST', body: JSON.stringify({ end: todayStr() }) })).narrative); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  if (!s) return <p className="text-slate-500">Cargando…</p>;
  const rows: [string, string][] = [
    ['Días con comidas registradas', `${s.registro.diasConComidas} de ${s.registro.de}`],
    ['Calorías (media de días registrados)', `${v(s.nutricion.kcalMedia)} / ${s.nutricion.kcalObjetivo}`],
    ['Proteína media', `${v(s.nutricion.proteinaMediaG, ' g')} / ${s.nutricion.proteinaObjetivoG} g`],
    ['Fibra media', v(s.nutricion.fibraMediaG, ' g')], ['Agua media', v(s.nutricion.aguaMediaMl, ' ml')],
    ['Días con proteína cumplida', String(s.cumplimiento.diasProteinaObjetivo)], ['Días dentro del objetivo calórico', String(s.cumplimiento.diasDentroDeKcal)],
    ['Pasos medios', `${v(s.actividad.pasosMedios)} (${s.actividad.diasConDatosPasos} días con dato)`], ['Kcal activas medias', v(s.actividad.kcalActivasMedias)],
    ['Sueño medio', `${v(s.sueno.horasMedias, ' h')} (${s.sueno.nochesConDato} noches)`],
    ['Peso: primero → último de la semana', `${v(s.peso.primeroKg, ' kg')} → ${v(s.peso.ultimoKg, ' kg')}`],
    ['Media de peso vs. semana anterior', s.peso.cambioMediaSemanalKg == null ? 'sin datos' : `${s.peso.cambioMediaSemanalKg > 0 ? '+' : ''}${s.peso.cambioMediaSemanalKg} kg`],
  ];
  return (
    <div className="flex flex-col gap-3">
      <section className="card"><h2 className="mb-1 font-semibold">Semana {s.desde.slice(5)} → {s.hasta.slice(5)}</h2>
        <p className="mb-2 text-xs text-slate-500">Calculado con tus datos reales. «Sin datos» significa que no hay registro, no que sea cero.</p>
        <dl className="text-sm">{rows.map(([k, val]) => <div key={k} className="flex justify-between gap-3 border-t border-slate-200 py-1.5 dark:border-slate-800"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{val}</dd></div>)}</dl></section>
      <section className={`card ${s.tendencia.status === 'stalled' || s.tendencia.status === 'too_fast' ? 'border-amber-500' : ''}`}><h2 className="mb-1 font-semibold">Tendencia del peso</h2><p className="text-sm">{s.tendencia.message}</p></section>
      <button className="btn" disabled={busy} onClick={analyse}>{busy ? 'Analizando…' : 'Análisis con IA de esta semana'}</button>
      <ErrBox e={err} />
      {nar && <section className="card flex flex-col gap-2 text-sm"><p>{nar.summary}</p>
        {nar.wins.length > 0 && <><h3 className="font-semibold">Lo bueno</h3><ul className="list-disc pl-5">{nar.wins.map((w) => <li key={w}>{w}</li>)}</ul></>}
        {nar.concerns.length > 0 && <><h3 className="font-semibold">A vigilar</h3><ul className="list-disc pl-5">{nar.concerns.map((w) => <li key={w}>{w}</li>)}</ul></>}
        {nar.suggestions.length > 0 && <><h3 className="font-semibold">Para la próxima semana</h3><ul className="list-disc pl-5">{nar.suggestions.map((w) => <li key={w}>{w}</li>)}</ul></>}</section>}
    </div>
  );
}
