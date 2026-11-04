import type { MealTypeId } from '@fittrack/shared';
import { Camera, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Button, Card, FormField, Notice } from '../ui/primitives';
import { LogTab } from './ai/LogTab';
import { AIError } from './ai/shared';

type Img = { mime: 'image/jpeg'; data: string };
type Question = { id: string; question: string; options: string[] };
type Item = Parameters<typeof LogTab>[0] extends infer P ? (P extends { initial?: { items: infer I } } ? I : never) : never;
type Stage =
  | { s: 'start' }
  | { s: 'camera' }
  | { s: 'checking'; img: Img; url: string }
  | { s: 'questions'; img: Img; url: string; dish: string | null; questions: Question[] }
  | { s: 'analyzing'; img: Img; url: string }
  | { s: 'result'; items: Item; notes: string | null };

const MAX_SIDE = 1280;

/** Reduce y codifica un lienzo como JPEG base64 (sin prefijo). */
function encode(src: CanvasImageSource, sw: number, sh: number, crop?: { x: number; y: number; w: number; h: number }): Img & { url: string } {
  const c0 = crop ?? { x: 0, y: 0, w: sw, h: sh };
  const k = Math.min(1, MAX_SIDE / Math.max(c0.w, c0.h));
  const c = document.createElement('canvas');
  c.width = Math.round(c0.w * k); c.height = Math.round(c0.h * k);
  c.getContext('2d')!.drawImage(src, c0.x, c0.y, c0.w, c0.h, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { mime: 'image/jpeg', data: url.split(',')[1]!, url };
}

async function fromFile(file: File) {
  const bmp = await createImageBitmap(file);
  const r = encode(bmp, bmp.width, bmp.height);
  bmp.close();
  return r;
}

/** Foto del plato: cámara interna con marco de encaje → la IA comprueba que es comida y pregunta → estimación editable. */
export function PlateAI({ date, type, onClose }: { date: string; type: MealTypeId; onClose: () => void }) {
  const [st, setSt] = useState<Stage>({ s: 'start' });
  const [err, setErr] = useState<unknown>();

  async function inspect(p: Img & { url: string }) {
    const img: Img = { mime: p.mime, data: p.data };
    setErr(undefined); setSt({ s: 'checking', img, url: p.url });
    try {
      const r = await api<{ dish: string | null; questions: Question[] }>('/ai/plate/inspect', { method: 'POST', body: JSON.stringify({ image: img }) });
      if (r.questions.length) setSt({ s: 'questions', img, url: p.url, dish: r.dish, questions: r.questions });
      else await analyze(img, p.url, []);
    } catch (e) { setErr(e); setSt({ s: 'start' }); }
  }

  async function analyze(img: Img, url: string, answers: { question: string; answer: string }[]) {
    setErr(undefined); setSt({ s: 'analyzing', img, url });
    try {
      const r = await api<{ items: Item; notes: string | null }>('/ai/plate/analyze', { method: 'POST', body: JSON.stringify({ image: img, answers }) });
      setSt({ s: 'result', items: r.items, notes: r.notes });
    } catch (e) { setErr(e); setSt({ s: 'start' }); }
  }

  async function onFile(file: File) {
    try { await inspect(await fromFile(file)); } catch (e) { setErr(e); }
  }

  if (st.s === 'result') return <LogTab initial={{ items: st.items, notes: st.notes }} date={date} mealType={type} onDone={onClose} />;

  return (
    <div className="flex flex-col gap-3">
      {st.s === 'start' && (
        <Card className="flex flex-col gap-3">
          <p className="t-body">Haz una foto al plato y la IA estimará lo que hay. Antes comprobará que es comida y te hará un par de preguntas rápidas.</p>
          <Notice tone="info">La foto se envía al proveedor de IA solo para este análisis y no se guarda. Las cifras son una estimación: podrás corregirlas antes de guardar.</Notice>
          <AIError e={err} />
          <Button block onClick={() => { setErr(undefined); setSt({ s: 'camera' }); }}><Camera className="size-5" aria-hidden /> Abrir la cámara</Button>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-ctl border border-line-strong bg-surface text-sm font-medium text-ink-2 transition hover:bg-surface-2">
            <ImagePlus className="size-5" aria-hidden /> Elegir una foto de la galería
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
          </label>
        </Card>
      )}
      {st.s === 'camera' && <CameraView onCancel={() => setSt({ s: 'start' })} onShot={(p) => void inspect(p)} />}
      {(st.s === 'checking' || st.s === 'analyzing') && (
        <AnalyzingView url={st.url} messages={st.s === 'checking'
          ? ['Comprobando que es comida…', 'Mirando el plato…', 'Preparando preguntas…']
          : ['Identificando ingredientes…', 'Estimando raciones…', 'Calculando calorías y macros…', 'Casi listo…']} />
      )}
      {st.s === 'questions' && <Questions st={st} onSubmit={(a) => void analyze(st.img, st.url, a)} onCancel={() => setSt({ s: 'start' })} />}
    </div>
  );
}

function AnalyzingView({ url, messages }: { url: string; messages: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % messages.length), 1800); return () => clearInterval(t); }, [messages]);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-card bg-black">
        <img src={url} alt="Foto del plato en análisis" className="aspect-square w-full object-cover opacity-80" />
        <div className="plate-sweep pointer-events-none absolute inset-x-0 h-[3px] bg-accent shadow-[0_0_18px_6px_var(--accent,#34d399)]" aria-hidden />
        <Corners className="plate-pulse" />
      </div>
      <p role="status" aria-live="polite" className="t-body font-medium">{messages[i]}</p>
    </div>
  );
}

