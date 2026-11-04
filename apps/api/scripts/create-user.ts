import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/env';
import { createUser } from '../src/users';

// Uso: npm run create-user -- tu@email.com "contraseña-larga-de-12+"
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: npm run create-user -- <email> <contraseña (>=12 caracteres)>');
  process.exit(1);
}
loadEnv();
const prisma = new PrismaClient();
try {
  const u = await createUser(prisma, { email, password });
  console.log(`Usuario creado: ${u.email}`);
} finally {
  await prisma.$disconnect();
}
