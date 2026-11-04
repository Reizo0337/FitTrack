import { ArrowUp, BarChart3, ChefHat, ChevronLeft, ClipboardList, KeyRound, Mic, MicOff, Sparkles, Square, UtensilsCrossed, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EatTab } from '../components/ai/EatTab';
import { LogTab } from '../components/ai/LogTab';
import { Markdown } from '../components/ai/Markdown';
import { MenuTab } from '../components/ai/MenuTab';
import { ReportTab } from '../components/ai/ReportTab';
import { chipClass, friendly } from '../components/ai/shared';
import { PageHeader } from '../components/PageHeader';
import { todayStr } from '../ctx';
import { useData } from '../hooks';
import { plainSpeech, useDictation, useSpeaker } from '../voice';
import { useToast } from '../ui/overlays';
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingState, Notice, cx } from '../ui/primitives';

type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean };
type Cfg = { consent: boolean; providers: { provider: string; hasKey: boolean }[]; tasks: { task: string; provider: string; model: string }[]; usageToday: { calls: number; limit: number } };
type Tool = 'log' | 'eat' | 'menu' | 'report';
const TOOLS: { value: Tool; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'log', label: 'Registrar', hint: 'Cuéntame qué has comido', icon: ClipboardList },
  { value: 'eat', label: 'Qué comer', hint: 'Ideas según lo que te queda', icon: ChefHat },
  { value: 'menu', label: 'Menú', hint: 'Plan semanal y compra', icon: UtensilsCrossed },
  { value: 'report', label: 'Informe', hint: 'Resumen de tu semana', icon: BarChart3 },
];

/**
 * Sigue el viewport visual: con el teclado abierto encoge el chat en vez de empujar la página,
 * y oculta la barra inferior (clase kb-open) para que nada suba ni se descoloque.
 */
function useChatViewport() {
  const [vp, setVp] = useState({ top: 0, height: window.innerHeight, kb: false });
  useEffect(() => {
    const vv = window.visualViewport;
    const lock = window.matchMedia('(max-width: 1023px)').matches;
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = 'hidden';
    const update = () => {
      const h = vv?.height ?? window.innerHeight;
      const kb = window.innerHeight - h > 120;
      setVp({ top: vv?.offsetTop ?? 0, height: h, kb });
      document.documentElement.classList.toggle('kb-open', kb);
    };
    update();
    vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); window.removeEventListener('resize', update);
      document.documentElement.classList.remove('kb-open'); document.body.style.overflow = prev;
    };
  }, []);
  return vp;
}

const SUGGESTIONS = [
  '¿Qué puedo cenar hoy?', '¿Cuántas proteínas me faltan?', 'Analiza mi semana', '¿Estoy perdiendo peso demasiado rápido?',
  '¿Por qué llevo dos semanas sin bajar de peso?', '¿Cuántas calorías he consumido esta semana?', '¿Cómo afecta dormir poco a mi actividad?',
];

export function AI() {
  const cfg = useData<Cfg>('/ai/config');
  const nutri = cfg.data?.tasks.find((t) => t.task === 'NUTRITIONIST');
  const hasKey = !!cfg.data?.providers.find((p) => p.provider === nutri?.provider)?.hasKey;
  const ready = !!cfg.data?.consent && hasKey;

  if (cfg.loading || cfg.error || !cfg.data || !ready) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col">
        <PageHeader title="Asistente nutricional" overline="IA" />
        {cfg.loading ? <LoadingState rows={1} /> : cfg.error || !cfg.data ? (
          <ErrorState text="No se pudo conectar con el asistente. Comprueba que el servidor incluye la función de IA." onRetry={cfg.reload} />
        ) : (
          <>
            <Card>
              <EmptyState icon={KeyRound} title="Configura tu asistente"
                text={!cfg.data.consent ? 'Para responder con tus datos reales necesita tu consentimiento explícito. Solo se envían datos agregados, sin tu nombre ni tu email.' : 'Añade la clave API de tu proveedor (Claude, Gemini u OpenAI). Se guarda cifrada en el servidor y nunca se muestra.'}
                action={<Link to="/settings#ia" className="inline-flex min-h-11 items-center rounded-ctl bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">Ir a Ajustes</Link>} />
            </Card>
            <div className="mt-4"><ReportTab aiReady={false} /></div>
          </>
        )}
      </div>
    );
  }
  return <ChatTab usage={cfg.data.usageToday} />;
}

