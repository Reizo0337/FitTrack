// Reaplica los productos de semilla (p. ej. Prozis) a todos los usuarios existentes. Idempotente.
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/env';
import { seedProducts } from '../src/users';

loadEnv();
const prisma = new PrismaClient();
try {
  for (const u of await prisma.user.findMany()) await seedProducts(prisma, u.id);
  console.log('Productos de semilla actualizados.');
} finally {
  await prisma.$disconnect();
}
