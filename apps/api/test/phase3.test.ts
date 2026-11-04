import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';
import { createUser } from '../src/users';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL! } as NodeJS.ProcessEnv);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

// Open Food Facts simulado (red real no se usa en tests).
const OFF: Record<string, unknown> = {
  '5000000000017': { status: 1, product: { product_name: 'Barrita Test', brands: 'MarcaX, otra', serving_quantity: 40, nutriments: { 'energy-kcal_100g': 450, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 18, 'saturated-fat_100g': 5, sugars_100g: 20, salt_100g: 0.5 } } },
  '5000000000024': { status: 1, product: { product_name: 'Sin calorías', nutriments: { proteins_100g: 5 } } },
};
const fakeFetch = (async (url: string) => {
  const code = /product\/(\d+)\.json/.exec(String(url))?.[1];
  const body = code ? OFF[code] : undefined;
  if (!body) return new Response(JSON.stringify({ status: 0 }), { status: 404 });
  return new Response(JSON.stringify(body), { status: 200 });
}) as unknown as typeof fetch;

let app: Awaited<ReturnType<typeof buildApp>>;
let auth: Record<string, string>;
let otherAuth: Record<string, string>;
let prozisId: string;
const DAY = '2026-11-04';

async function loginAs(email: string, password: string) {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress: `10.1.0.${Math.floor(Math.random() * 250)}` });
  return { authorization: `Bearer ${r.json().accessToken}` };
}
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, h = auth) =>
  app.inject({ method, url, payload: payload as object, headers: h });

beforeAll(async () => {
  app = await buildApp(env, prisma, { fetch: fakeFetch });
  await createUser(prisma, { email: 'fase3@example.com', password: 'una-contraseña-larga-1' });
  await createUser(prisma, { email: 'otro@example.com', password: 'una-contraseña-larga-2' });
  auth = await loginAs('fase3@example.com', 'una-contraseña-larga-1');
  otherAuth = await loginAs('otro@example.com', 'una-contraseña-larga-2');
  const s = await call('GET', '/api/foods/search?q=prozis');
  prozisId = s.json().items[0].id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Prozis y cálculo por cantidad real', () => {
  it('un batido de 60 g calcula los nutrientes de la ración', async () => {
    const r = await call('POST', '/api/diary/entries', { date: DAY, type: 'BREAKFAST', kind: 'product', id: prozisId, units: 1 });
    expect(r.statusCode).toBe(201);
    expect(r.json().grams).toBe(60);
    expect(r.json().nutrients).toMatchObject({ kcal: 230, protein: 25.2, carbs: 19.8, fat: 5.4, salt: 0.6 });
  });
  it('cantidad personalizada (45 g) no usa la ración', async () => {
    const r = await call('POST', '/api/diary/entries', { date: DAY, type: 'SNACKS', kind: 'product', id: prozisId, grams: 45 });
    expect(r.json().nutrients).toMatchObject({ kcal: 173, protein: 18.9 });
  });
  it('dos batidos: dentro del límite; tres: avisa del máximo del fabricante', async () => {
    await call('POST', '/api/diary/entries', { date: '2026-11-05', type: 'BREAKFAST', kind: 'product', id: prozisId, units: 2 });
    let d = (await call('GET', '/api/diary?date=2026-11-05')).json();
    expect(d.productAlerts[0]).toMatchObject({ servings: 2, level: 'ok' });
    await call('POST', '/api/diary/entries', { date: '2026-11-05', type: 'LUNCH', kind: 'product', id: prozisId, units: 1 });
    d = (await call('GET', '/api/diary?date=2026-11-05')).json();
    expect(d.productAlerts[0].level).toBe('warn');
    expect(d.productAlerts[0].messages.join(' ')).toMatch(/máximo 2/);
  });
  it('exige gramos o unidades, no ambos ni ninguno', async () => {
    expect((await call('POST', '/api/diary/entries', { date: DAY, type: 'LUNCH', kind: 'product', id: prozisId })).statusCode).toBe(400);
    expect((await call('POST', '/api/diary/entries', { date: DAY, type: 'LUNCH', kind: 'product', id: prozisId, grams: 10, units: 1 })).statusCode).toBe(400);
  });
});

