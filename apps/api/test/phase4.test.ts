import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';
import type { PushPayload } from '../src/modules/reminders/service';
import { createUser } from '../src/users';

const CRON = 'cron-secret-con-al-menos-24-caracteres';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL!, CRON_SECRET: CRON } as NodeJS.ProcessEnv);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const pushed: PushPayload[] = [];
let app: Awaited<ReturnType<typeof buildApp>>;
let auth: Record<string, string>;
let ingestToken = '';
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = auth) =>
  app.inject({ method, url, payload: payload as object, headers });
const ingest = (body: unknown, token = ingestToken) => call('POST', '/api/health/ingest', body, { authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await buildApp(env, prisma, { pushSender: async (_s, p) => { pushed.push(p); return 'ok'; } });
  await createUser(prisma, { email: 'fase4@example.com', password: 'una-contraseña-larga-4' });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'fase4@example.com', password: 'una-contraseña-larga-4' }, remoteAddress: '10.4.0.1' });
  auth = { authorization: `Bearer ${r.json().accessToken}` };
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('token de ingesta y Apple Health (Atajos)', () => {
  it('rechaza sin token o con token inválido', async () => {
    expect((await ingest({ days: [{ date: '2026-11-03', steps: 1 }] }, 'ftk_inventado')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/health/ingest', payload: {} })).statusCode).toBe(401);
  });
  it('crea un token que se muestra una vez y no se lista en claro', async () => {
    const c = await call('POST', '/api/health/tokens', { label: 'iPhone' });
    expect(c.statusCode).toBe(201);
    ingestToken = c.json().token;
    expect(ingestToken).toMatch(/^ftk_/);
    const list = await call('GET', '/api/health/tokens');
    expect(JSON.stringify(list.json())).not.toContain(ingestToken);
    expect((await prisma.ingestToken.findFirstOrThrow()).tokenHash).not.toBe(ingestToken);
  });
  it('el token de ingesta solo sirve para importar, no para leer datos', async () => {
    expect((await call('GET', '/api/profile', undefined, { authorization: `Bearer ${ingestToken}` })).statusCode).toBe(401);
  });
  it('importa actividad, sueño, peso y entrenos; y es idempotente', async () => {
    const body = {
      days: [{ date: '2026-11-03', steps: 8421, activeKcal: 410, restingKcal: 1950, distanceKm: 6.1, exerciseMin: 38 }],
      sleep: [{ date: '2026-11-03', sleepAt: '2026-11-02T22:45:00Z', wakeAt: '2026-11-03T06:15:00Z', awakenings: 2 }],
      weights: [{ date: '2026-11-03', weightKg: 110.4 }],
      workouts: [{ externalId: 'W-1', startedAt: '2026-11-03T17:00:00Z', type: 'Caminata', durationMin: 45, activeKcal: 200 }],
    };
    const a = await ingest(body);
    expect(a.json()).toEqual({ applied: 4, skipped: 0 });
    expect((await ingest(body)).json()).toEqual({ applied: 0, skipped: 4 });
    expect(await prisma.activityRecord.count({ where: { source: 'HEALTH' } })).toBe(1);
    expect(await prisma.workout.count()).toBe(1);
    const sleep = await prisma.sleepRecord.findFirstOrThrow({ where: { source: 'HEALTH' } });
    expect(sleep.totalMin).toBe(450);
  });
  it('un dato modificado se actualiza sin duplicar y los campos ausentes no se ponen a 0', async () => {
    const r = await ingest({ days: [{ date: '2026-11-03', steps: 9000 }] });
    expect(r.json().applied).toBe(1);
    const rec = await prisma.activityRecord.findFirstOrThrow({ where: { source: 'HEALTH' } });
    expect([rec.steps, rec.activeKcal, rec.restingKcal]).toEqual([9000, 410, 1950]);
    expect(await prisma.activityRecord.count({ where: { source: 'HEALTH' } })).toBe(1);
  });
  it('valida datos imposibles y cuerpos vacíos', async () => {
    expect((await ingest({ days: [{ date: '2026-11-03', steps: -5 }] })).statusCode).toBe(400);
    expect((await ingest({})).statusCode).toBe(400);
  });
  it('el peso importado aparece en la serie de peso', async () => {
    const s = (await call('GET', '/api/weight?days=365')).json().series;
    expect(s.find((p: { date: string }) => p.date === '2026-11-03').weightKg).toBe(110.4);
  });
  it('un token revocado deja de funcionar', async () => {
    const c = await call('POST', '/api/health/tokens', { label: 'temporal' });
    const id = c.json().id;
    await call('DELETE', `/api/health/tokens/${id}`);
    expect((await ingest({ days: [{ date: '2026-11-03', steps: 1 }] }, c.json().token)).statusCode).toBe(401);
  });
});

describe('actividad: sin doble conteo', () => {
  it('Health y manual el mismo día no se suman: gana Health', async () => {
    await call('POST', '/api/activity/activity', { date: '2026-11-03', steps: 3000, exerciseMin: 20 });
    const o = (await call('GET', '/api/activity/overview?date=2026-11-04&days=7')).json();
    const d = o.days.find((x: { date: string }) => x.date === '2026-11-03');
    expect(d.steps).toBe(9000); // no 12000
    expect(d.exerciseMin).toBe(38); // Health tiene prioridad
    expect(d.expenditure).toEqual({ kcal: 2360, source: 'HEALTH' }); // reposo 1950 + activa 410
  });
  it('sin energía en reposo el gasto se marca como estimación; sin datos activos no hay gasto', async () => {
    await call('POST', '/api/activity/activity', { date: '2026-11-02', activeKcal: 300 });
    const o = (await call('GET', '/api/activity/overview?date=2026-11-04&days=7')).json();
    const d2 = o.days.find((x: { date: string }) => x.date === '2026-11-02');
    expect(d2.expenditure.source).toBe('ESTIMATE');
    expect(d2.expenditure.kcal).toBeGreaterThan(2000);
    expect(o.days.find((x: { date: string }) => x.date === '2026-11-01').expenditure).toBeNull();
    expect(o.days.find((x: { date: string }) => x.date === '2026-11-01').steps).toBeNull();
  });
});

describe('sueño', () => {
  it('registro manual calcula la duración y valida horas incoherentes', async () => {
    const ok = await call('POST', '/api/activity/sleep', { date: '2026-11-04', sleepAt: '2026-11-03T23:00:00Z', wakeAt: '2026-11-04T06:30:00Z', quality: 4 });
    expect(ok.json().totalMin).toBe(450);
    const bad = await call('POST', '/api/activity/sleep', { date: '2026-11-04', sleepAt: '2026-11-04T07:00:00Z', wakeAt: '2026-11-04T06:00:00Z' });
    expect(bad.statusCode).toBe(400);
    expect((await call('POST', '/api/activity/sleep', { date: '2026-11-04' })).statusCode).toBe(400);
  });
  it('estadísticas: media, regularidad y relaciones solo con datos suficientes', async () => {
    let o = (await call('GET', '/api/activity/overview?date=2026-11-04&days=14')).json();
    expect(o.sleepStats.nights).toBe(2);
    expect(o.sleepStats.avgHours7).toBe(7.5);
    expect(o.relations.sleepVsSteps.r).toBeNull(); // < 7 pares: no se inventa
    for (let i = 0; i < 8; i++) {
      const day = `2026-10-${String(20 + i).padStart(2, '0')}`;
      await call('POST', '/api/activity/sleep', { date: day, totalMin: 360 + i * 20 });
      await call('POST', '/api/activity/activity', { date: day, steps: 5000 + i * 700 });
    }
    o = (await call('GET', '/api/activity/overview?date=2026-11-04&days=30')).json();
    expect(o.relations.sleepVsSteps.n).toBeGreaterThanOrEqual(8);
    expect(o.relations.sleepVsSteps.r).toBeGreaterThan(0.9);
    expect(o.relations.note).toMatch(/no demuestra causa/);
  });
  it('el panel usa Health antes que lo manual', async () => {
    const d = (await call('GET', '/api/dashboard?date=2026-11-03')).json();
    expect(d.activity).toMatchObject({ steps: 9000, source: 'HEALTH' });
    expect(d.sleep).toMatchObject({ totalMin: 450, source: 'HEALTH' });
  });
});

describe('recordatorios y notificaciones', () => {
  const NOW = new Date('2026-11-10T07:10:00Z'); // martes 08:10 en Madrid (CET)
  const tick = (secret?: string) => app.inject({ method: 'POST', url: '/api/internal/tick', headers: secret ? { 'x-cron-secret': secret } : {} });

  it('todo está desactivado por defecto', async () => {
    const r = (await call('GET', '/api/reminders')).json().items;
    expect(r.length).toBeGreaterThan(5);
    expect(r.every((x: { enabled: boolean }) => !x.enabled)).toBe(true);
  });
  it('el endpoint del cron exige el secreto', async () => {
    expect((await tick()).statusCode).toBe(404);
    expect((await tick('incorrecto-incorrecto-incorrecto')).statusCode).toBe(404);
  });
  it('envía una vez al día solo si la condición se cumple', async () => {
    const { tick: runTick } = await import('../src/modules/reminders/service');
    const user = await prisma.user.findFirstOrThrow({ where: { email: 'fase4@example.com' } });
    await call('PUT', '/api/reminders', { items: [{ kind: 'BREAKFAST', enabled: true, timeLocal: '08:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }, { kind: 'WEIGH_IN', enabled: true, timeLocal: '08:00', weekdays: [1] }] });
    expect((await call('POST', '/api/push/subscribe', { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } })).statusCode).toBe(201);
    const send = async (_s: unknown, p: PushPayload) => { pushed.push(p); return 'ok' as const; };
    pushed.length = 0;
    const a = await runTick(prisma, NOW, send);
    expect(a.sent).toBe(1); // desayuno sí; pesaje es solo lunes
    expect(pushed[0]?.title).toBe('Desayuno');
    expect((await runTick(prisma, new Date(NOW.getTime() + 20 * 60000), send)).sent).toBe(0); // ya enviado hoy
    // otro día, pero con el desayuno ya registrado: no molesta
    const food = (await call('GET', '/api/foods/search?q=prozis')).json().items[0];
    await call('POST', '/api/diary/entries', { date: '2026-11-11', type: 'BREAKFAST', kind: 'product', id: food.id, units: 1 });
    expect((await runTick(prisma, new Date('2026-11-11T07:10:00Z'), send)).sent).toBe(0);
    // demasiado tarde (fuera de la ventana de recuperación): no se envía
    await prisma.reminder.updateMany({ where: { userId: user.id }, data: { lastSentAt: null } });
    expect((await runTick(prisma, new Date('2026-11-12T11:00:00Z'), send)).sent).toBe(0);
  });
  it('con el secreto correcto el endpoint ejecuta el tick', async () => {
    const r = await tick(CRON);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveProperty('sent');
  });
  it('config de push no expone claves privadas', async () => {
    const c = (await call('GET', '/api/push/config')).json();
    expect(c).toEqual({ enabled: false, publicKey: null, cronConfigured: true });
  });
});
