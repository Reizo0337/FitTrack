import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from '../src/security';
import { createUser } from '../src/users';

const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL!,
} as NodeJS.ProcessEnv);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
let app: Awaited<ReturnType<typeof buildApp>>;
const EMAIL = 'yo@example.com';
const PASS = 'una-contraseña-larga-123';

beforeAll(async () => {
  app = await buildApp(env, prisma);
  await createUser(prisma, { email: EMAIL, password: PASS });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const login = (password = PASS, email = EMAIL) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress: `10.0.0.${Math.floor(Math.random() * 250)}` });

describe('seguridad', () => {
  it('hash de contraseña verificable y no reversible', async () => {
    const h = await hashPassword('secreto-secreto');
    expect(h).not.toContain('secreto');
    expect(await verifyPassword('secreto-secreto', h)).toBe(true);
    expect(await verifyPassword('otra', h)).toBe(false);
  });
  it('cifrado AES-GCM ida y vuelta y detecta manipulación', () => {
    const key = env.MASTER_KEY;
    const enc = encryptSecret('sk-test-123', key);
    expect(enc).not.toContain('sk-test');
    expect(decryptSecret(enc, key)).toBe('sk-test-123');
    expect(() => decryptSecret(enc.slice(0, -2) + 'AA', key)).toThrow();
  });
});

describe('auth', () => {
  it('no existe registro público', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'x@y.com', password: 'xxxxxxxxxxxx' } });
    expect(r.statusCode).toBe(404);
  });
  it('rechaza credenciales incorrectas con el mismo error para usuario inexistente', async () => {
    const a = await login('mala-contraseña-1');
    const b = await login(PASS, 'nadie@example.com');
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });
  it('login valida entrada', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'no-es-email', password: '1' } });
    expect(r.statusCode).toBe(400);
  });
  it('rutas protegidas exigen token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/profile' })).statusCode).toBe(401);
  });
  it('refresh rota el token y el anterior deja de valer', async () => {
    const l = await login();
    expect(l.statusCode).toBe(200);
    const c1 = l.cookies.find((c) => c.name === 'ft_refresh')!;
    const r1 = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { ft_refresh: c1.value } });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { ft_refresh: c1.value } });
    expect(r2.statusCode).toBe(401);
  });
});

describe('perfil', () => {
  async function token() {
    return (await login()).json().accessToken as string;
  }
  it('devuelve perfil inicial y valores derivados marcados como estimación', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/profile', headers: { authorization: `Bearer ${await token()}` } });
    expect(r.statusCode).toBe(200);
    const { profile, derived } = r.json();
    expect(profile.targetKcal).toBe(2000);
    expect(profile.startWeightKg).toBe(112);
    expect(derived.bmr).toBe(2104);
    expect(derived.tdee).toBe(2525);
    expect(derived.isEstimate).toBe(true);
    expect(derived.pace.level).toBe('OK');
  });
  it('permite modificar objetivos y avisa de déficit peligroso', async () => {
    const r = await app.inject({
      method: 'PUT', url: '/api/profile', headers: { authorization: `Bearer ${await token()}` },
      payload: { targetKcal: 1200 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().derived.warnings.length).toBeGreaterThan(0);
    await prisma.userProfile.updateMany({ data: { targetKcal: 2000 } });
  });
  it('valida rangos', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/profile', headers: { authorization: `Bearer ${await token()}` }, payload: { targetKcal: 50 } });
    expect(r.statusCode).toBe(400);
  });
});

describe('Prozis Army Meal Replacement', () => {
  it('está en la BD (seed) con los valores por 100 g y ración de 60 g', async () => {
    const p = await prisma.foodProduct.findFirstOrThrow({ where: { name: 'Prozis Army Meal Replacement' } });
    expect([p.kcal100, p.protein100, p.carbs100, p.fat100, p.satFat100, p.fiber100, p.sugars100, p.salt100]).toEqual([384, 42, 33, 9, 2.4, 1.7, 2.5, 1]);
    expect(p.servingG).toBe(60);
  });
});
