import { ArrowUp, KeyRound, Mic, MicOff, Sparkles, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingState, Notice, Segmented, cx } from '../ui/primitives';

type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean };
type Cfg = { consent: boolean; providers: { provider: string; hasKey: boolean }[]; tasks: { task: string; provider: string; model: string }[]; usageToday: { calls: number; limit: number } };
type Tab = 'chat' | 'log' | 'eat' | 'menu' | 'report';
const TABS: { value: Tab; label: string }[] = [{ value: 'chat', label: 'Chat' }, { value: 'log', label: 'Registrar' }, { value: 'eat', label: 'Qué comer' }, { value: 'menu', label: 'Menú' }, { value: 'report', label: 'Informe' }];

const SUGGESTIONS = [
  '¿Qué puedo cenar hoy?', '¿Cuántas proteínas me faltan?', 'Analiza mi semana', '¿Estoy perdiendo peso demasiado rápido?',
  '¿Por qué llevo dos semanas sin bajar de peso?', '¿Cuántas calorías he consumido esta semana?', '¿Cómo afecta dormir poco a mi actividad?',
];

export function AI() {
  const cfg = useData<Cfg>('/ai/config');
  const [tab, setTab] = useState<Tab>('chat');
  const nutri = cfg.data?.tasks.find((t) => t.task === 'NUTRITIONIST');
  const hasKey = !!cfg.data?.providers.find((p) => p.provider === nutri?.provider)?.hasKey;
  const ready = !!cfg.data?.consent && hasKey;

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <PageHeader title="Asistente nutricional" overline="IA" />
      <div className="-mx-1 mb-4 overflow-x-auto px-1"><Segmented<Tab> label="Secciones de IA" value={tab} onChange={setTab} options={TABS} /></div>
      {cfg.loading ? <LoadingState rows={1} /> : cfg.error || !cfg.data ? (
        <ErrorState text="No se pudo conectar con el asistente. Comprueba que el servidor incluye la función de IA." onRetry={cfg.reload} />
      ) : tab === 'report' ? <ReportTab aiReady={ready} /> : !ready ? (
        <Card>
          <EmptyState icon={KeyRound} title="Configura tu asistente"
            text={!cfg.data.consent ? 'Para responder con tus datos reales necesita tu consentimiento explícito. Solo se envían datos agregados, sin tu nombre ni tu email.' : 'Añade la clave API de tu proveedor (Claude, Gemini u OpenAI). Se guarda cifrada en el servidor y nunca se muestra.'}
            action={<Link to="/settings#ia" className="inline-flex min-h-11 items-center rounded-ctl bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">Ir a Ajustes</Link>} />
        </Card>
      ) : (
        <>
          {tab === 'chat' && <ChatTab usage={cfg.data.usageToday} />}
          {tab === 'log' && <LogTab />}
          {tab === 'eat' && <EatTab />}
          {tab === 'menu' && <MenuTab />}
        </>
      )}
    </div>
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
  const end = useRef<HTMLDivElement>(null);
  const speaker = useSpeaker();
  const voiceRef = useRef(voiceMode);
  voiceRef.current = voiceMode;
  useEffect(() => { if (msgs.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

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
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 14rem)' }}>
      <div className="flex-1 pb-4" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="pt-2">
            <div className="mb-5 flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong"><Sparkles className="size-[18px]" aria-hidden /></span>
              <p className="t-body pt-1">Hola. Puedo consultar tus comidas, peso, actividad y sueño registrados para orientarte. No soy un médico: para temas de salud consulta a un profesional.{dictation.supported ? ' Puedes escribirme o hablarme con el micrófono.' : ''}</p></div>
            <p className="t-over mb-2">Prueba a preguntar</p>
            <ul className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <li key={s}><button onClick={() => send(s)} className={chipClass(false)}>{s}</button></li>)}</ul>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {msgs.map((m, i) => (
              <li key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[88%] rounded-[18px] px-4 py-2.5 text-[0.9375rem] leading-relaxed',
                  m.role === 'user' ? 'whitespace-pre-wrap rounded-br-md bg-accent text-accent-ink' : m.error ? 'whitespace-pre-wrap rounded-bl-md bg-warn-soft' : 'rounded-bl-md border border-line bg-surface')}>
                  {m.role === 'assistant' && !m.error ? <Markdown>{m.content}</Markdown> : m.content}
                </div>
              </li>
            ))}
            {busy && <li className="flex"><span className="flex gap-1 rounded-[18px] rounded-bl-md border border-line bg-surface px-4 py-3" role="status" aria-label="Escribiendo">{[0, 1, 2].map((d) => <i key={d} className="size-1.5 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${d * 150}ms` }} />)}</span></li>}
          </ul>
        )}
        <div ref={end} />
      </div>

      <div className="sticky z-10 bg-bg pb-3 pt-2 max-lg:bottom-[calc(3.25rem+env(safe-area-inset-bottom))] lg:bottom-0">
        {dictation.error && <div className="mb-2"><Notice tone="warn">{dictation.error}</Notice></div>}
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }} className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} aria-label="Mensaje"
            placeholder={dictation.listening ? 'Escuchando… habla ahora' : 'Pregunta sobre tu alimentación…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line-strong bg-surface px-4 py-2.5 placeholder:text-ink-3 focus:border-accent focus:outline-none" />
          {dictation.supported && (
            <IconButton type="button" icon={dictation.listening ? MicOff : Mic} label={dictation.listening ? 'Dejar de escuchar' : 'Hablar con el micrófono'} aria-pressed={dictation.listening}
              tone={dictation.listening ? 'danger' : 'default'} className={cx('border border-line-strong', dictation.listening && 'animate-pulse')} onClick={toggleMic} />
          )}
          <Button type="submit" aria-label="Enviar" disabled={!text.trim()} loading={busy} className="!size-11 !rounded-full !px-0" icon={ArrowUp} />
        </form>
        {(dictation.supported || speaker.supported) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {dictation.supported && speaker.supported && (
              <Button variant={voiceMode ? 'primary' : 'secondary'} size="sm" icon={voiceMode ? Volume2 : VolumeX} aria-pressed={voiceMode} onClick={toggleVoiceMode}>Modo voz {voiceMode ? 'activado' : 'desactivado'}</Button>
            )}
            {speaker.speaking && <Button variant="ghost" size="sm" icon={Square} onClick={speaker.stop}>Parar lectura</Button>}
            {dictation.listening && <span role="status" className="t-meta flex items-center gap-1.5"><i className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />Escuchando…</span>}
          </div>
        )}
        {!dictation.supported && <p className="t-meta mt-2">Este navegador no admite dictado por voz. En el iPhone puedes usar el micrófono del teclado.</p>}
        {voiceMode && <p className="t-meta mt-2">Modo voz: al terminar de hablar se envía el mensaje y se lee la respuesta. El audio lo procesa el servicio de voz de tu navegador (Apple o Google).</p>}
      </div>
      <p className="t-meta pb-2 text-center">Orientación nutricional con estimaciones; no sustituye a un profesional sanitario. {usage.calls}/{usage.limit} consultas hoy.</p>
    </div>
  );
}