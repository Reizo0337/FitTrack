import { MEAL_TYPES, NUTRIENT_KEYS, sumNutrients, type MealTypeId, type Nutrients } from '@fittrack/shared';
import type { MealEntry, PrismaClient } from '@prisma/client';
import { toDbDate } from '../../lib/dates';

export const entryNutrients = (e: MealEntry): Nutrients => ({
  kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, satFat: e.satFat, fiber: e.fiber, sugars: e.sugars, salt: e.salt,
});

/** Recalcula el agregado diario cacheado a partir de las entradas reales. */
export async function recomputeDaily(db: PrismaClient, userId: string, date: string) {
  const entries = await db.mealEntry.findMany({ where: { meal: { userId, localDate: toDbDate(date) } } });
  const t = sumNutrients(entries.map(entryNutrients));
  const data = { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, satFat: t.satFat, fiber: t.fiber, sugars: t.sugars, salt: t.salt };
  await db.dailyNutrition.upsert({
    where: { userId_localDate: { userId, localDate: toDbDate(date) } },
    create: { userId, localDate: toDbDate(date), ...data },
    update: data,
  });
}

export async function getOrCreateMeal(db: PrismaClient, userId: string, date: string, type: MealTypeId, tz: string) {
  return db.meal.upsert({
    where: { userId_localDate_type: { userId, localDate: toDbDate(date), type } },
    create: { userId, localDate: toDbDate(date), type, tz },
    update: {},
  });
}

export type ProductAlert = { productId: string; name: string; servings: number; max: number; level: 'ok' | 'warn'; messages: string[] };

/** Comprueba el uso de productos con indicaciones del fabricante (p. ej. sustitutivos de comida). */
export async function productAlerts(db: PrismaClient, userId: string, date: string): Promise<ProductAlert[]> {
  const entries = await db.mealEntry.findMany({
    where: { productId: { not: null }, meal: { userId, localDate: toDbDate(date) } },
    include: { product: true },
  });
  const byProduct = new Map<string, { name: string; grams: number; serving: number; max: number; note: string | null }>();
  for (const e of entries) {
    const p = e.product;
    if (!p || !p.maxServingsPerDay || !p.servingG) continue;
    const cur = byProduct.get(p.id) ?? { name: p.name, grams: 0, serving: p.servingG, max: p.maxServingsPerDay, note: p.guidanceNote };
    cur.grams += e.grams;
    byProduct.set(p.id, cur);
  }
  if (!byProduct.size) return [];
  const all = await db.mealEntry.findMany({ where: { meal: { userId, localDate: toDbDate(date) } } });
  const out: ProductAlert[] = [];
  for (const [productId, v] of byProduct) {
    const servings = Math.round((v.grams / v.serving) * 10) / 10;
    const messages: string[] = [];
    if (servings > v.max) messages.push(`${v.name}: ${servings} raciones hoy; el fabricante recomienda como máximo ${v.max} sustituciones de comida al día.`);
    const others = sumNutrients(all.filter((e) => e.productId !== productId).map(entryNutrients));
    if (servings >= 1) messages.push(`Recuerda: el resto de la dieta (${others.kcal} kcal registradas sin este producto hoy) debe aportar verduras, fruta, grasas saludables y fibra.`);
    if (v.note && messages.length) messages.push(v.note);
    out.push({ productId, name: v.name, servings, max: v.max, level: servings > v.max ? 'warn' : 'ok', messages });
  }
  return out;
}

export async function buildDiary(db: PrismaClient, userId: string, date: string) {
  const [meals, profile, water, alerts] = await Promise.all([
    db.meal.findMany({ where: { userId, localDate: toDbDate(date) }, include: { entries: { orderBy: { createdAt: 'asc' } } } }),
    db.userProfile.findUniqueOrThrow({ where: { userId } }),
    db.waterIntake.aggregate({ where: { userId, localDate: toDbDate(date) }, _sum: { ml: true } }),
    productAlerts(db, userId, date),
  ]);
  const byType = new Map(meals.map((m) => [m.type, m]));
  const outMeals = MEAL_TYPES.map((type) => {
    const entries = (byType.get(type)?.entries ?? []).map((e) => ({
      id: e.id, name: e.name, grams: e.grams, isEstimate: e.isEstimate, source: e.source,
      productId: e.productId, foodId: e.foodId, nutrients: entryNutrients(e),
    }));
    return { type, entries, totals: sumNutrients(entries.map((e) => e.nutrients)) };
  });
  const totals = sumNutrients(outMeals.map((m) => m.totals));
  const targets = {
    kcal: profile.targetKcal, protein: profile.targetProteinG, fat: profile.targetFatG, fiber: profile.targetFiberG,
    carbs: Math.round((profile.targetKcal - profile.targetProteinG * 4 - profile.targetFatG * 9) / 4),
    waterMl: profile.targetWaterMl,
  };
  const remaining = Object.fromEntries(
    NUTRIENT_KEYS.filter((k) => k in targets).map((k) => [k, Math.round((targets[k as keyof typeof targets] - totals[k]) * 10) / 10]),
  );
  return { date, meals: outMeals, totals, targets, remaining, waterMl: water._sum.ml ?? 0, productAlerts: alerts };
}
