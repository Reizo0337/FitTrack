import type { FoodItem } from '@fittrack/shared';

const UA = 'FitTrack/0.1 (uso personal)';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

export type Fetch = typeof fetch;

type OffProduct = {
  code?: string; product_name?: string; brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_quantity?: number | string; serving_size?: string;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Mapea un producto de Open Food Facts. Usa SOLO valores por 100 g (nunca por ración).
 * Si falta un campo no se inventa: queda en 0 y se lista en `missing`.
 * Devuelve null si faltan los datos esenciales (kcal o macros) para poder calcular.
 */
export function mapOffProduct(p: OffProduct): FoodItem | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy_100g']);
    if (kj != null) kcal = Math.round(kj / 4.184);
  }
  const fields = {
    protein: num(n['proteins_100g']), carbs: num(n['carbohydrates_100g']), fat: num(n['fat_100g']),
    satFat: num(n['saturated-fat_100g']), fiber: num(n['fiber_100g']), sugars: num(n['sugars_100g']), salt: num(n['salt_100g']),
  };
  const name = p.product_name?.trim();
  if (!name || kcal == null || fields.protein == null || fields.carbs == null || fields.fat == null) return null;
  const missing = (['satFat', 'fiber', 'sugars', 'salt'] as const).filter((k) => fields[k] == null);
  const serving = num(p.serving_quantity);
  return {
    kind: 'product', id: null, name, brand: p.brands?.split(',')[0]?.trim() || null, barcode: p.code ?? null,
    per100: {
      kcal, protein: fields.protein, carbs: fields.carbs, fat: fields.fat,
      satFat: fields.satFat ?? 0, fiber: fields.fiber ?? 0, sugars: fields.sugars ?? 0, salt: fields.salt ?? 0,
    },
    servingG: serving && serving > 0 ? serving : null, servingName: p.serving_size ?? null,
    source: 'OPEN_FOOD_FACTS', missing,
  };
}

async function get(f: Fetch, url: string): Promise<Response> {
  return f(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
}

export async function offByBarcode(f: Fetch, code: string): Promise<{ status: 'found' | 'incomplete' | 'not_found'; item?: FoodItem }> {
  const r = await get(f, `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (r.status === 404) return { status: 'not_found' };
  if (!r.ok) throw new Error(`OFF ${r.status}`);
  const j = (await r.json()) as { status?: number; product?: OffProduct };
  if (j.status !== 1 || !j.product) return { status: 'not_found' };
  const item = mapOffProduct({ ...j.product, code });
  return item ? { status: 'found', item } : { status: 'incomplete' };
}

export async function offSearch(f: Fetch, q: string): Promise<FoodItem[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const r = await get(f, url);
  if (!r.ok) throw new Error(`OFF ${r.status}`);
  const j = (await r.json()) as { products?: OffProduct[] };
  return (j.products ?? []).map(mapOffProduct).filter((x): x is FoodItem => x !== null);
}
