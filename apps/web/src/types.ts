import type { MealTypeId, Nutrients } from '@fittrack/shared';

export type Entry = { id: string; name: string; grams: number; isEstimate: boolean; at?: string; nutrients: Nutrients };
export type MealDay = { type: MealTypeId; entries: Entry[]; totals: Nutrients };
export type ProductAlert = { productId: string; name: string; servings: number; max: number; level: 'ok' | 'warn'; messages: string[] };
export type Diary = {
  date: string; meals: MealDay[]; totals: Nutrients;
  targets: { kcal: number; protein: number; fat: number; carbs: number; fiber: number; waterMl: number };
  remaining: Record<string, number>; waterMl: number; productAlerts: ProductAlert[];
};
export type Dash = {
  date: string; diary: Diary;
  weight: { currentKg: number | null; startKg: number; goalKg: number; lostKg: number | null; remainingKg: number | null; progressPct: number | null; avg7Kg: number | null; weeklyChangeKg: number | null; lastMeasuredOn: string | null; bodyFatPct: number | null; note: string };
  activity: { steps: number | null; activeKcal: number | null; restingKcal: number | null; distanceKm: number | null; exerciseMin: number | null; source: string } | null;
  sleep: { totalMin: number | null; source: string } | null;
  history: { date: string; kcal: number; protein: number; carbs: number; fat: number }[];
};
export type Profile = {
  displayName: string; startWeightKg: number; goalWeightKg: number; activityLevel: string; timezone: string;
  targetKcal: number; targetProteinG: number; targetFatG: number; targetFiberG: number; targetWaterMl: number;
  allergies: string[]; dislikedFoods: string[]; aiConsent: boolean;
};
export type Derived = { bmr: number; tdee: number; expectedWeeklyLossKg: number; weeksToGoal: number | null; pace: { message: string; level: string }; warnings: string[] };
