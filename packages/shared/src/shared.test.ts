import { describe, expect, it } from 'vitest';
import { assessPace, bmrMifflin, checkCalorieTarget, expectedWeeklyLossKg, movingAverage, scaleFromPer100, tdeeFromBmr, totalExpenditure, weeksToGoal } from './index';

const prozis100 = { kcal: 384, protein: 42, carbs: 33, fat: 9, satFat: 2.4, fiber: 1.7, sugars: 2.5, salt: 1 };

describe('nutrition', () => {
  it('escala por cantidad real (60 g de Prozis)', () => {
    const n = scaleFromPer100(prozis100, 60);
    expect(n.kcal).toBe(230); // 230.4 -> 230 (la etiqueta dice ≈231)
    expect(n.protein).toBe(25.2);
    expect(n.carbs).toBe(19.8);
    expect(n.fat).toBe(5.4);
    expect(n.salt).toBe(0.6);
  });
  it('rechaza cantidades negativas', () => {
    expect(() => scaleFromPer100(prozis100, -1)).toThrow();
  });
});

describe('energía', () => {
  const me = { sex: 'MALE' as const, weightKg: 112, heightCm: 175, ageYears: 23 };
  it('Mifflin-St Jeor para 112 kg / 175 cm / 23 a', () => {
    expect(bmrMifflin(me)).toBe(2104);
    expect(tdeeFromBmr(2104, 'SEDENTARY')).toBe(2525);
  });
  it('2000 kcal sedentario: ritmo sostenible pero ~10-11 meses (más lento que 7-9)', () => {
    const weekly = expectedWeeklyLossKg(2525 - 2000);
    expect(assessPace(weekly, 112).level).toBe('OK');
    const months = weeksToGoal(112, 90, weekly) / 4.345;
    expect(months).toBeGreaterThan(10);
    expect(months).toBeLessThan(11.5);
  });
  it('para 7-9 meses hace falta un déficit de ~620-800 kcal/día, y sigue siendo ritmo asumible', () => {
    for (const months of [7, 9]) {
      const weeklyNeeded = 22 / (months * 4.345);
      const deficit = (weeklyNeeded * 7700) / 7;
      expect(deficit).toBeGreaterThan(600);
      expect(deficit).toBeLessThan(830);
      expect(['OK', 'FAST']).toContain(assessPace(weeklyNeeded, 112).level);
    }
  });
  it('avisa de déficits peligrosos', () => {
    expect(checkCalorieTarget(1200, 2104, 'MALE').length).toBe(2);
    expect(checkCalorieTarget(2000, 2104, 'MALE')).toEqual([]);
  });
  it('no suma dos veces: con Health usa reposo + activa', () => {
    expect(totalExpenditure({ restKcal: 2000, activeKcal: 400, estimatedTdee: 2525 })).toEqual({ kcal: 2400, source: 'HEALTH' });
    expect(totalExpenditure({ restKcal: null, activeKcal: 400, estimatedTdee: 2525 }).source).toBe('ESTIMATE');
  });
  it('media móvil ignora huecos sin inventar datos', () => {
    expect(movingAverage([100, null, 98], 7)).toEqual([100, 100, 99]);
    expect(movingAverage([null, null], 7)).toEqual([null, null]);
  });
});
