import { localDate, measurementCreateSchema, rollingAverageByDate, weightCreateSchema } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fromDbDate, toDbDate } from '../../lib/dates';

export const weightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  // Un pesaje manual por día: si ya existe, se actualiza.
  app.post('/', async (req, reply) => {
    const b = weightCreateSchema.parse(req.body);
    const userId = req.user.sub;
    const profile = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    const day = toDbDate(b.date);
    const data = { weightKg: b.weightKg, bodyFatPct: b.bodyFatPct ?? null, muscleKg: b.muscleKg ?? null, bodyWaterPct: b.bodyWaterPct ?? null };
    const existing = await db.weightEntry.findFirst({ where: { userId, localDate: day, source: 'MANUAL' } });
    if (existing) {
      await db.weightEntry.update({ where: { id: existing.id }, data });
      return { id: existing.id, updated: true };
    }
    const w = await db.weightEntry.create({
      data: { userId, localDate: day, measuredAt: new Date(), tz: profile.timezone, source: 'MANUAL', ...data },
    });
    return reply.code(201).send({ id: w.id, updated: false });
  });

  app.get('/', async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(3650).default(180) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await db.weightEntry.findMany({ where: { userId: req.user.sub, localDate: { gte: since } }, orderBy: { localDate: 'asc' } });
    // Varias fuentes el mismo día: media del día (sin duplicar el peso en la tendencia).
    const perDay = new Map<string, { sum: number; n: number; fat: number | null; muscle: number | null; water: number | null }>();
    for (const r of rows) {
      const k = fromDbDate(r.localDate);
      const cur = perDay.get(k) ?? { sum: 0, n: 0, fat: null, muscle: null, water: null };
      cur.sum += r.weightKg; cur.n++;
      cur.fat = r.bodyFatPct ?? cur.fat; cur.muscle = r.muscleKg ?? cur.muscle; cur.water = r.bodyWaterPct ?? cur.water;
      perDay.set(k, cur);
    }
    const points = [...perDay].map(([date, v]) => ({ date, value: Math.round((v.sum / v.n) * 10) / 10 }));
    const series = rollingAverageByDate(points, 7).map((p) => {
      const v = perDay.get(p.date)!;
      return { date: p.date, weightKg: p.value, avg7: p.avg, bodyFatPct: v.fat, muscleKg: v.muscle, bodyWaterPct: v.water };
    });
    return { series };
  });

  app.delete('/:date', async (req, reply) => {
    const { date } = z.object({ date: localDate }).parse(req.params);
    const r = await db.weightEntry.deleteMany({ where: { userId: req.user.sub, localDate: toDbDate(date), source: 'MANUAL' } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.post('/measurements', async (req, reply) => {
    const { date, ...m } = measurementCreateSchema.parse(req.body);
    const row = await db.bodyMeasurement.create({ data: { userId: req.user.sub, localDate: toDbDate(date), ...m } });
    return reply.code(201).send({ id: row.id });
  });

  app.get('/measurements', async (req) => {
    const rows = await db.bodyMeasurement.findMany({ where: { userId: req.user.sub }, orderBy: { localDate: 'asc' } });
    return { items: rows.map((r) => ({ id: r.id, date: fromDbDate(r.localDate), waistCm: r.waistCm, chestCm: r.chestCm, hipCm: r.hipCm, armCm: r.armCm, thighCm: r.thighCm })) };
  });
};
