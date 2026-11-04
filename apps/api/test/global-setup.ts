import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import 'dotenv/config';

// Cada ejecución usa un schema PostgreSQL propio (requiere la BD de desarrollo en marcha).
export default function setup() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL no definida (arranca la BD con npm run dev:db)');
  const schema = `test_${randomBytes(4).toString('hex')}`;
  const url = `${base.split('?')[0]}?schema=${schema}`;
  process.env.TEST_DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url } });
  return () => {
    // el schema temporal se elimina vía prisma en teardown manual si se desea; es inocuo
  };
}
