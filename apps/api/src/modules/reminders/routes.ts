import { timingSafeEqual } from 'node:crypto';
import { reminderKinds, reminderListSchema } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import webpush from 'web-push';
import { z } from 'zod';
import { tick, type Sender } from './service';

const DEFAULT_TIMES: Record<string, string> = {
  WAKE: '08:00', WATER: '11:00', BREAKFAST: '10:00', LUNCH: '15:30', WALK: '18:00', LOG_DINNER: '22:00', BEDTIME: '23:15', WEIGH_IN: '08:30', DINNER: '22:30', WEEKLY_REPORT: '20:00',
};

export const reminderRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma;
  const { env } = app;
  const pushEnabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (pushEnabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

  const send: Sender = async (s, payload) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      return 'ok';
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return 'gone';
      throw e;
    }
  };

  // Llamado por un cron externo (p. ej. GitHub Actions cada 15 min). Sin secreto configurado, queda desactivado.
  app.post('/internal/tick', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const given = Buffer.from(String(req.headers['x-cron-secret'] ?? ''));
    const want = Buffer.from(env.CRON_SECRET ?? '');
    if (!env.CRON_SECRET || (!pushEnabled && !app.pushSender) || given.length !== want.length || !timingSafeEqual(given, want)) return reply.code(404).send({ error: 'Not Found' });
    return tick(db, new Date(), app.pushSender ?? send);
  });

  app.register(async (priv) => {
    priv.addHook('onRequest', app.authenticate);

    priv.get('/push/config', async () => ({ enabled: pushEnabled, publicKey: env.VAPID_PUBLIC_KEY ?? null, cronConfigured: !!env.CRON_SECRET }));

    priv.post('/push/subscribe', async (req, reply) => {
      const b = z.object({ endpoint: z.string().url().max(600), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }).parse(req.body);
      await db.pushSubscription.upsert({
        where: { endpoint: b.endpoint },
        create: { userId: req.user.sub, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth },
        update: { userId: req.user.sub, p256dh: b.keys.p256dh, auth: b.keys.auth },
      });
      return reply.code(201).send({ ok: true });
    });
    priv.post('/push/unsubscribe', async (req) => {
      const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
      await db.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.sub } });
      return { ok: true };
    });
    priv.post('/push/test', async (req, reply) => {
      if (!pushEnabled) return reply.code(409).send({ error: 'PUSH_NOT_CONFIGURED' });
      const subs = await db.pushSubscription.findMany({ where: { userId: req.user.sub } });
      if (!subs.length) return reply.code(409).send({ error: 'NO_SUBSCRIPTION' });
      let sent = 0;
      for (const s of subs) {
        const r = await send(s, { title: 'FitTrack', body: 'Las notificaciones funcionan.', url: '/', tag: 'ft-test' }).catch(() => 'gone' as const);
        if (r === 'gone') await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined); else sent++;
      }
      return { sent };
    });

    // Todos desactivados por defecto: nada se envía hasta que lo actives.
    priv.get('/reminders', async (req) => {
      const rows = await db.reminder.findMany({ where: { userId: req.user.sub } });
      const by = new Map(rows.map((r) => [r.kind, r]));
      return { items: reminderKinds.map((kind) => { const r = by.get(kind); return { kind, enabled: r?.enabled ?? false, timeLocal: r?.timeLocal ?? DEFAULT_TIMES[kind]!, weekdays: r?.weekdays ?? (kind === 'WEIGH_IN' ? [1, 3, 5] : kind === 'WEEKLY_REPORT' ? [7] : [1, 2, 3, 4, 5, 6, 7]) }; }) };
    });
    priv.put('/reminders', async (req) => {
      const list = reminderListSchema.parse((req.body as { items?: unknown })?.items);
      for (const r of list) {
        await db.reminder.upsert({
          where: { userId_kind: { userId: req.user.sub, kind: r.kind } },
          create: { userId: req.user.sub, ...r }, update: { enabled: r.enabled, timeLocal: r.timeLocal, weekdays: r.weekdays },
        });
      }
      return { ok: true };
    });
  });
};
