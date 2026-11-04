import { z } from 'zod';
import { localDate } from './schemas';

export const GOAL_KINDS = ['STEPS', 'PROTEIN', 'WATER', 'SLEEP', 'LOG_MEALS', 'WORKOUTS'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_LABEL: Record<GoalKind, string> = {
  STEPS: 'Pasos diarios', PROTEIN: 'Proteína del día', WATER: 'Hidratación', SLEEP: 'Horas de sueño', LOG_MEALS: 'Registrar las comidas', WORKOUTS: 'Entrenamientos a la semana',
};
export const GOAL_UNIT: Record<GoalKind, string> = { STEPS: 'pasos', PROTEIN: 'g', WATER: 'ml', SLEEP: 'h', LOG_MEALS: 'comidas', WORKOUTS: 'sesiones' };
export const GOAL_PERIOD: Record<GoalKind, 'DAY' | 'WEEK'> = { STEPS: 'DAY', PROTEIN: 'DAY', WATER: 'DAY', SLEEP: 'DAY', LOG_MEALS: 'DAY', WORKOUTS: 'WEEK' };

export const goalsUpdateSchema = z.object({
  items: z.array(z.object({ kind: z.enum(GOAL_KINDS), target: z.number().min(1).max(100000), active: z.boolean() })).max(6),
});

/**
 * Racha actual: días consecutivos cumplidos hasta hoy. Si hoy aún no se cumple pero ayer sí, la racha sigue viva
 * (no se «rompe» hasta que termina el día). `days` va de más antiguo a más reciente; null = sin dato (no cuenta como cumplido).
 */
export function currentStreak(days: (boolean | null)[]): number {
  let i = days.length - 1;
  if (i >= 0 && days[i] !== true) i--; // hoy todavía puede cumplirse
  let n = 0;
  for (; i >= 0 && days[i] === true; i--) n++;
  return n;
}

export const bestStreak = (days: (boolean | null)[]): number => {
  let best = 0, cur = 0;
  for (const d of days) { cur = d === true ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
};

/** % de días cumplidos entre los días CON dato (los días sin dato no penalizan). */
export function complianceRate(days: (boolean | null)[]): number | null {
  const known = days.filter((d): d is boolean => d !== null);
  return known.length ? Math.round((known.filter(Boolean).length / known.length) * 100) : null;
}

/** Hitos de peso cada `stepKg` kilos perdidos. */
export function weightMilestones(startKg: number, goalKg: number, currentKg: number | null, stepKg = 2) {
  const total = startKg - goalKg;
  const marks: { kg: number; reached: boolean }[] = [];
  for (let kg = startKg - stepKg; kg > goalKg; kg -= stepKg) marks.push({ kg: Math.round(kg * 10) / 10, reached: currentKg != null && currentKg <= kg });
  marks.push({ kg: goalKg, reached: currentKg != null && currentKg <= goalKg });
  const next = marks.find((m) => !m.reached) ?? null;
  return { marks, next, lostKg: currentKg != null ? Math.round((startKg - currentKg) * 10) / 10 : null, totalKg: total };
}

/** Mensajes discretos, sin culpabilizar. */
export function encouragement(o: { streakBest: number; metToday: number; activeGoals: number; loggedDays7: number }): string {
  if (o.activeGoals === 0) return 'Activa alguna meta para seguir tu constancia.';
  if (o.metToday === o.activeGoals && o.activeGoals > 0) return 'Hoy has cumplido todas tus metas. Buen trabajo.';
  if (o.metToday > 0) return `Llevas ${o.metToday} de ${o.activeGoals} metas hoy; todavía estás a tiempo de más.`;
  if (o.loggedDays7 >= 4) return 'Tu constancia esta semana es buena. Un día más tranquilo no cambia la tendencia.';
  return 'Cada registro cuenta. Retomar cualquier día es suficiente.';
}

export const pantryAddSchema = z.object({ name: z.string().trim().min(2).max(60) });

const IMAGE_MAX_BYTES = 3_000_000;
export const photoUploadSchema = z.object({
  date: localDate,
  note: z.string().trim().max(200).optional(),
  imageBase64: z.string().min(100).max(Math.ceil(IMAGE_MAX_BYTES * 1.4)),
});
export { IMAGE_MAX_BYTES };

/** Lista de la compra: suma gramos por ingrediente normalizado. */
export function aggregateIngredients(list: { name: string; grams: number }[], norm: (s: string) => string) {
  const map = new Map<string, { name: string; grams: number }>();
  for (const i of list) {
    const k = norm(i.name);
    const cur = map.get(k);
    if (cur) cur.grams += i.grams;
    else map.set(k, { name: i.name.trim(), grams: i.grams });
  }
  return [...map.values()].map((x) => ({ ...x, grams: Math.round(x.grams) })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
