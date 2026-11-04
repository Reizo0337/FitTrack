import { ageFromBirthDate, assessPace, bmrMifflin, checkCalorieTarget, expectedWeeklyLossKg, profileUpdateSchema, tdeeFromBmr, weeksToGoal } from '@fittrack/shared';
import type { UserProfile } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

/** Valores derivados: son ESTIMACIONES a partir de fórmulas, no valores médicos. */
function derive(p: UserProfile, currentKg: number) {
  const bmr = bmrMifflin({ sex: p.sex, weightKg: currentKg, heightCm: p.heightCm, ageYears: ageFromBirthDate(p.birthDate) });
  const tdee = tdeeFromBmr(bmr, p.activityLevel);
  const weekly = expectedWeeklyLossKg(tdee - p.targetKcal);
  return {
    bmr,
    tdee,
    expectedWeeklyLossKg: Math.round(weekly * 100) / 100,
    weeksToGoal: Number.isFinite(weeksToGoal(currentKg, p.goalWeightKg, weekly)) ? Math.round(weeksToGoal(currentKg, p.goalWeightKg, weekly)) : null,
    pace: assessPace(weekly, currentKg),
    warnings: checkCalorieTarget(p.targetKcal, bmr, p.sex),
    isEstimate: true,
  };
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  async function respond(userId: string) {
    const profile = await app.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) return null;
    const last = await app.prisma.weightEntry.findFirst({ where: { userId }, orderBy: { measuredAt: 'desc' } });
    return { profile, derived: derive(profile, last?.weightKg ?? profile.startWeightKg) };
  }

  app.get('/', async (req, reply) => {
    const out = await respond(req.user.sub);
    return out ?? reply.code(404).send({ error: 'NO_PROFILE' });
  });

  app.put('/', async (req, reply) => {
    const body = profileUpdateSchema.parse(req.body);
    const { birthDate, ...rest } = body;
    const data = { ...rest, ...(birthDate ? { birthDate: new Date(birthDate) } : {}) };
    const exists = await app.prisma.userProfile.findUnique({ where: { userId: req.user.sub } });
    if (!exists) return reply.code(404).send({ error: 'NO_PROFILE' });
    await app.prisma.userProfile.update({ where: { userId: req.user.sub }, data });
    return respond(req.user.sub);
  });
};
