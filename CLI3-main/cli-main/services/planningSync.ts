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

const getWeekKey = (referenceDate: Date): string => {
  const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return format(currentWeekStart, 'yyyy-MM-dd');
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

  if (ingredientKey === 'alubias') {
    return 0.5;
  }

  return 1;
};

type MealIngredientRequirements = {
  requiredCounts: Record<string, number>;
  requiredDisplayNames: Record<string, string>;
};

const getMealIngredientRequirements = async (meal: Meal): Promise<MealIngredientRequirements> => {
  const { ingredients } = await getIngredientsForDish(meal.dish_name);

  const requiredCounts: Record<string, number> = {};
  const requiredDisplayNames: Record<string, string> = {};

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

  return { requiredCounts, requiredDisplayNames };
};

const getInventoryByIngredientKey = async (userId: string) => {
  const inventoryItems = await mockDb.inventory.list(userId);
  const inventoryByNormalized: Record<string, number | 'm'> = {};

  inventoryItems.forEach((item) => {
    const canonical = canonicalizeIngredient(item.ingredient_name);
    inventoryByNormalized[canonical.key] = item.quantity;
  });

  return inventoryByNormalized;
};

const buildCurrentWeekRequirements = async (userId: string, referenceDate: Date) => {
  const allMeals = await mockDb.meals.list(userId);
  const currentWeekMeals = allMeals.filter((meal: Meal) =>
    isSameWeek(parseISO(meal.date), referenceDate, { weekStartsOn: 1 })
  );

  const requiredCounts: Record<string, number> = {};
  const requiredDisplayNames: Record<string, string> = {};

  for (const meal of currentWeekMeals) {
    const mealRequirements = await getMealIngredientRequirements(meal);

    Object.entries(mealRequirements.requiredCounts).forEach(([ingredientKey, ingredientRequired]) => {
      requiredCounts[ingredientKey] = (requiredCounts[ingredientKey] || 0) + ingredientRequired;
    });

    Object.entries(mealRequirements.requiredDisplayNames).forEach(([ingredientKey, displayName]) => {
      if (!requiredDisplayNames[ingredientKey]) {
        requiredDisplayNames[ingredientKey] = displayName;
      }
    });
  }

  return { requiredCounts, requiredDisplayNames };
};