describe('alimentos propios', () => {
  it('rechaza valores nutricionales incoherentes', async () => {
    const r = await call('POST', '/api/foods', { name: 'Imposible', per100: { kcal: 100, protein: 60, carbs: 60, fat: 0 } });
    expect(r.statusCode).toBe(400);
  });
  it('crea un alimento con unidad y registra 2 unidades', async () => {
    const f = await call('POST', '/api/foods', { name: 'Huevo M', per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, satFat: 3.1 }, unitName: 'unidad', unitGrams: 58 });
    expect(f.statusCode).toBe(201);
    const e = await call('POST', '/api/diary/entries', { date: DAY, type: 'BREAKFAST', kind: 'food', id: f.json().id, units: 2 });
    expect(e.json().grams).toBe(116);
    expect(e.json().nutrients.protein).toBe(14.6);
  });
  it('un alimento sin tamaño de unidad no admite unidades', async () => {
    const f = await call('POST', '/api/foods', { name: 'Arroz cocido', per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } });
    const e = await call('POST', '/api/diary/entries', { date: DAY, type: 'LUNCH', kind: 'food', id: f.json().id, units: 1 });
    expect(e.statusCode).toBe(422);
  });
});

describe('códigos de barras / Open Food Facts', () => {
  it('encuentra el producto y usa SIEMPRE los valores por 100 g, no por ración', async () => {
    const r = (await call('GET', '/api/foods/barcode/5000000000017')).json();
    expect(r.status).toBe('found');
    expect(r.item.id).toBeNull();
    expect(r.item.brand).toBe('MarcaX');
    expect(r.item.per100.kcal).toBe(450);
    expect(r.item.servingG).toBe(40);
    expect(r.item.missing).toEqual(['fiber']);
  });
  it('datos incompletos no se inventan', async () => {
    expect((await call('GET', '/api/foods/barcode/5000000000024')).json().status).toBe('incomplete');
  });
  it('producto inexistente permite crearlo y luego se encuentra en local', async () => {
    expect((await call('GET', '/api/foods/barcode/5000000000099')).json().status).toBe('not_found');
    const c = await call('POST', '/api/foods', { name: 'Mi galleta', barcode: '5000000000099', per100: { kcal: 480, protein: 6, carbs: 70, fat: 20 }, servingG: 25 });
    expect(c.statusCode).toBe(201);
    expect((await call('POST', '/api/foods', { name: 'dup', barcode: '5000000000099', per100: { kcal: 1, protein: 0, carbs: 0, fat: 0 } })).statusCode).toBe(409);
    const again = (await call('GET', '/api/foods/barcode/5000000000099')).json();
    expect(again).toMatchObject({ status: 'found', origin: 'local' });
  });
  it('código de barras inválido es rechazado', async () => {
    expect((await call('GET', '/api/foods/barcode/abc')).statusCode).toBe(400);
  });
});

