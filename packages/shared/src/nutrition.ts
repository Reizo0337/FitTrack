/** Nutrientes en gramos salvo kcal. Siempre se calculan con la cantidad REAL consumida. */
export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'salt'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number>;

export const zeroNutrients = (): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Nutrients;

const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Escala valores por 100 g a una cantidad real en gramos. */
export function scaleFromPer100(per100: Nutrients, grams: number): Nutrients {
  if (!Number.isFinite(grams) || grams < 0) throw new RangeError('grams must be a non-negative number');
  const out = zeroNutrients();
  for (const k of NUTRIENT_KEYS) out[k] = round((per100[k] * grams) / 100, k === 'kcal' ? 0 : 1);
  return out;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out = zeroNutrients();
  for (const n of list) for (const k of NUTRIENT_KEYS) out[k] += n[k];
  for (const k of NUTRIENT_KEYS) out[k] = round(out[k], k === 'kcal' ? 0 : 1);
  return out;
}

/** Atwater: kcal estimadas a partir de macros; sirve para detectar datos incoherentes. */
export const kcalFromMacros = (n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>) =>
  n.protein * 4 + n.carbs * 4 + n.fat * 9;

/** Avisa (no corrige) si las kcal declaradas difieren >25 % de las derivadas de macros. */
export function nutrientsLookInconsistent(n: Nutrients): boolean {
  const est = kcalFromMacros(n);
  if (est < 20 && n.kcal < 20) return false;
  return Math.abs(est - n.kcal) / Math.max(est, n.kcal) > 0.25;
}
