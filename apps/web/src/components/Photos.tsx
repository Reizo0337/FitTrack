import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { useApp } from '../ctx';
import { useData } from '../hooks';
import { todayStr } from '../ui/DateSelector';
import { ConfirmSheet, useToast } from '../ui/overlays';
import { Button, Card, EmptyState, IconButton, Notice, Skeleton } from '../ui/primitives';
import { useEffect } from 'react';

type P = { id: string; date: string; note: string | null; bytes: number };

/** Reduce la foto en el navegador (máx. 1280 px, JPEG) antes de subirla: menos datos y sin metadatos EXIF/GPS. */
async function downscale(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.82));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function Img({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { api<{ url: string }>(`/photos/${id}/url`).then((r) => setSrc(r.url)).catch(() => undefined); }, [id]);
  return src ? <img src={src} alt={alt} loading="lazy" className="aspect-[3/4] w-full rounded-ctl bg-surface-2 object-cover" /> : <Skeleton className="aspect-[3/4] w-full !rounded-ctl" />;
}

/** Fotos de progreso privadas (enlaces firmados que caducan). Una foto es una referencia visual, no una medida de grasa. */
export function Photos() {
  const { bump } = useApp();
  const toast = useToast();
  const { data, reload } = useData<{ items: P[] }>('/photos');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<P | null>(null);
  const items = data?.items ?? [];
  const first = items[0], last = items.length > 1 ? items[items.length - 1] : undefined;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' });

  async function upload(file: File) {
    setBusy(true);
    try {
      await api('/photos', { method: 'POST', body: JSON.stringify({ date: todayStr(), imageBase64: await downscale(file) }) });
      toast('Foto guardada'); reload(); bump();
    } catch (e) { toast(e instanceof ApiError && e.code === 'UNSUPPORTED_IMAGE' ? 'Formato no admitido (JPEG, PNG o WebP)' : 'No se pudo subir la foto', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="t-head flex items-center gap-2"><Camera className="size-[18px] text-ink-2" aria-hidden />Fotos de progreso</h2>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>Añadir foto</Button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1} aria-label="Elegir foto"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>
      {!items.length ? (
        <EmptyState icon={Camera} title="Aún no hay fotos" text="Guárdalas de forma privada para comparar tu evolución. Solo se ven con tu sesión." />
      ) : (
        <div className="flex flex-col gap-4">
          {first && last && (
            <div>
              <p className="t-over mb-2">Comparación</p>
              <div className="grid grid-cols-2 gap-3">
                {[first, last].map((p) => <figure key={p.id}><Img id={p.id} alt={`Foto del ${fmt(p.date)}`} /><figcaption className="t-meta mt-1 text-center">{fmt(p.date)}</figcaption></figure>)}
              </div>
            </div>
          )}
          <ul className="grid grid-cols-3 gap-2">
            {[...items].reverse().map((p) => (
              <li key={p.id} className="relative">
                <Img id={p.id} alt={`Foto del ${fmt(p.date)}`} />
                <span className="t-meta mt-1 block text-center">{fmt(p.date)}</span>
                <IconButton icon={Trash2} label={`Borrar foto del ${fmt(p.date)}`} className="absolute right-0.5 top-0.5 !size-11 bg-surface/85 backdrop-blur-sm" onClick={() => setDeleting(p)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4"><Notice tone="info">Privadas: enlaces que caducan a los 5 minutos y sin metadatos de ubicación. Una foto es una referencia visual: no mide la grasa corporal.</Notice></div>
      <ConfirmSheet open={!!deleting} title="Borrar foto" text="Se eliminará definitivamente. No se puede deshacer." confirmLabel="Borrar" onClose={() => setDeleting(null)}
        onConfirm={async () => { await api(`/photos/${deleting!.id}`, { method: 'DELETE' }); setDeleting(null); toast('Foto borrada'); reload(); }} />
    </Card>
  );
}
