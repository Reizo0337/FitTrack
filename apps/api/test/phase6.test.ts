import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';
import { createUser } from '../src/users';

const baseEnv = { ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL! } as NodeJS.ProcessEnv;
const env = loadEnv(baseEnv);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
let sentBodies: string[] = [];
let plateIsFood = true;
const anthropicReply = (o: unknown) => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(o) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
const fake = (async (_u: string, init: RequestInit) => {
  sentBodies.push(String(init.body));
  const body = String(init.body);
  if (body.includes('Examina la imagen adjunta')) return anthropicReply(plateIsFood ? { isFood: true, dish: 'Puré de patata', questions: [{ id: 'q1', question: '¿Tamaño de la ración?', options: ['Pequeña', 'Normal'] }] } : { isFood: false, reason: 'es un gato', questions: [] });
  if (body.includes('Analiza el plato')) return anthropicReply({ isFood: true, items: [{ name: 'Puré de patata', grams: 250, kcal: 220, protein: 5, carbs: 35, fat: 7 }] });
  if (body.includes('"type":"image"')) return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ items: [{ name: 'yogur natural', quantity: '4 uds' }, { name: 'tomates', quantity: null }], notes: null }) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ options: [{ title: 'Tortilla', category: 'facil', ingredients: [{ name: 'Huevos', grams: 120 }], kcal: 300, protein: 25, carbs: 2, fat: 20, fiber: 0, steps: [] }] }) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
}) as unknown as typeof fetch;

let app: Awaited<ReturnType<typeof buildApp>>;
let auth: Record<string, string>;
const PASS = 'una-contraseña-larga-61';
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = auth) => app.inject({ method, url, payload: payload as object, headers });
const login = async (email: string, pw: string, a = app) => {
  const r = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: pw }, remoteAddress: `10.6.0.${Math.floor(Math.random() * 250)}` });
  return { r, headers: { authorization: `Bearer ${r.json().accessToken}` } as Record<string, string> };
};
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const DAY = '2026-11-04';

beforeAll(async () => {
  app = await buildApp(env, prisma, { fetch: fake });
  await createUser(prisma, { email: 'fase6@example.com', password: PASS });
  auth = (await login('fase6@example.com', PASS)).headers;
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('exportar datos', () => {
  it('incluye tus datos y NUNCA hashes, tokens ni claves', async () => {
    await call('POST', '/api/weight', { date: DAY, weightKg: 110 });
    await call('PUT', '/api/ai/keys', { provider: 'ANTHROPIC', apiKey: 'sk-ant-clave-de-prueba-exportar' });
    await call('POST', '/api/health/tokens', { label: 'tel' });
    const r = await call('GET', '/api/account/export');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/fittrack-export-\d{4}-\d{2}-\d{2}\.json/);
    expect(r.headers['cache-control']).toBe('no-store');
    const j = r.json();
    expect(j.account.email).toBe('fase6@example.com');
    expect(j.weights).toHaveLength(1);
    expect(j.products.some((p: { name: string }) => p.name.includes('Prozis'))).toBe(true);
    expect(r.body).not.toMatch(/passwordHash|encryptedKey|tokenHash|sk-ant-clave/);
  });
});

describe('contraseña', () => {
  it('valida la actual y la longitud de la nueva', async () => {
    expect((await call('POST', '/api/account/password', { current: 'incorrecta-incorrecta', next: 'otra-contraseña-larga-1' })).statusCode).toBe(403);
    expect((await call('POST', '/api/account/password', { current: PASS, next: 'corta' })).statusCode).toBe(400);
  });
  it('al cambiarla, la antigua deja de valer y se cierran las demás sesiones', async () => {
    const second = await login('fase6@example.com', PASS);
    const cookie = second.r.cookies.find((c) => c.name === 'ft_refresh')!.value;
    expect((await call('POST', '/api/account/password', { current: PASS, next: 'nueva-contraseña-larga-62' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { ft_refresh: cookie } })).statusCode).toBe(401);
    expect((await login('fase6@example.com', PASS)).r.statusCode).toBe(401);
    const ok = await login('fase6@example.com', 'nueva-contraseña-larga-62');
    expect(ok.r.statusCode).toBe(200);
    auth = ok.headers;
  });
});

describe('fotos de progreso privadas', () => {
  let id = '';
  it('acepta imágenes reales, comprueba los bytes y rechaza lo demás', async () => {
    const ok = await call('POST', '/api/photos', { date: DAY, note: 'Inicio', imageBase64: jpeg.toString('base64') });
    expect(ok.statusCode).toBe(201);
    id = ok.json().id;
    const fake1 = await call('POST', '/api/photos', { date: DAY, imageBase64: Buffer.from('<html><script>alert(1)</script>'.repeat(10)).toString('base64') });
    expect(fake1.statusCode).toBe(415);
    const huge = await call('POST', '/api/photos', { date: DAY, imageBase64: Buffer.concat([jpeg, Buffer.alloc(3_100_000)]).toString('base64') });
    expect([413, 400]).toContain(huge.statusCode);
  });
  it('solo se sirve con URL firmada y temporal; la firma no se puede manipular', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/photos/${id}/file` })).statusCode).toBe(400);
    const { url } = (await call('GET', `/api/photos/${id}/url`)).json();
    const file = await app.inject({ method: 'GET', url }); // sin cabecera Authorization, como un <img>
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.rawPayload.length).toBe(jpeg.length);
    const tampered = url.replace(/exp=(\d+)/, (_m: string, n: string) => `exp=${Number(n) + 3600}`);
    expect((await app.inject({ method: 'GET', url: tampered })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: url.replace(/sig=.*/, 'sig=falsa') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: url.replace(/exp=\d+/, 'exp=1') })).statusCode).toBe(404);
  });
  it('otro usuario no puede pedir la URL ni borrarla', async () => {
    await createUser(prisma, { email: 'otro6@example.com', password: 'una-contraseña-larga-63' });
    const other = (await login('otro6@example.com', 'una-contraseña-larga-63')).headers;
    expect((await call('GET', `/api/photos/${id}/url`, undefined, other)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/photos/${id}`, undefined, other)).statusCode).toBe(404);
    expect((await call('GET', '/api/photos', undefined, other)).json().items).toHaveLength(0);
  });
  it('se puede borrar', async () => {
    expect((await call('DELETE', `/api/photos/${id}`)).statusCode).toBe(200);
    expect((await call('GET', '/api/photos')).json().items).toHaveLength(0);
  });
});

