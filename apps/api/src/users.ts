import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { profileUpdateSchema, type Nutrients } from '@fittrack/shared';
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from './security';

type SeedProduct = {
  name: string; brand: string; barcode: string | null; per100g: Nutrients; servingG: number; servingName: string;
};

const seedPath = fileURLToPath(new URL('../data/products.seed.json', import.meta.url));

export async function seedProducts(prisma: PrismaClient, userId: string) {
  const list = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedProduct[];
  for (const p of list) {
    const data = {
      name: p.name, brand: p.brand, kcal100: p.per100g.kcal, protein100: p.per100g.protein, carbs100: p.per100g.carbs,
      fat100: p.per100g.fat, satFat100: p.per100g.satFat, fiber100: p.per100g.fiber, sugars100: p.per100g.sugars,
      salt100: p.per100g.salt, servingG: p.servingG, servingName: p.servingName, source: 'SEED' as const, isFavorite: true,
    };
    const existing = await prisma.foodProduct.findFirst({ where: { userId, name: p.name, source: 'SEED' } });
    if (existing) await prisma.foodProduct.update({ where: { id: existing.id }, data });
    else await prisma.foodProduct.create({ data: { userId, ...data } });
  }
}

/** Valores iniciales del usuario (todos configurables luego desde la app). */
export const DEFAULT_PROFILE = {
  displayName: '',
  birthDate: new Date(new Date().getFullYear() - 23, new Date().getMonth(), new Date().getDate()).toISOString().slice(0, 10),
  sex: 'MALE' as const,
  heightCm: 175,
  startWeightKg: 112,
  goalWeightKg: 90,
  activityLevel: 'SEDENTARY' as const,
  timezone: 'Europe/Madrid',
  targetKcal: 2000,
  targetProteinG: 150,
  targetFatG: 65,
  targetFiberG: 30,
  targetWaterMl: 2500,
  allergies: [] as string[],
  dislikedFoods: [] as string[],
  aiConsent: false,
};

export async function createUser(
  prisma: PrismaClient,
  input: { email: string; password: string; profile?: Parameters<typeof profileUpdateSchema.parse>[0] },
) {
  if (input.password.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres');
  const overrides = profileUpdateSchema.parse(input.profile ?? {});
  const p = { ...DEFAULT_PROFILE, ...overrides };
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      profile: { create: { ...p, birthDate: new Date(p.birthDate) } },
    },
  });
  await seedProducts(prisma, user.id);
  return user;
}
