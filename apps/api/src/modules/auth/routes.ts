import { loginSchema } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../security';

const REFRESH_DAYS = 30;
const COOKIE = 'ft_refresh';

// Hash ficticio para igualar tiempos cuando el usuario no existe (evita enumeración).
const dummyHashPromise = hashPassword('dummy-password-for-timing');

export const authRoutes: FastifyPluginAsync = async (app) => {
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const, // la web se sirve desde el mismo origen: Lax basta y protege frente a CSRF
    secure: app.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: REFRESH_DAYS * 86400,
  };

  // Defensa CSRF adicional: si el navegador envía Origin, debe ser el propio servidor o un origen permitido.
  const allowed = app.env.CORS_ORIGINS.split(',').map((s) => s.trim());
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (req.method === 'POST' && origin && !allowed.includes(origin) && new URL(origin).host !== req.headers.host) return reply.code(403).send({ error: 'BAD_ORIGIN' });
  });

  async function issueSession(userId: string, reply: import('fastify').FastifyReply) {
    const token = randomToken();
    await app.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400_000) },
    });
    reply.setCookie(COOKIE, token, cookieOpts);
    return { accessToken: app.jwt.sign({ sub: userId }) };
  }

  app.post('/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await app.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHashPromise));
    if (!user || !ok) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    return issueSession(user.id, reply);
  });

  // Rotación: cada refresh invalida el token usado y emite uno nuevo.
  app.post('/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const raw = req.cookies[COOKIE];
    if (!raw) return reply.code(401).send({ error: 'NO_REFRESH' });
    const row = await app.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      reply.clearCookie(COOKIE, { path: cookieOpts.path });
      return reply.code(401).send({ error: 'INVALID_REFRESH' });
    }
    await app.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return issueSession(row.userId, reply);
  });

  app.post('/logout', async (req, reply) => {
    const raw = req.cookies[COOKIE];
    if (raw) await app.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    reply.clearCookie(COOKIE, { path: cookieOpts.path });
    return { ok: true };
  });
};
