import { describe, expect, it } from 'vitest';
import { computeFasting, DEFAULT_FASTING, mealGaps, zonedToUtc } from './fasting';
import { detectTrend, findViolations, weeklyWindows, parseNutritionText, pearson, rollingAverageByDate, assessPace, bmrMifflin, checkCalorieTarget, expectedWeeklyLossKg, movingAverage, scaleFromPer100, tdeeFromBmr, totalExpenditure, weeksToGoal } from './index';

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

describe('OCR de etiquetas', () => {
  it('extrae valores por 100 g de un texto de etiqueta y no inventa los que faltan', () => {
    const txt = 'Información nutricional  por 100 g\nValor energético 1650 kJ / 394 kcal\nGrasas 8,5 g\nde las cuales saturadas 2,1 g\nHidratos de carbono 55 g\nde los cuales azúcares 4,2 g\nFibra alimentaria 6,3 g\nProteínas 12 g\nSal 1,1 g';
    const r = parseNutritionText(txt);
    expect(r.per100).toBe(true);
    expect(r.values).toEqual({ kcal: 394, fat: 8.5, satFat: 2.1, carbs: 55, sugars: 4.2, fiber: 6.3, protein: 12, salt: 1.1 });
    expect(parseNutritionText('texto sin datos').values).toEqual({});
  });
});

describe('tendencia y restricciones', () => {
  const pts = (vals: [string, number][]) => vals.map(([date, value]) => ({ date, value }));
  it('detecta estancamiento sobre la media semanal, no sobre un día', () => {
    const flat = pts([['2026-10-14', 110.4], ['2026-10-16', 110.5], ['2026-10-19', 110.3], ['2026-10-21', 110.4], ['2026-10-26', 110.5], ['2026-10-28', 110.3], ['2026-11-02', 110.4], ['2026-11-03', 110.6], ['2026-11-04', 110.2]]);
    const t = detectTrend(weeklyWindows(flat, '2026-11-04', 4), 110);
    expect(t.status).toBe('stalled');
    expect(t.message).toMatch(/profesional/);
  });
  it('un día alto aislado no cambia el estado de una tendencia a la baja', () => {
    const down = pts([['2026-10-14', 112], ['2026-10-16', 111.9], ['2026-10-19', 111.2], ['2026-10-21', 111.1], ['2026-10-23', 111], ['2026-10-26', 110.5], ['2026-10-28', 110.4], ['2026-11-02', 109.8], ['2026-11-03', 111.5], ['2026-11-04', 109.7]]);
    expect(detectTrend(weeklyWindows(down, '2026-11-04', 4), 110).status).toBe('progressing');
  });
  it('sin pesajes suficientes no concluye', () => {
    expect(detectTrend(weeklyWindows(pts([['2026-11-04', 110]]), '2026-11-04', 4), 110).status).toBe('insufficient_data');
  });
  it('avisa si baja demasiado deprisa', () => {
    const fast = pts([['2026-10-14', 114], ['2026-10-16', 114], ['2026-10-19', 113], ['2026-10-21', 112.8], ['2026-10-26', 111], ['2026-10-28', 110.8], ['2026-11-01', 109], ['2026-11-02', 108.8], ['2026-11-04', 108.6]]);
    expect(detectTrend(weeklyWindows(fast, '2026-11-04', 4), 109).status).toBe('too_fast');
  });
  it('detecta alérgenos sin importar mayúsculas ni acentos', () => {
    expect(findViolations(['Pan de GLUTEN', 'Hígado de res', 'arroz'], ['gluten', 'higado'])).toHaveLength(2);
    expect(findViolations(['arroz'], ['gluten'])).toEqual([]);
    expect(findViolations(['arroz'], ['a'])).toEqual([]); // términos demasiado cortos se ignoran
  });
});

describe('estadísticas', () => {
  it('pearson exige datos suficientes y variación', () => {
    expect(pearson([[1, 2], [2, 4]])).toBeNull();
    const p = Array.from({ length: 8 }, (_, i) => [i, i * 2] as [number, number]);
    expect(pearson(p)).toBe(1);
    expect(pearson(Array.from({ length: 8 }, () => [1, 1] as [number, number]))).toBeNull();
  });
  it('rollingAverageByDate no inventa días sin dato', () => {
    const r = rollingAverageByDate([{ date: '2026-11-01', value: 100 }, { date: '2026-11-10', value: 98 }], 7);
    expect(r[1]!.avg).toBe(98);
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

describe('ayuno', () => {
  const tz = 'Europe/Madrid';
  const at = (d: string, t: string) => zonedToUtc(d, t, tz);
  const run = (now: Date, entries: { type: string; at: Date; localDate: string }[] = [], cfg = DEFAULT_FASTING) => computeFasting({ now, tz, cfg, bmr: 1680, entries });

  it('convierte hora local a UTC (invierno y verano)', () => {
    expect(zonedToUtc('2026-01-15', '21:00', tz).toISOString()).toBe('2026-01-15T20:00:00.000Z');
    expect(zonedToUtc('2026-07-15', '21:00', tz).toISOString()).toBe('2026-07-15T19:00:00.000Z');
  });
  it('tras la hora de cena empieza solo y calcula kcal en reposo', () => {
    const s = run(at('2026-03-10', '23:00'));
    expect(s.state).toBe('fasting');
    expect(s.startSource).toBe('schedule');
    expect(s.elapsedHours).toBe(2);
    expect(s.kcalBurned).toBe(140); // 1680/24 = 70 kcal/h
  });
  it('usa la cena registrada como inicio y la primera comida como fin', () => {
    const dinner = { type: 'DINNER', at: at('2026-03-10', '22:00'), localDate: '2026-03-10' };
    const mid = run(at('2026-03-11', '06:00'), [dinner]);
    expect(mid.state).toBe('fasting');
    expect(mid.startSource).toBe('logged');
    expect(mid.elapsedHours).toBe(8);
    const done = run(at('2026-03-11', '09:00'), [dinner, { type: 'BREAKFAST', at: at('2026-03-11', '08:30'), localDate: '2026-03-11' }]);
    expect(done.state).toBe('done');
    expect(done.elapsedHours).toBe(10.5);
    expect(done.kcalBurned).toBe(735);
  });
  it('antes de la cena y con el ayuno anterior roto queda en espera', () => {
    const entries = [{ type: 'BREAKFAST', at: at('2026-03-11', '08:30'), localDate: '2026-03-11' }];
    expect(run(at('2026-03-11', '15:00'), entries).state).toBe('done');
    expect(run(at('2026-03-11', '15:00'), entries).nextStartAt).toBe(at('2026-03-11', '21:00').toISOString());
  });
  it('ignora registros añadidos a posteriori y respeta enabled=false', () => {
    const late = { type: 'DINNER', at: at('2026-03-11', '09:00'), localDate: '2026-03-10' };
    expect(run(at('2026-03-11', '10:00'), [late]).startSource).toBe('schedule');
    expect(run(at('2026-03-11', '10:00'), [], { ...DEFAULT_FASTING, enabled: false }).state).toBe('off');
  });
  it('calcula las horas entre comidas', () => {
    const g = mealGaps(DEFAULT_FASTING);
    expect(g.map((x) => x.hours)).toEqual([6, 7, 11]);
  });
});
