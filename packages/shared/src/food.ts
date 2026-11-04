import { z } from 'zod';
import { type Nutrients } from './nutrition';
import { localDate } from './schemas';

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER', 'SNACKS'] as const;
export type MealTypeId = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealTypeId, string> = {
  BREAKFAST: 'Desayuno', LUNCH: 'Comida', AFTERNOON_SNACK: 'Merienda', DINNER: 'Cena', SNACKS: 'Snacks',
};

const g100 = z.number().min(0).max(100);
export const per100Schema = z
  .object({
    kcal: z.number().min(0).max(950),
    protein: g100, carbs: g100, fat: g100,
    satFat: g100.default(0), fiber: g100.default(0), sugars: g100.default(0), salt: g100.default(0),
  })
  .refine((n) => n.protein + n.carbs + n.fat <= 101, 'Proteínas + carbohidratos + grasas no pueden superar 100 g por 100 g')
  .refine((n) => n.satFat <= n.fat + 0.5, 'Las grasas saturadas no pueden superar a las grasas')
  .refine((n) => n.sugars <= n.carbs + 0.5, 'Los azúcares no pueden superar a los carbohidratos');

export const foodCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).optional(),
  barcode: z.string().regex(/^\d{6,14}$/, 'Código de barras inválido').optional(),
  per100: per100Schema,
  servingG: z.number().positive().max(5000).optional(),
  servingName: z.string().max(60).optional(),
  unitName: z.string().max(40).optional(),
  unitGrams: z.number().positive().max(5000).optional(),
  isFavorite: z.boolean().optional(),
  source: z.enum(['MANUAL', 'OPEN_FOOD_FACTS', 'OCR']).default('MANUAL'),
});
export type FoodCreate = z.infer<typeof foodCreateSchema>;

export const entryCreateSchema = z
  .object({
    date: localDate,
    type: z.enum(MEAL_TYPES),
    kind: z.enum(['food', 'product']),
    id: z.string().min(1),
    grams: z.number().positive().max(5000).optional(),
    units: z.number().positive().max(100).optional(),
  })
  .refine((e) => (e.grams != null) !== (e.units != null), 'Indica gramos o unidades (solo uno)');

export const weightCreateSchema = z.object({
  date: localDate,
  weightKg: z.number().min(30).max(400),
  bodyFatPct: z.number().min(2).max(70).optional(),
  muscleKg: z.number().min(10).max(150).optional(),
  bodyWaterPct: z.number().min(20).max(80).optional(),
});

export const measurementCreateSchema = z
  .object({
    date: localDate,
    waistCm: z.number().min(30).max(250), chestCm: z.number().min(30).max(250), hipCm: z.number().min(30).max(250),
    armCm: z.number().min(10).max(100), thighCm: z.number().min(20).max(150),
  })
  .partial()
  .required({ date: true })
  .refine((m) => Object.keys(m).length > 1, 'Indica al menos una medida');

export const waterCreateSchema = z.object({ date: localDate, ml: z.number().int().min(10).max(3000) });

export type FoodItem = {
  kind: 'food' | 'product';
  id: string | null; // null = aún no guardado (p. ej. resultado de Open Food Facts)
  name: string;
  brand?: string | null;
  barcode?: string | null;
  per100: Nutrients;
  servingG?: number | null;
  servingName?: string | null;
  unitName?: string | null;
  unitGrams?: number | null;
  isFavorite?: boolean;
  source: string;
  /** campos que la fuente no aportó; nunca se rellenan inventando valores */
  missing?: string[];
};
