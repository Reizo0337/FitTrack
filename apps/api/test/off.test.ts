import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';
import { createUser } from '../src/users';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL! } as NodeJS.ProcessEnv);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

// Respuestas simuladas de Open Food Facts; `mode` decide cuál de los dos buscadores falla.
let mode: 'ok' | 'modern-down' | 'all-down' | 'timeout' | 'modern-empty-classic-down' = 'ok';
const urls: string[] = [];
const modernHit = { code: '7501020542134', product_name: 'Leche en polvo', brands: ['Nutri leche'], nutriments: { 'energy-kj_100g': 2048, proteins_100g: 15, carbohydrates_100g: 55.4, fat_100g: 23, 'saturated-fat_100g': 11, sugars_100g: 33.4, salt_100g: 0.97 } };
const classicHit = { code: '111', product_name: 'Leche clásica', brands: 'MarcaA, MarcaB', nutriments: { 'energy-kcal_100g': 46, proteins_100g: 3.2, carbohydrates_100g: 4.8, fat_100g: 1.6 } };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

const fake = (async (url: string, init?: RequestInit) => {
  const u = String(url);
  urls.push(u);
  expect((init?.headers as Record<string, string>)['user-agent']).toMatch(/FitTrack/); // User-Agent identificable
  if (mode === 'timeout') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  if (u.includes('search.openfoodfacts.org')) return mode === 'ok' ? json({ hits: [modernHit, { code: '2', product_name: 'Incompleto', nutriments: {} }] }) : mode === 'modern-empty-classic-down' ? json({ hits: [] }) : json({}, 503);
  if (u.includes('cgi/search.pl')) return mode === 'all-down' || mode === 'modern-empty-classic-down' ? json({}, 503) : json({ products: [classicHit] });
  return json({ status: 0 }, 404);
}) as unknown as typeof fetch;

let app: Awaited<ReturnType<typeof buildApp>>;
let auth: Record<string, string>;
const search = (q: string) => app.inject({ method: 'GET', url: `/api/foods/off/search?q=${q}`, headers: auth, remoteAddress: `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

beforeAll(async () => {
  app = await buildApp(env, prisma, { fetch: fake });
  await createUser(prisma, { email: 'off@example.com', password: 'una-contraseña-larga-off' });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'off@example.com', password: 'una-contraseña-larga-off' }, remoteAddress: '10.7.0.1' });
  auth = { authorization: `Bearer ${r.json().accessToken}` };
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('búsqueda en Open Food Facts', () => {
  it('usa el buscador moderno, convierte kJ a kcal, acepta marcas en lista y descarta productos incompletos', async () => {
    mode = 'ok'; urls.length = 0;
    const r = await search('leche');
    expect(r.statusCode).toBe(200);
    const items = r.json().items;
    expect(items).toHaveLength(1); // el incompleto no se inventa
    expect(items[0]).toMatchObject({ name: 'Leche en polvo', brand: 'Nutri leche', source: 'OPEN_FOOD_FACTS' });
    expect(items[0].per100.kcal).toBe(489); // 2048 kJ / 4,184
    expect(items[0].missing).toEqual(['fiber']);
    expect(urls.every((u) => !u.includes('cgi/search.pl'))).toBe(true);
  });
  it('si el buscador moderno falla, usa el clásico', async () => {
    mode = 'modern-down'; urls.length = 0;
    const r = await search('leche');
    expect(r.statusCode).toBe(200);
    expect(r.json().items[0]).toMatchObject({ name: 'Leche clásica', brand: 'MarcaA' });
    expect(urls.some((u) => u.includes('search.openfoodfacts.org'))).toBe(true);
    expect(urls.some((u) => u.includes('cgi/search.pl'))).toBe(true);
  });
  it('reintenta una vez ante un 503 antes de rendirse', async () => {
    mode = 'modern-down'; urls.length = 0;
    await search('leche');
    expect(urls.filter((u) => u.includes('search.openfoodfacts.org'))).toHaveLength(2);
  });
  it('si fallan los dos devuelve OFF_UNAVAILABLE (no un error genérico)', async () => {
    mode = 'all-down';
    const r = await search('leche');
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toBe('OFF_UNAVAILABLE');
  });
  it('si un buscador responde sin resultados y el otro falla, es «sin resultados», no «no disponible»', async () => {
    mode = 'modern-empty-classic-down';
    const r = await search('xqzwvk');
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toEqual([]);
  });
  it('un tiempo de espera agotado también se trata como no disponible', async () => {
    mode = 'timeout';
    expect((await search('leche')).statusCode).toBe(502);
  });
});
