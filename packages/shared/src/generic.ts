import type { FoodItem } from './food';

// Alimentos genéricos y platos caseros habituales (valores orientativos por 100 g, ya cocinados/preparados tal como se comen),
// para que «patatas fritas» encuentre las caseras y no solo las congeladas o de bolsa del súper.
// [nombre, otros nombres, kcal, prot, carb, grasa, saturadas, fibra, azúcares, sal, unidad?, gramos por unidad?]
type Row = [string, string, number, number, number, number, number, number, number, number, string?, number?];

const ROWS: Row[] = [
  // Patata
  ['Patatas fritas caseras (fritas en aceite)', 'patata frita freidora sartén', 290, 3.6, 37, 13.5, 2, 3.2, 0.5, 0.3],
  ['Patatas fritas caseras (al horno / air fryer)', 'patata asada airfryer', 160, 3, 28, 4.5, 0.7, 2.8, 0.8, 0.2],
  ['Patata cocida', 'patatas hervidas', 86, 1.9, 19.5, 0.1, 0, 1.8, 0.8, 0],
  ['Patata al horno / asada', 'patata asada', 93, 2.5, 21, 0.1, 0, 2.2, 1.2, 0.01],
  ['Puré de patata casero (con leche y mantequilla)', 'puré patatas', 115, 2.2, 15.5, 5, 3, 1.5, 1.5, 0.3],
  ['Tortilla de patata casera', 'tortilla española', 190, 7, 12, 12, 2.4, 1.2, 1.2, 0.5, 'ración', 150],
  // Huevo
  ['Huevo cocido', 'huevo duro', 155, 12.6, 1.1, 10.6, 3.3, 0, 1.1, 0.4, 'unidad', 55],
  ['Huevo frito', 'huevos fritos', 196, 13.6, 0.8, 15.3, 3.7, 0, 0.4, 0.4, 'unidad', 50],
  ['Huevo revuelto', 'huevos revueltos', 170, 11, 1.5, 13, 4, 0, 1.4, 0.4],
  ['Tortilla francesa', 'tortilla huevo', 180, 12.5, 1, 14, 4, 0, 0.8, 0.4, 'unidad', 100],
  ['Huevo (crudo)', 'huevo', 143, 12.6, 0.7, 9.5, 3.1, 0, 0.7, 0.4, 'unidad', 60],
  // Arroz / pasta / cereales
  ['Arroz blanco cocido', 'arroz hervido', 130, 2.7, 28, 0.3, 0.1, 0.4, 0, 0],
  ['Arroz integral cocido', '', 123, 2.7, 25.6, 1, 0.2, 1.8, 0.4, 0],
  ['Arroz blanco (crudo)', '', 355, 7, 78, 0.6, 0.2, 1.4, 0.1, 0],
  ['Pasta cocida', 'macarrones espagueti fideos cocidos', 158, 5.8, 31, 0.9, 0.2, 1.8, 0.6, 0],
  ['Pasta (cruda)', 'macarrones espagueti', 360, 12.5, 72, 1.5, 0.3, 3, 3, 0.02],
  ['Macarrones con tomate (caseros)', 'pasta tomate', 140, 4.5, 24, 3, 0.6, 1.8, 3.5, 0.3],
  ['Copos de avena', 'avena', 372, 13, 60, 7, 1.3, 10, 1, 0.02],
  ['Pan blanco', 'barra pan', 265, 9, 49, 3.2, 0.7, 2.7, 3, 1.2, 'rebanada', 30],
  ['Pan integral', '', 247, 9, 41, 3.4, 0.7, 7, 3.5, 1.1, 'rebanada', 30],
  ['Tostada de pan con aceite', 'tostada aceite oliva', 330, 7, 45, 13, 2, 2.5, 2, 1, 'tostada', 45],
  ['Lentejas cocidas', 'lentejas guisadas', 116, 9, 20, 0.4, 0.1, 7.9, 1.8, 0],
  ['Garbanzos cocidos', '', 164, 8.9, 27, 2.6, 0.3, 7.6, 4.8, 0.01],
  ['Alubias cocidas', 'judías frijoles', 127, 8.7, 22.8, 0.5, 0.1, 6.4, 0.3, 0],
  ['Pan rallado', '', 395, 13, 72, 5, 1, 4.5, 6, 1.5],
  // Carnes
  ['Pechuga de pollo a la plancha', 'pollo plancha', 165, 31, 0, 3.6, 1, 0, 0, 0.15],
  ['Pechuga de pollo (cruda)', 'pollo crudo', 110, 23, 0, 1.6, 0.4, 0, 0, 0.15],
  ['Pollo empanado frito (casero)', 'filete empanado pollo san jacobo', 260, 20, 14, 14, 3, 0.8, 0.5, 0.6],
  ['Muslo de pollo asado (con piel)', 'pollo asado', 215, 25, 0, 12.5, 3.5, 0, 0, 0.2],
  ['Ternera a la plancha', 'filete ternera', 190, 28, 0, 8.5, 3.4, 0, 0, 0.1],
  ['Carne picada de ternera cocinada', 'hamburguesa carne picada', 250, 26, 0, 16, 6.5, 0, 0, 0.15],
  ['Lomo de cerdo a la plancha', 'cerdo', 200, 27, 0, 10, 3.5, 0, 0, 0.1],
  ['Chuleta de cerdo a la plancha', '', 240, 25, 0, 15.5, 5.5, 0, 0, 0.15],
  ['Pavo (pechuga) a la plancha', '', 150, 30, 0, 3, 0.9, 0, 0, 0.15],
  ['Salchicha de cerdo cocinada', 'salchichas', 300, 13, 3, 26, 9.5, 0, 1, 1.8],
  ['Jamón cocido (york)', 'jamon york', 105, 17, 1.5, 3.5, 1.2, 0, 1, 2.3, 'loncha', 20],
  ['Jamón serrano', '', 240, 31, 0.3, 12.5, 4.3, 0, 0, 5, 'loncha', 15],
  ['Albóndigas caseras en salsa', '', 190, 14, 8, 11, 4, 0.8, 2, 0.7],
  // Pescado
  ['Salmón a la plancha', 'salmon', 206, 22, 0, 13, 3, 0, 0, 0.1],
  ['Merluza a la plancha', 'merluza hervida', 100, 21, 0, 1.8, 0.4, 0, 0, 0.2],
  ['Merluza rebozada frita (casera)', 'merluza frita', 215, 15, 12, 12, 2, 0.6, 0.5, 0.5],
  ['Atún en lata al natural', 'atun lata', 110, 25, 0, 1, 0.3, 0, 0, 1, 'lata', 52],
  ['Atún en lata en aceite (escurrido)', 'atun aceite', 200, 26, 0, 10.5, 1.9, 0, 0, 1, 'lata', 52],
  ['Gambas a la plancha', 'langostinos', 99, 21, 0.2, 1.1, 0.3, 0, 0, 0.6],
  ['Calamares a la romana (fritos)', 'calamares rebozados', 220, 12, 14, 12, 2, 0.6, 0.5, 0.6],
  // Verduras
  ['Ensalada mixta (lechuga, tomate, cebolla)', 'ensalada', 20, 1, 3.5, 0.2, 0, 1.5, 2.5, 0.01],
  ['Tomate', '', 18, 0.9, 3.9, 0.2, 0, 1.2, 2.6, 0.01, 'unidad', 120],
  ['Lechuga', '', 15, 1.4, 2.9, 0.2, 0, 1.3, 0.8, 0.03],
  ['Brócoli cocido', 'brocoli', 35, 2.4, 7, 0.4, 0.1, 3.3, 1.4, 0.03],
  ['Zanahoria', '', 41, 0.9, 9.6, 0.2, 0, 2.8, 4.7, 0.2, 'unidad', 80],
  ['Judías verdes cocidas', 'judias verdes', 35, 1.9, 7, 0.3, 0.1, 3.2, 1.4, 0],
  ['Calabacín a la plancha', 'calabacin', 25, 1.5, 3.5, 0.6, 0.1, 1.2, 2, 0.01],
  ['Espinacas cocidas', '', 23, 3, 3.6, 0.3, 0, 2.4, 0.4, 0.2],
  ['Pimientos fritos', 'pimiento', 90, 1.2, 6, 6.5, 1, 2, 4, 0.2],
  ['Tomate frito (casero)', 'salsa tomate', 80, 1.4, 8, 4.8, 0.7, 1.6, 6, 0.4],
  ['Gazpacho', '', 45, 0.8, 4.5, 2.8, 0.4, 0.9, 3.5, 0.5],
  ['Croquetas caseras fritas', '', 230, 6.5, 20, 13.5, 3.5, 1, 2.5, 0.7, 'unidad', 30],
  // Fruta
  ['Plátano', 'banana', 89, 1.1, 22.8, 0.3, 0.1, 2.6, 12.2, 0, 'unidad', 120],
  ['Manzana', '', 52, 0.3, 13.8, 0.2, 0, 2.4, 10.4, 0, 'unidad', 180],
  ['Naranja', '', 47, 0.9, 11.8, 0.1, 0, 2.4, 9.4, 0, 'unidad', 180],
  ['Fresas', '', 32, 0.7, 7.7, 0.3, 0, 2, 4.9, 0],
  ['Uvas', '', 69, 0.7, 18, 0.2, 0.1, 0.9, 15.5, 0],
  ['Aguacate', '', 160, 2, 8.5, 14.7, 2.1, 6.7, 0.7, 0.01, 'unidad', 150],
  // Lácteos y grasas
  ['Leche entera', '', 64, 3.3, 4.7, 3.6, 2.3, 0, 4.7, 0.1],
  ['Leche semidesnatada', '', 47, 3.3, 4.8, 1.6, 1, 0, 4.8, 0.1],
  ['Leche desnatada', '', 34, 3.4, 4.9, 0.1, 0.1, 0, 4.9, 0.1],
  ['Yogur natural', '', 61, 3.5, 4.7, 3.3, 2.1, 0, 4.7, 0.1, 'unidad', 125],
  ['Yogur natural desnatado', '', 40, 4, 5.5, 0.2, 0.1, 0, 5.5, 0.1, 'unidad', 125],
  ['Queso fresco batido 0 %', 'skyr quark', 50, 8, 4, 0.2, 0.1, 0, 4, 0.1],
  ['Queso curado', '', 400, 26, 0.5, 33, 21, 0, 0.5, 1.8, 'loncha', 20],
  ['Mantequilla', '', 717, 0.9, 0.1, 81, 51, 0, 0.1, 0.05, 'cucharada', 10],
  ['Aceite de oliva', 'aove', 884, 0, 0, 100, 14, 0, 0, 0, 'cucharada', 10],
  ['Almendras', 'frutos secos', 580, 21, 20, 50, 4, 12, 4, 0.01],
  ['Nueces', '', 654, 15, 14, 65, 6, 6.7, 2.6, 0.01],
  ['Crema de cacahuete', 'mantequilla de cacahuete', 600, 25, 14, 50, 10, 6, 6, 0.6, 'cucharada', 15],
  // Otros platos caseros
  ['Pizza casera', '', 250, 11, 31, 9, 4, 2, 3, 1.2, 'ración', 150],
  ['Hamburguesa casera con pan', '', 270, 15, 22, 13, 5, 1.5, 4, 1, 'unidad', 200],
  ['Paella de verduras / pollo', 'paella', 150, 7, 20, 4.5, 1, 1, 1, 0.5],
  ['Lentejas estofadas con chorizo', 'lentejas con chorizo', 150, 8, 15, 6, 2, 4, 1, 0.6],
  ['Cocido madrileño', '', 140, 9, 12, 6, 2, 3, 1, 0.6],
  ['Sopa de pollo con fideos', '', 40, 3, 5, 1, 0.3, 0.3, 0.5, 0.6],
  ['Bocadillo de jamón serrano', 'bocata', 280, 14, 33, 10, 3, 2, 2, 2, 'unidad', 150],
  ['Bocadillo de tortilla francesa', '', 260, 11, 32, 9, 2, 2, 2, 0.9, 'unidad', 170],
  ['Magdalena casera', '', 410, 6, 55, 18, 6, 1, 28, 0.4, 'unidad', 45],
  ['Café con leche (sin azúcar)', '', 33, 1.7, 2.4, 1.8, 1.1, 0, 2.4, 0.05, 'taza', 200],
];

export type GenericFood = FoodItem & { search: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const GENERIC_FOODS: GenericFood[] = ROWS.map(([name, aliases, kcal, protein, carbs, fat, satFat, fiber, sugars, salt, unitName, unitGrams]) => ({
  kind: 'food', id: null, name, per100: { kcal, protein, carbs, fat, satFat, fiber, sugars, salt },
  unitName: unitName ?? null, unitGrams: unitGrams ?? null, source: 'GENERIC', search: norm(`${name} ${aliases}`),
}));

/** Busca por todas las palabras (sin tildes ni mayúsculas). Los nombres que empiezan por la búsqueda van primero. */
export function searchGenericFoods(q: string, limit = 12): FoodItem[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const first = norm(q).trim();
  const hits = GENERIC_FOODS.filter((f) => words.every((w) => f.search.includes(w)));
  hits.sort((a, b) => Number(norm(b.name).startsWith(first)) - Number(norm(a.name).startsWith(first)));
  return hits.slice(0, limit).map(({ search: _s, ...item }) => item);
}
