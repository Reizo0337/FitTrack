import { createPrisma } from '../src/db';
import { loadEnv } from '../src/env';
import { createUser } from '../src/users';

// Uso: npm run create-user -- tu@email.com "contraseña-larga-de-12+"
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: npm run create-user -- <email> <contraseña (>=12 caracteres)>');
  process.exit(1);
}
const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
try {
  const u = await createUser(prisma, { email, password });
  console.log(`Usuario creado: ${u.email}`);
} finally {
  await prisma.$disconnect();
}
