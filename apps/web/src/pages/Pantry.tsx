import { ChevronLeft, Copy, ShoppingBasket, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PantryCook, PantryScan } from '../components/PantryAI';
import { useData } from '../hooks';
import { useToast } from '../ui/overlays';
import { Button, Card, EmptyState, ErrorState, FormField, LoadingState, Notice, SectionHeader, cx } from '../ui/primitives';

type Shop = { menuId: string | null; createdAt?: string; note?: string; items: { name: string; grams: number; inPantry: boolean }[] };
const fmt = (g: number) => (g >= 1000 ? `${(Math.round(g / 100) / 10).toLocaleString('es')} kg` : `${g} g`);

export function Pantry() {
  const toast = useToast();
  const pantry = useData<{ items: { id: string; name: string }[] }>('/pantry');
  const shop = useData<Shop>('/pantry/shopping');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  if (shop.data && loadedFor !== shop.data.menuId) { setLoadedFor(shop.data.menuId); setChecked(JSON.parse(localStorage.getItem(`shop-${shop.data.menuId}`) ?? '{}')); }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name')).trim();
    if (name.length < 2) return;
    setBusy(true);
    try { await api('/pantry', { method: 'POST', body: JSON.stringify({ name }) }); form.reset(); pantry.reload(); shop.reload(); }
    catch { toast('No se pudo añadir', 'error'); } finally { setBusy(false); }
  }
  const toggle = (name: string) => { const n = { ...checked, [name]: !checked[name] }; setChecked(n); localStorage.setItem(`shop-${shop.data?.menuId}`, JSON.stringify(n)); };
  const toBuy = shop.data?.items.filter((i) => !i.inPantry) ?? [];
  const have = shop.data?.items.filter((i) => i.inPantry) ?? [];
  async function copy() {
    const text = toBuy.filter((i) => !checked[i.name]).map((i) => `- ${i.name}: ${fmt(i.grams)}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Lista copiada'); } catch { toast('No se pudo copiar', 'error'); }
  }

  return (
    <>
      <PageHeader title="Despensa y compra" actions={<Link to="/food" className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-accent-strong"><ChevronLeft className="size-4" aria-hidden />Diario</Link>} bare />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionHeader title="Lo que tengo" />
          <Card>
            <p className="t-meta mb-3">La IA usa esta lista para sugerirte comidas cuando no indicas qué tienes.</p>
            <form onSubmit={add} className="flex items-end gap-2"><FormField className="flex-1" label="Añadir alimento" name="name" placeholder="Huevos" maxLength={60} required /><Button type="submit" loading={busy}>Añadir</Button></form>
            {pantry.loading ? <div className="mt-3"><LoadingState rows={0} /></div> : pantry.error ? <div className="mt-3"><ErrorState onRetry={pantry.reload} /></div> : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {pantry.data?.items.map((p) => (
                  <li key={p.id} className="flex min-h-11 items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1 text-sm">{p.name}
                    <button className="-mr-1 inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-line" aria-label={`Quitar ${p.name}`} onClick={async () => { await api(`/pantry/${p.id}`, { method: 'DELETE' }); pantry.reload(); shop.reload(); }}><X className="size-4" aria-hidden /></button></li>
                ))}
                {!pantry.data?.items.length && <li className="t-meta">Vacía.</li>}
              </ul>
            )}
          </Card>
        </section>

        <div className="flex flex-col gap-4">
          <PantryScan onAdded={() => { pantry.reload(); shop.reload(); }} />
          <PantryCook empty={!pantry.loading && !pantry.data?.items.length} />
        </div>

        <section>
          <SectionHeader title="Lista de la compra" />
          <Card>
            {shop.loading ? <LoadingState rows={0} /> : shop.error ? <ErrorState onRetry={shop.reload} /> : !shop.data?.menuId ? (
              <EmptyState icon={ShoppingBasket} title="Aún no hay lista" text="Genera un menú semanal en IA y aquí aparecerá lo que necesitas comprar."
                action={<Link to="/ai" className="inline-flex min-h-11 items-center rounded-ctl bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-strong">Ir a la IA</Link>} />
            ) : (
              <>
                <p className="t-meta mb-2">{shop.data.note}</p>
                <ul>{toBuy.map((i) => (
                  <li key={i.name} className="border-t border-line first:border-0">
                    <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--accent)]" checked={!!checked[i.name]} onChange={() => toggle(i.name)} />
                      <span className={cx('flex-1', checked[i.name] && 'text-ink-3 line-through')}>{i.name}</span><span className="num t-meta">{fmt(i.grams)}</span></label>
                  </li>))}</ul>
                {have.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-2">Ya en tu despensa ({have.length})</summary>
                  <ul className="t-meta mt-1">{have.map((i) => <li key={i.name} className="flex justify-between py-1"><span>{i.name}</span><span className="num">{fmt(i.grams)}</span></li>)}</ul></details>}
                <Button variant="secondary" icon={Copy} block className="mt-4" onClick={copy} disabled={!toBuy.length}>Copiar lista</Button>
                <div className="mt-3"><Notice tone="info">Cantidades aproximadas del menú. Las casillas se guardan solo en este dispositivo.</Notice></div>
              </>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
