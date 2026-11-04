import type { FoodItem, Nutrients } from '@fittrack/shared';
import type { Food, FoodProduct } from '@prisma/client';

type Row = Food | FoodProduct;

export const per100Of = (r: Row): Nutrients => ({
  kcal: r.kcal100, protein: r.protein100, carbs: r.carbs100, fat: r.fat100,
  satFat: r.satFat100, fiber: r.fiber100, sugars: r.sugars100, salt: r.salt100,
});

export const foodToItem = (r: Food): FoodItem => ({
  kind: 'food', id: r.id, name: r.name, per100: per100Of(r), unitName: r.unitName, unitGrams: r.unitGrams,
  isFavorite: r.isFavorite, source: r.source,
});

export const productToItem = (r: FoodProduct): FoodItem => ({
  kind: 'product', id: r.id, name: r.name, brand: r.brand, barcode: r.barcode, per100: per100Of(r),
  servingG: r.servingG, servingName: r.servingName, isFavorite: r.isFavorite, source: r.source,
});

/** Gramos por unidad/ración para convertir unidades -> gramos (nunca se asume 100 g). */
export function gramsPerUnit(kind: 'food' | 'product', row: Food | FoodProduct): number | null {
  return kind === 'food' ? (row as Food).unitGrams : (row as FoodProduct).servingG;
}
