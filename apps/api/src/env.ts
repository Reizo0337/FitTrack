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
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error('Configuración inválida:\n' + parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  return parsed.data;
}
