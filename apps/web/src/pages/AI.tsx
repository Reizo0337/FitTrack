import { ArrowUp, KeyRound, Sparkles } from 'lucide-react';
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
import { Button, Card, EmptyState, ErrorState, LoadingState, Segmented, cx } from '../ui/primitives';

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
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (msgs.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

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

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 14rem)' }}>
      <div className="flex-1 pb-4" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="pt-2">
            <div className="mb-5 flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong"><Sparkles className="size-[18px]" aria-hidden /></span>
              <p className="t-body pt-1">Hola. Puedo consultar tus comidas, peso, actividad y sueño registrados para orientarte. No soy un médico: para temas de salud consulta a un profesional.</p></div>
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
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }}
        className="sticky z-10 flex items-end gap-2 bg-bg pb-3 pt-2 max-lg:bottom-[calc(3.25rem+env(safe-area-inset-bottom))] lg:bottom-0">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder="Pregunta sobre tu alimentación…" aria-label="Mensaje"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line-strong bg-surface px-4 py-2.5 placeholder:text-ink-3 focus:border-accent focus:outline-none" />
        <Button type="submit" aria-label="Enviar" disabled={!text.trim()} loading={busy} className="!size-11 !rounded-full !px-0" icon={ArrowUp} />
      </form>
      <p className="t-meta pb-2 text-center">Orientación nutricional con estimaciones; no sustituye a un profesional sanitario. {usage.calls}/{usage.limit} consultas hoy.</p>
    </div>
  );
}
