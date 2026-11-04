import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

type Profile = { goalWeightKg: number; activityLevel: string; timezone: string; targetKcal: number; targetProteinG: number; targetFatG: number; targetFiberG: number; targetWaterMl: number; allergies: string[]; dislikedFoods: string[]; aiConsent: boolean };
type Reminder = { kind: string; enabled: boolean; timeLocal: string; weekdays: number[] };
type Tok = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
type PushCfg = { enabled: boolean; publicKey: string | null; cronConfigured: boolean };

const KIND_LABEL: Record<string, string> = {
  WAKE: 'Registrar la hora de despertar', WATER: 'Beber agua', BREAKFAST: 'Registrar el desayuno', LUNCH: 'Registrar la comida', DINNER: 'Registrar la cena',
  WALK: 'Caminar (si llevas pocos pasos)', LOG_DINNER: 'Completar el seguimiento del día', BEDTIME: 'Hora de acostarme', WEIGH_IN: 'Pesarme',
};
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const ACT: [string, string][] = [['SEDENTARY', 'Sedentaria'], ['LIGHT', 'Ligera'], ['MODERATE', 'Moderada'], ['ACTIVE', 'Alta'], ['VERY_ACTIVE', 'Muy alta']];

const b64ToU8 = (s: string) => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function Settings() {
  const [msg, setMsg] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>
      {msg && <p role="status" className="rounded-xl bg-slate-200 p-3 text-sm dark:bg-slate-800">{msg}</p>}
      <Goals say={setMsg} />
      <Health say={setMsg} />
      <Notifications say={setMsg} />
    </div>
  );
}

