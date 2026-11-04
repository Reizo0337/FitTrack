import { z } from 'zod';
import { localDate } from './schemas';

const DAY = 86400000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

export type WeekWindow = { index: number; avg: number | null; n: number };

/** Ventanas de 7 días terminadas en `endDate` (índice 0 = la más reciente). Media solo de pesajes reales. */
export function weeklyWindows(points: { date: string; value: number }[], endDate: string, weeks = 4): WeekWindow[] {
  return Array.from({ length: weeks }, (_, i) => {
    const hi = t(endDate) - i * 7 * DAY, lo = hi - 7 * DAY;
    const v = points.filter((p) => t(p.date) <= hi && t(p.date) > lo).map((p) => p.value);
    return { index: i, avg: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null, n: v.length };
  });
}

export type Trend = {
  status: 'insufficient_data' | 'progressing' | 'stalled' | 'gaining' | 'too_fast';
  changePerWeekKg: number | null;
  weeksCompared: number;
  message: string;
};

const MIN_WEIGHINS = 3; // p. ej. tres mañanas a la semana
const FLAT_KG_PER_WEEK = 0.15;

/**
 * Detector de estancamiento sobre la MEDIA semanal (no sobre un día). Compara la ventana más reciente con la más
 * antigua que tenga datos suficientes (≥ 2 semanas de diferencia). No propone recortar calorías automáticamente.
 */
export function detectTrend(windows: WeekWindow[], weightKg: number): Trend {
  const w0 = windows[0];
  const older = [...windows].reverse().find((w) => w.index >= 2 && w.n >= MIN_WEIGHINS && w.avg != null);
  if (!w0 || w0.n < MIN_WEIGHINS || w0.avg == null || !older) {
    return { status: 'insufficient_data', changePerWeekKg: null, weeksCompared: 0, message: 'Aún no hay pesajes suficientes (al menos 3 por semana durante 3 semanas) para valorar la tendencia.' };
  }
  const change = Math.round(((w0.avg - older.avg!) / older.index) * 100) / 100;
  const base = { changePerWeekKg: change, weeksCompared: older.index };
  if (-change > weightKg * 0.01) return { ...base, status: 'too_fast', message: `Estás perdiendo ~${-change} kg/semana, más del 1 % de tu peso: conviene no recortar más y vigilar energía y sueño.` };
  if (change <= -FLAT_KG_PER_WEEK) return { ...base, status: 'progressing', message: `Tendencia a la baja: ${change} kg/semana de media en ${older.index} semanas.` };
  if (change >= FLAT_KG_PER_WEEK) return { ...base, status: 'gaining', message: `La media semanal ha subido ${change} kg/semana en ${older.index} semanas. Revisa adherencia, sal/líquidos y descanso antes de cambiar el plan.` };
  return { ...base, status: 'stalled', message: `La media semanal lleva ${older.index} semanas prácticamente plana (${change} kg/semana). Antes de tocar el plan revisa adherencia al registro, pasos, sueño y porciones; si persiste, consúltalo con un profesional.` };
}

// ---- Normalización para comprobar alergias/rechazos (sin acentos, minúsculas) ----
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function findViolations(ingredientNames: string[], blocked: string[]): string[] {
  const terms = blocked.map(norm).filter((x) => x.length >= 3);
  const hits = new Set<string>();
  for (const ing of ingredientNames.map(norm)) for (const term of terms) if (ing.includes(term)) hits.add(`${ing} (contiene «${term}»)`);
  return [...hits];
}

// ---- Esquemas de petición/respuesta de IA ----
export const aiNutrients = z.object({
  kcal: z.number().min(0).max(4000), protein: z.number().min(0).max(300), carbs: z.number().min(0).max(600), fat: z.number().min(0).max(300),
  satFat: z.number().min(0).max(150).default(0), fiber: z.number().min(0).max(100).default(0), sugars: z.number().min(0).max(300).default(0), salt: z.number().min(0).max(30).default(0),
});

export const aiFoodItem = aiNutrients.extend({
  name: z.string().trim().min(1).max(120),
  grams: z.number().min(1).max(5000),
  confidence: z.enum(['alta', 'media', 'baja']).default('media'),
  assumption: z.string().max(300).nullish(),
});
export type AiFoodItem = z.infer<typeof aiFoodItem>;
export const aiFoodParse = z.object({ items: z.array(aiFoodItem).min(1).max(25), notes: z.string().max(500).nullish() });