describe('diario', () => {
  it('suma totales, calcula restantes y copia comidas', async () => {
    const d = (await call('GET', `/api/diary?date=${DAY}`)).json();
    expect(d.totals.kcal).toBeGreaterThan(400);
    expect(d.remaining.kcal).toBe(Math.round((2000 - d.totals.kcal) * 10) / 10);
    expect(d.targets.carbs).toBe(204);
    const c = await call('POST', '/api/diary/copy', { fromDate: DAY, toDate: '2026-11-06', type: 'BREAKFAST' });
    expect(c.json().copied).toBeGreaterThan(0);
    expect((await call('GET', '/api/diary?date=2026-11-06')).json().totals.kcal).toBeGreaterThan(0);
  });
  it('editar gramos reescala y borrar actualiza el total', async () => {
    const d = (await call('GET', '/api/diary?date=2026-11-06')).json();
    const e = d.meals.find((m: { type: string }) => m.type === 'BREAKFAST').entries[0];
    await call('PATCH', `/api/diary/entries/${e.id}`, { grams: e.grams * 2 });
    const d2 = (await call('GET', '/api/diary?date=2026-11-06')).json();
    expect(d2.meals[0].entries[0].nutrients.kcal).toBeCloseTo(e.nutrients.kcal * 2, -1);
    await call('DELETE', `/api/diary/entries/${e.id}`);
  });
  it('otro usuario no puede ver ni borrar tus datos', async () => {
    const d = (await call('GET', `/api/diary?date=${DAY}`)).json();
    const id = d.meals.flatMap((m: { entries: { id: string }[] }) => m.entries)[0].id;
    expect((await call('DELETE', `/api/diary/entries/${id}`, undefined, otherAuth)).statusCode).toBe(404);
    expect((await call('GET', `/api/diary?date=${DAY}`, undefined, otherAuth)).json().totals.kcal).toBe(0);
    expect((await call('POST', '/api/diary/entries', { date: DAY, type: 'LUNCH', kind: 'product', id: prozisId, grams: 10 }, otherAuth)).statusCode).toBe(404);
  });
  it('agua: suma y deshace', async () => {
    await call('POST', '/api/diary/water', { date: DAY, ml: 500 });
    await call('POST', '/api/diary/water', { date: DAY, ml: 250 });
    expect((await call('GET', `/api/diary?date=${DAY}`)).json().waterMl).toBe(750);
    await call('DELETE', `/api/diary/water/last?date=${DAY}`);
    expect((await call('GET', `/api/diary?date=${DAY}`)).json().waterMl).toBe(500);
  });
});

describe('peso y panel', () => {
  it('sin pesajes no inventa el peso actual ni los kilos perdidos', async () => {
    const d = (await call('GET', `/api/dashboard?date=${DAY}`)).json();
    expect(d.weight).toMatchObject({ currentKg: null, lostKg: null, progressPct: null, startKg: 112, goalKg: 90 });
    expect(d.activity).toBeNull();
    expect(d.sleep).toBeNull();
  });
  it('registra pesos, calcula media de 7 días, progreso y no afirma pérdida de grasa', async () => {
    for (const [date, w] of [['2026-10-29', 111.4], ['2026-11-01', 110.8], ['2026-11-04', 110.2]] as const)
      expect((await call('POST', '/api/weight', { date, weightKg: w })).statusCode).toBe(201);
    expect((await call('POST', '/api/weight', { date: '2026-11-04', weightKg: 110 })).json().updated).toBe(true);
    const s = (await call('GET', '/api/weight?days=365')).json().series;
    expect(s).toHaveLength(3);
    expect(s[2]).toMatchObject({ weightKg: 110, avg7: 110.73 });
    const d = (await call('GET', `/api/dashboard?date=${DAY}`)).json();
    expect(d.weight).toMatchObject({ currentKg: 110, lostKg: 2, remainingKg: 20, progressPct: 9.1, bodyFatPct: null });
    expect(d.weight.note).toMatch(/no se puede afirmar/);
    expect(d.history.length).toBeGreaterThan(0);
  });
  it('valida pesos imposibles y guarda medidas', async () => {
    expect((await call('POST', '/api/weight', { date: DAY, weightKg: 5 })).statusCode).toBe(400);
    expect((await call('POST', '/api/weight/measurements', { date: DAY })).statusCode).toBe(400);
    expect((await call('POST', '/api/weight/measurements', { date: DAY, waistCm: 108 })).statusCode).toBe(201);
    expect((await call('GET', '/api/weight/measurements')).json().items[0].waistCm).toBe(108);
  });
});
