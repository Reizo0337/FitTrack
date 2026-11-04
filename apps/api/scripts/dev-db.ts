// PostgreSQL local de desarrollo sin Docker (paquete embedded-postgres). Datos en ../../.data/pg
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = resolve(import.meta.dirname, '../../../.data/pg');
const fresh = !existsSync(resolve(dir, 'PG_VERSION'));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'fittrack', password: 'fittrack', port: 5433, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('fittrack');
console.log('PostgreSQL listo: postgresql://fittrack:fittrack@localhost:5433/fittrack');
const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
