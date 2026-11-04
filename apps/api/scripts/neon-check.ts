// Comprobación de la conexión con Neon SIN imprimir credenciales. Uso: node --env-file=../../.env.local --import tsx scripts/neon-check.ts
import { createPrisma, prismaUrl } from '../src/db';
import { loadEnv } from '../src/env';

const env = loadEnv();
const describe = (raw: string) => {
  const u = new URL(raw);
  return { host: u.hostname, pooled: u.hostname.includes('-pooler'), params: [...u.searchParams.keys()] };
};
console.log('DATABASE_URL (la que usa la app):', describe(prismaUrl(env.DATABASE_URL)));
console.log('DATABASE_URL_UNPOOLED (migraciones):', process.env.DATABASE_URL_UNPOOLED ? describe(process.env.DATABASE_URL_UNPOOLED) : 'no definida');

const prisma = createPrisma(env.DATABASE_URL);
try {
  const [row] = await prisma.$queryRaw<{ db: string; user: string; enc: string; version: string }[]>`select current_database() as db, current_user as user, pg_encoding_to_char(encoding) as enc, split_part(version(), ' ', 2) as version from pg_database where datname = current_database()`;
  console.log('Conectado a:', row);
  const tables = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  console.log('Tablas en public:', Number(tables[0]?.n));
} finally {
  await prisma.$disconnect();
}
