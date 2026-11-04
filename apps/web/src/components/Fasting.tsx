import { Flame, Moon, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FastingConfig, FastingStatus } from '@fittrack/shared';
import { api } from '../api';
import { useData } from '../hooks';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Card, Notice, cx } from '../ui/primitives';
import { ProgressBar } from '../ui/progress';

type Fasting = { config: FastingConfig; gaps: { from: string; to: string; hours: number }[]; status: FastingStatus; isEstimate: true };

const MEALS: [keyof FastingConfig, string][] = [['breakfastTime', 'Desayuno'], ['lunchTime', 'Comida'], ['snackTime', 'Merienda'], ['dinnerTime', 'Cena']];
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const dur = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;

/** Formulario de horarios: se usa en Ajustes y en la hoja de la tarjeta de inicio. */
export function FastingSettings({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const f = useData<Fasting>('/fasting');
  const [cfg, setCfg] = useState<FastingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (f.data) setCfg(f.data.config); }, [f.data]);
  if (!cfg) return <p className="t-meta">Cargando…</p>;

  async function save() {
    setBusy(true);
    try { await api('/fasting', { method: 'PUT', body: JSON.stringify(cfg) }); toast('Horario de ayuno guardado'); onSaved?.(); f.reload(); }
    catch { toast('No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }
  const gaps = (f.data?.gaps ?? []).map((g) => `${g.from} → ${g.to}: ${g.hours} h`);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
        Activar el ayuno automático
      </label>
      <p className="t-meta">Empieza solo al terminar la cena (cuando la registras o a la hora indicada) y se rompe con la primera comida del día siguiente.</p>
      <ul>
        {MEALS.map(([key, label]) => (
          <li key={key} className="flex min-h-11 items-center justify-between gap-3 border-t border-line py-1 first:border-0">
            <span className="text-sm">{label}</span>
            <input type="time" required value={cfg[key] as string} disabled={!cfg.enabled} onChange={(e) => e.target.value && setCfg({ ...cfg, [key]: e.target.value })} aria-label={`Hora de ${label.toLowerCase()}`} className="min-h-10 rounded-ctl border border-line-strong bg-surface px-2 text-sm disabled:opacity-50" />
          </li>
        ))}
      </ul>
      {cfg.enabled && gaps.length > 0 && <p className="t-meta">Entre comidas: {gaps.join(' · ')}</p>}
      <Button onClick={save} disabled={busy}>Guardar horario</Button>
    </div>
  );
}

export function FastingCard() {
  const f = useData<Fasting>('/fasting');
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(f.reload, 5 * 60_000); return () => clearInterval(t); }, [f.reload]);

  if (!f.data) return null;
  const { status: s, config } = f.data;
  const settings = (
    <Sheet open={open} onClose={() => setOpen(false)} title="Horario de comidas y ayuno">
      <FastingSettings onSaved={() => { setOpen(false); f.reload(); }} />
    </Sheet>
  );
  const gear = (
    <button onClick={() => setOpen(true)} aria-label="Ajustar horario de ayuno" className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2"><Settings2 className="size-5" aria-hidden /></button>
  );

  if (s.state === 'off') {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Moon className="size-5 text-ink-2" aria-hidden /><div><p className="font-semibold">Ayuno automático</p><p className="t-meta">Desactivado</p></div></div>
          {gear}
        </div>
        {settings}
      </Card>
    );
  }

  const fasting = s.state === 'fasting';
  // Mientras ayunas, el contador avanza en vivo a partir del inicio; el servidor da la base y el ritmo.
  const elapsed = fasting && s.startAt ? Math.max(0, (now - Date.parse(s.startAt)) / 3600_000) : s.elapsedHours;
  const burned = fasting ? Math.round(elapsed * s.kcalPerHour) : s.kcalBurned;
  const progress = s.plannedHours > 0 ? elapsed / s.plannedHours : 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Moon className={cx('size-5', fasting ? 'text-accent-strong' : 'text-ink-2')} aria-hidden />
          <div>
            <p className="font-semibold">{fasting ? 'Ayunando' : s.state === 'done' ? 'Último ayuno' : 'Ayuno automático'}</p>
            <p className="t-meta">
              {fasting && s.startAt && `Desde las ${clock(s.startAt)}${s.startSource === 'schedule' ? ' (hora de cena configurada)' : ' (tu última cena)'}`}
              {s.state === 'done' && s.startAt && s.endAt && `${clock(s.startAt)} → ${clock(s.endAt)}`}
              {s.state === 'waiting' && s.nextStartAt && `Empezará tras la cena (~${clock(s.nextStartAt)})`}
            </p>
          </div>
        </div>
        {gear}
      </div>

      {s.state !== 'waiting' && (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div><p className="t-meta">{fasting ? 'Tiempo en ayunas' : 'Duración'}</p><p className="num t-display">{dur(elapsed)}</p></div>
            <div className="text-right"><p className="t-meta">Quemadas en reposo</p><p className="num flex items-center justify-end gap-1 text-xl font-semibold"><Flame className="size-4 text-accent-strong" aria-hidden />{burned.toLocaleString('es')}<span className="t-meta font-normal"> kcal</span></p></div>
          </div>
          {fasting && s.plannedEndAt && (
            <>
              <div className="mt-4"><ProgressBar value={progress} height={8} label="Progreso del ayuno" /></div>
              <p className="t-meta mt-2">
                {s.overdue ? `Ya pasó tu hora de desayuno (${clock(s.plannedEndAt)}). Se rompe al registrar tu primera comida.` : `Objetivo: desayuno a las ${clock(s.plannedEndAt)} · ${dur(s.plannedHours)} en total`}
              </p>
            </>
          )}
          <p className="t-meta mt-2">Estimación: metabolismo basal ({Math.round(f.data.status.kcalPerHour)} kcal/h) × horas sin comer. Es gasto en reposo, no suma a tu objetivo diario.</p>
        </>
      )}
      {config.enabled && s.state === 'waiting' && <Notice tone="info">Registra la cena y el ayuno empieza solo.</Notice>}
      {settings}
    </Card>
  );
}
