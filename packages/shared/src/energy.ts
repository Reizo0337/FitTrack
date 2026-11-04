export type Sex = 'MALE' | 'FEMALE';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

/** Mifflin-St Jeor (kcal/día). */
export function bmrMifflin(p: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return Math.round(base + (p.sex === 'MALE' ? 5 : -161));
}

/** Katch-McArdle, si se conoce el % de grasa corporal. */
export function bmrKatchMcArdle(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return Math.round(370 + 21.6 * lbm);
}

export const tdeeFromBmr = (bmr: number, level: ActivityLevel) => Math.round(bmr * ACTIVITY_FACTOR[level]);

/** 1 kg de grasa ≈ 7700 kcal (aproximación estándar; la pérdida real varía). */
export const KCAL_PER_KG_FAT = 7700;

/** Ritmo semanal esperado (kg/semana) con un déficit diario dado. */
export const expectedWeeklyLossKg = (dailyDeficitKcal: number) => (dailyDeficitKcal * 7) / KCAL_PER_KG_FAT;

/** Semanas necesarias para ir de start a goal con un ritmo semanal. */
export function weeksToGoal(startKg: number, goalKg: number, weeklyLossKg: number): number {
  if (weeklyLossKg <= 0) return Infinity;
  return Math.max(0, (startKg - goalKg) / weeklyLossKg);
}

export type PaceAssessment = { level: 'OK' | 'FAST' | 'TOO_FAST' | 'SLOW'; weeklyPctOfBody: number; message: string };

/** Evalúa el ritmo semanal: >1 % del peso/semana se considera demasiado rápido. */
export function assessPace(weeklyLossKg: number, weightKg: number): PaceAssessment {
  const pct = (weeklyLossKg / weightKg) * 100;
  if (pct > 1) return { level: 'TOO_FAST', weeklyPctOfBody: pct, message: 'Ritmo superior al 1 % del peso por semana: conviene reducir el déficit.' };
  if (pct > 0.8) return { level: 'FAST', weeklyPctOfBody: pct, message: 'Ritmo alto; vigila energía, sueño y rendimiento.' };
  if (pct < 0.25) return { level: 'SLOW', weeklyPctOfBody: pct, message: 'Ritmo muy lento; revisa adherencia antes de tocar el plan.' };
  return { level: 'OK', weeklyPctOfBody: pct, message: 'Ritmo sostenible.' };
}

/** Comprobaciones de seguridad del objetivo calórico. */
export function checkCalorieTarget(targetKcal: number, bmr: number, sex: Sex): string[] {
  const warnings: string[] = [];
  const floor = sex === 'MALE' ? 1500 : 1200;
  if (targetKcal < floor) warnings.push(`Objetivo por debajo de ${floor} kcal: no recomendable sin supervisión profesional.`);
  if (targetKcal < bmr * 0.8) warnings.push('Objetivo muy por debajo del metabolismo basal estimado.');
  return warnings;
}

/** Gasto total del día. Con datos de Health: reposo + activa (sin sumar dos veces). */
export function totalExpenditure(opts: { restKcal?: number | null; activeKcal?: number | null; estimatedTdee: number }) {
  if (opts.restKcal != null && opts.activeKcal != null) {
    return { kcal: Math.round(opts.restKcal + opts.activeKcal), source: 'HEALTH' as const };
  }
  return { kcal: opts.estimatedTdee, source: 'ESTIMATE' as const };
}

/** Media móvil simple (ventana en puntos con dato; null si no hay suficientes). */
export function movingAverage(values: (number | null)[], window = 7): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100 : null;
  });
}

/** Media de los últimos `days` días naturales (incluido el actual) para cada punto. Sin inventar huecos. */
export function rollingAverageByDate(points: { date: string; value: number }[], days = 7) {
  const ms = 86400_000;
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  return points.map((p) => {
    const win = points.filter((q) => t(q.date) <= t(p.date) && t(q.date) > t(p.date) - days * ms);
    const avg = win.reduce((a, b) => a + b.value, 0) / win.length;
    return { date: p.date, value: p.value, avg: Math.round(avg * 100) / 100 };
  });
}

export const ageFromBirthDate = (birth: Date, now = new Date()) => {
  let a = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) a--;
  return a;
};