/** Función del asistente como un círculo con su icono. Con `labelled` lleva el nombre debajo (pantalla de bienvenida). */
function ToolCircle({ t, onOpen, labelled = false }: { t: (typeof TOOLS)[number]; onOpen: () => void; labelled?: boolean }) {
  return (
    <button data-tool={t.value} onClick={onOpen} aria-label={t.label} title={`${t.label}: ${t.hint}`}
      className={cx('group flex flex-col items-center gap-1.5', labelled ? 'w-16 rounded-ctl' : 'rounded-full')}>
      <span className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface text-accent-strong transition group-hover:bg-surface-2 group-active:scale-95">
        <t.icon className="size-5" aria-hidden />
      </span>
      {labelled && <span className="text-[0.6875rem] font-medium leading-tight text-ink-2" aria-hidden>{t.label}</span>}
    </button>
  );
}

function ChatTab({ usage }: { usage: { calls: number; limit: number } }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [convo, setConvo] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  // Modo voz: se envía solo al terminar de hablar y se lee la respuesta en voz alta.
  const [voiceMode, setVoiceMode] = useState(() => { try { return localStorage.getItem('voiceMode') === '1'; } catch { return false; } });
  const baseText = useRef('');
  const scroller = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const toast = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevTool = useRef<Tool | null>(null);
  const vp = useChatViewport();
  const speaker = useSpeaker();
  const voiceRef = useRef(voiceMode);
  voiceRef.current = voiceMode;
  useEffect(() => { if (msgs.length) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy, vp.kb]);
  // El cuadro de texto crece con lo que escribes (hasta 8 rem) para que siempre veas tu mensaje.
  useLayoutEffect(() => { const el = taRef.current; if (!el) return; if (!text) { el.style.height = ''; return; } el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }, [text, tool]);
  // Foco: al abrir una función va a su título; al volver, al botón que la abrió (no se pierde la posición con teclado o lector de pantalla).
  useEffect(() => {
    if (tool) headingRef.current?.focus();
    else if (prevTool.current) document.querySelector<HTMLElement>(`[data-tool="${prevTool.current}"]`)?.focus();
    prevTool.current = tool;
  }, [tool]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    speaker.stop();
    setMsgs((x) => [...x, { role: 'user', content: m }]); setText(''); setBusy(true);
    try {
      const r = await api<{ conversationId: string; reply: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ message: m, conversationId: convo, date: todayStr() }) });
      setConvo(r.conversationId);
      setMsgs((x) => [...x, { role: 'assistant', content: r.reply }]);
      if (voiceRef.current) speaker.speak(plainSpeech(r.reply));
    } catch (e) {
      setMsgs((x) => [...x, { role: 'assistant', content: friendly(e), error: true }]);
    } finally { setBusy(false); }
  }

  const sendRef = useRef(send);
  sendRef.current = send;
  const dictation = useDictation(
    (interim) => setText(`${baseText.current} ${interim}`.trim()),
    (final) => { const full = `${baseText.current} ${final}`.trim(); setText(full); if (voiceRef.current) sendRef.current(full); },
  );

  function toggleMic() {
    if (dictation.listening) { dictation.stop(); return; }
    speaker.stop(); speaker.unlock();
    baseText.current = text.trim();
    dictation.start();
  }
  function toggleVoiceMode() {
    const on = !voiceMode;
    setVoiceMode(on);
    try { localStorage.setItem('voiceMode', on ? '1' : '0'); } catch { /* sin almacenamiento */ }
    if (on) speaker.unlock(); else speaker.stop();
    toast(on ? 'Modo voz activado: se envía al terminar de hablar y se lee la respuesta. El audio lo procesa el servicio de voz de tu navegador.' : 'Modo voz desactivado', 'info');
  }

  const style = { '--vv-top': `${vp.top}px`, '--vv-h': `${vp.height}px`, '--nav-h': vp.kb ? '0px' : 'calc(3.25rem + env(safe-area-inset-bottom))' } as CSSProperties;
  const active = TOOLS.find((t) => t.value === tool);

  return (
    <div style={style} className="max-lg:fixed max-lg:inset-x-0 max-lg:top-[var(--vv-top)] max-lg:z-20 max-lg:h-[calc(var(--vv-h)-var(--nav-h))] max-lg:bg-bg max-lg:px-4 lg:h-[calc(100dvh-4rem)]">
      <div className="mx-auto flex h-full max-w-2xl flex-col">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line pb-2 max-lg:pt-[max(0.5rem,env(safe-area-inset-top))]">
          {active ? (
            <button onClick={() => setTool(null)} aria-label="Volver al chat" className="-ml-2 inline-flex min-h-11 min-w-11 items-center gap-1 rounded-ctl px-2 text-sm font-medium text-accent-strong"><ChevronLeft className="size-5" aria-hidden />Chat</button>
          ) : <h1 className="t-title">Asistente nutricional</h1>}
          {active && <h1 ref={headingRef} tabIndex={-1} className="t-head outline-none">{active.label}</h1>}
          {active && <span className="w-16" aria-hidden />}
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
          {active ? (
            <>
              {tool === 'log' && <LogTab />}
              {tool === 'eat' && <EatTab />}
              {tool === 'menu' && <MenuTab />}
              {tool === 'report' && <ReportTab aiReady />}
            </>
          ) : msgs.length === 0 ? (
            <div className="pt-1">
              <div className="mb-4 flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong"><Sparkles className="size-[18px]" aria-hidden /></span>
                <p className="t-body pt-1">Hola. Consulto tus comidas, peso, actividad y sueño para orientarte. No soy médico: ante dudas de salud, consulta a un profesional.</p></div>
              <p className="t-over mb-2">Funciones</p>
              <ul className="mb-4 flex gap-4" aria-label="Funciones">{TOOLS.map((t) => <li key={t.value}><ToolCircle t={t} labelled onOpen={() => setTool(t.value)} /></li>)}</ul>
              <p className="t-over mb-2">Prueba a preguntar</p>
              <ul className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <li key={s}><button onClick={() => send(s)} className={chipClass(false)}>{s}</button></li>)}</ul>
            </div>
          ) : (
            <ul className="flex flex-col gap-3" role="log" aria-live="polite" aria-label="Conversación">
              {msgs.map((m, i) => (
                <li key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cx('min-w-0 max-w-[88%] rounded-[18px] [overflow-wrap:anywhere] px-4 py-2.5 text-[0.9375rem] leading-relaxed',
                    m.role === 'user' ? 'whitespace-pre-wrap rounded-br-md bg-accent text-accent-ink' : m.error ? 'whitespace-pre-wrap rounded-bl-md bg-warn-soft' : 'rounded-bl-md border border-line bg-surface')}>
                    {m.role === 'assistant' && !m.error ? <Markdown>{m.content}</Markdown> : m.content}
                  </div>
                </li>
              ))}
              {busy && <li className="flex"><span className="flex gap-1 rounded-[18px] rounded-bl-md border border-line bg-surface px-4 py-3" role="status" aria-label="Escribiendo">{[0, 1, 2].map((d) => <i key={d} className="size-1.5 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${d * 150}ms` }} />)}</span></li>}
            </ul>
          )}
        </div>

      <div className={cx('shrink-0 border-t border-line bg-bg pb-2 pt-2', active && 'hidden')}>
        {msgs.length > 0 && !vp.kb && (
          <ul className="mb-2 flex items-center gap-2.5 [@media(max-height:520px)]:hidden" aria-label="Funciones">
            {TOOLS.map((t) => <li key={t.value}><ToolCircle t={t} onOpen={() => setTool(t.value)} /></li>)}
          </ul>
        )}
        {dictation.error && <div className="mb-2"><Notice tone="warn">{dictation.error}</Notice></div>}
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }} className="flex items-end gap-2">
          <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} aria-label="Mensaje"
            enterKeyHint="send" autoComplete="off" autoCapitalize="sentences"
            placeholder={dictation.listening ? 'Escuchando…' : 'Pregunta algo…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-line-strong bg-surface px-4 py-2.5 text-base placeholder:text-ink-3 focus:border-accent focus:outline-none" />
          {dictation.supported && speaker.supported && (speaker.speaking
            ? <IconButton type="button" icon={Square} label="Parar lectura" tone="accent" className="shrink-0 border border-accent bg-accent-soft" onClick={speaker.stop} />
            : <IconButton type="button" icon={voiceMode ? Volume2 : VolumeX} label="Modo voz" aria-pressed={voiceMode} tone={voiceMode ? 'accent' : 'default'}
                className={cx('shrink-0 border', voiceMode ? 'border-accent bg-accent-soft' : 'border-line-strong')} onClick={toggleVoiceMode} />)}
          {dictation.supported && (
            <IconButton type="button" icon={dictation.listening ? MicOff : Mic} label={dictation.listening ? 'Dejar de escuchar' : 'Hablar con el micrófono'} aria-pressed={dictation.listening}
              tone={dictation.listening ? 'danger' : 'default'} className={cx('shrink-0 border border-line-strong', dictation.listening && 'animate-pulse')} onClick={toggleMic} />
          )}
          <Button type="submit" aria-label="Enviar" disabled={!text.trim()} loading={busy} onPointerDown={(e) => e.preventDefault()} className="!size-11 shrink-0 !rounded-full !px-0" icon={ArrowUp} />
        </form>
        {dictation.listening && <p role="status" className="t-meta mt-2 flex items-center gap-1.5"><i className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />Escuchando…</p>}
        {!dictation.supported && !vp.kb && <p className="t-meta mt-2">Este navegador no admite dictado por voz. En el iPhone puedes usar el micrófono del teclado.</p>}
      </div>        {!vp.kb && <p className="t-meta pt-2 text-center [@media(max-height:700px)]:hidden">Orientación nutricional con estimaciones; no sustituye a un profesional sanitario. {usage.calls}/{usage.limit} consultas hoy.</p>}
      </div>
    </div>
  );
}