describe('metas, rachas e hitos', () => {
  it('crea metas por defecto y calcula cumplimiento y rachas con datos reales', async () => {
    const tokenRes = await call('POST', '/api/health/tokens', { label: 'metas' });
    const ing = { authorization: `Bearer ${tokenRes.json().token}` };
    await call('POST', '/api/health/ingest', { days: [{ date: '2026-11-01', steps: 9000 }, { date: '2026-11-02', steps: 8500 }, { date: '2026-11-03', steps: 4000 }, { date: '2026-11-04', steps: 8200 }] }, ing);
    const g = (await call('GET', `/api/goals?date=${DAY}`)).json();
    expect(g.goals.map((x: { kind: string }) => x.kind)).toEqual(['STEPS', 'PROTEIN', 'WATER', 'SLEEP', 'LOG_MEALS', 'WORKOUTS']);
    const steps = g.goals.find((x: { kind: string }) => x.kind === 'STEPS');
    expect(steps).toMatchObject({ target: 8000, today: { value: 8200, met: true }, streak: 1, bestStreak: 2 });
    expect(steps.compliance30).toBe(75); // 3 de 4 días con dato
    expect(g.goals.find((x: { kind: string }) => x.kind === 'PROTEIN').today.met).toBeNull(); // sin registro: sin dato, no «fallo»
    expect(g.goals.find((x: { kind: string }) => x.kind === 'WORKOUTS').active).toBe(false);
    expect(g.summary.message).not.toMatch(/fallaste|culpa/i);
    expect(g.milestones.lostKg).toBe(2);
    expect(g.milestones.marks[0]).toEqual({ kg: 110, reached: true });
  });
  it('permite ajustar y desactivar metas', async () => {
    expect((await call('PUT', '/api/goals', { items: [{ kind: 'STEPS', target: 10000, active: true }, { kind: 'WORKOUTS', target: 2, active: true }] })).statusCode).toBe(200);
    const g = (await call('GET', `/api/goals?date=${DAY}`)).json();
    expect(g.goals.find((x: { kind: string }) => x.kind === 'STEPS')).toMatchObject({ target: 10000, today: { met: false } });
    expect((await call('PUT', '/api/goals', { items: [{ kind: 'STEPS', target: 0, active: true }] })).statusCode).toBe(400);
  });
});

