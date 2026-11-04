import { foodCreateSchema, searchGenericFoods } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { foodToItem, productToItem } from '../../lib/foodrows';
import { offByBarcode, offSearch } from './off';

const kindParam = z.object({ kind: z.enum(['food', 'product']), id: z.string() });

export const foodRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;

  // Búsqueda local. Sin `q`: favoritos y recientes.
  app.get('/search', async (req) => {
    const { q = '' } = z.object({ q: z.string().max(80).optional() }).parse(req.query);
    const userId = req.user.sub;
    const where = q ? { userId, name: { contains: q, mode: 'insensitive' as const } } : { userId };
    const [foods, products] = await Promise.all([
      db.food.findMany({ where: q ? where : { userId, isFavorite: true }, orderBy: [{ isFavorite: 'desc' }, { name: 'asc' }], take: 25 }),
      db.foodProduct.findMany({ where: q ? where : { userId, OR: [{ isFavorite: true }, { usageCount: { gt: 0 } }] }, orderBy: [{ isFavorite: 'desc' }, { usageCount: 'desc' }, { name: 'asc' }], take: 25 }),
    ]);
    const mine = [...products.map(productToItem), ...foods.map(foodToItem)];
    // Alimentos genéricos y caseros (patatas fritas caseras, arroz cocido…). Se omiten los que ya tienes guardados con el mismo nombre.
    const have = new Set(mine.map((i) => i.name.toLowerCase()));
    const generic = q ? searchGenericFoods(q).filter((g) => !have.has(g.name.toLowerCase())) : [];
    return { items: [...mine, ...generic] };
  });

  app.get('/off/search', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { q } = z.object({ q: z.string().min(2).max(80) }).parse(req.query);
    try {
      return { items: await offSearch(app.fetchImpl, q) };
    } catch (e) {
      req.log.warn({ off: String(e) }, 'Open Food Facts: búsqueda no disponible'); // el motivo queda en los logs del servidor
      return reply.code(502).send({ error: 'OFF_UNAVAILABLE' });
    }
  });

  // Código de barras: primero tu base local; si no, Open Food Facts (sin guardar hasta que lo confirmes).
  app.get('/barcode/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6,14}$/) }).parse(req.params);
    const local = await db.foodProduct.findUnique({ where: { userId_barcode: { userId: req.user.sub, barcode: code } } });
    if (local) return { status: 'found', origin: 'local', item: productToItem(local) };
    try {
      let r = await offByBarcode(app.fetchImpl, code);
      // Un UPC-A (12 cifras) figura en OFF como EAN-13 con un 0 delante, y al revés.
      if (r.status === 'not_found') {
        const alt = code.length === 12 ? `0${code}` : code.length === 13 && code.startsWith('0') ? code.slice(1) : null;
        if (alt) { const r2 = await offByBarcode(app.fetchImpl, alt); if (r2.status !== 'not_found') r = r2; }
      }
      return { ...r, origin: 'off', barcode: code };
    } catch (e) {
      req.log.warn({ off: String(e) }, 'Open Food Facts: código de barras no disponible');
      return reply.code(502).send({ error: 'OFF_UNAVAILABLE' });
    }
  });

  app.post('/', async (req, reply) => {
    const b = foodCreateSchema.parse(req.body);
    const userId = req.user.sub;
    const base = {
      userId, name: b.name, kcal100: b.per100.kcal, protein100: b.per100.protein, carbs100: b.per100.carbs, fat100: b.per100.fat,
      satFat100: b.per100.satFat, fiber100: b.per100.fiber, sugars100: b.per100.sugars, salt100: b.per100.salt,
      isFavorite: b.isFavorite ?? false, source: b.source,
    };
    // Con código de barras, marca o ración => producto; si no, alimento genérico.
    if (b.barcode || b.brand || b.servingG) {
      if (b.barcode && (await db.foodProduct.findUnique({ where: { userId_barcode: { userId, barcode: b.barcode } } })))
        return reply.code(409).send({ error: 'BARCODE_EXISTS' });
      const row = await db.foodProduct.create({
        data: { ...base, brand: b.brand, barcode: b.barcode, servingG: b.servingG, servingName: b.servingName },
      });
      return reply.code(201).send(productToItem(row));
    }
    const row = await db.food.create({ data: { ...base, unitName: b.unitName, unitGrams: b.unitGrams } });
    return reply.code(201).send(foodToItem(row));
  });

  app.patch('/:kind/:id/favorite', async (req, reply) => {
    const { kind, id } = kindParam.parse(req.params);
    const { isFavorite } = z.object({ isFavorite: z.boolean() }).parse(req.body);
    const userId = req.user.sub;
    const r = kind === 'food'
      ? await db.food.updateMany({ where: { id, userId }, data: { isFavorite } })
      : await db.foodProduct.updateMany({ where: { id, userId }, data: { isFavorite } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.delete('/:kind/:id', async (req, reply) => {
    const { kind, id } = kindParam.parse(req.params);
    const userId = req.user.sub;
    const r = kind === 'food'
      ? await db.food.deleteMany({ where: { id, userId } })
      : await db.foodProduct.deleteMany({ where: { id, userId } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
  });
};
