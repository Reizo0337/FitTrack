import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { api, ApiError, download } from '../api';
import { FastingSettings } from '../components/Fasting';
import { PageHeader } from '../components/PageHeader';
import { useData } from '../hooks';
import type { Profile } from '../types';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Card, FormField, LoadingState, Notice, Segmented, SelectField, cx } from '../ui/primitives';
import { getThemePref, setThemePref, type ThemePref } from '../ui/theme';

const ACT: [string, string][] = [['SEDENTARY', 'Sedentaria'], ['LIGHT', 'Ligera'], ['MODERATE', 'Moderada'], ['ACTIVE', 'Alta'], ['VERY_ACTIVE', 'Muy alta']];
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const KIND_LABEL: Record<string, string> = {
  WAKE: 'Registrar la hora de despertar', WATER: 'Beber agua', BREAKFAST: 'Registrar el desayuno', LUNCH: 'Registrar la comida', DINNER: 'Registrar la cena',
  WALK: 'Caminar (si llevas pocos pasos)', LOG_DINNER: 'Completar el seguimiento del día', BEDTIME: 'Hora de acostarme', WEIGH_IN: 'Pesarme', WEEKLY_REPORT: 'Informe semanal',
};
const b64ToU8 = (s: string) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function Section({ id, title, text, children }: { id: string; title: string; text?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="t-head px-1">{title}</h2>
      {text && <p className="t-meta mb-2 mt-0.5 px-1">{text}</p>}
      <Card className="mt-2">{children}</Card>
    </section>
  );
}

export function Settings({ onLogout }: { onLogout: () => void }) {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  useEffect(() => { if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }, []);
  return (
    <>
      <PageHeader title="Ajustes" bare />
      <div className="flex flex-col gap-7 lg:max-w-2xl">
        <Goals />
        <Section id="ia" title="Asistente de IA" text="Elige el proveedor y el modelo de cada tarea. Las claves se guardan cifradas en el servidor.">
          <AISettings />
        </Section>
        <Section id="ayuno" title="Ayuno" text="Define la hora de cada comida. El ayuno nocturno se activa solo después de la cena."><FastingSettings /></Section>
        <Section id="apple-health" title="Apple Health" text="Una web no puede leer HealthKit: un Atajo de iOS envía tus datos con un token personal."><Health /></Section>
        <Section id="notificaciones" title="Notificaciones"><Notifications /></Section>
        <Section id="apariencia" title="Apariencia">
          <Segmented<ThemePref> label="Tema" value={theme} onChange={(v) => { setTheme(v); setThemePref(v); }} options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
        </Section>
        <Section id="privacidad" title="Privacidad y cuenta" text="Tus datos son tuyos: puedes llevártelos o borrarlos por completo cuando quieras."><Account onLogout={onLogout} /></Section>
      </div>
    </>
  );
}