describe('despensa y lista de la compra', () => {
  it('evita duplicados por nombre normalizado', async () => {
    await call('POST', '/api/pantry', { name: 'Huevos' });
    await call('POST', '/api/pantry', { name: 'huevos' });
    await call('POST', '/api/pantry', { name: 'Arroz' });
    expect((await call('GET', '/api/pantry')).json().items).toHaveLength(2);
  });
  it('genera la lista desde el último menú, suma cantidades y marca lo que ya tienes', async () => {
    const meal = (title: string, ing: { name: string; grams: number }[]) => ({ type: 'LUNCH', title, ingredients: ing, kcal: 500, protein: 30, carbs: 40, fat: 15, fiber: 5 });
    const days = Array.from({ length: 7 }, (_, i) => ({ day: `D${i}`, meals: [meal('a', [{ name: 'Pechuga de pollo', grams: 150 }, { name: 'Arroz', grams: 80 }]), meal('b', [{ name: 'huevos', grams: 120 }]), meal('c', [{ name: 'Pechuga de POLLO', grams: 50 }])] }));
    const user = await prisma.user.findFirstOrThrow({ where: { email: 'fase6@example.com' } });
    await prisma.weeklyMenu.create({ data: { userId: user.id, menu: { days }, warnings: [] } });
    const s = (await call('GET', '/api/pantry/shopping')).json();
    const by = Object.fromEntries(s.items.map((i: { name: string; grams: number; inPantry: boolean }) => [i.name.toLowerCase(), i]));
    expect(by['pechuga de pollo']).toMatchObject({ grams: 1400, inPantry: false });
    expect(by['arroz']).toMatchObject({ grams: 560, inPantry: true });
    expect(by['huevos']).toMatchObject({ grams: 840, inPantry: true });
  });
  it('las recomendaciones usan la despensa cuando no indicas alimentos', async () => {
    await call('PUT', '/api/profile', { aiConsent: true });
    sentBodies = [];
    const r = await call('POST', '/api/ai/recommend', { date: DAY });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(sentBodies[0]!).messages[0].content).toContain('"alimentosDisponibles":["Arroz","Huevos"]');
  });
});

describe('foto del plato', () => {
  const image = { mime: 'image/jpeg', data: jpeg.toString('base64').padEnd(200, 'A') };
  it('comprueba que es comida y devuelve preguntas; con otra cosa da error NOT_FOOD', async () => {
    plateIsFood = true;
    const ok = await call('POST', '/api/ai/plate/inspect', { image });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().questions).toHaveLength(1);
    plateIsFood = false;
    const no = await call('POST', '/api/ai/plate/inspect', { image });
    expect(no.statusCode).toBe(422);
    expect(no.json().error).toBe('NOT_FOOD');
    plateIsFood = true;
  });
  it('estima el plato con las respuestas del usuario', async () => {
    sentBodies = [];
    const r = await call('POST', '/api/ai/plate/analyze', { image, answers: [{ question: '¿Tamaño?', answer: 'Normal' }] });
    expect(r.statusCode).toBe(200);
    expect(r.json().isEstimate).toBe(true);
    expect(r.json().items[0].name).toBe('Puré de patata');
    expect(sentBodies[0]).toContain('Normal');
  });
});

describe('despensa por foto', () => {
  it('envía la imagen al modelo, devuelve los alimentos y permite añadirlos en bloque sin duplicar', async () => {
    sentBodies = [];
    const data = jpeg.toString('base64').padEnd(200, 'A');
    const r = await call('POST', '/api/ai/pantry/scan', { images: [{ mime: 'image/jpeg', data }] });
    expect(r.statusCode).toBe(200);
    expect(r.json().items.map((i: { name: string }) => i.name)).toEqual(['yogur natural', 'tomates']);
    expect(sentBodies[0]).toContain('"media_type":"image/jpeg"');
    expect((await call('POST', '/api/ai/pantry/scan', { images: [] })).statusCode).toBe(400);
    expect((await call('POST', '/api/pantry/bulk', { names: ['Yogur natural', 'tomates', 'TOMATES', 'Arroz'] })).json()).toEqual({ added: 2 });
    expect((await call('GET', '/api/pantry')).json().items).toHaveLength(4);
  });
  it('la recomendación recibe el tipo de comida', async () => {
    sentBodies = [];
    await call('POST', '/api/ai/recommend', { date: DAY, meal: 'DINNER' });
    expect(JSON.parse(sentBodies[0]!).messages[0].content).toContain('"tipoComida":"DINNER"');
  });
});