function Goals({ say }: { say: (m: string) => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  useEffect(() => { api<{ profile: Profile }>('/profile').then((r) => setP(r.profile)); }, []);
  if (!p) return null;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(String(f.get(k)).replace(',', '.'));
    const list = (k: string) => String(f.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const r = await api<{ derived: { warnings: string[]; pace: { message: string } } }>('/profile', { method: 'PUT', body: JSON.stringify({
        targetKcal: n('kcal'), targetProteinG: n('protein'), targetFatG: n('fat'), targetFiberG: n('fiber'), targetWaterMl: n('water'), goalWeightKg: n('goal'),
        activityLevel: String(f.get('activity')), allergies: list('allergies'), dislikedFoods: list('disliked'), aiConsent: f.get('ai') === 'on',
      }) });
      setWarn(r.derived.warnings); say(`Objetivos guardados. ${r.derived.pace.message}`);
    } catch (er) { say(er instanceof ApiError && er.status === 400 ? 'Algún valor está fuera de rango.' : 'No se pudo guardar.'); }
  }
  const row = (k: string, label: string, v: number | string, ph = '') => <label className="text-xs text-slate-500">{label}<input name={k} className="input mt-1" inputMode="decimal" defaultValue={v} placeholder={ph} required /></label>;
  return (
    <form onSubmit={save} className="card flex flex-col gap-2">
      <h2 className="font-semibold">Objetivos</h2>
      <p className="text-xs text-slate-500">Son estimaciones iniciales, no valores médicos. Ajústalos según tu evolución o las indicaciones de un profesional.</p>
      <div className="grid grid-cols-2 gap-2">
        {row('kcal', 'Calorías (kcal)', p.targetKcal)}{row('protein', 'Proteínas (g)', p.targetProteinG)}{row('fat', 'Grasas (g)', p.targetFatG)}
        {row('fiber', 'Fibra (g)', p.targetFiberG)}{row('water', 'Agua (ml)', p.targetWaterMl)}{row('goal', 'Peso objetivo (kg)', p.goalWeightKg)}
        <label className="col-span-2 text-xs text-slate-500">Actividad<select name="activity" className="input mt-1" defaultValue={p.activityLevel}>{ACT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="col-span-2 text-xs text-slate-500">Alergias / intolerancias (separadas por comas)<input name="allergies" className="input mt-1" defaultValue={p.allergies.join(', ')} /></label>
        <label className="col-span-2 text-xs text-slate-500">Alimentos que no quieres que se recomienden<input name="disliked" className="input mt-1" defaultValue={p.dislikedFoods.join(', ')} /></label>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="ai" defaultChecked={p.aiConsent} className="size-4" /> Permitir enviar mis datos agregados a un modelo de IA (Fase 5)</label>
      </div>
      {warn.map((w) => <p key={w} className="text-sm text-amber-500">⚠ {w}</p>)}
      <button className="btn">Guardar objetivos</button>
    </form>
  );
}

function Health({ say }: { say: (m: string) => void }) {
  const [toks, setToks] = useState<Tok[]>([]);
  const [fresh, setFresh] = useState('');
  const load = useCallback(() => api<{ items: Tok[] }>('/health/tokens').then((r) => setToks(r.items)), []);
  useEffect(() => { load(); }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = String(new FormData(e.currentTarget).get('label'));
    const r = await api<{ token: string }>('/health/tokens', { method: 'POST', body: JSON.stringify({ label }) });
    setFresh(r.token); e.currentTarget.reset(); load();
  }
  async function revoke(id: string) { await api(`/health/tokens/${id}`, { method: 'DELETE' }); load(); say('Token revocado.'); }
  const url = `${location.origin}/api/health/ingest`;
  const sample = JSON.stringify({ days: [{ date: '2026-11-04', steps: 8421, activeKcal: 410, restingKcal: 1950, distanceKm: 6.1, exerciseMin: 38 }], sleep: [{ date: '2026-11-04', sleepAt: '2026-11-03T22:45:00Z', wakeAt: '2026-11-04T06:15:00Z' }] }, null, 1);
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-semibold">Apple Health (mediante Atajos)</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">Una web no puede leer HealthKit. Alternativa sin app nativa: un Atajo de iOS lee Salud y envía los datos a tu servidor con un token personal que solo permite <b>escribir</b> datos de salud. Pide permisos de Salud de forma explícita la primera vez que ejecutas el Atajo.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>Crea un token aquí abajo y cópialo (solo se muestra una vez).</li>
        <li>En Atajos: acción <i>Buscar muestras de salud</i> (Pasos, Energía activa, Energía en reposo, Distancia, Minutos de ejercicio, Sueño) del día de hoy.</li>
        <li>Acción <i>Obtener contenido de URL</i>: POST a <code className="break-all">{url}</code>, cabecera <code>Authorization: Bearer &lt;token&gt;</code>, cuerpo JSON como el ejemplo.</li>
        <li>Automatización: «Hora del día» (p. ej. 23:30) → ejecutar el Atajo.</li>
      </ol>
      <details><summary className="text-sm">Ejemplo de cuerpo JSON</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-[#1b2430]">{sample}</pre>
        <p className="mt-1 text-xs text-slate-500">Todos los campos son opcionales: lo que no envíes queda sin dato (nunca se rellena con 0). Reenviar el mismo día actualiza, no duplica. También admite <code>weights</code> y <code>workouts</code>.</p></details>
      <p className="text-xs text-slate-500">Limitación: las automatizaciones de Atajos corren a horas fijas y iOS puede pedir confirmación; no es sincronización en tiempo real.</p>
      {fresh && <div role="alert" className="rounded-xl border border-amber-500 bg-amber-500/10 p-3 text-sm"><b>Copia tu token ahora; no volverá a mostrarse:</b><code className="mt-1 block break-all select-all">{fresh}</code><button className="mt-2 text-xs underline" onClick={() => setFresh('')}>Ya lo he copiado</button></div>}
      <ul className="text-sm">{toks.map((t) => <li key={t.id} className="flex items-center justify-between border-t border-slate-200 py-2 dark:border-slate-800"><span><b>{t.label}</b><span className="block text-xs text-slate-500">{t.lastUsedAt ? `último uso: ${new Date(t.lastUsedAt).toLocaleString('es')}` : 'sin usar todavía'}</span></span><button className="text-red-500" onClick={() => revoke(t.id)}>Revocar</button></li>)}</ul>
      <form onSubmit={create} className="flex gap-2"><input name="label" className="input" placeholder="Nombre (p. ej. iPhone)" required maxLength={40} /><button className="btn shrink-0">Crear token</button></form>
    </section>
  );
}

function Notifications({ say }: { say: (m: string) => void }) {
  const [cfg, setCfg] = useState<PushCfg | null>(null);
  const [items, setItems] = useState<Reminder[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    api<PushCfg>('/push/config').then(setCfg);
    api<{ items: Reminder[] }>('/reminders').then((r) => setItems(r.items));
    if (supported) navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSubscribed(!!s)).catch(() => undefined);
  }, [supported]);

  async function enable() {
    if (!cfg?.publicKey) return;
    const perm = await Notification.requestPermission(); // petición explícita, tras pulsar el botón
    if (perm !== 'granted') { say('Permiso de notificaciones denegado. Puedes cambiarlo en los ajustes del navegador/iOS.'); return; }
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.publicKey) }));
    await api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
    setSubscribed(true); say('Notificaciones activadas en este dispositivo.');
  }
  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setSubscribed(false); say('Notificaciones desactivadas en este dispositivo.');
  }
  async function test() {
    try { const r = await api<{ sent: number }>('/push/test', { method: 'POST' }); say(r.sent ? 'Notificación de prueba enviada.' : 'No se pudo enviar.'); } catch { say('No se pudo enviar la prueba.'); }
  }
  async function save() {
    await api('/reminders', { method: 'PUT', body: JSON.stringify({ items }) }); say('Recordatorios guardados.');
  }
  const upd = (kind: string, patch: Partial<Reminder>) => setItems((xs) => xs.map((x) => (x.kind === kind ? { ...x, ...patch } : x)));

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-semibold">Recordatorios</h2>
      <p className="text-xs text-slate-500">Todos desactivados por defecto. Solo se envía un aviso por tipo y día, y únicamente si aún no has hecho lo que recuerda (p. ej. no avisa del desayuno si ya lo registraste).</p>
      {!supported && <p className="text-sm text-amber-500">Este navegador no admite notificaciones push.</p>}
      {supported && isIos && !standalone && <p className="text-sm text-amber-500">En iPhone las notificaciones solo funcionan con la app instalada: Safari → Compartir → «Añadir a pantalla de inicio» (iOS 16.4 o superior) y ábrela desde el icono.</p>}
      {cfg && !cfg.enabled && <p className="text-sm text-amber-500">El servidor no tiene claves VAPID configuradas, por lo que no puede enviar notificaciones (ver README).</p>}
      {cfg?.enabled && !cfg.cronConfigured && <p className="text-sm text-amber-500">Falta CRON_SECRET en el servidor: sin un programador externo no se enviarán avisos automáticos.</p>}
      {supported && cfg?.enabled && (
        <div className="flex gap-2">
          {subscribed ? <><button className="flex-1 rounded-xl border border-slate-300 py-2 text-sm dark:border-slate-700" onClick={test}>Enviar prueba</button><button className="flex-1 rounded-xl py-2 text-sm text-red-500" onClick={disable}>Desactivar aquí</button></> : <button className="btn w-full" onClick={enable}>Activar notificaciones en este dispositivo</button>}
        </div>
      )}
      <ul>
        {items.map((r) => (
          <li key={r.kind} className="border-t border-slate-200 py-2 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={r.enabled} onChange={(e) => upd(r.kind, { enabled: e.target.checked })} />{KIND_LABEL[r.kind] ?? r.kind}</label>
              <input type="time" value={r.timeLocal} onChange={(e) => upd(r.kind, { timeLocal: e.target.value })} className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700" aria-label="Hora" /></div>
            {r.enabled && <div className="mt-1 flex gap-1">{DAYS.map((d, i) => { const on = r.weekdays.includes(i + 1); return <button key={d} type="button" aria-pressed={on} className={`size-8 rounded-full text-xs ${on ? 'bg-accent text-[#052e1d]' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`} onClick={() => { const w = on ? r.weekdays.filter((x) => x !== i + 1) : [...r.weekdays, i + 1].sort(); if (w.length) upd(r.kind, { weekdays: w }); }}>{d}</button>; })}</div>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">«Avisarme si llevo horas sin moverme» no es posible: requiere movimiento en tiempo real, y Apple Health solo llega al servidor en las sincronizaciones del Atajo.</p>
      <button className="btn" onClick={save}>Guardar recordatorios</button>
    </section>
  );
}
