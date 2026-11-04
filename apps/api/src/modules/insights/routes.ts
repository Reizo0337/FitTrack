import { detectTrend, localDate, weeklyWindows } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { weeklyStats } from '../../ai/context';
import { addDays, fromDbDate, toDbDate } from '../../lib/dates';

/** Informes deterministas: no necesitan IA ni consentimiento (no salen del servidor). */
export const insightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  app.get('/status', async (req) => {
    const { date } = z.object({ date: localDate }).parse(req.query);
    const userId = req.user.sub;
    const [profile, w] = await Promise.all([
      db.userProfile.findUniqueOrThrow({ where: { userId } }),
      db.weightEntry.findMany({ where: { userId, localDate: { gte: toDbDate(addDays(date, -40)), lte: toDbDate(date) } }, orderBy: { localDate: 'asc' } }),
    ]);
    const pts = w.map((x) => ({ date: fromDbDate(x.localDate), value: x.weightKg }));
    const windows = weeklyWindows(pts, date, 4);
    return { trend: detectTrend(windows, pts.at(-1)?.value ?? profile.startWeightKg), windows };
  });

  app.get('/weekly', async (req) => {
    const { end } = z.object({ end: localDate }).parse(req.query);
    return weeklyStats(db, req.user.sub, end);
  });
};
