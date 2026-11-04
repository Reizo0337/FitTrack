import { Flame, SlidersHorizontal, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useApp } from '../ctx';
import { useData } from '../hooks';
import { todayStr } from '../ui/DateSelector';
import { Sheet, useToast } from '../ui/overlays';
import { Badge, Button, Card, FormField, LoadingState, Notice, SectionHeader, cx } from '../ui/primitives';
import { ProgressBar } from '../ui/progress';

type G = {
  kind: string; label: string; unit: string; period: 'DAY' | 'WEEK'; target: number; active: boolean;
  today: { value: number | null; met: boolean | null }; streak: number | null; bestStreak: number | null; compliance30: number | null; last7: (boolean | null)[];
};
type Data = {
  goals: G[]; summary: { activeGoals: number; metToday: number; loggedDays7: number; message: string };
  milestones: { marks: { kg: number; reached: boolean }[]; next: { kg: number } | null; lostKg: number | null };
};

const dot = (m: boolean | null) => (m === true ? 'bg-accent' : m === false ? 'bg-line-strong' : 'bg-surface-2');

/** Metas y constancia. «Sin dato» no cuenta como fallo: los días sin registro no penalizan. */
export function Challenges({ compact = false, embedded = false }: { compact?: boolean; embedded?: boolean }) {
  const { data: d, loading } = useData<Data>(`/goals?date=${todayStr()}`);
  const [editing, setEditing] = useState(false);
  if (loading || !d) return <LoadingState rows={1} />;
  const active = d.goals.filter((g) => g.active);
  const adjust = <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setEditing(true)}>Ajustar</Button>;

  return (
    <div>
      {!embedded && <SectionHeader title="Metas de hoy" action={!compact ? adjust : undefined} />}
      <Card>
        {embedded && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="t-head">Metas de hoy</h2>{adjust}</div>}
        <p className="t-body">{d.summary.message}</p>
        {!active.length ? <p className="t-meta mt-3">No hay metas activas.</p> : (
          <ul className="mt-4 flex flex-col gap-4">
            {active.map((g) => {
              const v = g.today.value, pct = v == null ? 0 : v / g.target;
              return (
                <li key={g.kind}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cx('text-[0.9375rem] font-medium', g.today.met && 'text-accent-strong')}>{g.label}</span>
                    <span className="num t-meta">{v == null ? 'sin dato' : `${v.toLocaleString('es')} / ${g.target.toLocaleString('es')} ${g.unit}`}{g.period === 'WEEK' ? ' · 7 días' : ''}</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar value={pct} tone={g.today.met ? 'accent' : 'ink'} label={g.label} /></div>
                  {!compact && (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="flex gap-1" role="img" aria-label="Últimos 7 días">{g.last7.map((m, i) => <i key={i} className={cx('size-2.5 rounded-full', dot(m))} />)}</span>
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {g.streak != null && g.streak > 0 && <Badge tone="accent"><Flame className="mr-1 size-3" aria-hidden />{g.streak} {g.streak === 1 ? 'día' : 'días'}</Badge>}
                        {g.compliance30 != null && <Badge>{g.compliance30} % en 30 d</Badge>}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!compact && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="t-head mb-2 flex items-center gap-2"><Trophy className="size-[18px] text-ink-2" aria-hidden />Hitos de peso</h3>
            <ul className="flex flex-wrap gap-1.5">{d.milestones.marks.map((m) => <li key={m.kg}><Badge tone={m.reached ? 'accent' : 'neutral'}>{m.kg} kg</Badge></li>)}</ul>
            <p className="t-meta mt-2">{d.milestones.lostKg == null ? 'Registra tu peso para ver tus hitos.' : d.milestones.next ? `Llevas ${d.milestones.lostKg} kg menos. Próximo hito: ${d.milestones.next.kg} kg.` : '¡Objetivo alcanzado!'}</p>
          </div>
        )}
      </Card>
      <GoalsSheet open={editing} goals={d.goals} onClose={() => setEditing(false)} />
    </div>
  );
}

function GoalsSheet({ open, goals, onClose }: { open: boolean; goals: G[]; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const items = goals.map((g) => ({ kind: g.kind, target: Number(String(f.get(`t-${g.kind}`)).replace(',', '.')), active: f.get(`a-${g.kind}`) === 'on' }));
    setBusy(true);
    try { await api('/goals', { method: 'PUT', body: JSON.stringify({ items }) }); toast('Metas guardadas'); bump(); onClose(); }
    catch { toast('Revisa los valores', 'error'); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Ajustar metas">
      <form onSubmit={save} className="flex flex-col gap-3">
        {goals.map((g) => (
          <div key={g.kind} className="flex items-end gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-3 pb-0.5 text-sm"><input type="checkbox" name={`a-${g.kind}`} defaultChecked={g.active} className="size-5 accent-[var(--accent)]" />{g.label}</label>
            <FormField className="w-28" label={g.unit} name={`t-${g.kind}`} defaultValue={g.target} inputMode="decimal" aria-label={`Objetivo de ${g.label}`} />
          </div>
        ))}
        <Notice tone="info">Los días sin datos no cuentan como fallo. Puedes desactivar cualquier meta.</Notice>
        <Button type="submit" loading={busy} block>Guardar metas</Button>
      </form>
    </Sheet>
  );
}
