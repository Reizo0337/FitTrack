import type { AIProvider, AITask } from '@prisma/client';

export type ImageIn = { mime: string; data: string }; // data = base64 sin prefijo
export type ChatMsg = { role: 'user' | 'assistant'; content: string; images?: ImageIn[] };
export type CompleteArgs = { apiKey: string; model: string; system: string; messages: ChatMsg[]; json: boolean; maxTokens: number; fetchImpl: typeof fetch };
export type Completion = { text: string; tokensIn: number; tokensOut: number };

export class ProviderError extends Error {
  /** `detail`: mensaje breve del proveedor (cuota agotada, modelo sobrecargado…); nunca incluye la clave. `retryAfterMs`: espera sugerida. */
  constructor(public kind: 'auth' | 'rate' | 'overloaded' | 'billing' | 'model' | 'other', public status: number, public detail?: string, public retryAfterMs?: number) {
    super(`provider_${kind}_${status}`);
  }
}

/** Extrae solo el texto del mensaje de error del proveedor (recortado), no el cuerpo entero. */
async function errorDetail(r: Response): Promise<string | undefined> {
  try {
    const j = (await r.json()) as { error?: { message?: string } | string };
    const m = typeof j.error === 'string' ? j.error : j.error?.message;
    return m?.replace(/\s+/g, ' ').slice(0, 220);
  } catch { return undefined; }
}

async function post(f: typeof fetch, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  if (!r.ok) {
    const kind = r.status === 401 || r.status === 403 ? 'auth' : r.status === 429 ? 'rate' : r.status === 503 || r.status === 529 ? 'overloaded' : r.status === 402 ? 'billing' : r.status === 404 ? 'model' : 'other';
    const ra = Number(r.headers.get('retry-after'));
    throw new ProviderError(kind, r.status, await errorDetail(r), Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
  }
  return r.json();
}

type Adapter = (a: CompleteArgs) => Promise<Completion>;

const anthropic: Adapter = async (a) => {
  const j = (await post(a.fetchImpl, 'https://api.anthropic.com/v1/messages', { 'x-api-key': a.apiKey, 'anthropic-version': '2023-06-01' }, {
    model: a.model, max_tokens: a.maxTokens, system: a.system,
    messages: a.messages.map((m) => ({ role: m.role, content: m.images?.length ? [...m.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: m.content }] : m.content })),
  })) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  return { text: (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''), tokensIn: j.usage?.input_tokens ?? 0, tokensOut: j.usage?.output_tokens ?? 0 };
};

const openai: Adapter = async (a) => {
  const j = (await post(a.fetchImpl, 'https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${a.apiKey}` }, {
    model: a.model, max_tokens: a.maxTokens, messages: [{ role: 'system', content: a.system }, ...a.messages.map((m) => ({ role: m.role, content: m.images?.length ? [...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } })), { type: 'text', text: m.content }] : m.content }))],
    ...(a.json ? { response_format: { type: 'json_object' } } : {}),
  })) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: j.choices?.[0]?.message?.content ?? '', tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0 };
};

const gemini: Adapter = async (a) => {
  const j = (await post(a.fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:generateContent`, { 'x-goog-api-key': a.apiKey }, {
    systemInstruction: { parts: [{ text: a.system }] },
    contents: a.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [...(m.images ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: m.content }] })),
    generationConfig: { maxOutputTokens: a.maxTokens, ...(a.json ? { responseMimeType: 'application/json' } : {}) },
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  return { text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''), tokensIn: j.usageMetadata?.promptTokenCount ?? 0, tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0 };
};

export const ADAPTERS: Record<AIProvider, Adapter> = { ANTHROPIC: anthropic, OPENAI: openai, GEMINI: gemini };

/** Modelos por defecto (editables en Ajustes; los nombres cambian con el tiempo, verifícalos en la documentación del proveedor). */
export const DEFAULT_MODELS: Record<AIProvider, Record<AITask, string>> = {
  ANTHROPIC: { NUTRITIONIST: 'claude-sonnet-5-5', FOOD_RECOGNITION: 'claude-haiku-5-5', WEEKLY_ANALYSIS: 'claude-sonnet-5-5' },
  OPENAI: { NUTRITIONIST: 'gpt-4o', FOOD_RECOGNITION: 'gpt-4o-mini', WEEKLY_ANALYSIS: 'gpt-4o' },
  // Google retira modelos a menudo (2.0 y 2.5 ya no están disponibles para cuentas nuevas).
  GEMINI: { NUTRITIONIST: 'gemini-3.5-flash', FOOD_RECOGNITION: 'gemini-3.5-flash-lite', WEEKLY_ANALYSIS: 'gemini-3.5-flash' },
};