function Goals() {
  const toast = useToast();
  const { data, loading } = useData<{ profile: Profile }>('/profile');
  const [warn, setWarn] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (loading || !data) return <LoadingState rows={1} />;
  const p = data.profile;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(String(f.get(k)).replace(',', '.'));
    const list = (k: string) => String(f.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      const r = await api<{ derived: { warnings: string[]; pace: { message: string } } }>('/profile', { method: 'PUT', body: JSON.stringify({
        displayName: String(f.get('name') || ''), targetKcal: n('kcal'), targetProteinG: n('protein'), targetFatG: n('fat'), targetFiberG: n('fiber'), targetWaterMl: n('water'),
        goalWeightKg: n('goal'), activityLevel: String(f.get('activity')), allergies: list('allergies'), dislikedFoods: list('disliked'), aiConsent: f.get('ai') === 'on',
      }) });
      setWarn(r.derived.warnings); toast('Cambios guardados');
    } catch (er) { toast(er instanceof ApiError && er.status === 400 ? 'Algún valor está fuera de rango' : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Section id="perfil" title="Perfil y objetivos" text="Son estimaciones iniciales, no valores médicos. Ajústalos según tu evolución o las indicaciones de un profesional.">
      <form onSubmit={save} className="flex flex-col gap-3">
        <FormField label="Nombre (para el saludo)" name="name" defaultValue={p.displayName} maxLength={80} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Calorías (kcal)" name="kcal" inputMode="decimal" defaultValue={p.targetKcal} required />
          <FormField label="Proteínas (g)" name="protein" inputMode="decimal" defaultValue={p.targetProteinG} required />
          <FormField label="Grasas (g)" name="fat" inputMode="decimal" defaultValue={p.targetFatG} required />
          <FormField label="Fibra (g)" name="fiber" inputMode="decimal" defaultValue={p.targetFiberG} required />
          <FormField label="Agua (ml)" name="water" inputMode="decimal" defaultValue={p.targetWaterMl} required />
          <FormField label="Peso objetivo (kg)" name="goal" inputMode="decimal" defaultValue={p.goalWeightKg} required />
        </div>
        <SelectField label="Nivel de actividad" name="activity" defaultValue={p.activityLevel}>{ACT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
        <FormField label="Alergias e intolerancias" name="allergies" defaultValue={p.allergies.join(', ')} hint="Separadas por comas. La IA nunca las propondrá." />
        <FormField label="Alimentos que prefieres evitar" name="disliked" defaultValue={p.dislikedFoods.join(', ')} />
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="ai" defaultChecked={p.aiConsent} className="mt-1 size-5 accent-[var(--accent)]" />
          <span>Permitir que la IA consulte mis datos agregados (sin nombre ni email) para responder y recomendar.</span></label>
        {warn.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
        <Button type="submit" loading={busy} block>Guardar cambios</Button>
      </form>
    </Section>
  );
}

type AICfg = { consent: boolean; providers: { provider: string; hasKey: boolean }[]; tasks: { task: string; provider: string; model: string }[]; defaults: Record<string, Record<string, string>>; usageToday: { calls: number;tokensIn: number; tokensOut: number } };
const PROV: Record<string, string> = { ANTHROPIC: 'Anthropic Claude', GEMINI: 'Google Gemini', OPENAI: 'OpenAI' };
const TASK: Record<string, string> = { NUTRITIONIST: 'Nutricionista (chat y menús)', FOOD_RECOGNITION: 'Reconocimiento de comidas', WEEKLY_ANALYSIS: 'Análisis semanal' };

function AISettings() {
  const toast = useToast();
  const { data, error, reload } = useData<AICfg>('/ai/config');
  const [tasks, setTasks] = useState<AICfg['tasks']>([]);
  const [keyFor, setKeyFor] = useState<string | null>(null);
  useEffect(() => { if (data) setTasks(data.tasks); }, [data]);
  if (error) return <p className="t-meta">El servidor no incluye todavía la función de IA.</p>;
  if (!data) return <LoadingState rows={1} />;

  async function saveKey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const apiKey = String(new FormData(e.currentTarget).get('key'));
    try { await api('/ai/keys', { method: 'PUT', body: JSON.stringify({ provider: keyFor, apiKey }) }); toast('Clave guardada'); setKeyFor(null); reload(); }
    catch { toast('No se pudo guardar la clave', 'error'); }
  }
  async function removeKey(provider: string) { await api(`/ai/keys/${provider}`, { method: 'DELETE' }); toast('Clave eliminada'); reload(); }
  async function saveTasks() {
    try { await api('/ai/config', { method: 'PUT', body: JSON.stringify({ items: tasks }) }); toast('Modelos guardados'); }
    catch (er) { toast(er instanceof ApiError && er.status === 400 ? 'Nombre de modelo no válido' : 'No se pudo guardar', 'error'); }
  }
  const upd = (task: string, patch: Partial<AICfg['tasks'][number]>) => setTasks((xs) => xs.map((x) => (x.task === task ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col">
        {data.providers.map((p) => (
          <li key={p.provider} className="flex min-h-14 items-center justify-between gap-3 border-t border-line first:border-0">
            <span><span className="font-medium">{PROV[p.provider]}</span><span className={cx('t-meta block', p.hasKey && 'text-accent-strong')}>{p.hasKey ? 'Clave guardada' : 'Sin clave'}</span></span>
            <span className="flex gap-2">{p.hasKey && <Button variant="ghost" size="sm" onClick={() => removeKey(p.provider)}>Quitar</Button>}<Button variant="secondary" size="sm" onClick={() => setKeyFor(p.provider)}>{p.hasKey ? 'Cambiar' : 'Añadir'}</Button></span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        {tasks.map((t) => (
          <div key={t.task} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">{TASK[t.task]}</p>
            <SelectField label="Proveedor" value={t.provider} onChange={(e) => upd(t.task, { provider: e.target.value, model: data.defaults[e.target.value]?.[t.task] ?? t.model })}>{Object.entries(PROV).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
            <FormField label="Modelo" value={t.model} onChange={(e) => upd(t.task, { model: e.target.value })} />
          </div>
        ))}
        <p className="t-meta">Los nombres de modelo cambian con el tiempo: verifícalos en la documentación del proveedor.</p>
        <Button variant="secondary" onClick={saveTasks}>Guardar modelos</Button>
      </div>
      <p className="t-meta border-t border-line pt-3">Uso de hoy: {data.usageToday.calls} llamadas · {(data.usageToday.tokensIn + data.usageToday.tokensOut).toLocaleString('es')} tokens.</p>
      <Sheet open={!!keyFor} onClose={() => setKeyFor(null)} title={`Clave de ${keyFor ? PROV[keyFor] : ''}`}>
        <form onSubmit={saveKey} className="flex flex-col gap-3">
          <FormField label="Clave API" name="key" type="password" autoComplete="off" required minLength={10} autoFocus hint="Se cifra en el servidor y no se vuelve a mostrar." />
          <Button type="submit" block>Guardar</Button>
        </form>
      </Sheet>
    </div>
  );
}

type Tok = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
function Health() {
  const toast = useToast();
  const [toks, setToks] = useState<Tok[]>([]);
  const [fresh, setFresh] = useState('');
  const load = useCallback(() => api<{ items: Tok[] }>('/health/tokens').then((r) => setToks(r.items)).catch(() => undefined), []);
  useEffect(() => { load(); }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const label = String(new FormData(form).get('label'));
    const r = await api<{ token: string }>('/health/tokens', { method: 'POST', body: JSON.stringify({ label }) });
    setFresh(r.token); form.reset(); load();
  }
  const url = `${location.origin}/api/health/ingest`;
  const sample = JSON.stringify({ days: [{ date: '2026-11-04', steps: 8421, activeKcal: 410, restingKcal: 1950, distanceKm: 6.1, exerciseMin: 38 }], sleep: [{ date: '2026-11-04', sleepAt: '2026-11-03T22:45:00Z', wakeAt: '2026-11-04T06:15:00Z' }] }, null, 1);
  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
        <li>Crea un token y cópialo (solo se muestra una vez). Solo permite <b>enviar</b> datos de salud.</li>
        <li>En Atajos: <i>Buscar muestras de salud</i> (pasos, energía activa y en reposo, distancia, ejercicio, sueño) de hoy.</li>
        <li><i>Obtener contenido de URL</i>: POST a <code className="break-all text-ink">{url}</code> con la cabecera <code className="text-ink">Authorization: Bearer &lt;token&gt;</code> y un cuerpo JSON.</li>
        <li>Automatización «Hora del día» (p. ej. 23:30) que ejecute el Atajo.</li>
      </ol>
      <details><summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-2">Ejemplo de cuerpo JSON</summary>
        <pre className="mt-1 overflow-x-auto rounded-ctl bg-surface-2 p-3 text-xs">{sample}</pre>
        <p className="t-meta mt-2">Todo es opcional: lo que no envíes queda sin dato (nunca se rellena con 0). Reenviar el mismo día actualiza sin duplicar.</p></details>
      <Notice tone="info">Limitación: las automatizaciones de Atajos corren a horas fijas y iOS puede pedir confirmación. No es sincronización en tiempo real.</Notice>
      {fresh && <Notice tone="warn"><b>Copia el token ahora; no volverá a mostrarse:</b><code className="mt-1 block select-all break-all">{fresh}</code><button className="mt-2 min-h-11 text-xs font-medium underline" onClick={() => setFresh('')}>Ya lo he copiado</button></Notice>}
      <ul>{toks.map((t) => (
        <li key={t.id} className="flex min-h-14 items-center justify-between gap-3 border-t border-line first:border-0">
          <span><span className="font-medium">{t.label}</span><span className="t-meta block">{t.lastUsedAt ? `Último uso: ${new Date(t.lastUsedAt).toLocaleString('es')}` : 'Sin usar todavía'}</span></span>
          <Button variant="danger" size="sm" onClick={async () => { await api(`/health/tokens/${t.id}`, { method: 'DELETE' }); toast('Token revocado'); load(); }}>Revocar</Button>
        </li>))}</ul>
      <form onSubmit={create} className="flex items-end gap-2"><FormField className="flex-1" label="Nuevo token" name="label" placeholder="iPhone" required maxLength={40} /><Button type="submit">Crear</Button></form>
    </div>
  );
}

type Reminder = { kind: string; enabled: boolean; timeLocal: string; weekdays: number[] };
type PushCfg = { enabled: boolean; publicKey: string | null; cronConfigured: boolean };
function Notifications() {
  const toast = useToast();
  const [cfg, setCfg] = useState<PushCfg | null>(null);
  const [items, setItems] = useState<Reminder[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    api<PushCfg>('/push/config').then(setCfg).catch(() => undefined);
    api<{ items: Reminder[] }>('/reminders').then((r) => setItems(r.items)).catch(() => undefined);
    if (supported) navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSubscribed(!!s)).catch(() => undefined);
  }, [supported]);

  async function enable() {
    if (!cfg?.publicKey) return;
    if ((await Notification.requestPermission()) !== 'granted') { toast('Permiso denegado. Puedes cambiarlo en los ajustes del sistema.', 'error'); return; }
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.publicKey) }));
    await api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
    setSubscribed(true); toast('Notificaciones activadas en este dispositivo');
  }
  async function disable() {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) { await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setSubscribed(false); toast('Notificaciones desactivadas aquí');
  }
  const upd = (kind: string, patch: Partial<Reminder>) => setItems((xs) => xs.map((x) => (x.kind === kind ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta">Todos desactivados por defecto. Un aviso por tipo y día, y solo si aún no has hecho lo que recuerda.</p>
      {!supported && <Notice tone="warn">Este navegador no admite notificaciones push.</Notice>}
      {supported && isIos && !standalone && <Notice tone="warn">En iPhone solo funcionan con la app instalada: Safari → Compartir → «Añadir a pantalla de inicio» (iOS 16.4 o superior) y ábrela desde el icono.</Notice>}
      {cfg && !cfg.enabled && <Notice tone="info">El servidor no tiene claves VAPID configuradas, así que no puede enviar notificaciones.</Notice>}
      {cfg?.enabled && !cfg.cronConfigured && <Notice tone="info">Falta CRON_SECRET en el servidor: sin un programador externo no se enviarán avisos automáticos.</Notice>}
      {supported && cfg?.enabled && (subscribed
        ? <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={async () => { try { const r = await api<{ sent: number }>('/push/test', { method: 'POST' }); toast(r.sent ? 'Prueba enviada' : 'No se pudo enviar', r.sent ? 'success' : 'error'); } catch { toast('No se pudo enviar la prueba', 'error'); } }}>Enviar prueba</Button><Button variant="ghost" onClick={disable}>Desactivar aquí</Button></div>
        : <Button onClick={enable} block>Activar en este dispositivo</Button>)}
      <ul>{items.map((r) => (
        <li key={r.kind} className="border-t border-line py-3 first:border-0">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label className="flex flex-1 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--accent)]" checked={r.enabled} onChange={(e) => upd(r.kind, { enabled: e.target.checked })} />{KIND_LABEL[r.kind] ?? r.kind}</label>
            <input type="time" value={r.timeLocal} onChange={(e) => upd(r.kind, { timeLocal: e.target.value })} aria-label={`Hora: ${KIND_LABEL[r.kind] ?? r.kind}`} className="min-h-11 rounded-ctl border border-line-strong bg-surface px-2 text-base" />
          </div>
          {r.enabled && <div className="mt-2 flex flex-wrap gap-1.5 pl-0 sm:pl-8">{DAYS.map((d, i) => { const on = r.weekdays.includes(i + 1); return <button key={d} type="button" aria-pressed={on} aria-label={['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i]} className={cx('size-10 rounded-full text-xs font-semibold transition', on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2')} onClick={() => { const w = on ? r.weekdays.filter((x) => x !== i + 1) : [...r.weekdays, i + 1].sort(); if (w.length) upd(r.kind, { weekdays: w }); }}>{d}</button>; })}</div>}
        </li>))}</ul>
      <p className="t-meta">«Avisarme si llevo horas sin moverme» no es posible: requiere movimiento en tiempo real.</p>
      <Button variant="secondary" onClick={async () => { await api('/reminders', { method: 'PUT', body: JSON.stringify({ items }) }); toast('Recordatorios guardados'); }}>Guardar recordatorios</Button>
    </div>
  );
}

function Account({ onLogout }: { onLogout: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'json' | 'photos' | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  async function exportData(photos: boolean) {
    setBusy(photos ? 'photos' : 'json');
    try { await download(`/account/export${photos ? '?photos=1' : ''}`, `fittrack-export-${new Date().toISOString().slice(0, 10)}.json`); toast('Exportación descargada'); }
    catch { toast('No se pudo exportar', 'error'); } finally { setBusy(null); }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" icon={Download} loading={busy === 'json'} onClick={() => exportData(false)}>Exportar datos (JSON)</Button>
        <Button variant="secondary" icon={Download} loading={busy === 'photos'} onClick={() => exportData(true)}>Exportar con fotos</Button>
      </div>
      <p className="t-meta">La exportación no incluye contraseñas, tokens ni claves API.</p>
      <ul className="border-t border-line text-sm">
        <li className="flex min-h-14 items-center justify-between gap-3"><span className="font-medium">Contraseña<span className="t-meta block">Al cambiarla se cierran las demás sesiones.</span></span><Button variant="secondary" size="sm" onClick={() => setPwOpen(true)}>Cambiar</Button></li>
        <li className="flex min-h-14 items-center justify-between gap-3 border-t border-line"><span className="font-medium">Sesión</span><Button variant="secondary" size="sm" onClick={onLogout}>Cerrar sesión</Button></li>
        <li className="flex min-h-14 items-center justify-between gap-3 border-t border-line"><span className="font-medium">Eliminar todos mis datos<span className="t-meta block">Definitivo: comidas, peso, fotos, claves…</span></span><Button variant="danger" size="sm" onClick={() => setDelOpen(true)}>Eliminar</Button></li>
      </ul>
      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
      <DeleteSheet open={delOpen} onClose={() => setDelOpen(false)} />
    </div>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    try { await api('/account/password', { method: 'POST', body: JSON.stringify({ current: String(f.get('current')), next: String(f.get('next')) }) }); toast('Contraseña cambiada. Las demás sesiones se han cerrado.'); onClose(); }
    catch (er) { setErr(er instanceof ApiError && er.status === 403 ? 'La contraseña actual no es correcta.' : 'La nueva contraseña debe tener al menos 12 caracteres.'); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Cambiar contraseña">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FormField label="Contraseña actual" name="current" type="password" autoComplete="current-password" required autoFocus />
        <FormField label="Nueva contraseña" name="next" type="password" autoComplete="new-password" minLength={12} required hint="Mínimo 12 caracteres." />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" loading={busy} block>Cambiar contraseña</Button>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    try { await api('/account', { method: 'DELETE', body: JSON.stringify({ password: String(f.get('password')), confirm: String(f.get('confirm')) }) }); location.href = '/'; }
    catch (er) { setErr(er instanceof ApiError && er.status === 403 ? 'Contraseña incorrecta.' : 'Escribe exactamente BORRAR TODO para confirmar.'); setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Eliminar todos mis datos">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Notice tone="danger">Se eliminarán tu cuenta y todo lo asociado de forma definitiva. No se puede deshacer. Exporta antes si quieres conservar una copia.</Notice>
        <FormField label="Tu contraseña" name="password" type="password" autoComplete="current-password" required />
        <FormField label="Escribe BORRAR TODO para confirmar" name="confirm" autoComplete="off" required />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" variant="danger" loading={busy} block>Eliminar definitivamente</Button>
      </form>
    </Sheet>
  );
}