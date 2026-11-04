import { createHmac, timingSafeEqual } from 'node:crypto';
import { IMAGE_MAX_BYTES, photoUploadSchema } from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fromDbDate } from '../../lib/dates';

const MAX_PHOTOS = 300;
const URL_TTL_S = 300;

/** Detecta el tipo real por los bytes (no se fía del tipo declarado por el cliente). */
export function sniffImage(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Fotos de progreso privadas: guardadas en BD, accesibles solo con sesión o con URL firmada de 5 minutos. */
export const photoRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma;
  const sign = (id: string, userId: string, exp: number) => createHmac('sha256', app.env.JWT_SECRET).update(`photo|${id}|${userId}|${exp}`).digest('base64url');

  // Ruta de archivo: no usa cabecera Authorization (la pide un <img>); la firma liga foto, usuario y caducidad.
  app.get('/:id/file', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { exp, sig } = z.object({ exp: z.coerce.number().int(), sig: z.string().max(100) }).parse(req.query);
    const p = await db.progressPhoto.findUnique({ where: { id } });
    const okSig = p && exp * 1000 > Date.now() && (() => { const a = Buffer.from(sign(id, p.userId, exp)), b = Buffer.from(sig); return a.length === b.length && timingSafeEqual(a, b); })();
    if (!p || !okSig) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.header('content-type', p.mime).header('cache-control', 'private, no-store').header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox").send(Buffer.from(p.data));
  });

  app.register(async (priv) => {
    priv.addHook('onRequest', app.authenticate);

    priv.post('/', { bodyLimit: 5_000_000, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
      const b = photoUploadSchema.parse(req.body);
      const userId = req.user.sub;
      const buf = Buffer.from(b.imageBase64.replace(/^data:[^,]+,/, ''), 'base64');
      if (buf.length > IMAGE_MAX_BYTES) return reply.code(413).send({ error: 'IMAGE_TOO_LARGE' });
      const mime = sniffImage(buf);
      if (!mime) return reply.code(415).send({ error: 'UNSUPPORTED_IMAGE', message: 'Solo JPEG, PNG o WebP.' });
      if ((await db.progressPhoto.count({ where: { userId } })) >= MAX_PHOTOS) return reply.code(409).send({ error: 'PHOTO_LIMIT' });
      const row = await db.progressPhoto.create({ data: { userId, takenAt: new Date(`${b.date}T12:00:00Z`), note: b.note, mime, bytes: buf.length, data: buf } });
      return reply.code(201).send({ id: row.id });
    });

    priv.get('/', async (req) => ({
      items: (await db.progressPhoto.findMany({ where: { userId: req.user.sub }, orderBy: { takenAt: 'asc' }, select: { id: true, takenAt: true, note: true, bytes: true } }))
        .map((p) => ({ id: p.id, date: fromDbDate(p.takenAt), note: p.note, bytes: p.bytes })),
    }));

    priv.get('/:id/url', async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const p = await db.progressPhoto.findFirst({ where: { id, userId: req.user.sub }, select: { id: true } });
      if (!p) return reply.code(404).send({ error: 'NOT_FOUND' });
      const exp = Math.floor(Date.now() / 1000) + URL_TTL_S;
      return { url: `/api/photos/${id}/file?exp=${exp}&sig=${sign(id, req.user.sub, exp)}`, expiresInSeconds: URL_TTL_S };
    });

    priv.delete('/:id', async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const r = await db.progressPhoto.deleteMany({ where: { id, userId: req.user.sub } });
      return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
    });
  });
};
