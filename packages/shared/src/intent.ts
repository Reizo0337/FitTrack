/**
 * Detección de intención en el chat: si el mensaje pide algo que ya hace una función de IA de la app
 * (registrar lo comido, ideas de comida, menú semanal, informe), se ejecuta esa función como si se hubiera
 * escrito desde su pantalla. Reglas deterministas en español: sin coste de IA ni latencia extra. Ante la duda
 * devuelve null y el mensaje sigue siendo una conversación normal.
 */
export type EatCategory = 'economica' | 'rapida' | 'facil' | 'alta_proteina' | 'baja_caloria' | 'receta';
export type ChatIntent =
  | { tool: 'log'; text: string }
  | { tool: 'eat'; category?: EatCategory; budgetEur?: number; available?: string[] }
  | { tool: 'menu'; budgetEur?: number }
  | { tool: 'report' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const FOOD_WORDS = /\b(pollo|pavo|ternera|cerdo|cordero|carne|jamon|pescado|salmon|atun|merluza|gambas|huevos?|tortilla|arroz|pasta|macarrones|espaguetis|pizza|pan|tostadas?|bocadillo|sandwich|hamburguesa|ensalada|verduras?|tomate|patatas?|lentejas|garbanzos|judias|sopa|crema|fruta|manzana|platano|naranja|yogur|queso|leche|cafe|te|batido|prozis|avena|cereales|galletas?|chocolate|helado|cerveza|vino|zumo|aceite|nueces|almendras|frutos secos|tarta|pastel|kebab|sushi|bolsa|barrita)\b/;
const QUANTITY = /\b\d+(?:[.,]\d+)?\s*(g|gr|gramos?|kg|ml|cl|l|litros?|uds?|unidades?|raciones?|rebanadas?|lonchas?|cucharad(?:a|as|ita|itas)|tazas?|vasos?|platos?|trozos?|latas?|botes?|piezas?)\b/;
const ATE = /\b(he|hemos) (comido|cenado|desayunado|almorzado|merendado|tomado|picado|bebido)\b|\bme (he|hemos) (comido|tomado|bebido|zampado)\b|\bacabo de (comer|cenar|desayunar|merendar|almorzar|tomar)\b|\b(comi|cene|desayune|meriende|almorce|tome)\b/;

const eurosIn = (t: string): number | undefined => {
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?|eur)\b/);
  const v = m ? Number(m[1]!.replace(',', '.')) : NaN;
  return Number.isFinite(v) && v > 0 && v <= 500 ? v : undefined;
};

const categoryIn = (t: string): EatCategory | undefined => {
  if (/\breceta\b/.test(t)) return 'receta';
  if (/\b(proteic[oa]s?|alto en proteina|ricas? en proteina|mucha proteina)\b/.test(t)) return 'alta_proteina';
  if (/\b(ligera|ligero|light|pocas calorias|bajo en calorias|baja en calorias|hipocalorica?)\b/.test(t)) return 'baja_caloria';
  if (/\b(barat[oa]s?|economic[oa]s?)\b/.test(t)) return 'economica';
  if (/\b(rapid[oa]s?|express|en 10 minutos|en 15 minutos)\b/.test(t)) return 'rapida';
  if (/\b(facil(?:es)?|sencill[oa]s?)\b/.test(t)) return 'facil';
  return undefined;
};

const availableIn = (t: string): string[] | undefined => {
  const m = t.match(/\btengo (?:en casa )?(.{3,120})$/);
  if (!m) return undefined;
  const items = m[1]!.replace(/[?!.¿¡]+/g, ' ').split(/,| y | e | con /).map((s) => s.replace(/^((un|una|unos|unas|el|la|los|las)\s+)?((algo de|poco de|poca|un poco de)\s+)?/, '').trim()).filter((s) => s.length >= 2 && s.length <= 40);
  return items.length ? items.slice(0, 8) : undefined;
};

export function detectIntent(raw: string): ChatIntent | null {
  const t = norm(raw);
  if (t.length < 4 || t.length > 600) return null;
  const isQuestion = raw.includes('?');

  // 1) Informe / análisis de la semana
  if (/\b(informe( semanal)?|resumen (de )?(mi|la|esta) semana|analiza (mi|la|esta) semana|analisis (de )?(mi|la|esta) semana|como (me )?(ha|ha ido|fue|va) (mi |la |esta )?semana)\b/.test(t)) return { tool: 'report' };

  // 2) Menú semanal
  if (/\b(menu|plan de comidas|planificacion|plan de alimentacion)\b/.test(t) && /\b(semana|semanal|7 dias|siete dias)\b/.test(t)) {
    const budgetEur = eurosIn(t);
    return budgetEur ? { tool: 'menu', budgetEur } : { tool: 'menu' };
  }

  // 3) Registrar lo que se ha comido: afirmativo, en pasado y con señales claras de comida
  if (!isQuestion && ATE.test(t) && (QUANTITY.test(t) || FOOD_WORDS.test(t))) return { tool: 'log', text: raw.trim() };

  // 4) Ideas de qué comer (hoy / ahora): si habla de mañana o de la semana, es una conversación normal
  if (!/\b(manana|pasado|semana|semanal|ayer)\b/.test(t)) {
    const ask = /\bque (puedo|podria|deberia|debo|me recomiendas|me sugieres|como|ceno|desayuno|meriendo|almuerzo|cocino|preparo)\b.{0,25}\b(comer|cenar|desayunar|merendar|almorzar|cocinar|preparar)\b|\bque (como|ceno|desayuno|meriendo|almuerzo|cocino|preparo)\b|\b(ideas?|opciones?|sugerencias?|recomendaciones?|recomiendame|sugiereme)\b.{0,30}\b(comida|cena|desayuno|merienda|almuerzo|comer|cenar|snack|receta)\b|\b(dame|quiero|busco|necesito|hazme|ponme|propon(?:me|gas)?) (una |alguna |unas )?(recetas?|cena|comida|desayuno|merienda)\b|\balgo (rapido |ligero|barato |facil |sano |proteico |de proteina )?para (comer|cenar|desayunar|merendar)\b/;
    if (ask.test(t)) {
      const out: ChatIntent = { tool: 'eat' };
      const category = categoryIn(t), budgetEur = eurosIn(t), available = availableIn(t);
      if (category) out.category = category;
      if (budgetEur) out.budgetEur = budgetEur;
      if (available) out.available = available;
      return out;
    }
  }
  return null;
}
