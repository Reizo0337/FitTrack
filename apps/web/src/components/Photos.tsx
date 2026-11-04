import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { todayStr } from '../ctx';

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
  return src ? <img src={src} alt={alt} loading="lazy" className="aspect-[3/4] w-full rounded-xl bg-slate-200 object-cover dark:bg-slate-800" /> : <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />;
}

export function Photos() {
  const [items, setItems] = useState<P[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ items: P[] }>('/photos').then((r) => setItems(r.items)).catch(() => undefined), []);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true); setMsg('');
    try {
      const imageBase64 = await downscale(file);
      await api('/photos', { method: 'POST', body: JSON.stringify({ date: todayStr(), imageBase64 }) });
      setMsg('Foto guardada.'); load();
    } catch (e) { setMsg(e instanceof ApiError && e.code === 'UNSUPPORTED_IMAGE' ? 'Formato no admitido.' : 'No se pudo subir la foto.'); } finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm('¿Borrar esta foto definitivamente?')) return;
    await api(`/photos/${id}`, { method: 'DELETE' }); load();
  }
  const first = items[0], last = items.length > 1 ? items[items.length - 1] : undefined;

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-semibold">Fotos de progreso</h2>
      <p className="text-xs text-slate-500">Privadas: solo se muestran con tu sesión, mediante enlaces que caducan a los 5 minutos. Se reducen y se eliminan los metadatos (ubicación, etc.) antes de subirlas. Una foto es una referencia visual: no mide la grasa corporal.</p>
      <label className={`rounded-xl border border-dashed border-slate-400 p-3 text-center text-sm text-slate-500 ${busy ? 'opacity-50' : ''}`}>
        📷 {busy ? 'Subiendo…' : 'Añadir foto de hoy'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </label>
      {msg && <p role="status" className="text-sm text-slate-500">{msg}</p>}
      {first && last && (
        <div><h3 className="mb-1 text-sm font-semibold">Comparación</h3>
          <div className="grid grid-cols-2 gap-2"><figure><Img id={first.id} alt={`Foto del ${first.date}`} /><figcaption className="mt-1 text-center text-xs text-slate-500">{first.date}</figcaption></figure>
            <figure><Img id={last.id} alt={`Foto del ${last.date}`} /><figcaption className="mt-1 text-center text-xs text-slate-500">{last.date}</figcaption></figure></div></div>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">{[...items].reverse().map((p) => (
          <figure key={p.id} className="relative"><Img id={p.id} alt={`Foto del ${p.date}`} />
            <figcaption className="text-center text-[11px] text-slate-500">{p.date.slice(5)}</figcaption>
            <button onClick={() => del(p.id)} className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white" aria-label={`Borrar foto del ${p.date}`}>✕</button></figure>))}</div>
      )}
      {!items.length && <p className="text-sm text-slate-500">Aún no hay fotos.</p>}
    </section>
  );
}
