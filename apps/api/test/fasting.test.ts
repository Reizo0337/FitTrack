import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';
import { createUser } from '../src/users';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL! } as NodeJS.ProcessEnv);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
let app: Awaited<ReturnType<typeof buildApp>>;
let auth: Record<string, string>;
const PASS = 'una-contraseña-larga-71';

beforeAll(async () => {
  app = await buildApp(env, prisma);
  await createUser(prisma, { email: 'ayuno@example.com', password: PASS });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ayuno@example.com', password: PASS }, remoteAddress: '10.7.0.1' });
  auth = { authorization: `Bearer ${r.json().accessToken}` };
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('ayuno', () => {
  it('devuelve horario por defecto y estado calculado', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/fasting', headers: auth });
    expect(r.statusCode).toBe(200);
    expect(r.json().config).toMatchObject({ enabled: true, breakfastTime: '08:00', dinnerTime: '21:00' });
    expect(r.json().gaps).toHaveLength(3);
    expect(['waiting', 'fasting', 'done']).toContain(r.json().status.state);
    expect(r.json().status.kcalPerHour).toBeGreaterThan(0);
  });
  it('guarda los horarios, los valida y permite desactivarlo', async () => {
    const cfg = { enabled: true, breakfastTime: '07:30', lunchTime: '13:00', dinnerTime: '20:30' };
    const ok = await app.inject({ method: 'PUT', url: '/api/fasting', headers: auth, payload: cfg });
    expect(ok.json().config).toEqual(cfg);
    expect((await app.inject({ method: 'PUT', url: '/api/fasting', headers: auth, payload: { ...cfg, dinnerTime: '25:99' } })).statusCode).toBe(400);
    const off = await app.inject({ method: 'PUT', url: '/api/fasting', headers: auth, payload: { ...cfg, enabled: false } });
    expect(off.json().status.state).toBe('off');
  });
  it('exige sesión', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/fasting' })).statusCode).toBe(401);
  });
});
