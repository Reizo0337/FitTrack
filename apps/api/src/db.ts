import { PrismaClient } from '@prisma/client';

/**
 * Neon: la URL con pool (host con «-pooler») pasa por PgBouncer en modo transacción, y Prisma necesita
 * `pgbouncer=true` para no usar sentencias preparadas de sesión. Se añade solo si falta.
 */
export function prismaUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('-pooler') && !u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
    return u.toString();
  } catch {
    return url;
  }
}

export const createPrisma = (databaseUrl: string) => new PrismaClient({ datasources: { db: { url: prismaUrl(databaseUrl) } } });