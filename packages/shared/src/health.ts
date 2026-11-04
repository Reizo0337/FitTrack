import { z } from 'zod';
import { localDate } from './schemas';

const iso = z.string().datetime({ offset: true });
const nn = (max: number) => z.number().min(0).max(max);

/** Un día de actividad. Los campos ausentes NO se rellenan: quedan sin dato. */
export const healthDaySchema = z.object({
  date: localDate,
  steps: z.number().int().min(0).max(200000).optional(),
  activeKcal: nn(20000).optional(),
  restingKcal: nn(10000).optional(),
  distanceKm: nn(500).optional(),
  exerciseMin: nn(1440).optional(),
  avgHeartRate: z.number().min(25).max(250).optional(),
  restingHeartRate: z.number().min(25).max(200).optional(),
});

export const healthSleepSchema = z.object({
  date: localDate, // día en el que te despiertas
  bedtime: iso.optional(),
  sleepAt: iso.optional(),
  wakeAt: iso.optional(),
  totalMin: z.number().int().min(0).max(1440).optional(),
  awakenings: z.number().int().min(0).max(50).optional(),
});

export const healthWeightSchema = z.object({
  date: localDate,
  weightKg: z.number().min(30).max(400),
  bodyFatPct: z.number().min(2).max(70).optional(),
});

export const healthWorkoutSchema = z.object({
  externalId: z.string().min(1).max(100),
  startedAt: iso,
  type: z.string().min(1).max(60),
  durationMin: z.number().min(0.5).max(1440),
  activeKcal: nn(20000).optional(),
  distanceKm: nn(500).optional(),
  avgHeartRate: z.number().min(25).max(250).optional(),
});

export const healthIngestSchema = z
  .object({
    days: z.array(healthDaySchema).max(400).default([]),
    sleep: z.array(healthSleepSchema).max(400).default([]),
    weights: z.array(healthWeightSchema).max(400).default([]),
    workouts: z.array(healthWorkoutSchema).max(400).default([]),
  })
  .refine((b) => b.days.length + b.sleep.length + b.weights.length + b.workouts.length > 0, 'Sin datos que importar');
export type HealthIngest = z.infer<typeof healthIngestSchema>;

export const activityManualSchema = z
  .object({
    date: localDate,
    steps: z.number().int().min(0).max(200000),
    activeKcal: nn(20000),
    distanceKm: nn(500),
    exerciseMin: nn(1440),
  })
  .partial()
  .required({ date: true })
  .refine((a) => Object.keys(a).length > 1, 'Indica al menos un dato');

export const sleepManualSchema = z
  .object({
    date: localDate,
    bedtime: iso.optional(),
    sleepAt: iso.optional(),
    wakeAt: iso.optional(),
    totalMin: z.number().int().min(30).max(1440).optional(),
    quality: z.number().int().min(1).max(5).optional(),
    awakenings: z.number().int().min(0).max(50).optional(),
  })
  .refine((s) => s.totalMin != null || (s.sleepAt && s.wakeAt), 'Indica la duración o las horas de dormir y despertar');

/** Minutos entre dos instantes ISO; null si el resultado no es plausible (0-24 h). */
export function minutesBetween(fromIso: string, toIso: string): number | null {
  const m = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
  return m > 0 && m <= 1440 ? m : null;
}

export const reminderKinds = ['WAKE', 'WATER', 'BREAKFAST', 'LUNCH', 'DINNER', 'WALK', 'LOG_DINNER', 'BEDTIME', 'WEIGH_IN'] as const;
export const reminderSchema = z.object({
  kind: z.enum(reminderKinds),
  enabled: z.boolean(),
  timeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});
export const reminderListSchema = z.array(reminderSchema).max(30);
export type ReminderInput = z.infer<typeof reminderSchema>;

/** Parsea la tabla nutricional de un texto OCR (valores por 100 g). Devuelve solo lo que encuentra. */
export function parseNutritionText(text: string): { values: Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat' | 'satFat' | 'fiber' | 'sugars' | 'salt', number>>; per100: boolean } {
  const t = text.toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');
  const num = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : undefined;
  };
  const values: Record<string, number | undefined> = {
    kcal: num(/(\d+(?:\.\d+)?)\s*kcal/) ?? num(/kj\s*\/?\s*(\d+(?:\.\d+)?)\s*kcal/),
    fat: num(/(?:grasas?|fat|lípidos|lipidos)(?!\s*saturad)(?:[^\d]{0,25}?)(\d+(?:\.\d+)?)\s*g/),
    satFat: num(/(?:saturad[a-z]*|saturates)(?:[^\d]{0,15}?)(\d+(?:\.\d+)?)\s*g/),
    carbs: num(/(?:hidratos de carbono|carbohidratos|carbohydrate)(?:[^\d]{0,25}?)(\d+(?:\.\d+)?)\s*g/),
    sugars: num(/(?:az[uú]cares|sugars)(?:[^\d]{0,15}?)(\d+(?:\.\d+)?)\s*g/),
    fiber: num(/(?:fibra|fibre|fiber)(?:[^\d]{0,20}?)(\d+(?:\.\d+)?)\s*g/),
    protein: num(/(?:prote[ií]nas?|protein)(?:[^\d]{0,15}?)(\d+(?:\.\d+)?)\s*g/),
    salt: num(/(?:sal|salt)(?:[^\d]{0,15}?)(\d+(?:\.\d+)?)\s*g/),
  };
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)) as Record<string, number>;
  return { values: clean, per100: /100\s*(g|ml)/.test(t) };
}
