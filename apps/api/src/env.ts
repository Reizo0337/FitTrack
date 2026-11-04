import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener >= 32 caracteres'),
  /** Clave maestra (32 bytes en hex = 64 caracteres) para cifrar claves API en BD. */
  MASTER_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'MASTER_KEY debe ser 64 caracteres hex'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Notificaciones push (opcional). Genera con: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  /** Secreto para que un cron externo llame a /api/internal/tick (opcional, >= 24 caracteres). */
  CRON_SECRET: z.string().min(24).optional(),
  /** Límite diario de llamadas a modelos de IA (control de costes). */
  /** Carpeta con la web compilada (apps/web/dist) para servirla desde el mismo origen. */
  STATIC_DIR: z.string().optional(),
  /** Peticiones por minuto y IP (global). En tests se desactiva salvo que se indique. */
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).optional(),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(60),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Las variables vacías (p. ej. copiadas de .env.example) cuentan como no definidas.
  const clean = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(clean);
  if (!parsed.success) {
    throw new Error('Configuración inválida:\n' + parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  return parsed.data;
}