describe('seguridad', () => {
  it('rechaza peticiones de sesión desde otro origen y acepta el propio', async () => {
    const evil = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { origin: 'https://evil.example' } });
    expect(evil.statusCode).toBe(403);
    expect(evil.json().error).toBe('BAD_ORIGIN');
    const own = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { origin: 'http://localhost:5173' } });
    expect(own.statusCode).toBe(401); // pasa el filtro de origen; falla por no haber cookie
    const same = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { origin: 'http://miapp.local', host: 'miapp.local' } });
    expect(same.statusCode).toBe(401);
  });
  it('cookie de sesión HttpOnly y SameSite=Lax; cabeceras de seguridad y CSP', async () => {
    const { r } = await login('fase6@example.com', 'nueva-contraseña-larga-62');
    const c = r.cookies.find((x) => x.name === 'ft_refresh')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Lax');
    const h = await app.inject({ method: 'GET', url: '/api/health' });
    expect(h.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(h.headers['content-security-policy']).toMatch(/object-src 'none'/);
    expect(h.headers['x-content-type-options']).toBe('nosniff');
  });
  it('límite global de peticiones por IP', async () => {
    const limited = await buildApp(loadEnv({ ...baseEnv, RATE_LIMIT_MAX: '10' } as NodeJS.ProcessEnv), prisma);
    const codes: number[] = [];
    for (let i = 0; i < 13; i++) codes.push((await limited.inject({ method: 'GET', url: '/api/health', remoteAddress: '10.8.8.8' })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429, 429]);
    await limited.close();
  });
});

describe('configuración', () => {
  it('las variables opcionales vacías del .env.example no rompen el arranque', () => {
    const e = loadEnv({ ...baseEnv, CRON_SECRET: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', STATIC_DIR: '', RATE_LIMIT_MAX: '' } as NodeJS.ProcessEnv);
    expect(e.CRON_SECRET).toBeUndefined();
    expect(e.STATIC_DIR).toBeUndefined();
  });
  it('rechaza claves maestras mal formadas', () => {
    expect(() => loadEnv({ ...baseEnv, MASTER_KEY: 'corta' } as NodeJS.ProcessEnv)).toThrow(/MASTER_KEY/);
  });
});

describe('web servida desde el mismo origen', () => {
  it('sirve la SPA, el fallback de rutas y deja las rutas /api con JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ft-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>FitTrack</title><div id="root"></div>');
    writeFileSync(join(dir, 'assets', 'app-abc.js'), 'console.log(1)');
    const web = await buildApp(loadEnv({ ...baseEnv, STATIC_DIR: dir } as NodeJS.ProcessEnv), prisma);
    const root = await web.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('FitTrack');
    expect(root.headers['cache-control']).toBe('no-cache');
    expect((await web.inject({ method: 'GET', url: '/food' })).body).toContain('FitTrack'); // ruta de la SPA
    const asset = await web.inject({ method: 'GET', url: '/assets/app-abc.js' });
    expect(asset.headers['cache-control']).toMatch(/immutable/);
    const missing = await web.inject({ method: 'GET', url: '/api/no-existe' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'NOT_FOUND' });
    await web.close();
  });
});

describe('borrar todos los datos', () => {
  it('exige contraseña y confirmación explícita', async () => {
    expect((await call('DELETE', '/api/account', { password: 'mal-mal-mal-mal', confirm: 'BORRAR TODO' })).statusCode).toBe(403);
    expect((await call('DELETE', '/api/account', { password: 'nueva-contraseña-larga-62', confirm: 'si' })).statusCode).toBe(400);
  });
  it('elimina la cuenta y todo lo asociado, sin dejar rastro', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { email: 'fase6@example.com' } });
    const uid = user.id;
    await call('POST', '/api/photos', { date: DAY, imageBase64: jpeg.toString('base64') });
    const before = await Promise.all([prisma.mealEntry.count(), prisma.weightEntry.count({ where: { userId: uid } }), prisma.progressPhoto.count({ where: { userId: uid } })]);
    expect(before[1]).toBeGreaterThan(0);
    const r = await call('DELETE', '/api/account', { password: 'nueva-contraseña-larga-62', confirm: 'BORRAR TODO' });
    expect(r.statusCode).toBe(200);
    const w = { where: { userId: uid } };
    const counts = await Promise.all([
      prisma.user.count({ where: { id: uid } }), prisma.userProfile.count(w), prisma.weightEntry.count(w), prisma.foodProduct.count(w), prisma.food.count(w), prisma.meal.count(w),
      prisma.dailyNutrition.count(w), prisma.activityRecord.count(w), prisma.sleepRecord.count(w), prisma.progressPhoto.count(w), prisma.aIProviderKey.count(w), prisma.aIConversation.count(w),
      prisma.weeklyMenu.count(w), prisma.pantryItem.count(w), prisma.goal.count(w), prisma.ingestToken.count(w), prisma.refreshToken.count(w), prisma.healthSyncRecord.count(w), prisma.aIUsage.count(w), prisma.aICache.count(w),
    ]);
    expect(counts.every((n) => n === 0)).toBe(true);
    expect((await login('fase6@example.com', 'nueva-contraseña-larga-62')).r.statusCode).toBe(401);
    expect((await call('GET', '/api/profile')).statusCode).toBe(404); // el token sigue firmado pero el perfil ya no existe
  });
});
