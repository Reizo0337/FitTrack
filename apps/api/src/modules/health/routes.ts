import { createHash } from 'node:crypto';
import { healthIngestSchema, minutesBetween } from '@fittrack/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toDbDate } from '../../lib/dates';
import { randomToken, sha256 } from '../../security';

const hash = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

/** Idempotencia: si ya se importó exactamente este dato, se omite; si cambió, se actualiza. */
async function shouldApply(db: PrismaClient, userId: string, dataType: string, externalId: string, content: unknown) {
  const h = hash(content);
  const cur = await db.healthSyncRecord.findUnique({ where: { userId_dataType_externalId: { userId, dataType, externalId } } });
  if (cur?.contentHash === h) return false;
  await db.healthSyncRecord.upsert({
    where: { userId_dataType_externalId: { userId, dataType, externalId } },
    create: { userId, dataType, externalId, contentHash: h },
    update: { contentHash: h, syncedAt: new Date() },
  });
  return true;
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma;

  // --- Importación desde Atajos de iOS: autenticada SOLO con un token de ingesta (no sirve para leer datos) ---
  app.post('/ingest', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, bodyLimit: 500_000 }, async (req, reply) => {
    const raw = /^Bearer (ftk_[\w-]+)$/.exec(req.headers.authorization ?? '')?.[1];
    const tok = raw ? await db.ingestToken.findUnique({ where: { tokenHash: sha256(raw) } }) : null;
    if (!tok || tok.revokedAt) return reply.code(401).send({ error: 'INVALID_INGEST_TOKEN' });
    const userId = tok.userId;
    const b = healthIngestSchema.parse(req.body);
    const profile = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    const r = { applied: 0, skipped: 0 };
    const count = (ok: boolean) => (ok ? r.applied++ : r.skipped++);

    for (const d of b.days) {
      const { date, ...vals } = d;
      const ok = await shouldApply(db, userId, 'activity', date, vals);
      count(ok);
      if (!ok) continue;
      const day = toDbDate(date);
      await db.activityRecord.upsert({
        where: { userId_localDate_source: { userId, localDate: day, source: 'HEALTH' } },
        create: { userId, localDate: day, source: 'HEALTH', ...vals },
        update: vals, // solo los campos recibidos; el resto se conserva, nunca se pone a 0
      });
    }
    for (const s of b.sleep) {
      const { date, bedtime, sleepAt, wakeAt, totalMin, awakenings } = s;
      const ok = await shouldApply(db, userId, 'sleep', date, s);
      count(ok);
      if (!ok) continue;
      const total = totalMin ?? (sleepAt && wakeAt ? minutesBetween(sleepAt, wakeAt) : null);
      const data = { bedtimeAt: bedtime ? new Date(bedtime) : undefined, sleepAt: sleepAt ? new Date(sleepAt) : undefined, wakeAt: wakeAt ? new Date(wakeAt) : undefined, totalMin: total ?? undefined, awakenings };
      const day = toDbDate(date);
      await db.sleepRecord.upsert({
        where: { userId_localDate_source: { userId, localDate: day, source: 'HEALTH' } },
        create: { userId, localDate: day, source: 'HEALTH', ...data }, update: data,
      });
    }
    for (const w of b.weights) {
      const ok = await shouldApply(db, userId, 'weight', w.date, w);
      count(ok);
      if (!ok) continue;
      const day = toDbDate(w.date);
      const data = { weightKg: w.weightKg, bodyFatPct: w.bodyFatPct ?? null };
      await db.weightEntry.upsert({
        where: { userId_source_externalId: { userId, source: 'HEALTH', externalId: w.date } },
        create: { userId, localDate: day, measuredAt: new Date(`${w.date}T07:00:00Z`), tz: profile.timezone, source: 'HEALTH', externalId: w.date, ...data },
        update: data,
      });
    }
    for (const w of b.workouts) {
      const ok = await shouldApply(db, userId, 'workout', w.externalId, w);
      count(ok);
      if (!ok) continue;
      const { externalId, startedAt, ...rest } = w;
      const localDate = toDbDate(startedAt.slice(0, 10));
      await db.workout.upsert({
        where: { userId_source_externalId: { userId, source: 'HEALTH', externalId } },
        create: { userId, source: 'HEALTH', externalId, startedAt: new Date(startedAt), localDate, ...rest },
        update: { startedAt: new Date(startedAt), localDate, ...rest },
      });
    }
    await db.ingestToken.update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } });
    return r;
  });

  // --- Gestión de tokens (con sesión normal) ---
  app.register(async (priv) => {
    priv.addHook('onRequest', app.authenticate);
    priv.get('/tokens', async (req) => ({
      items: (await db.ingestToken.findMany({ where: { userId: req.user.sub, revokedAt: null }, orderBy: { createdAt: 'desc' } }))
        .map((t) => ({ id: t.id, label: t.label, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt })),
    }));
    // El token en claro se muestra UNA sola vez; en BD solo queda su hash.
    priv.post('/tokens', async (req, reply) => {
      const { label } = z.object({ label: z.string().trim().min(1).max(40) }).parse(req.body);
      const token = `ftk_${randomToken(32)}`;
      const t = await db.ingestToken.create({ data: { userId: req.user.sub, label, tokenHash: sha256(token) } });
      return reply.code(201).send({ id: t.id, token });
    });
    priv.delete('/tokens/:id', async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const r = await db.ingestToken.updateMany({ where: { id, userId: req.user.sub, revokedAt: null }, data: { revokedAt: new Date() } });
      return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
    });
  });
};
