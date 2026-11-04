// Reaplica los productos de semilla (p. ej. Prozis) a todos los usuarios existentes. Idempotente.
import { createPrisma } from '../src/db';
import { loadEnv } from '../src/env';
import { seedProducts } from '../src/users';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
try {
  for (const u of await prisma.user.findMany()) await seedProducts(prisma, u.id);
  console.log('Productos de semilla actualizados.');
} finally {
  await prisma.$disconnect();
}