/** Cuatro esquinas tipo visor. */
function Corners({ className = '' }: { className?: string }) {
  const b = 'absolute size-7 border-white';
  return (
    <div className={`pointer-events-none absolute inset-4 ${className}`} aria-hidden>
      <span className={`${b} left-0 top-0 rounded-tl-xl border-l-4 border-t-4`} />
      <span className={`${b} right-0 top-0 rounded-tr-xl border-r-4 border-t-4`} />
      <span className={`${b} bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4`} />
      <span className={`${b} bottom-0 right-0 rounded-br-xl border-b-4 border-r-4`} />
    </div>
  );
}

function Questions({ st, onSubmit, onCancel }: { st: Extract<Stage, { s: 'questions' }>; onSubmit: (a: { question: string; answer: string }[]) => void; onCancel: () => void }) {
  const [ans, setAns] = useState<Record<string, string>>({});
  const out = () => st.questions.filter((q) => ans[q.id]?.trim()).map((q) => ({ question: q.question, answer: ans[q.id]!.trim() }));
  return (
    <div className="flex flex-col gap-4">
      <img src={st.url} alt="Foto del plato" className="aspect-[16/9] w-full rounded-card object-cover" />
      {st.dish && <p className="t-body">Parece: <b>{st.dish}</b></p>}
      <p className="t-meta">Responde para afinar la estimación (puedes saltarte las que no sepas).</p>
      {st.questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="t-body mb-1 font-medium">{q.question}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <button key={o} type="button" aria-pressed={ans[q.id] === o} onClick={() => setAns((a) => ({ ...a, [q.id]: a[q.id] === o ? '' : o }))}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition active:scale-[.98] ${ans[q.id] === o ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface hover:bg-surface-2'}`}>{o}</button>
            ))}
          </div>
          <FormField label="Otra respuesta" maxLength={200} value={q.options.includes(ans[q.id] ?? '') ? '' : (ans[q.id] ?? '')} onChange={(e) => setAns((a) => ({ ...a, [q.id]: e.target.value }))} />
        </fieldset>
      ))}
      <Button block onClick={() => onSubmit(out())}>Analizar plato</Button>
      <Button block variant="secondary" onClick={onCancel}>Repetir la foto</Button>
    </div>
  );
}

/** Cámara interna a pantalla completa con marco para encajar el plato; recorta la foto a ese marco. */
function CameraView({ onShot, onCancel }: { onShot: (p: Img & { url: string }) => void; onCancel: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr('La cámara solo está disponible con HTTPS (o en localhost). Usa «Elegir una foto».'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream; await v.play().catch(() => {}); setReady(true);
      } catch { setErr('No se pudo acceder a la cámara (permiso denegado o no disponible). Usa «Elegir una foto».'); }
    })();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', key);
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); document.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shoot() {
    const v = video.current, w = wrap.current, f = frame.current;
    if (!v || !w || !f || !v.videoWidth) return;
    // Traduce el marco (coordenadas de pantalla, vídeo con object-cover) a coordenadas del vídeo, con un 6 % de margen.
    const W = w.clientWidth, H = w.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
    const s = Math.max(W / vw, H / vh), ox = (vw * s - W) / 2, oy = (vh * s - H) / 2;
    const wr = w.getBoundingClientRect(), fr = f.getBoundingClientRect();
    const m = 0.06 * fr.width;
    const x = Math.max(0, (fr.left - wr.left - m + ox) / s), y = Math.max(0, (fr.top - wr.top - m + oy) / s);
    const cw = Math.min(vw - x, (fr.width + 2 * m) / s), ch = Math.min(vh - y, (fr.height + 2 * m) / s);
    onShot(encode(v, vw, vh, { x, y, w: cw, h: ch }));
  }

  return createPortal(
    <div ref={wrap} className="fixed inset-0 z-[60] bg-black" role="dialog" aria-modal="true" aria-label="Cámara para fotografiar el plato">
      <video ref={video} className="absolute inset-0 size-full object-cover" muted playsInline aria-label="Vista de la cámara" />
      <div ref={frame} className="pointer-events-none absolute left-1/2 top-[44%] aspect-square w-[82%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] shadow-[0_0_0_9999px_rgba(0,0,0,.6)]" aria-hidden>
        <Corners />
        <div className="absolute inset-[12%] rounded-full border-2 border-dashed border-white/40" />
      </div>
      <p className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] px-16 text-center text-sm font-medium text-white drop-shadow">Encaja el plato dentro del marco</p>
      <button type="button" onClick={onCancel} aria-label="Cerrar la cámara" className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] inline-flex size-11 items-center justify-center rounded-full bg-black/50 text-white"><X className="size-5" aria-hidden /></button>
      {err && <div className="absolute inset-x-4 top-1/2 -translate-y-1/2"><Notice tone="warn">{err}</Notice></div>}
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <button type="button" onClick={shoot} disabled={!ready} aria-label="Hacer foto" className="size-[72px] rounded-full border-4 border-white bg-white/30 transition active:scale-95 disabled:opacity-40"><span className="mx-auto block size-[54px] rounded-full bg-white" /></button>
      </div>
    </div>,
    document.body,
  );
}
