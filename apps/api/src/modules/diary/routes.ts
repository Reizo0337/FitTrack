import { entryCreateSchema, localDate, MEAL_TYPES, scaleFromPer100, waterCreateSchema } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toDbDate } from '../../lib/dates';
import { gramsPerUnit, per100Of } from '../../lib/foodrows';
import { buildDiary, getOrCreateMeal, recomputeDaily } from './service';

export const diaryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  app.get('/', async (req) => {
    const { date } = z.object({ date: localDate }).parse(req.query);
    return buildDiary(db, req.user.sub, date);
  });

  // Añadir una entrada: los nutrientes se calculan SIEMPRE con la cantidad real consumida.
  app.post('/entries', async (req, reply) => {
    const b = entryCreateSchema.parse(req.body);
    const userId = req.user.sub;
    const row = b.kind === 'food'
      ? await db.food.findFirst({ where: { id: b.id, userId } })
      : await db.foodProduct.findFirst({ where: { id: b.id, userId } });
    if (!row) return reply.code(404).send({ error: 'FOOD_NOT_FOUND' });
    let grams = b.grams;
    if (grams == null) {
      const unit = gramsPerUnit(b.kind, row);
      if (!unit) return reply.code(422).send({ error: 'NO_UNIT_SIZE', message: 'Este alimento no tiene tamaño de unidad/ración definido; indica gramos.' });
      grams = Math.round(unit * (b.units as number) * 10) / 10;
    }
    if (grams > 5000) return reply.code(400).send({ error: 'VALIDATION' });
    const n = scaleFromPer100(per100Of(row), grams);
    const profile = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    const meal = await getOrCreateMeal(db, userId, b.date, b.type, profile.timezone);
    const entry = await db.mealEntry.create({
      data: {
        mealId: meal.id, name: row.name, grams, ...n,
        foodId: b.kind === 'food' ? row.id : null, productId: b.kind === 'product' ? row.id : null,
        source: row.source,
      },
    });
    if (b.kind === 'product') await db.foodProduct.update({ where: { id: row.id }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } });
    await recomputeDaily(db, userId, b.date);
    return reply.code(201).send({ id: entry.id, grams, nutrients: n });
  });

  app.patch('/entries/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { grams } = z.object({ grams: z.number().positive().max(5000) }).parse(req.body);
    const e = await db.mealEntry.findFirst({ where: { id, meal: { userId: req.user.sub } }, include: { meal: true } });
    if (!e) return reply.code(404).send({ error: 'NOT_FOUND' });
    const f = grams / e.grams; // reescala la instantánea (válido también para entradas de IA/estimadas)
    const r = (v: number, d = 1) => Math.round(v * f * 10 ** d) / 10 ** d;
    await db.mealEntry.update({
      where: { id },
      data: { grams, kcal: r(e.kcal, 0), protein: r(e.protein), carbs: r(e.carbs), fat: r(e.fat), satFat: r(e.satFat), fiber: r(e.fiber), sugars: r(e.sugars), salt: r(e.salt) },
    });
    await recomputeDaily(db, req.user.sub, e.meal.localDate.toISOString().slice(0, 10));
    return { ok: true };
  });

  app.delete('/entries/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const e = await db.mealEntry.findFirst({ where: { id, meal: { userId: req.user.sub } }, include: { meal: true } });
    if (!e) return reply.code(404).send({ error: 'NOT_FOUND' });
    await db.mealEntry.delete({ where: { id } });
    await recomputeDaily(db, req.user.sub, e.meal.localDate.toISOString().slice(0, 10));
    return { ok: true };
  });

  // Repetir comidas de otro día (o de un solo tipo de comida).
  app.post('/copy', async (req) => {
    const b = z.object({ fromDate: localDate, toDate: localDate, type: z.enum(MEAL_TYPES).optional() }).parse(req.body);
    const userId = req.user.sub;
    const meals = await db.meal.findMany({
      where: { userId, localDate: toDbDate(b.fromDate), ...(b.type ? { type: b.type } : {}) },
      include: { entries: true },
    });
    const profile = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    let copied = 0;
    for (const m of meals) {
      if (!m.entries.length) continue;
      const target = await getOrCreateMeal(db, userId, b.toDate, m.type === 'AFTERNOON_SNACK' ? 'SNACKS' : m.type, profile.timezone);
      await db.mealEntry.createMany({
        data: m.entries.map(({ id: _id, mealId: _m, createdAt: _c, ...rest }) => ({ ...rest, mealId: target.id })),
      });
      copied += m.entries.length;
    }
    await recomputeDaily(db, userId, b.toDate);
    return { copied };
  });

  app.post('/water', async (req, reply) => {
    const b = waterCreateSchema.parse(req.body);
    const w = await db.waterIntake.create({ data: { userId: req.user.sub, localDate: toDbDate(b.date), ml: b.ml } });
    return reply.code(201).send({ id: w.id });
  });

  app.delete('/water/last', async (req, reply) => {
    const { date } = z.object({ date: localDate }).parse(req.query);
    const last = await db.waterIntake.findFirst({ where: { userId: req.user.sub, localDate: toDbDate(date) }, orderBy: { at: 'desc' } });
    if (!last) return reply.code(404).send({ error: 'NOT_FOUND' });
    await db.waterIntake.delete({ where: { id: last.id } });
    return { ok: true };
  });
};
