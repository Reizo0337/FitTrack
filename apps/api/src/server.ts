import { buildApp } from './app';
import { createPrisma } from './db';
import { loadEnv } from './env';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
const app = await buildApp(env, prisma);

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
