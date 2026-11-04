import { describe, expect, it } from 'vitest';
import { GENERIC_FOODS, nutrientsLookInconsistent, per100Schema, searchGenericFoods } from './index';

describe('alimentos genéricos y caseros', () => {
  it('«patatas fritas» encuentra primero las caseras', () => {
    const r = searchGenericFoods('patatas fritas');
    expect(r[0]!.name).toContain('caseras');
    expect(r[0]!.per100.kcal).toBeLessThan(400); // no las de bolsa (~540 kcal)
  });
  it('ignora tildes y mayúsculas, y busca por todas las palabras', () => {
    expect(searchGenericFoods('PURE patata')[0]!.name).toContain('Puré');
    expect(searchGenericFoods('zzz')).toEqual([]);
  });
  it('todos los valores son válidos y coherentes', () => {
    for (const f of GENERIC_FOODS) {
      expect(per100Schema.safeParse(f.per100).success, f.name).toBe(true);
      expect(nutrientsLookInconsistent(f.per100), f.name).toBe(false);
    }
  });
});
