import {
  aiConfigRequest, aiFoodParse, aiKeyRequest, aiMenu, aiRecommend, aiWeeklyNarrative, chatRequest, findViolations, foodConfirmRequest,
  foodParseRequest, localDate, menuRequest, nutrientsLookInconsistent, recommendRequest, type AiMenu,
} from '@fittrack/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildContext, weeklyStats } from '../../ai/context';
import { CHAT_PROMPT, FOOD_PARSE_PROMPT, MENU_PROMPT, RECOMMEND_PROMPT, WEEKLY_PROMPT } from '../../ai/prompts';
import { DEFAULT_MODELS } from '../../ai/providers';
import { cacheKey, getTaskConfig, runJson, runText, type AIDeps } from '../../ai/service';
import { toDbDate } from '../../lib/dates';
import { encryptSecret } from '../../security';
import { getOrCreateMeal, recomputeDaily } from '../diary/service';

const TASKS = ['NUTRITIONIST', 'FOOD_RECOGNITION', 'WEEKLY_ANALYSIS'] as const;
const PROVIDERS = ['ANTHROPIC', 'GEMINI', 'OPENAI'] as const;
const wrap = (tag: string, v: unknown) => `<${tag}>${typeof v === 'string' ? v : JSON.stringify(v)}</${tag}>`;

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const db = app.prisma;
  const deps = (userId: string): AIDeps => ({ db, env: app.env, fetchImpl: app.fetchImpl, userId });
  const blockedOf = async (userId: string) => {
    const p = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    return { allergies: p.allergies, disliked: p.dislikedFoods, blocked: [...p.allergies, ...p.dislikedFoods], sex: p.sex, targetKcal: p.targetKcal };
  };

  // ---------- Configuración (las claves NUNCA se devuelven) ----------
  app.get('/config', async (req) => {
    const userId = req.user.sub;
    const [keys, usage, profile] = await Promise.all([
      db.aIProviderKey.findMany({ where: { userId }, select: { provider: true } }),
      db.aIUsage.findMany({ where: { userId, day: toDbDate(new Date().toISOString().slice(0, 10)) } }),
      db.userProfile.findUniqueOrThrow({ where: { userId } }),
    ]);
    return {
      consent: profile.aiConsent,
      providers: PROVIDERS.map((p) => ({ provider: p, hasKey: keys.some((k) => k.provider === p) })),
      tasks: await Promise.all(TASKS.map(async (t) => ({ task: t, ...(await getTaskConfig(db, userId, t)) }))),
      defaults: DEFAULT_MODELS,
      usageToday: { calls: usage.reduce((a, u) => a + u.calls, 0), limit: app.env.AI_DAILY_LIMIT, tokensIn: usage.reduce((a, u) => a + u.tokensIn, 0), tokensOut: usage.reduce((a, u) => a + u.tokensOut, 0) },
    };
  });
  app.put('/config', async (req) => {
    const { items } = aiConfigRequest.parse(req.body);
    for (const i of items) {
      await db.aIProviderConfig.upsert({ where: { userId_task: { userId: req.user.sub, task: i.task } }, create: { userId: req.user.sub, ...i }, update: { provider: i.provider, model: i.model } });
    }
    return { ok: true };
  });
  app.put('/keys', async (req) => {
    const { provider, apiKey } = aiKeyRequest.parse(req.body);
    const encryptedKey = encryptSecret(apiKey, app.env.MASTER_KEY);
    await db.aIProviderKey.upsert({ where: { userId_provider: { userId: req.user.sub, provider } }, create: { userId: req.user.sub, provider, encryptedKey }, update: { encryptedKey } });
    return { ok: true };
  });
  app.delete('/keys/:provider', async (req, reply) => {
    const { provider } = z.object({ provider: z.enum(PROVIDERS) }).parse(req.params);
    const r = await db.aIProviderKey.deleteMany({ where: { userId: req.user.sub, provider } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  // ---------- Registro de comidas por lenguaje natural ----------
  // Solo se envía el texto escrito (ningún dato personal). Las cifras son ESTIMACIONES que hay que confirmar.
  app.post('/food/parse', async (req) => {
    const b = foodParseRequest.parse(req.body);
    const { data } = await runJson(deps(req.user.sub), 'FOOD_RECOGNITION', { prompt: FOOD_PARSE_PROMPT, user: wrap('texto_usuario', b.text), schema: aiFoodParse, maxTokens: 1800 });
    return {
      isEstimate: true,
      disclaimer: 'Valores estimados por IA, no exactos. Revísalos y corrígelos antes de guardar.',
      notes: data.notes ?? null,
      items: data.items.map((i) => ({ ...i, inconsistent: nutrientsLookInconsistent({ kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, satFat: i.satFat, fiber: i.fiber, sugars: i.sugars, salt: i.salt }) })),
    };
  });

  app.post('/food/confirm', async (req, reply) => {
    const b = foodConfirmRequest.parse(req.body);
    const userId = req.user.sub;
    const profile = await db.userProfile.findUniqueOrThrow({ where: { userId } });
    const meal = await getOrCreateMeal(db, userId, b.date, b.type, profile.timezone);
    await db.mealEntry.createMany({
      data: b.items.map((i) => ({ mealId: meal.id, name: i.name, grams: i.grams, kcal: Math.round(i.kcal), protein: i.protein, carbs: i.carbs, fat: i.fat, satFat: i.satFat, fiber: i.fiber, sugars: i.sugars, salt: i.salt, isEstimate: true, source: 'AI' as const })),
    });
    await recomputeDaily(db, userId, b.date);
    return reply.code(201).send({ saved: b.items.length });
  });

  // ---------- Qué comer ----------
  app.post('/recommend', async (req) => {
    const b = recommendRequest.parse(req.body);
    const userId = req.user.sub;
    const [ctx, who] = await Promise.all([buildContext(db, userId, b.date, 7), blockedOf(userId)]);
    const rem = ctx.hoy.restante as Record<string, number>;
    const key = cacheKey('rec', Math.round((rem.kcal ?? 0) / 50), Math.round((rem.protein ?? 0) / 10), b.category, b.budgetEur, [...(b.available ?? [])].sort(), who.blocked);
    const user = wrap('datos_usuario', { ...ctx, petición: { categoria: b.category ?? 'cualquiera', presupuestoEur: b.budgetEur ?? null, alimentosDisponibles: b.available ?? [] } });
    const { data, cached } = await runJson(deps(userId), 'NUTRITIONIST', { prompt: RECOMMEND_PROMPT, user, schema: aiRecommend, maxTokens: 3500, cache: { key, ttlMin: 180 } });
    // Defensa propia: nunca se muestra una opción con ingredientes bloqueados, diga lo que diga el modelo.
    const safe = data.options.filter((o) => findViolations(o.ingredients.map((i) => i.name), who.blocked).length === 0);
    return {
      cached, isEstimate: true, removedForRestrictions: data.options.length - safe.length,
      remaining: ctx.hoy.restante,
      options: safe.map((o) => ({ ...o, exceedsRemainingKcal: rem.kcal != null && o.kcal > rem.kcal * 1.15 })),
    };
  });

  // ---------- Menú semanal ----------
  const checkMenu = (menu: AiMenu, who: Awaited<ReturnType<typeof blockedOf>>) => {
    const warnings: string[] = [];
    const floor = who.sex === 'MALE' ? 1500 : 1200;
    for (const d of menu.days) {
      const v = findViolations(d.meals.flatMap((m) => m.ingredients.map((i) => i.name)), who.blocked);
      if (v.length) warnings.push(`${d.day}: contiene alimentos que has excluido → ${v.join(', ')}`);
      const kcal = d.meals.reduce((a, m) => a + m.kcal, 0);
      if (kcal < floor) warnings.push(`${d.day}: solo ${Math.round(kcal)} kcal, por debajo del mínimo de seguridad (${floor}).`);
      else if (Math.abs(kcal - who.targetKcal) > who.targetKcal * 0.2) warnings.push(`${d.day}: ${Math.round(kcal)} kcal, se aleja más de un 20 % de tu objetivo (${who.targetKcal}).`);
    }
    return { warnings, violated: warnings.some((w) => w.includes('has excluido')) };
  };

  app.post('/menu/weekly', async (req) => {
    const b = menuRequest.parse(req.body ?? {});
    const userId = req.user.sub;
    const date = new Date().toISOString().slice(0, 10);
    const [ctx, who] = await Promise.all([buildContext(db, userId, date, 7), blockedOf(userId)]);
    const base = { objetivosDiarios: ctx.objetivosDiarios, perfil: { sexo: ctx.perfil.sexo }, alergiasIntolerancias: who.allergies, alimentosRechazados: who.disliked, presupuestoSemanalEur: b.budgetEur ?? null, alimentosDisponibles: b.available ?? [] };
    const d = deps(userId);
    let { data } = await runJson(d, 'NUTRITIONIST', { prompt: MENU_PROMPT, user: wrap('datos_usuario', base), schema: aiMenu, maxTokens: 7000, cache: { key: cacheKey('menu', base), ttlMin: 60 } });
    let check = checkMenu(data, who);
    if (check.violated) { // un único reintento indicando los errores concretos
      const retry = await runJson(d, 'NUTRITIONIST', { prompt: MENU_PROMPT, user: `${wrap('datos_usuario', base)}\nCORRIGE estos errores del intento anterior y vuelve a generar el menú completo:\n${check.warnings.join('\n')}`, schema: aiMenu, maxTokens: 7000 });
      data = retry.data; check = checkMenu(data, who);
    }
    const row = await db.weeklyMenu.create({ data: { userId, menu: data, warnings: check.warnings } });
    return { id: row.id, isEstimate: true, menu: data, warnings: check.warnings };
  });
  app.get('/menu/latest', async (req) => {
    const m = await db.weeklyMenu.findFirst({ where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' } });
    return m ? { id: m.id, createdAt: m.createdAt, menu: m.menu, warnings: m.warnings, isEstimate: true } : { menu: null };
  });

  // ---------- Nutricionista (chat) ----------
  app.post('/chat', async (req) => {
    const b = chatRequest.extend({ date: localDate.optional() }).parse(req.body);
    const userId = req.user.sub;
    let convo = b.conversationId ? await db.aIConversation.findFirst({ where: { id: b.conversationId, userId } }) : null;
    if (b.conversationId && !convo) throw Object.assign(new Error('NOT_FOUND'), { statusCode: 404 });
    convo ??= await db.aIConversation.create({ data: { userId, title: b.message.slice(0, 60) } });
    const history = await db.aIMessage.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'desc' }, take: 10 });
    const ctx = await buildContext(db, userId, b.date ?? new Date().toISOString().slice(0, 10), 14);
    const { text, tokensIn, tokensOut } = await runText(deps(userId), 'NUTRITIONIST', {
      system: `${CHAT_PROMPT}\n${wrap('datos_usuario', ctx)}`,
      messages: [...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })), { role: 'user' as const, content: b.message }],
    });
    await db.aIMessage.createMany({ data: [{ conversationId: convo.id, role: 'user', content: b.message }, { conversationId: convo.id, role: 'assistant', content: text, tokensIn, tokensOut }] });
    return { conversationId: convo.id, reply: text };
  });
  app.get('/conversations', async (req) => ({
    items: (await db.aIConversation.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' }, take: 30 })).map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt })),
  }));
  app.get('/conversations/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const c = await db.aIConversation.findFirst({ where: { id, userId: req.user.sub }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    return c ? { id: c.id, messages: c.messages.map((m) => ({ role: m.role, content: m.content })) } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  // ---------- Análisis semanal con IA (las cifras salen de las estadísticas calculadas) ----------
  app.post('/weekly-analysis', async (req) => {
    const { end } = z.object({ end: localDate }).parse(req.body);
    const stats = await weeklyStats(db, req.user.sub, end);
    const { data, cached } = await runJson(deps(req.user.sub), 'WEEKLY_ANALYSIS', { prompt: WEEKLY_PROMPT, user: wrap('datos_usuario', stats), schema: aiWeeklyNarrative, maxTokens: 1500, cache: { key: cacheKey('weekly', stats), ttlMin: 24 * 60 } });
    return { cached, narrative: data };
  });
};