const calculateDeficits = async (userId: string, requiredCounts: Record<string, number>) => {
  const inventoryByNormalized = await getInventoryByIngredientKey(userId);

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

const applyIngredientDeltas = async (
  userId: string,
  ingredientDeltas: Record<string, number>,
  ingredientDisplayNames: Record<string, string>
) => {
  const affectedIngredientKeys = Object.keys(ingredientDeltas).filter(
    (ingredientKey) => ingredientDeltas[ingredientKey] !== 0
  );

  if (affectedIngredientKeys.length === 0) {
    return;
  }

  const [shoppingItems, inventoryByIngredientKey] = await Promise.all([
    mockDb.shoppingItems.list(userId),
    getInventoryByIngredientKey(userId)
  ]);

  const autoItemIndex = buildAutoItemIndex(shoppingItems);

  for (const ingredientKey of affectedIngredientKeys) {
    const deltaRequired = ingredientDeltas[ingredientKey] || 0;
    const existingItems = autoItemIndex[ingredientKey] || [];
    const currentMissing = existingItems.reduce((sum, item) => sum + (item.required_quantity || 0), 0);

    const inventoryQuantity = inventoryByIngredientKey[ingredientKey];
    const hasInfiniteInventory = inventoryQuantity === 'm';
    const inventoryAvailable = typeof inventoryQuantity === 'number' ? inventoryQuantity : 0;

    const currentRequired = hasInfiniteInventory ? 0 : inventoryAvailable + currentMissing;
    const nextRequired = Math.max(currentRequired + deltaRequired, 0);
    const nextMissing = hasInfiniteInventory ? 0 : Math.max(nextRequired - inventoryAvailable, 0);

    if (nextMissing <= 0) {
      if (existingItems.length > 0) {
        await Promise.all(existingItems.map((item) => mockDb.shoppingItems.delete(item.id)));
      }
      continue;
    }

    const ingredientName =
      ingredientDisplayNames[ingredientKey] ||
      existingItems[0]?.ingredient_name ||
      ingredientKey.charAt(0).toUpperCase() + ingredientKey.slice(1);

    if (existingItems.length > 0) {
      await mockDb.shoppingItems.update(existingItems[0].id, {
        ingredient_name: ingredientName,
        required_quantity: nextMissing
      });

      if (existingItems.length > 1) {
        await Promise.all(existingItems.slice(1).map((item) => mockDb.shoppingItems.delete(item.id)));
      }
      continue;
    }

    await mockDb.shoppingItems.add({
      user_id: userId,
      ingredient_name: ingredientName,
      category: 'Ingredientes',
      purchased: false,
      manual: false,
      required_quantity: nextMissing
    });
  }
};

export const applyMealAdded = async (userId: string, meal: Meal) => {
  const mealRequirements = await getMealIngredientRequirements(meal);
  await applyIngredientDeltas(userId, mealRequirements.requiredCounts, mealRequirements.requiredDisplayNames);
};

export const applyMealDeleted = async (userId: string, meal: Meal) => {
  const mealRequirements = await getMealIngredientRequirements(meal);
  const negativeDeltas = Object.fromEntries(
    Object.entries(mealRequirements.requiredCounts).map(([ingredientKey, value]) => [ingredientKey, -value])
  );

  await applyIngredientDeltas(userId, negativeDeltas, mealRequirements.requiredDisplayNames);
};

export const applyMealUpdated = async (userId: string, previousMeal: Meal, nextMeal: Meal) => {
  const [previousRequirements, nextRequirements] = await Promise.all([
    getMealIngredientRequirements(previousMeal),
    getMealIngredientRequirements(nextMeal)
  ]);

  const ingredientKeys = new Set([
    ...Object.keys(previousRequirements.requiredCounts),
    ...Object.keys(nextRequirements.requiredCounts)
  ]);

  const ingredientDeltas: Record<string, number> = {};
  const ingredientDisplayNames: Record<string, string> = {
    ...previousRequirements.requiredDisplayNames,
    ...nextRequirements.requiredDisplayNames
  };

  ingredientKeys.forEach((ingredientKey) => {
    const previousValue = previousRequirements.requiredCounts[ingredientKey] || 0;
    const nextValue = nextRequirements.requiredCounts[ingredientKey] || 0;
    ingredientDeltas[ingredientKey] = nextValue - previousValue;
  });

  await applyIngredientDeltas(userId, ingredientDeltas, ingredientDisplayNames);
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
  const currentWeekKey = getWeekKey(referenceDate);

  const { requiredCounts, requiredDisplayNames } = await buildCurrentWeekRequirements(userId, referenceDate);
  const deficits = await calculateDeficits(userId, requiredCounts);
  const shoppingItems = await mockDb.shoppingItems.list(userId);
  const autoItemIndex = buildAutoItemIndex(shoppingItems);
  const exclusions = await mockDb.shoppingAutoExclusions.listActive(userId, currentWeekKey);
  const excludedIngredientKeys = new Set(exclusions.map((entry) => entry.ingredient_key));

  for (const [ingredientKey, existingItems] of Object.entries(autoItemIndex)) {
    if (existingItems.length > 1) {
      await Promise.all(existingItems.slice(1).map((item) => mockDb.shoppingItems.delete(item.id)));
      autoItemIndex[ingredientKey] = [existingItems[0]];
    }
  }

  for (const [normalizedIngredient, missingCount] of Object.entries(deficits)) {
    if (excludedIngredientKeys.has(normalizedIngredient)) {
      continue;
    }

    const existing = autoItemIndex[normalizedIngredient]?.[0];

    if (existing) {
      await mockDb.shoppingItems.update(existing.id, {
        ingredient_name: requiredDisplayNames[normalizedIngredient] || existing.ingredient_name,
        required_quantity: missingCount
      });
      continue;
    }

    await mockDb.shoppingItems.add({
      user_id: userId,
      ingredient_name: requiredDisplayNames[normalizedIngredient] || normalizedIngredient,
      category: 'Ingredientes',
      purchased: false,
      manual: false,
      required_quantity: missingCount
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
    consumed: {}
  });
};

export const syncWeeklyShoppingAndInventory = async (userId: string, referenceDate: Date = new Date()) => {
  await mockDb.shoppingAutoExclusions.clearAllForUser(userId);

  const shoppingItems = await mockDb.shoppingItems.list(userId);
  const autoItems = shoppingItems.filter((item) => !item.manual);
  await Promise.all(autoItems.map((item) => mockDb.shoppingItems.delete(item.id)));

  await syncCurrentWeekShoppingAndInventoryIncremental(userId, referenceDate);
};
