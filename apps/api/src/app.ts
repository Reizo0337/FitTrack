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
  });

  app.decorate('prisma', prisma);
  app.decorate('env', env);
  app.decorate('fetchImpl', deps.fetch ?? fetch);
  app.decorate('pushSender', deps.pushSender);

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: '15m' } });
  await app.register(rateLimit, { global: false });

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

  return app;
}
