import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { hashPassword, verifyPassword } from '../../security';

/** Exportación y borrado de TODOS los datos del usuario (privacidad). */
export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  app.get('/export', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = req.user.sub;
    const { photos } = z.object({ photos: z.enum(['0', '1']).default('0') }).parse(req.query);
    const w = { userId };
    const [user, profile, weights, measurements, foods, products, recipes, meals, daily, water, activity, workouts, sleep, reminders, goals, aiConfigs, usage, menus, pantry, convos, photoRows] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, createdAt: true } }),
      db.userProfile.findUnique({ where: { userId } }),
      db.weightEntry.findMany({ where: w, orderBy: { measuredAt: 'asc' } }),
      db.bodyMeasurement.findMany({ where: w }),
      db.food.findMany({ where: w }),
      db.foodProduct.findMany({ where: w }),
      db.recipe.findMany({ where: w, include: { items: true } }),
      db.meal.findMany({ where: w, include: { entries: true }, orderBy: { localDate: 'asc' } }),
      db.dailyNutrition.findMany({ where: w }),
      db.waterIntake.findMany({ where: w }),
      db.activityRecord.findMany({ where: w }),
      db.workout.findMany({ where: w }),
      db.sleepRecord.findMany({ where: w }),
      db.reminder.findMany({ where: w }),
      db.goal.findMany({ where: w }),
      db.aIProviderConfig.findMany({ where: w }),
      db.aIUsage.findMany({ where: w }),
      db.weeklyMenu.findMany({ where: w }),
      db.pantryItem.findMany({ where: w }),
      db.aIConversation.findMany({ where: w, include: { messages: { orderBy: { createdAt: 'asc' } } } }),
      db.progressPhoto.findMany({ where: w, orderBy: { takenAt: 'asc' } }),
    ]);
    // Nunca se exportan hashes de contraseña/tokens ni claves API.
    const out = {
      exportedAt: new Date().toISOString(), app: 'FitTrack', format: 1,
      account: user, profile, weights, measurements, foods, products, recipes, meals, dailyNutrition: daily, water, activity, workouts, sleep, reminders, goals,
      ai: { providerConfig: aiConfigs, usage, conversations: convos, weeklyMenus: menus }, pantry,
      progressPhotos: photoRows.map((p) => ({ id: p.id, takenAt: p.takenAt, note: p.note, mime: p.mime, bytes: p.bytes, ...(photos === '1' ? { dataBase64: Buffer.from(p.data).toString('base64') } : {}) })),
      notes: photos === '1' ? undefined : 'Las fotos no se incluyen por defecto (usa ?photos=1).',
    };
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="fittrack-export-${new Date().toISOString().slice(0, 10)}.json"`);
    reply.header('cache-control', 'no-store');
    return reply.send(JSON.stringify(out));
  });

  app.post('/password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { current, next } = z.object({ current: z.string().min(1).max(200), next: z.string().min(12, 'Mínimo 12 caracteres').max(200) }).parse(req.body);
    const user = await db.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (!(await verifyPassword(current, user.passwordHash))) return reply.code(403).send({ error: 'INVALID_PASSWORD' });
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
    // Cierra todas las demás sesiones.
    await db.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  });

  app.delete('/', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { password, confirm } = z.object({ password: z.string().min(1).max(200), confirm: z.literal('BORRAR TODO') }).parse(req.body);
    const user = await db.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (!(await verifyPassword(password, user.passwordHash))) return reply.code(403).send({ error: 'INVALID_PASSWORD' });
    await db.user.delete({ where: { id: user.id } }); // cascada: borra todo lo asociado, incluidas fotos y claves
    reply.clearCookie('ft_refresh', { path: '/api/auth' });
    return { ok: true, deleted: true };
  });
};
