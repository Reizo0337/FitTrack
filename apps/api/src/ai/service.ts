import { createHash } from 'node:crypto';
import type { AIProvider, AITask, PrismaClient } from '@prisma/client';
import type { ZodType } from 'zod';
import type { Env } from '../env';
import { toDbDate } from '../lib/dates';
import { decryptSecret } from '../security';
import { ADAPTERS, DEFAULT_MODELS, ProviderError, type ChatMsg, type Completion } from './providers';
import { JSON_ONLY, SAFETY_SYSTEM } from './prompts';

export class AIError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export type AIDeps = { db: PrismaClient; env: Env; fetchImpl: typeof fetch; userId: string };

export async function getTaskConfig(db: PrismaClient, userId: string, task: AITask): Promise<{ provider: AIProvider; model: string }> {
  const c = await db.aIProviderConfig.findUnique({ where: { userId_task: { userId, task } } });
  return c ? { provider: c.provider, model: c.model } : { provider: 'ANTHROPIC', model: DEFAULT_MODELS.ANTHROPIC[task] };
}

const today = () => toDbDate(new Date().toISOString().slice(0, 10));

async function guard(d: AIDeps, task: AITask) {
  const profile = await d.db.userProfile.findUniqueOrThrow({ where: { userId: d.userId } });
  if (!profile.aiConsent) throw new AIError(403, 'AI_CONSENT_REQUIRED', 'Activa el consentimiento de IA en Ajustes para usar esta función.');
  const { provider, model } = await getTaskConfig(d.db, d.userId, task);
  const k = await d.db.aIProviderKey.findUnique({ where: { userId_provider: { userId: d.userId, provider } } });
  if (!k) throw new AIError(409, 'AI_KEY_MISSING', `Falta la clave API de ${provider} (Ajustes → IA).`);
  const used = await d.db.aIUsage.aggregate({ where: { userId: d.userId, day: today() }, _sum: { calls: true } });
  if ((used._sum.calls ?? 0) >= d.env.AI_DAILY_LIMIT) throw new AIError(429, 'AI_DAILY_LIMIT', 'Has alcanzado el límite diario de llamadas a la IA.');
  return { provider, model, apiKey: decryptSecret(k.encryptedKey, d.env.MASTER_KEY) };
}

async function call(d: AIDeps, task: AITask, g: Awaited<ReturnType<typeof guard>>, system: string, messages: ChatMsg[], json: boolean, maxTokens: number): Promise<Completion> {
  let out: Completion;
  try {
    out = await ADAPTERS[g.provider]({ apiKey: g.apiKey, model: g.model, system, messages, json, maxTokens, fetchImpl: d.fetchImpl });
  } catch (e) {
    if (e instanceof ProviderError) {
      if (e.kind === 'auth') throw new AIError(502, 'AI_PROVIDER_AUTH', 'El proveedor rechazó la clave API. Revísala en Ajustes.');
      if (e.kind === 'rate') throw new AIError(503, 'AI_PROVIDER_BUSY', 'El proveedor está limitando las peticiones. Inténtalo en un rato.');
      throw new AIError(502, 'AI_PROVIDER_ERROR', `Error del proveedor (${e.status}).`);
    }
    throw new AIError(502, 'AI_PROVIDER_ERROR', 'No se pudo contactar con el proveedor de IA.');
  }
  await d.db.aIUsage.upsert({
    where: { userId_day_task: { userId: d.userId, day: today(), task } },
    create: { userId: d.userId, day: today(), task, calls: 1, tokensIn: out.tokensIn, tokensOut: out.tokensOut },
    update: { calls: { increment: 1 }, tokensIn: { increment: out.tokensIn }, tokensOut: { increment: out.tokensOut } },
  });
  return out;
}

export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json');
  return JSON.parse(text.slice(start, end + 1));
}

export const cacheKey = (...parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/** Llamada con salida JSON validada (1 reintento de reparación) y caché opcional. */
export async function runJson<T>(d: AIDeps, task: AITask, o: { prompt: string; user: string; schema: ZodType<T, unknown>; maxTokens?: number; cache?: { key: string; ttlMin: number } }): Promise<{ data: T; cached: boolean }> {
  const g = await guard(d, task);
  if (o.cache) {
    const hit = await d.db.aICache.findUnique({ where: { userId_key: { userId: d.userId, key: o.cache.key } } });
    if (hit && hit.expiresAt > new Date()) return { data: JSON.parse(hit.response) as T, cached: true };
  }
  const system = `${SAFETY_SYSTEM}\n\n${o.prompt}${JSON_ONLY}`;
  const messages: ChatMsg[] = [{ role: 'user', content: o.user }];
  let out = await call(d, task, g, system, messages, true, o.maxTokens ?? 3000);
  let parsed = tryParse(out.text, o.schema);
  if (!parsed.ok) {
    out = await call(d, task, g, system, [...messages, { role: 'assistant', content: out.text.slice(0, 4000) }, { role: 'user', content: `Tu respuesta no cumple el formato (${parsed.error}). Devuelve solo el JSON corregido.` }], true, o.maxTokens ?? 3000);
    parsed = tryParse(out.text, o.schema);
  }
  if (!parsed.ok) throw new AIError(502, 'AI_BAD_OUTPUT', 'El modelo no devolvió una respuesta utilizable. Inténtalo de nuevo.');
  if (o.cache) {
    const expiresAt = new Date(Date.now() + o.cache.ttlMin * 60_000);
    await d.db.aICache.upsert({ where: { userId_key: { userId: d.userId, key: o.cache.key } }, create: { userId: d.userId, key: o.cache.key, response: JSON.stringify(parsed.data), expiresAt }, update: { response: JSON.stringify(parsed.data), expiresAt } });
  }
  return { data: parsed.data, cached: false };
}

function tryParse<T>(text: string, schema: ZodType<T, unknown>): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const r = schema.safeParse(extractJson(text));
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  } catch {
    return { ok: false, error: 'JSON inválido' };
  }
}

export async function runText(d: AIDeps, task: AITask, o: { system: string; messages: ChatMsg[]; maxTokens?: number }): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const g = await guard(d, task);
  return call(d, task, g, `${SAFETY_SYSTEM}\n\n${o.system}`, o.messages, false, o.maxTokens ?? 900);
}
