import type { FoodItem } from '@fittrack/shared';

// Open Food Facts pide un User-Agent identificable; las IP de hosting compartido sin él suelen limitarse.
const UA = 'FitTrack/0.1 (app personal; https://github.com/Reizo0337/FitTrack)';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';
const TIMEOUT_MS = 15_000;

export type Fetch = typeof fetch;

export class OffError extends Error {
  constructor(public status: number | 'network' | 'timeout', message?: string) {
    super(message ?? `OFF ${status}`);
  }
}

type OffProduct = {
  code?: string; product_name?: string; brands?: string | string[];
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
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
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
  const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || null;
  return {
    kind: 'product', id: null, name, brand, barcode: p.code ?? null,
    per100: {
      kcal, protein: fields.protein, carbs: fields.carbs, fat: fields.fat,
      satFat: fields.satFat ?? 0, fiber: fields.fiber ?? 0, sugars: fields.sugars ?? 0, salt: fields.salt ?? 0,
    },
    servingG: serving && serving > 0 ? serving : null, servingName: p.serving_size ?? null,
    source: 'OPEN_FOOD_FACTS', missing,
  };
}

/** Una petición con tiempo máximo y un reintento ante errores de red o 5xx/429. */
async function get(f: Fetch, url: string): Promise<Response> {
  let last: OffError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await f(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (r.ok || r.status === 404) return r;
      last = new OffError(r.status);
      if (r.status < 500 && r.status !== 429) throw last; // 4xx: reintentar no ayuda
    } catch (e) {
      if (e instanceof OffError) { last = e; if (typeof e.status === 'number' && e.status < 500 && e.status !== 429) throw e; }
      else last = new OffError((e as Error)?.name === 'TimeoutError' ? 'timeout' : 'network', String(e));
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 400));
  }
  throw last ?? new OffError('network');
}

export async function offByBarcode(f: Fetch, code: string): Promise<{ status: 'found' | 'incomplete' | 'not_found'; item?: FoodItem }> {
  const r = await get(f, `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (r.status === 404) return { status: 'not_found' };
  const j = (await r.json()) as { status?: number; product?: OffProduct };
  if (j.status !== 1 || !j.product) return { status: 'not_found' };
  const item = mapOffProduct({ ...j.product, code });
  return item ? { status: 'found', item } : { status: 'incomplete' };
}

/** Búsqueda moderna (search-a-licious: rápida y pensada para texto); si falla, el buscador clásico. */
export async function offSearch(f: Fetch, q: string): Promise<FoodItem[]> {
  const enc = encodeURIComponent(q);
  const attempts: (() => Promise<FoodItem[]>)[] = [
    async () => {
      const r = await get(f, `https://search.openfoodfacts.org/search?q=${enc}&page_size=20&langs=es,en&fields=${FIELDS}`);
      const j = (await r.json()) as { hits?: OffProduct[] };
      return (j.hits ?? []).map(mapOffProduct).filter((x): x is FoodItem => x !== null);
    },
    async () => {
      const r = await get(f, `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`);
      const j = (await r.json()) as { products?: OffProduct[] };
      return (j.products ?? []).map(mapOffProduct).filter((x): x is FoodItem => x !== null);
    },
  ];
  let lastErr: unknown;
  for (const run of attempts) {
    try {
      const items = await run();
      if (items.length) return items;
      lastErr = undefined; // respuesta válida pero sin resultados completos: prueba el siguiente
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  return [];
}
