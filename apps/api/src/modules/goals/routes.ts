import {
  bestStreak, complianceRate, currentStreak, encouragement, GOAL_KINDS, GOAL_LABEL, GOAL_PERIOD, GOAL_UNIT, goalsUpdateSchema, localDate, weightMilestones, type GoalKind,
} from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addDays, fromDbDate, toDbDate } from '../../lib/dates';

const DAYS = 30;

export const goalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  async function ensureGoals(userId: string) {
    const existing = await db.goal.findMany({ where: { userId } });
    if (existing.length >= GOAL_KINDS.length) return existing;
    const p = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    const defaults: Record<GoalKind, number> = { STEPS: 8000, PROTEIN: Math.round(p.targetProteinG * 0.9), WATER: Math.round(p.targetWaterMl * 0.8), SLEEP: 7, LOG_MEALS: 3, WORKOUTS: 3 };
    for (const kind of GOAL_KINDS) {
      if (!existing.some((g) => g.kind === kind)) await db.goal.create({ data: { userId, kind, target: defaults[kind], period: GOAL_PERIOD[kind], active: kind !== 'WORKOUTS' } });
    }
    return db.goal.findMany({ where: { userId } });
  }

  app.get('/', async (req) => {
    const { date } = z.object({ date: localDate }).parse(req.query);
    const userId = req.user.sub;
    const goals = await ensureGoals(userId);
    const from = addDays(date, -(DAYS - 1));
    const range = { gte: toDbDate(from), lte: toDbDate(date) };
    const [nut, act, water, sleep, entries, workouts, profile, weight] = await Promise.all([
      db.dailyNutrition.findMany({ where: { userId, localDate: range } }),
      db.activityRecord.findMany({ where: { userId, localDate: range } }),
      db.waterIntake.groupBy({ by: ['localDate'], where: { userId, localDate: range }, _sum: { ml: true } }),
      db.sleepRecord.findMany({ where: { userId, localDate: range } }),
      db.meal.findMany({ where: { userId, localDate: range }, select: { localDate: true, type: true, _count: { select: { entries: true } } } }),
      db.workout.findMany({ where: { userId, localDate: { gte: toDbDate(addDays(from, -7)), lte: toDbDate(date) } }, select: { localDate: true } }),
      db.userProfile.findUniqueOrThrow({ where: { userId } }),
      db.weightEntry.findFirst({ where: { userId }, orderBy: [{ localDate: 'desc' }, { measuredAt: 'desc' }] }),
    ]);
    const dates = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
    const val = (kind: GoalKind, d: string): number | null => {
      switch (kind) {
        case 'STEPS': { const a = act.filter((x) => fromDbDate(x.localDate) === d); return a.find((x) => x.source === 'HEALTH')?.steps ?? a.find((x) => x.source === 'MANUAL')?.steps ?? null; }
        case 'PROTEIN': { const n = nut.find((x) => fromDbDate(x.localDate) === d); return n && n.kcal > 0 ? n.protein : null; }
        case 'WATER': { const w = water.find((x) => fromDbDate(x.localDate) === d); return w ? w._sum.ml ?? 0 : null; }
        case 'SLEEP': { const s = sleep.filter((x) => fromDbDate(x.localDate) === d); const t = (s.find((x) => x.source === 'HEALTH') ?? s[0])?.totalMin; return t != null ? t / 60 : null; }
        case 'LOG_MEALS': return entries.filter((m) => fromDbDate(m.localDate) === d && m._count.entries > 0).length;
        case 'WORKOUTS': { const lo = addDays(d, -6); return workouts.filter((w) => { const x = fromDbDate(w.localDate); return x >= lo && x <= d; }).length; } // sesiones en los últimos 7 días
      }
    };
    const out = goals.sort((a, b) => GOAL_KINDS.indexOf(a.kind as GoalKind) - GOAL_KINDS.indexOf(b.kind as GoalKind)).map((g) => {
      const kind = g.kind as GoalKind;
      const series = dates.map((d) => { const v = val(kind, d); return v == null ? null : v >= g.target; });
      const todayVal = val(kind, date);
      return {
        kind, label: GOAL_LABEL[kind], unit: GOAL_UNIT[kind], period: GOAL_PERIOD[kind], target: g.target, active: g.active,
        today: { value: todayVal == null ? null : Math.round(todayVal * 10) / 10, met: todayVal == null ? null : todayVal >= g.target },
        streak: GOAL_PERIOD[kind] === 'DAY' ? currentStreak(series) : null, bestStreak: GOAL_PERIOD[kind] === 'DAY' ? bestStreak(series) : null,
        compliance30: complianceRate(series), last7: series.slice(-7),
      };
    });
    const active = out.filter((g) => g.active);
    const loggedDays7 = dates.slice(-7).filter((d) => (val('LOG_MEALS', d) ?? 0) > 0).length;
    const metToday = active.filter((g) => g.today.met === true).length;
    return {
      date, goals: out,
      summary: { activeGoals: active.length, metToday, loggedDays7, message: encouragement({ streakBest: Math.max(0, ...active.map((g) => g.streak ?? 0)), metToday, activeGoals: active.length, loggedDays7 }) },
      milestones: weightMilestones(profile.startWeightKg, profile.goalWeightKg, weight?.weightKg ?? null),
    };
  });

  app.put('/', async (req) => {
    const { items } = goalsUpdateSchema.parse(req.body);
    const userId = req.user.sub;
    for (const i of items) {
      await db.goal.upsert({
        where: { userId_kind: { userId, kind: i.kind } },
        create: { userId, kind: i.kind, target: i.target, active: i.active, period: GOAL_PERIOD[i.kind] },
        update: { target: i.target, active: i.active },
      });
    }
    return { ok: true };
  });
};
