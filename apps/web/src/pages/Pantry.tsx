import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type Shop = { menuId: string | null; createdAt?: string; note?: string; items: { name: string; grams: number; inPantry: boolean }[] };

export function Pantry() {
  const [pantry, setPantry] = useState<{ id: string; name: string }[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([api<{ items: { id: string; name: string }[] }>('/pantry'), api<Shop>('/pantry/shopping')]);
    setPantry(p.items); setShop(s);
    setChecked(JSON.parse(localStorage.getItem(`shop-${s.menuId}`) ?? '{}'));
  }, []);
  useEffect(() => { load().catch(() => setMsg('No se pudo cargar.')); }, [load]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const name = String(new FormData(form).get('name')).trim();
    if (name.length < 2) return;
    await api('/pantry', { method: 'POST', body: JSON.stringify({ name }) }); form.reset(); load();
  }
  const toggle = (name: string) => { const n = { ...checked, [name]: !checked[name] }; setChecked(n); localStorage.setItem(`shop-${shop?.menuId}`, JSON.stringify(n)); };
  const toBuy = shop?.items.filter((i) => !i.inPantry) ?? [];
  const have = shop?.items.filter((i) => i.inPantry) ?? [];
  async function copy() {
    const text = toBuy.filter((i) => !checked[i.name]).map((i) => `- ${i.name}: ${i.grams >= 1000 ? `${Math.round(i.grams / 100) / 10} kg` : `${i.grams} g`}`).join('\n');
    try { await navigator.clipboard.writeText(text); setMsg('Lista copiada.'); } catch { setMsg('No se pudo copiar.'); }
  }
  const fmt = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} kg` : `${g} g`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Despensa y compra</h1><Link to="/food" className="text-sm text-accent">‹ Diario</Link></div>
      {msg && <p role="status" className="text-sm text-slate-500">{msg}</p>}
      <section className="card flex flex-col gap-2">
        <h2 className="font-semibold">Lo que tengo</h2>
        <p className="text-xs text-slate-500">La IA usa esta lista para sugerirte comidas cuando no indicas qué tienes.</p>
        <form onSubmit={add} className="flex gap-2"><input name="name" className="input" placeholder="Añadir alimento (p. ej. huevos)" maxLength={60} required /><button className="btn shrink-0">Añadir</button></form>
        <ul className="flex flex-wrap gap-2">{pantry.map((p) => <li key={p.id} className="flex items-center gap-1 rounded-full bg-slate-200 py-1 pl-3 pr-1 text-sm dark:bg-slate-800">{p.name}<button className="rounded-full px-2 text-slate-500" onClick={async () => { await api(`/pantry/${p.id}`, { method: 'DELETE' }); load(); }} aria-label={`Quitar ${p.name}`}>✕</button></li>)}</ul>
        {!pantry.length && <p className="text-sm text-slate-500">Vacía.</p>}
      </section>
      <section className="card flex flex-col gap-2">
        <h2 className="font-semibold">Lista de la compra</h2>
        {!shop?.menuId ? <p className="text-sm text-slate-500">Genera un menú semanal en <Link to="/ai" className="text-accent underline">IA → Menú semanal</Link> y aquí aparecerá la lista.</p> : <>
          <p className="text-xs text-slate-500">{shop.note}</p>
          <ul>{toBuy.map((i) => <li key={i.name} className="border-t border-slate-200 dark:border-slate-800"><label className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" className="size-5" checked={!!checked[i.name]} onChange={() => toggle(i.name)} /><span className={`flex-1 ${checked[i.name] ? 'text-slate-400 line-through' : ''}`}>{i.name}</span><span className="text-slate-500">{fmt(i.grams)}</span></label></li>)}</ul>
          {have.length > 0 && <details><summary className="cursor-pointer text-sm text-slate-500">Ya en tu despensa ({have.length})</summary><ul className="mt-1 text-sm text-slate-500">{have.map((i) => <li key={i.name}>{i.name} · {fmt(i.grams)}</li>)}</ul></details>}
          <button className="btn" onClick={copy} disabled={!toBuy.length}>Copiar lista</button></>}
      </section>
    </div>
  );
}
