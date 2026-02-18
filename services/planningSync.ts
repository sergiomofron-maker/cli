import { format, isSameWeek, parseISO, startOfWeek } from 'date-fns';
import { getIngredientsForDish } from './geminiService';
import { mockDb } from './mockDb';
import { Meal } from '../types';

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const canonicalizeIngredient = (ingredient: string): { key: string; displayName: string } => {
  const normalized = normalizeText(ingredient);

  if (normalized.includes('pimiento')) {
    return { key: 'pimiento', displayName: 'Pimiento' };
  }

  const displayName = ingredient.trim();
  return {
    key: normalized,
    displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1)
  };
};

const isEnsaladaDeGarbanzos = (dishName: string): boolean => normalizeText(dishName).includes('ensalada de garbanzos');
const isFajitas = (dishName: string): boolean => normalizeText(dishName).includes('fajita');

const getIngredientWeight = (dishName: string, ingredientKey: string): number => {
  const inGarbanzosSalad = isEnsaladaDeGarbanzos(dishName);

  if (ingredientKey === 'pimiento') {
    return inGarbanzosSalad || isFajitas(dishName) ? 0.25 : 0.5;
  }

  if (ingredientKey === 'garbanzos' && inGarbanzosSalad) {
    return 0.5;
  }

  if (ingredientKey === 'atun' && inGarbanzosSalad) {
    return 0.5;
  }

  if (ingredientKey === 'carne picada') {
    return 0.5;
  }

  return 1;
};

export const syncWeeklyShoppingAndInventory = async (userId: string, referenceDate: Date = new Date()) => {
  const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const currentWeekKey = format(currentWeekStart, 'yyyy-MM-dd');

  const allMeals = await mockDb.meals.list(userId);
  const currentWeekMeals = allMeals.filter((meal: Meal) =>
    isSameWeek(parseISO(meal.date), referenceDate, { weekStartsOn: 1 })
  );

  const requiredCounts: Record<string, number> = {};
  const requiredDisplayNames: Record<string, string> = {};

  for (const meal of currentWeekMeals) {
    const { ingredients } = await getIngredientsForDish(meal.dish_name);

    ingredients.forEach((ingredient) => {
      const cleanName = ingredient.trim();
      if (!cleanName) return;

      const canonical = canonicalizeIngredient(cleanName);
      const ingredientWeight = getIngredientWeight(meal.dish_name, canonical.key);

      requiredCounts[canonical.key] = (requiredCounts[canonical.key] || 0) + ingredientWeight;
      if (!requiredDisplayNames[canonical.key]) {
        requiredDisplayNames[canonical.key] = canonical.displayName;
      }
    });
  }

  const [inventoryItems, shoppingItems] = await Promise.all([
    mockDb.inventory.list(userId),
    mockDb.shoppingItems.list(userId)
  ]);

  const inventoryByNormalized: Record<string, { displayName: string; quantity: number | 'm' }> = {};
  inventoryItems.forEach((item) => {
    const canonical = canonicalizeIngredient(item.ingredient_name);
    inventoryByNormalized[canonical.key] = {
      displayName: canonical.displayName,
      quantity: item.quantity
    };
  });

  const deficits: Record<string, number> = {};

  for (const normalizedIngredient of Object.keys(requiredCounts)) {
    const required = requiredCounts[normalizedIngredient] || 0;
    const inventoryQuantity = inventoryByNormalized[normalizedIngredient]?.quantity;

    const hasInfiniteInventory = inventoryQuantity === 'm';
    const currentInventory = typeof inventoryQuantity === 'number' ? inventoryQuantity : 0;

    const missing = hasInfiniteInventory ? 0 : Math.max(required - currentInventory, 0);

    if (missing > 0) {
      deficits[normalizedIngredient] = missing;
    }
  }

  const autoItems = shoppingItems.filter((item) => !item.manual);
  await Promise.all(autoItems.map((item) => mockDb.shoppingItems.delete(item.id)));

  for (const [normalizedIngredient, missingCount] of Object.entries(deficits)) {
    await mockDb.shoppingItems.add({
      user_id: userId,
      ingredient_name: requiredDisplayNames[normalizedIngredient] || normalizedIngredient,
      category: 'Ingredientes',
      purchased: false,
      manual: false,
      required_quantity: missingCount
    });
  }

  await mockDb.inventorySync.update(userId, {
    weekKey: currentWeekKey,
    consumed: {}
  });
};
