import { localDate } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addDays, fromDbDate, toDbDate } from '../../lib/dates';
import { buildDiary } from '../diary/service';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  app.get('/', async (req) => {
    const { date } = z.object({ date: localDate }).parse(req.query);
    const userId = req.user.sub;
    const [diary, profile, weights, history, activityRows, sleepRows] = await Promise.all([
      buildDiary(db, userId, date),
      db.userProfile.findUniqueOrThrow({ where: { userId } }),
      db.weightEntry.findMany({ where: { userId, localDate: { lte: toDbDate(date) } }, orderBy: [{ localDate: 'desc' }, { measuredAt: 'desc' }], take: 60 }),
      db.dailyNutrition.findMany({ where: { userId, localDate: { gte: toDbDate(addDays(date, -13)), lte: toDbDate(date) } }, orderBy: { localDate: 'asc' } }),
      db.activityRecord.findMany({ where: { userId, localDate: toDbDate(date) } }),
      db.sleepRecord.findMany({ where: { userId, localDate: toDbDate(date) } }),
    ]);
    // Health tiene prioridad campo a campo sobre lo manual; nunca se suman fuentes (evita contar dos veces).
    const aH = activityRows.find((a) => a.source === 'HEALTH'), aM = activityRows.find((a) => a.source === 'MANUAL');
    const pickA = <K extends 'steps' | 'activeKcal' | 'restingKcal' | 'distanceKm' | 'exerciseMin'>(k: K) => aH?.[k] ?? aM?.[k] ?? null;
    const activity = activityRows.length ? { steps: pickA('steps'), activeKcal: pickA('activeKcal'), restingKcal: pickA('restingKcal'), distanceKm: pickA('distanceKm'), exerciseMin: pickA('exerciseMin'), source: aH ? 'HEALTH' : 'MANUAL' } : null;
    const sleepRow = sleepRows.find((s) => s.source === 'HEALTH') ?? sleepRows[0];
    const sleep = sleepRow ? { totalMin: sleepRow.totalMin, source: sleepRow.source } : null;

    const latest = weights[0];
    const currentKg = latest?.weightKg ?? null;
    const lostKg = currentKg != null ? Math.round((profile.startWeightKg - currentKg) * 10) / 10 : null;
    const totalToLose = profile.startWeightKg - profile.goalWeightKg;
    const progressPct = currentKg != null && totalToLose > 0 ? Math.max(0, Math.min(100, Math.round(((profile.startWeightKg - currentKg) / totalToLose) * 1000) / 10)) : null;

    // Tendencia: media de los últimos 7 días frente a la de la semana anterior (si hay datos en ambas).
    const avg = (from: number, to: number) => {
      const ws = weights.filter((w) => w.localDate >= toDbDate(addDays(date, from)) && w.localDate <= toDbDate(addDays(date, to)));
      return ws.length ? ws.reduce((a, b) => a + b.weightKg, 0) / ws.length : null;
    };
    const thisWeek = avg(-6, 0);
    const prevWeek = avg(-13, -7);
    const weeklyChangeKg = thisWeek != null && prevWeek != null ? Math.round((thisWeek - prevWeek) * 100) / 100 : null;

    return {
      date,
      diary,
      weight: {
        currentKg, startKg: profile.startWeightKg, goalKg: profile.goalWeightKg, lostKg, progressPct,
        remainingKg: currentKg != null ? Math.round((currentKg - profile.goalWeightKg) * 10) / 10 : null,
        avg7Kg: thisWeek != null ? Math.round(thisWeek * 10) / 10 : null, weeklyChangeKg,
        lastMeasuredOn: latest ? fromDbDate(latest.localDate) : null,
        // Con solo peso no se puede afirmar pérdida de grasa.
        bodyFatPct: weights.find((w) => w.bodyFatPct != null)?.bodyFatPct ?? null,
        note: 'Solo se dispone del peso total: no se puede afirmar cuánta grasa has perdido sin medir composición corporal.',
      },
      // Se rellenan con Apple Health / registro manual (Fase 4). Sin datos => null, nunca inventados.
      activity,
      sleep,
      history: history.map((h) => ({ date: fromDbDate(h.localDate), kcal: h.kcal, protein: h.protein, carbs: h.carbs, fat: h.fat })),
    };
  });
};
