import { Flame, Footprints, Moon, Timer, Watch } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Dash } from '../types';
import { Card, EmptyState } from '../ui/primitives';
import { Stat } from '../ui/progress';

const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
const n = (v: number | null | undefined, u = '') => (v == null ? '—' : `${Math.round(v).toLocaleString('es')}${u}`);

/** Resumen de actividad. Sin datos => estado vacío honesto; nunca se muestran cifras inventadas. */
export function ActivitySummary({ activity, sleep }: Pick<Dash, 'activity' | 'sleep'>) {
  if (!activity && !sleep) {
    return (
      <Card>
        <EmptyState icon={Watch} title="Sin datos de actividad" text="Conecta Apple Health con el Atajo de iOS o registra tu actividad a mano. No se muestran valores que no hayas aportado."
          action={<Link to="/activity" className="inline-flex min-h-11 items-center rounded-ctl bg-surface-2 px-4 text-sm font-semibold hover:bg-line">Configurar actividad</Link>} />
      </Card>
    );
  }
  const items = [
    { icon: Footprints, label: 'Pasos', value: n(activity?.steps) },
    { icon: Flame, label: 'Kcal activas', value: n(activity?.activeKcal) },
    { icon: Timer, label: 'Ejercicio', value: n(activity?.exerciseMin, ' min') },
    { icon: Moon, label: 'Sueño', value: sleep?.totalMin != null ? hm(sleep.totalMin) : '—' },
  ];
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {items.map(({ icon: I, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><I className="size-[18px]" aria-hidden /></span>
            <Stat label={label} value={value} />
          </div>
        ))}
      </dl>
      {(activity?.source === 'MANUAL') && <p className="t-meta mt-3">Datos introducidos manualmente.</p>}
    </Card>
  );
}
