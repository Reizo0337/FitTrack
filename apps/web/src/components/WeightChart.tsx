import { useMemo } from 'react';
import { TrendChart } from '../ui/TrendChart';

export type WeightPoint = { date: string; weightKg: number; avg7: number; bodyFatPct: number | null; muscleKg: number | null; bodyWaterPct: number | null };

/** Peso diario (puntos) y media móvil de 7 días (línea): la tendencia importa más que el ruido diario. */
export function WeightChart({ series, goalKg }: { series: WeightPoint[]; goalKg?: number }) {
  const s = useMemo(() => [
    { name: 'Media 7 d', color: 'var(--accent)', width: 2.75, pts: series.map((p) => ({ x: p.date, y: p.avg7 })) },
    { name: 'Peso', color: 'var(--ink-3)', pts: series.map((p) => ({ x: p.date, y: p.weightKg })), dots: false, dashed: true, width: 1.5 },
  ], [series]);
  return <TrendChart label="Evolución del peso" unit=" kg" decimals={1} height={220} series={s} goal={goalKg ? { y: goalKg, label: `Objetivo ${goalKg} kg` } : undefined} />;
}
