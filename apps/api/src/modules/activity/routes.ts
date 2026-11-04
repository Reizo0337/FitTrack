import { activityManualSchema, localDate, mean, minutesBetween, minutesSince18, pearson, sleepManualSchema, stdDev } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addDays, fromDbDate, toDbDate } from '../../lib/dates';
import { derive } from '../profile/routes';

/** Minutos del día en la zona horaria del usuario (para regularidad de horarios). */
function since18InTz(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value), m = Number(parts.find((p) => p.type === 'minute')?.value);
  return minutesSince18(new Date(Date.UTC(2000, 0, 1, h, m)));
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  app.post('/activity', async (req, reply) => {
    const { date, ...vals } = activityManualSchema.parse(req.body);
    const day = toDbDate(date);
    await db.activityRecord.upsert({
      where: { userId_localDate_source: { userId: req.user.sub, localDate: day, source: 'MANUAL' } },
      create: { userId: req.user.sub, localDate: day, source: 'MANUAL', ...vals }, update: vals,
    });
    return reply.code(201).send({ ok: true });
  });

  app.post('/sleep', async (req, reply) => {
    const b = sleepManualSchema.parse(req.body);
    const total = b.totalMin ?? (b.sleepAt && b.wakeAt ? minutesBetween(b.sleepAt, b.wakeAt) : null);
    if (total == null) return reply.code(400).send({ error: 'VALIDATION', message: 'La hora de despertar debe ser posterior a la de dormir (máx. 24 h).' });
    const data = {
      bedtimeAt: b.bedtime ? new Date(b.bedtime) : null, sleepAt: b.sleepAt ? new Date(b.sleepAt) : null, wakeAt: b.wakeAt ? new Date(b.wakeAt) : null,
      totalMin: total, quality: b.quality ?? null, awakenings: b.awakenings ?? null,
    };
    const day = toDbDate(b.date);
    await db.sleepRecord.upsert({
      where: { userId_localDate_source: { userId: req.user.sub, localDate: day, source: 'MANUAL' } },
      create: { userId: req.user.sub, localDate: day, source: 'MANUAL', ...data }, update: data,
    });
    return reply.code(201).send({ ok: true, totalMin: total });
  });

  app.get('/overview', async (req) => {
    const q = z.object({ date: localDate, days: z.coerce.number().int().min(7).max(180).default(30) }).parse(req.query);
    const userId = req.user.sub;
    const from = addDays(q.date, -(q.days - 1));
    const range = { gte: toDbDate(from), lte: toDbDate(q.date) };
    const [profile, acts, sleeps, weights, workouts] = await Promise.all([
      db.userProfile.findUniqueOrThrow({ where: { userId } }),
      db.activityRecord.findMany({ where: { userId, localDate: range } }),
      db.sleepRecord.findMany({ where: { userId, localDate: range } }),
      db.weightEntry.findMany({ where: { userId, localDate: { gte: toDbDate(addDays(from, -1)), lte: range.lte } }, orderBy: { localDate: 'asc' } }),
      db.workout.findMany({ where: { userId, localDate: range }, orderBy: { startedAt: 'desc' } }),
    ]);
    const latestW = weights.at(-1)?.weightKg ?? profile.startWeightKg;
    const bmr = derive(profile, latestW).bmr;

    const days = Array.from({ length: q.days }, (_, i) => {
      const date = addDays(from, i);
      const dayAct = acts.filter((a) => fromDbDate(a.localDate) === date);
      const h = dayAct.find((a) => a.source === 'HEALTH'), m = dayAct.find((a) => a.source === 'MANUAL');
      // Una sola fuente por campo (Health tiene prioridad): NUNCA se suman fuentes, para no contar la actividad dos veces.
      const pick = <K extends 'steps' | 'activeKcal' | 'restingKcal' | 'distanceKm' | 'exerciseMin'>(k: K) => h?.[k] ?? m?.[k] ?? null;
      const activeKcal = pick('activeKcal'), restingKcal = pick('restingKcal');
      const daySleep = sleeps.filter((s) => fromDbDate(s.localDate) === date);
      const hs = daySleep.find((s) => s.source === 'HEALTH'), ms = daySleep.find((s) => s.source === 'MANUAL');
      const s = hs ?? ms;
      return {
        date, steps: pick('steps'), activeKcal, restingKcal, distanceKm: pick('distanceKm'), exerciseMin: pick('exerciseMin'),
        // Gasto total = reposo + activa. Sin energía en reposo de Health se estima con el basal (marcado como estimación).
        expenditure: activeKcal == null ? null : { kcal: Math.round((restingKcal ?? bmr) + activeKcal), source: restingKcal != null ? 'HEALTH' : 'ESTIMATE' },
        sleepMin: s?.totalMin ?? null, sleepSource: s?.source ?? null, quality: ms?.quality ?? hs?.quality ?? null, awakenings: s?.awakenings ?? null,
        bedMin: s?.sleepAt ? since18InTz(s.sleepAt, profile.timezone) : null, wakeMin: s?.wakeAt ? since18InTz(s.wakeAt, profile.timezone) : null,
      };
    });

    const sleepVals = (arr: typeof days) => arr.filter((d) => d.sleepMin != null).map((d) => d.sleepMin as number);
    const last7 = days.slice(-7), prev7 = days.slice(-14, -7);
    const avgH = (arr: typeof days) => { const m = mean(sleepVals(arr)); return m == null ? null : r1(m / 60); };
    const sd = (k: 'bedMin' | 'wakeMin') => { const v = days.filter((d) => d[k] != null).map((d) => d[k] as number); const s = stdDev(v); return s == null ? null : Math.round(s); };

    const wByDate = new Map(weights.map((w) => [fromDbDate(w.localDate), w.weightKg]));
    const sleepSteps = days.filter((d) => d.sleepMin != null && d.steps != null).map((d) => [d.sleepMin as number, d.steps as number] as [number, number]);
    const sleepWeight = days.flatMap((d) => {
      const a = wByDate.get(addDays(d.date, -1)), b = wByDate.get(d.date);
      return d.sleepMin != null && a != null && b != null ? [[d.sleepMin, b - a] as [number, number]] : [];
    });

    return {
      days,
      workouts: workouts.map((w) => ({ id: w.id, date: fromDbDate(w.localDate), type: w.type, durationMin: w.durationMin, activeKcal: w.activeKcal, distanceKm: w.distanceKm, avgHeartRate: w.avgHeartRate })),
      sleepStats: {
        avgHours7: avgH(last7), avgHoursPrev7: avgH(prev7), avgHoursPeriod: avgH(days), nights: sleepVals(days).length,
        bedtimeVariabilityMin: sd('bedMin'), wakeVariabilityMin: sd('wakeMin'),
      },
      relations: {
        sleepVsSteps: { r: pearson(sleepSteps), n: sleepSteps.length },
        sleepVsNextWeighInDelta: { r: pearson(sleepWeight), n: sleepWeight.length },
        note: 'Correlación sobre tus propios datos; no demuestra causa. Se calcula solo con 7 o más días con ambos datos. El hambre no se registra todavía.',
      },
    };
  });
};
