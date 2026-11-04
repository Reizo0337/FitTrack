import { describe, expect, it } from 'vitest';
import { aggregateIngredients, bestStreak, complianceRate, currentStreak, encouragement, norm, weightMilestones } from './index';

describe('rachas y constancia', () => {
  it('la racha sigue viva si hoy aún no se cumple pero ayer sí', () => {
    expect(currentStreak([true, true, true, false])).toBe(3);
    expect(currentStreak([true, true, true, true])).toBe(4);
  });
  it('un día sin cumplir (o sin dato) corta la racha', () => {
    expect(currentStreak([true, false, true, true])).toBe(2);
    expect(currentStreak([true, true, null, true])).toBe(1);
    expect(currentStreak([false, false])).toBe(0);
  });
  it('mejor racha y cumplimiento ignoran los días sin dato', () => {
    expect(bestStreak([true, true, false, true, true, true])).toBe(3);
    expect(complianceRate([true, null, false, true])).toBe(67);
    expect(complianceRate([null, null])).toBeNull();
  });
});

describe('hitos de peso', () => {
  it('marca los hitos alcanzados y el siguiente', () => {
    const m = weightMilestones(112, 90, 107.5);
    expect(m.marks.slice(0, 3).map((x) => [x.kg, x.reached])).toEqual([[110, true], [108, true], [106, false]]);
    expect(m.next?.kg).toBe(106);
    expect(m.lostKg).toBe(4.5);
    expect(m.marks.at(-1)).toEqual({ kg: 90, reached: false });
  });
  it('sin pesajes no marca ninguno', () => {
    expect(weightMilestones(112, 90, null).marks.every((x) => !x.reached)).toBe(true);
  });
});

describe('mensajes y lista de la compra', () => {
  it('los mensajes no culpabilizan', () => {
    for (const o of [{ streakBest: 0, metToday: 0, activeGoals: 5, loggedDays7: 0 }, { streakBest: 3, metToday: 2, activeGoals: 5, loggedDays7: 5 }, { streakBest: 3, metToday: 5, activeGoals: 5, loggedDays7: 7 }])
      expect(encouragement(o)).not.toMatch(/fallaste|fracas|mal|culpa|perdiste la racha/i);
  });
  it('agrupa ingredientes por nombre normalizado y suma gramos', () => {
    const r = aggregateIngredients([{ name: 'Pechuga de pollo', grams: 150 }, { name: 'pechuga de POLLO', grams: 200 }, { name: 'Arroz', grams: 100 }, { name: 'Aceite de oliva', grams: 10 }], norm);
    expect(r).toEqual([{ name: 'Aceite de oliva', grams: 10 }, { name: 'Arroz', grams: 100 }, { name: 'Pechuga de pollo', grams: 350 }]);
  });
});