export const aiIngredient = z.object({ name: z.string().min(1).max(80), grams: z.number().min(0).max(3000) });
export const aiOption = z.object({
  title: z.string().min(1).max(120), category: z.string().max(40).default('general'),
  timeMin: z.number().min(0).max(600).nullish(), costEur: z.number().min(0).max(100).nullish(),
  ingredients: z.array(aiIngredient).min(1).max(30),
  kcal: z.number().min(0).max(3000), protein: z.number().min(0).max(250), carbs: z.number().min(0).max(400), fat: z.number().min(0).max(200), fiber: z.number().min(0).max(80).default(0),
  steps: z.array(z.string().max(400)).max(15).default([]),
});
export const aiRecommend = z.object({ options: z.array(aiOption).min(1).max(6) });
export type AiOption = z.infer<typeof aiOption>;

export const MEAL_IDS = ['BREAKFAST', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER', 'SNACKS'] as const;
export const aiMenuMeal = z.object({
  type: z.enum(MEAL_IDS), title: z.string().min(1).max(120), minutes: z.number().min(0).max(300).nullish(),
  ingredients: z.array(aiIngredient).min(1).max(25),
  kcal: z.number().min(0).max(2500), protein: z.number().min(0).max(200), carbs: z.number().min(0).max(300), fat: z.number().min(0).max(150), fiber: z.number().min(0).max(60).default(0),
});
export const aiMenu = z.object({ days: z.array(z.object({ day: z.string().max(20), meals: z.array(aiMenuMeal).min(3).max(6) })).length(7), notes: z.string().max(500).nullish() });
export type AiMenu = z.infer<typeof aiMenu>;

export const aiWeeklyNarrative = z.object({
  summary: z.string().max(1200), wins: z.array(z.string().max(300)).max(6).default([]),
  concerns: z.array(z.string().max(300)).max(6).default([]), suggestions: z.array(z.string().max(300)).max(6).default([]),
});

export const recommendRequest = z.object({
  date: localDate,
  category: z.enum(['economica', 'rapida', 'facil', 'alta_proteina', 'baja_caloria', 'receta']).optional(),
  meal: z.enum(MEAL_IDS).optional(),
  budgetEur: z.number().min(0).max(100).optional(),
  available: z.array(z.string().max(60)).max(30).optional(),
});
export const foodParseRequest = z.object({ text: z.string().trim().min(3).max(1500), date: localDate });
export const foodConfirmRequest = z.object({
  date: localDate, type: z.enum(MEAL_IDS),
  items: z.array(z.object({ name: z.string().trim().min(1).max(120), grams: z.number().min(1).max(5000) }).and(aiNutrients)).min(1).max(25),
});
export const menuRequest = z.object({ budgetEur: z.number().min(0).max(500).optional(), available: z.array(z.string().max(60)).max(40).optional() });
export const chatRequest = z.object({ conversationId: z.string().optional(), message: z.string().trim().min(1).max(2000) });
export const aiConfigRequest = z.object({
  items: z.array(z.object({ task: z.enum(['NUTRITIONIST', 'FOOD_RECOGNITION', 'WEEKLY_ANALYSIS']), provider: z.enum(['ANTHROPIC', 'GEMINI', 'OPENAI']), model: z.string().trim().min(2).max(80).regex(/^[\w.\-:/]+$/) })).max(3),
});
export const aiKeyRequest = z.object({ provider: z.enum(['ANTHROPIC', 'GEMINI', 'OPENAI']), apiKey: z.string().trim().min(10).max(300) });

/** Escaneo de despensa por foto: imágenes ya reducidas en el cliente (base64, sin prefijo data:). */
export const pantryScanRequest = z.object({
  images: z.array(z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().min(100).max(2_500_000) })).min(1).max(4),
});
export const aiPantryScan = z.object({
  items: z.array(z.object({ name: z.string().trim().min(2).max(60), quantity: z.string().max(40).nullish() })).max(60),
  notes: z.string().max(300).nullish(),
});
export const pantryBulkSchema = z.object({ names: z.array(z.string().trim().min(2).max(60)).min(1).max(60) });
