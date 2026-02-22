import { format, isSameWeek, parseISO, startOfWeek } from 'date-fns';
import { getIngredientsForDish } from './geminiService';
import { mockDb } from './mockDb';
import { Meal, ShoppingItem } from '../types';

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
const isTortillaDePatata = (dishName: string): boolean => normalizeText(dishName).includes('tortilla de patata');

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

  if (ingredientKey === 'pan de fajita') {
    return 2;
  }

  if (ingredientKey === 'huevos') {
    return isTortillaDePatata(dishName) ? 5 : 2;
  }

  return 1;
};


const getCurrentWeekKey = (referenceDate: Date): string => {
  const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return format(currentWeekStart, 'yyyy-MM-dd');
};

const loadCurrentWeekSuppressed = async (userId: string, currentWeekKey: string): Promise<Record<string, number>> => {
  const syncState = await mockDb.inventorySync.get(userId);

  if (!syncState || syncState.weekKey !== currentWeekKey) {
    return {};
  }

  return syncState.consumed || {};
};

const buildCurrentWeekRequirements = async (userId: string, referenceDate: Date) => {
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

  return { requiredCounts, requiredDisplayNames };
};

const calculateDeficits = async (userId: string, requiredCounts: Record<string, number>) => {
  const inventoryItems = await mockDb.inventory.list(userId);
  const inventoryByNormalized: Record<string, number | 'm'> = {};

  inventoryItems.forEach((item) => {
    const canonical = canonicalizeIngredient(item.ingredient_name);
    inventoryByNormalized[canonical.key] = item.quantity;
  });

  const deficits: Record<string, number> = {};

  for (const normalizedIngredient of Object.keys(requiredCounts)) {
    const required = requiredCounts[normalizedIngredient] || 0;
    const inventoryQuantity = inventoryByNormalized[normalizedIngredient];

    const hasInfiniteInventory = inventoryQuantity === 'm';
    const currentInventory = typeof inventoryQuantity === 'number' ? inventoryQuantity : 0;

    const missing = hasInfiniteInventory ? 0 : Math.max(required - currentInventory, 0);

    if (missing > 0) {
      deficits[normalizedIngredient] = missing;
    }
  }

  return deficits;
};

const buildAutoItemIndex = (shoppingItems: ShoppingItem[]) => {
  const autoItems = shoppingItems.filter((item) => !item.manual);
  const byIngredientKey: Record<string, ShoppingItem[]> = {};

  autoItems.forEach((item) => {
    const ingredientKey = canonicalizeIngredient(item.ingredient_name).key;
    if (!byIngredientKey[ingredientKey]) {
      byIngredientKey[ingredientKey] = [];
    }
    byIngredientKey[ingredientKey].push(item);
  });

  return byIngredientKey;
};

export const syncCurrentWeekShoppingAndInventoryIncremental = async (
  userId: string,
  referenceDate: Date = new Date()
) => {
  const currentWeekKey = getCurrentWeekKey(referenceDate);

  const { requiredCounts, requiredDisplayNames } = await buildCurrentWeekRequirements(userId, referenceDate);
  const deficits = await calculateDeficits(userId, requiredCounts);
  const suppressedByIngredient = await loadCurrentWeekSuppressed(userId, currentWeekKey);
  const shoppingItems = await mockDb.shoppingItems.list(userId);
  const autoItemIndex = buildAutoItemIndex(shoppingItems);

  for (const [ingredientKey, existingItems] of Object.entries(autoItemIndex)) {
    if (existingItems.length > 1) {
      await Promise.all(existingItems.slice(1).map((item) => mockDb.shoppingItems.delete(item.id)));
      autoItemIndex[ingredientKey] = [existingItems[0]];
    }
  }

  for (const [normalizedIngredient, missingCount] of Object.entries(deficits)) {
    const suppressedQuantity = suppressedByIngredient[normalizedIngredient] || 0;
    const adjustedMissingCount = Math.max(missingCount - suppressedQuantity, 0);
    const existing = autoItemIndex[normalizedIngredient]?.[0];

    if (adjustedMissingCount <= 0) {
      if (existing) {
        await mockDb.shoppingItems.delete(existing.id);
      }
      continue;
    }

    if (existing) {
      await mockDb.shoppingItems.update(existing.id, {
        ingredient_name: requiredDisplayNames[normalizedIngredient] || existing.ingredient_name,
        required_quantity: adjustedMissingCount
      });
      continue;
    }

    await mockDb.shoppingItems.add({
      user_id: userId,
      ingredient_name: requiredDisplayNames[normalizedIngredient] || normalizedIngredient,
      category: 'Ingredientes',
      purchased: false,
      manual: false,
      required_quantity: adjustedMissingCount
    });
  }

  const deficitKeys = new Set(Object.keys(deficits));
  const removals = Object.entries(autoItemIndex)
    .filter(([ingredientKey]) => !deficitKeys.has(ingredientKey))
    .flatMap(([, items]) => items.map((item) => mockDb.shoppingItems.delete(item.id)));

  if (removals.length > 0) {
    await Promise.all(removals);
  }

  await mockDb.inventorySync.update(userId, {
    weekKey: currentWeekKey,
    consumed: suppressedByIngredient
  });
};


export const registerSuppressedAutoIngredient = async (
  userId: string,
  ingredientName: string,
  quantity: number,
  referenceDate: Date = new Date()
) => {
  if (quantity <= 0) {
    return;
  }

  const ingredientKey = canonicalizeIngredient(ingredientName).key;
  const currentWeekKey = getCurrentWeekKey(referenceDate);
  const syncState = await mockDb.inventorySync.get(userId);

  const baseConsumed = syncState?.weekKey === currentWeekKey ? syncState.consumed : {};
  const nextConsumed = {
    ...baseConsumed,
    [ingredientKey]: (baseConsumed[ingredientKey] || 0) + quantity
  };

  await mockDb.inventorySync.update(userId, {
    weekKey: currentWeekKey,
    consumed: nextConsumed
  });
};

export const syncWeeklyShoppingAndInventory = async (userId: string, referenceDate: Date = new Date()) => {
  const currentWeekKey = getCurrentWeekKey(referenceDate);
  const shoppingItems = await mockDb.shoppingItems.list(userId);
  const autoItems = shoppingItems.filter((item) => !item.manual);
  await Promise.all(autoItems.map((item) => mockDb.shoppingItems.delete(item.id)));

  await syncCurrentWeekShoppingAndInventoryIncremental(userId, referenceDate);

  await mockDb.inventorySync.update(userId, {
    weekKey: currentWeekKey,
    consumed: {}
  });
};
