import { ArrowUp, Sparkles, KeyRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { PageHeader } from '../components/PageHeader';
import { todayStr } from '../ctx';
import { useData } from '../hooks';
import { Button, Card, EmptyState, ErrorState, LoadingState, cx } from '../ui/primitives';

type Msg = { role: 'user' | 'assistant'; content: string; error?: boolean };
type Cfg = { consent: boolean; providers: { provider: string; hasKey: boolean }[]; tasks: { task: string; provider: string; model: string }[]; usageToday: { calls: number; limit: number } };

const SUGGESTIONS = [
  '¿Qué puedo cenar hoy?', '¿Cuántas proteínas me faltan?', 'Analiza mi semana', '¿Estoy perdiendo peso demasiado rápido?',
  'Crea un menú para mañana', '¿Estoy comiendo suficiente proteína?', '¿Cómo afecta dormir poco a mi actividad?',
];

const friendly = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.code === 'AI_CONSENT_REQUIRED') return 'Activa el consentimiento de IA en Ajustes para que pueda consultar tus datos.';
    if (e.code === 'AI_KEY_MISSING') return 'Falta la clave API del proveedor. Añádela en Ajustes → Asistente de IA.';
    if (e.code === 'AI_DAILY_LIMIT') return 'Has alcanzado el límite diario de consultas.';
    if (e.code === 'AI_PROVIDER_AUTH') return 'El proveedor rechazó la clave API. Revísala en Ajustes.';
    if (e.detail) return e.detail;
  }
  return 'No se pudo obtener respuesta. Inténtalo de nuevo.';
};

export function AI() {
  const cfg = useData<Cfg>('/ai/config');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [convo, setConvo] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setMsgs((x) => [...x, { role: 'user', content: m }]); setText(''); setBusy(true);
    try {
      const r = await api<{ conversationId: string; reply: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ message: m, conversationId: convo, date: todayStr() }) });
      setConvo(r.conversationId);
      setMsgs((x) => [...x, { role: 'assistant', content: r.reply }]);
    } catch (e) {
      setMsgs((x) => [...x, { role: 'assistant', content: friendly(e), error: true }]);
    } finally { setBusy(false); }
  }

  const nutri = cfg.data?.tasks.find((t) => t.task === 'NUTRITIONIST');
  const hasKey = !!cfg.data?.providers.find((p) => p.provider === nutri?.provider)?.hasKey;
  const ready = !!cfg.data?.consent && hasKey;

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ minHeight: 'calc(100dvh - 7.5rem)' }}>
      <PageHeader title="Asistente nutricional" overline="IA" />
      {cfg.loading ? <LoadingState rows={1} /> : cfg.error || !cfg.data ? (
        <ErrorState text="No se pudo conectar con el asistente. Comprueba que el servidor incluye la función de IA." onRetry={cfg.reload} />
      ) : !ready ? (
        <Card>
          <EmptyState icon={KeyRound} title="Configura tu asistente"
            text={!cfg.data.consent ? 'Para responder con tus datos reales necesita tu consentimiento explícito. Solo se envían datos agregados, sin tu nombre ni tu email.' : 'Añade la clave API de tu proveedor (Claude, Gemini u OpenAI). Se guarda cifrada en el servidor y nunca se muestra.'}
            action={<Link to="/settings#ia" className="inline-flex min-h-11 items-center rounded-ctl bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">Ir a Ajustes</Link>} />
        </Card>
      ) : (
        <>
          <div className="flex-1 pb-4" aria-live="polite">
            {msgs.length === 0 ? (
              <div className="pt-2">
                <div className="mb-5 flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong"><Sparkles className="size-[18px]" aria-hidden /></span>
                  <p className="t-body pt-1">Hola. Puedo consultar tus comidas, peso, actividad y sueño registrados para orientarte. No soy un médico: para temas de salud consulta a un profesional.</p></div>
                <p className="t-over mb-2">Prueba a preguntar</p>
                <ul className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <li key={s}><button onClick={() => send(s)} className="min-h-10 rounded-full border border-line-strong bg-surface px-3.5 text-sm transition hover:bg-surface-2 active:scale-[.98]">{s}</button></li>)}</ul>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {msgs.map((m, i) => (
                  <li key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <p className={cx('max-w-[88%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-[0.9375rem] leading-relaxed',
                      m.role === 'user' ? 'rounded-br-md bg-accent text-accent-ink' : m.error ? 'rounded-bl-md bg-warn-soft' : 'rounded-bl-md border border-line bg-surface')}>{m.content}</p>
                  </li>
                ))}
                {busy && <li className="flex"><span className="flex gap-1 rounded-[18px] rounded-bl-md border border-line bg-surface px-4 py-3" role="status" aria-label="Escribiendo">{[0, 1, 2].map((d) => <i key={d} className="size-1.5 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${d * 150}ms` }} />)}</span></li>}
              </ul>
            )}
            <div ref={end} />
          </div>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }}
            className="sticky z-10 flex items-end gap-2 bg-bg pb-3 pt-2 max-lg:bottom-[calc(3.25rem+env(safe-area-inset-bottom))] lg:bottom-0">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder="Pregunta sobre tu alimentación…" aria-label="Mensaje"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line-strong bg-surface px-4 py-2.5 placeholder:text-ink-3 focus:border-accent focus:outline-none" />
            <Button type="submit" aria-label="Enviar" disabled={!text.trim()} loading={busy} className="!size-11 !rounded-full !px-0" icon={ArrowUp} />
          </form>
          <p className="t-meta pb-2 text-center">Orientación nutricional con estimaciones; no sustituye a un profesional sanitario. {cfg.data.usageToday.calls}/{cfg.data.usageToday.limit} consultas hoy.</p>
        </>
      )}
    </div>
  );
}
