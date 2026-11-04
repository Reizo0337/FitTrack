import { computeFasting, DEFAULT_FASTING, fastingConfigSchema, localDateIn, mealGaps } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { addDays, toDbDate } from '../../lib/dates';
import { derive } from '../profile/routes';

export const fastingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  async function respond(userId: string) {
    const [profile, stored, last] = await Promise.all([
      db.userProfile.findUniqueOrThrow({ where: { userId } }),
      db.fastingConfig.findUnique({ where: { userId } }),
      db.weightEntry.findFirst({ where: { userId }, orderBy: { measuredAt: 'desc' } }),
    ]);
    const cfg = stored
      ? { enabled: stored.enabled, breakfastTime: stored.breakfastTime, lunchTime: stored.lunchTime, dinnerTime: stored.dinnerTime }
      : DEFAULT_FASTING;
    const now = new Date();
    const today = localDateIn(now, profile.timezone);
    const meals = await db.meal.findMany({
      where: { userId, localDate: { gte: toDbDate(addDays(today, -1)), lte: toDbDate(addDays(today, 1)) } },
      select: { type: true, localDate: true, entries: { select: { createdAt: true } } },
    });
    const entries = meals.flatMap((m) => m.entries.map((e) => ({ type: m.type, at: e.createdAt, localDate: m.localDate.toISOString().slice(0, 10) })));
    const { bmr } = derive(profile, last?.weightKg ?? profile.startWeightKg);
    return { config: cfg, gaps: mealGaps(cfg), status: computeFasting({ now, tz: profile.timezone, cfg, bmr, entries }), isEstimate: true };
  }

  app.get('/', async (req) => respond(req.user.sub));

  app.put('/', async (req) => {
    const data = fastingConfigSchema.parse(req.body);
    const userId = req.user.sub;
    await db.fastingConfig.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return respond(userId);
  });
};
