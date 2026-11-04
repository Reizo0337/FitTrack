import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { Env } from './env';
import { authRoutes } from './modules/auth/routes';
import { profileRoutes } from './modules/profile/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { diaryRoutes } from './modules/diary/routes';
import { foodRoutes } from './modules/foods/routes';
import { weightRoutes } from './modules/weight/routes';
import { activityRoutes } from './modules/activity/routes';
import { healthRoutes } from './modules/health/routes';
import { reminderRoutes } from './modules/reminders/routes';
import { aiRoutes } from './modules/ai/routes';
import { accountRoutes } from './modules/account/routes';
import { goalRoutes } from './modules/goals/routes';
import { pantryRoutes } from './modules/pantry/routes';
import { fastingRoutes } from './modules/fasting/routes';
import { photoRoutes } from './modules/photos/routes';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { insightRoutes } from './modules/insights/routes';
import { AIError } from './ai/service';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    env: Env;
    fetchImpl: typeof fetch;
    pushSender?: import('./modules/reminders/service').Sender;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export async function buildApp(env: Env, prisma: PrismaClient, deps: { fetch?: typeof fetch; pushSender?: import('./modules/reminders/service').Sender } = {}) {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    bodyLimit: 1_000_000,
    trustProxy: env.NODE_ENV === 'production', // detrás del proxy del hosting: IP real para los límites de peticiones
  });

  app.decorate('prisma', prisma);
  app.decorate('env', env);
  app.decorate('fetchImpl', deps.fetch ?? fetch);
  app.decorate('pushSender', deps.pushSender);

  // CSP estricta. Tesseract.js (OCR local) necesita su worker (blob) y descarga el motor/idioma desde un CDN público.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:', 'https://cdn.jsdelivr.net'],
        workerSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: '15m' } });
  const globalMax = env.RATE_LIMIT_MAX ?? (env.NODE_ENV === 'test' ? 0 : 300);
  await app.register(rateLimit, globalMax ? { global: true, max: globalMax, timeWindow: '1 minute' } : { global: false });

  // Diagnóstico de rendimiento: las peticiones que tardan más de 1 s quedan en los logs del servidor.
  app.addHook('onResponse', (req, reply, done) => {
    if (reply.elapsedTime > 1000) req.log.warn({ url: req.url.split('?')[0], method: req.method, ms: Math.round(reply.elapsedTime) }, 'petición lenta');
    done();
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AIError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'VALIDATION', issues: err.issues });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'INTERNAL' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(profileRoutes, { prefix: '/api/profile' });
  await app.register(foodRoutes, { prefix: '/api/foods' });
  await app.register(diaryRoutes, { prefix: '/api/diary' });
  await app.register(weightRoutes, { prefix: '/api/weight' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(activityRoutes, { prefix: '/api/activity' });
  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(reminderRoutes, { prefix: '/api' });
  await app.register(aiRoutes, { prefix: '/api/ai' });
  await app.register(insightRoutes, { prefix: '/api/insights' });
  await app.register(accountRoutes, { prefix: '/api/account' });
  await app.register(photoRoutes, { prefix: '/api/photos' });
  await app.register(goalRoutes, { prefix: '/api/goals' });
  await app.register(pantryRoutes, { prefix: '/api/pantry' });
  await app.register(fastingRoutes, { prefix: '/api/fasting' });

  // Web compilada servida desde el mismo origen (necesario para cookies fiables en iOS/Safari y sin CORS).
  const staticDir = env.STATIC_DIR ? resolve(env.STATIC_DIR) : null;
  if (staticDir && existsSync(resolve(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, wildcard: false, index: false, setHeaders: (res, path) => { res.header('cache-control', path.replace(/\\/g, '/').includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'); } });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.header('cache-control', 'no-cache').sendFile('index.html');
      return reply.code(404).send({ error: 'NOT_FOUND' });
    });
  }

  return app;
}
