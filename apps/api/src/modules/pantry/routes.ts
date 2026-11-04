import { aggregateIngredients, norm, pantryAddSchema, pantryBulkSchema, type AiMenu } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

/** Despensa (qué tengo) y lista de la compra generada desde el último menú semanal. */
export const pantryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  app.get('/', async (req) => ({
    items: (await db.pantryItem.findMany({ where: { userId: req.user.sub }, orderBy: { name: 'asc' } })).map((p) => ({ id: p.id, name: p.name })),
  }));

  app.post('/', async (req, reply) => {
    const { name } = pantryAddSchema.parse(req.body);
    const userId = req.user.sub;
    const n = norm(name);
    if ((await db.pantryItem.count({ where: { userId } })) >= 200) return reply.code(409).send({ error: 'PANTRY_LIMIT' });
    const row = await db.pantryItem.upsert({ where: { userId_norm: { userId, norm: n } }, create: { userId, name, norm: n }, update: {} });
    return reply.code(201).send({ id: row.id, name: row.name });
  });

  app.post('/bulk', async (req, reply) => {
    const { names } = pantryBulkSchema.parse(req.body);
    const userId = req.user.sub;
    const unique = [...new Map(names.map((n) => [norm(n), n])).entries()].filter(([k]) => k);
    const existing = new Set((await db.pantryItem.findMany({ where: { userId }, select: { norm: true } })).map((p) => p.norm));
    const fresh = unique.filter(([k]) => !existing.has(k));
    if (existing.size + fresh.length > 200) return reply.code(409).send({ error: 'PANTRY_LIMIT' });
    await db.pantryItem.createMany({ data: fresh.map(([k, name]) => ({ userId, name, norm: k })), skipDuplicates: true });
    return reply.code(201).send({ added: fresh.length });
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const r = await db.pantryItem.deleteMany({ where: { id, userId: req.user.sub } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.get('/shopping', async (req) => {
    const userId = req.user.sub;
    const [menuRow, pantry] = await Promise.all([db.weeklyMenu.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }), db.pantryItem.findMany({ where: { userId } })]);
    if (!menuRow) return { menuId: null, items: [] };
    const menu = menuRow.menu as unknown as AiMenu;
    const agg = aggregateIngredients(menu.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients)), norm);
    const have = pantry.map((p) => p.norm);
    return {
      menuId: menuRow.id, createdAt: menuRow.createdAt, note: 'Cantidades aproximadas, sumadas de los 7 días del menú. Los que ya tienes en la despensa van aparte.',
      items: agg.map((i) => ({ ...i, inPantry: have.some((h) => norm(i.name).includes(h) || h.includes(norm(i.name))) })),
    };
  });
};
