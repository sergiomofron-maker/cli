import { addDays, addWeeks, differenceInCalendarWeeks, format, parseISO, startOfWeek } from "date-fns";
import { InventoryItem, Meal, ShoppingAutoExclusion, ShoppingItem, User, WeeklyHistoryEntry, WeeklyMealSnapshot } from "../types";

// Keys for localStorage
const MEALS_KEY = 'planifia_meals';
const ITEMS_KEY = 'planifia_items';
const USER_KEY = 'planifia_user';
const NOTES_KEY = 'planifia_shopping_notes';
const INVENTORY_KEY = 'planifia_inventory';
const INVENTORY_SYNC_KEY = 'planifia_inventory_sync';
const SHOPPING_AUTO_EXCLUSIONS_KEY = 'planifia_shopping_auto_exclusions';
const WEEK_HISTORY_KEY = 'planifia_week_history';
const WEEK_HISTORY_META_KEY = 'planifia_week_history_meta';

// Mock delay to simulate network
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface InventorySyncState {
  weekKey: string;
  consumed: Record<string, number>;
}

type WeeklyHistoryStore = Record<string, WeeklyHistoryEntry[]>;
type WeeklyHistoryMetaStore = Record<string, { last_processed_week_key: string }>;

const getWeekStartKey = (date: Date): string => format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');

const getMealsForWeek = (allMeals: Meal[], userId: string, weekStartKey: string): WeeklyMealSnapshot[] => {
  const start = parseISO(weekStartKey);
  const end = addDays(start, 6);
  return allMeals
    .filter((meal) => {
      if (meal.user_id !== userId) return false;
      const mealDate = parseISO(meal.date);
      return mealDate >= start && mealDate <= end;
    })
    .map((meal) => ({
      date: meal.date,
      meal_type: meal.meal_type,
      dish_name: meal.dish_name
    }));
};

const sortHistoryEntries = (entries: WeeklyHistoryEntry[]): WeeklyHistoryEntry[] => {
  return [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.week_start.localeCompare(a.week_start);
  });
};

const trimHistoryEntries = (entries: WeeklyHistoryEntry[]): WeeklyHistoryEntry[] => {
  const pinnedEntries = entries.filter((entry) => entry.pinned);
  const unpinnedEntries = entries
    .filter((entry) => !entry.pinned)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, 3);

  return sortHistoryEntries([...pinnedEntries, ...unpinnedEntries]);
};

const upsertHistoryEntry = (entries: WeeklyHistoryEntry[], entry: WeeklyHistoryEntry): WeeklyHistoryEntry[] => {
  const existing = entries.find((candidate) => candidate.week_key === entry.week_key);
  const normalizedEntry: WeeklyHistoryEntry = {
    ...entry,
    pinned: existing?.pinned ?? entry.pinned ?? false,
    pinned_at: existing?.pinned_at ?? entry.pinned_at
  };
  const withoutSameWeek = entries.filter((candidate) => candidate.week_key !== entry.week_key);
  return trimHistoryEntries([normalizedEntry, ...withoutSameWeek]);
};

export const mockDb = {
  auth: {
    signIn: async (email: string) => {
      await delay(500);
      const user: User = { id: 'user_123', email };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { user, error: null };
    },
    signOut: async () => {
      localStorage.removeItem(USER_KEY);
      return { error: null };
    },
    getUser: () => {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) as User : null;
    }
  },
  meals: {
    list: async (userId: string) => {
      await delay(200);
      const all = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]');
      return all.filter((m: Meal) => m.user_id === userId);
    },
    add: async (meal: Omit<Meal, 'id'>) => {
      await delay(200);
      const all = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]');
      const newMeal = { ...meal, id: Date.now().toString() };
      all.push(newMeal);
      localStorage.setItem(MEALS_KEY, JSON.stringify(all));
      return newMeal;
    },
    update: async (id: string, updates: Partial<Omit<Meal, 'id' | 'user_id'>>) => {
      await delay(200);
      const all = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]') as Meal[];
      const index = all.findIndex((meal) => meal.id === id);

      if (index === -1) {
        return null;
      }

      const updatedMeal: Meal = {
        ...all[index],
        ...updates
      };

      all[index] = updatedMeal;
      localStorage.setItem(MEALS_KEY, JSON.stringify(all));
      return updatedMeal;
    },
    delete: async (id: string) => {
      await delay(200);
      let all = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]');
      all = all.filter((m: Meal) => m.id !== id);
      localStorage.setItem(MEALS_KEY, JSON.stringify(all));
    },
    repeatCurrentWeekIntoNextWeek: async (userId: string, now: Date = new Date()) => {
      await delay(200);

      const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const currentWeekEnd = addDays(currentWeekStart, 6);
      const nextWeekStart = addWeeks(currentWeekStart, 1);
      const nextWeekEnd = addDays(nextWeekStart, 6);

      const allMeals = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]') as Meal[];
      const sourceMeals = allMeals.filter((meal) => {
        if (meal.user_id !== userId) return false;
        const mealDate = parseISO(meal.date);
        return mealDate >= currentWeekStart && mealDate <= currentWeekEnd;
      });

      const preservedMeals = allMeals.filter((meal) => {
        if (meal.user_id !== userId) return true;
        const mealDate = parseISO(meal.date);
        return mealDate < nextWeekStart || mealDate > nextWeekEnd;
      });

      const repeatedMeals = sourceMeals.map((meal) => ({
        ...meal,
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        date: format(addWeeks(parseISO(meal.date), 1), 'yyyy-MM-dd')
      }));

      localStorage.setItem(MEALS_KEY, JSON.stringify([...preservedMeals, ...repeatedMeals]));

      return {
        targetWeekKey: format(nextWeekStart, 'yyyy-MM-dd'),
        mealsInserted: repeatedMeals.length
      };
    }
  },
  weeklyHistory: {
    list: async (userId: string) => {
      await delay(100);
      const all = JSON.parse(localStorage.getItem(WEEK_HISTORY_KEY) || '{}') as WeeklyHistoryStore;
      return sortHistoryEntries(all[userId] || []);
    },
    getByWeekKey: async (userId: string, weekKey: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(WEEK_HISTORY_KEY) || '{}') as WeeklyHistoryStore;
      const entries = all[userId] || [];
      return entries.find((entry) => entry.week_key === weekKey) || null;
    },
    syncOnAppOpen: async (userId: string, now: Date = new Date()) => {
      await delay(100);
      const currentWeekKey = getWeekStartKey(now);
      const currentWeekStart = parseISO(currentWeekKey);

      const allMeals = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]') as Meal[];
      const historyStore = JSON.parse(localStorage.getItem(WEEK_HISTORY_KEY) || '{}') as WeeklyHistoryStore;
      const metaStore = JSON.parse(localStorage.getItem(WEEK_HISTORY_META_KEY) || '{}') as WeeklyHistoryMetaStore;

      let userHistory = historyStore[userId] || [];
      const userMeta = metaStore[userId];

      if (!userMeta) {
        for (let i = 1; i <= 3; i += 1) {
          const weekStart = addWeeks(currentWeekStart, -i);
          const weekKey = format(weekStart, 'yyyy-MM-dd');
          userHistory = upsertHistoryEntry(userHistory, {
            week_key: weekKey,
            week_start: weekKey,
            captured_at: Date.now(),
            pinned: false,
            meals: getMealsForWeek(allMeals, userId, weekKey)
          });
        }
        historyStore[userId] = userHistory;
        metaStore[userId] = { last_processed_week_key: currentWeekKey };
        localStorage.setItem(WEEK_HISTORY_KEY, JSON.stringify(historyStore));
        localStorage.setItem(WEEK_HISTORY_META_KEY, JSON.stringify(metaStore));
        return userHistory;
      }

      const lastProcessedWeekStart = parseISO(userMeta.last_processed_week_key);
      const movedWeeks = differenceInCalendarWeeks(currentWeekStart, lastProcessedWeekStart, { weekStartsOn: 1 });

      if (movedWeeks <= 0) {
        return userHistory.sort((a, b) => b.week_start.localeCompare(a.week_start));
      }

      for (let step = 0; step < movedWeeks; step += 1) {
        const completedWeekStart = addWeeks(lastProcessedWeekStart, step);
        const completedWeekKey = format(completedWeekStart, 'yyyy-MM-dd');
        userHistory = upsertHistoryEntry(userHistory, {
          week_key: completedWeekKey,
          week_start: completedWeekKey,
          captured_at: Date.now(),
          pinned: false,
          meals: getMealsForWeek(allMeals, userId, completedWeekKey)
        });
      }

      historyStore[userId] = userHistory;
      metaStore[userId] = { last_processed_week_key: currentWeekKey };
      localStorage.setItem(WEEK_HISTORY_KEY, JSON.stringify(historyStore));
      localStorage.setItem(WEEK_HISTORY_META_KEY, JSON.stringify(metaStore));
      return userHistory;
    },
    shouldWarnBeforeUnpin: async (userId: string, weekKey: string, now: Date = new Date()) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(WEEK_HISTORY_KEY) || '{}') as WeeklyHistoryStore;
      const entry = (all[userId] || []).find((candidate) => candidate.week_key === weekKey);
      if (!entry?.pinned) {
        return false;
      }

      const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const entryWeekStart = parseISO(entry.week_start);
      const elapsedWeeks = differenceInCalendarWeeks(currentWeekStart, entryWeekStart, { weekStartsOn: 1 });
      return elapsedWeeks > 3;
    },
    setPinned: async (userId: string, weekKey: string, pinned: boolean) => {
      await delay(80);
      const all = JSON.parse(localStorage.getItem(WEEK_HISTORY_KEY) || '{}') as WeeklyHistoryStore;
      const entries = all[userId] || [];
      const index = entries.findIndex((entry) => entry.week_key === weekKey);

      if (index === -1) {
        return { updated: false, removed: false };
      }

      const updatedEntries = [...entries];
      if (pinned) {
        updatedEntries[index] = {
          ...updatedEntries[index],
          pinned: true,
          pinned_at: Date.now()
        };
      } else {
        updatedEntries[index] = {
          ...updatedEntries[index],
          pinned: false,
          pinned_at: undefined
        };
      }

      const trimmedEntries = trimHistoryEntries(updatedEntries);
      const removed = !trimmedEntries.some((entry) => entry.week_key === weekKey);

      all[userId] = trimmedEntries;
      localStorage.setItem(WEEK_HISTORY_KEY, JSON.stringify(all));
      return { updated: !removed, removed };
    },
    repeatIntoNextWeek: async (userId: string, historyWeekKey: string, now: Date = new Date()) => {
      await delay(120);
      const historyStore = JSON.parse(localStorage.getItem(WEEK_HISTORY_KEY) || '{}') as WeeklyHistoryStore;
      const entry = (historyStore[userId] || []).find((candidate) => candidate.week_key === historyWeekKey);
      if (!entry) {
        return false;
      }

      const sourceStart = parseISO(entry.week_start);
      const targetWeekStart = addWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1);
      const targetWeekKey = format(targetWeekStart, 'yyyy-MM-dd');
      const targetWeekEnd = addDays(targetWeekStart, 6);

      const allMeals = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]') as Meal[];
      const preservedMeals = allMeals.filter((meal) => {
        if (meal.user_id !== userId) return true;
        const mealDate = parseISO(meal.date);
        return mealDate < targetWeekStart || mealDate > targetWeekEnd;
      });

      const repeatedMeals: Meal[] = entry.meals.map((snapshot) => {
        const sourceDate = parseISO(snapshot.date);
        const shiftedDays = Math.round((sourceDate.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          user_id: userId,
          date: format(addDays(targetWeekStart, shiftedDays), 'yyyy-MM-dd'),
          meal_type: snapshot.meal_type,
          dish_name: snapshot.dish_name
        };
      });

      localStorage.setItem(MEALS_KEY, JSON.stringify([...preservedMeals, ...repeatedMeals]));
      return { targetWeekKey, mealsInserted: repeatedMeals.length };
    }
  },
  shoppingNotes: {
    get: async (userId: string) => {
      await delay(100);
      const all = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') as Record<string, string>;
      return all[userId] || '';
    },
    update: async (userId: string, notes: string) => {
      await delay(100);
      const all = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') as Record<string, string>;
      all[userId] = notes;
      localStorage.setItem(NOTES_KEY, JSON.stringify(all));
      return notes;
    }
  },
  inventory: {
    list: async (userId: string) => {
      await delay(150);
      const all = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '[]') as InventoryItem[];
      return all
        .filter((i) => i.user_id === userId)
        .map((item) => ({
          ...item,
          quantity: item.quantity === '+' ? 'm' : item.quantity
        }));
    },
    upsertByName: async (userId: string, ingredientName: string, quantity: number | 'm') => {
      await delay(100);
      const all = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '[]') as InventoryItem[];
      const normalizedName = ingredientName.trim().toLowerCase();
      const index = all.findIndex((item) => item.user_id === userId && item.ingredient_name.trim().toLowerCase() === normalizedName);

      if (quantity !== 'm' && quantity <= 0) {
        if (index !== -1) {
          all.splice(index, 1);
        }
        localStorage.setItem(INVENTORY_KEY, JSON.stringify(all));
        return null;
      }

      if (index !== -1) {
        all[index] = { ...all[index], ingredient_name: ingredientName.trim(), quantity };
        localStorage.setItem(INVENTORY_KEY, JSON.stringify(all));
        return all[index];
      }

      const newItem: InventoryItem = {
        id: Date.now().toString() + Math.random(),
        user_id: userId,
        ingredient_name: ingredientName.trim(),
        quantity,
        created_at: Date.now()
      };
      all.push(newItem);
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(all));
      return newItem;
    },
    delete: async (id: string) => {
      await delay(100);
      let all = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '[]') as InventoryItem[];
      all = all.filter((i) => i.id !== id);
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(all));
    }
  },
  inventorySync: {
    get: async (userId: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(INVENTORY_SYNC_KEY) || '{}') as Record<string, InventorySyncState>;
      return all[userId] || null;
    },
    update: async (userId: string, state: InventorySyncState) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(INVENTORY_SYNC_KEY) || '{}') as Record<string, InventorySyncState>;
      all[userId] = state;
      localStorage.setItem(INVENTORY_SYNC_KEY, JSON.stringify(all));
      return state;
    }
  },
  shoppingAutoExclusions: {
    list: async (userId: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(SHOPPING_AUTO_EXCLUSIONS_KEY) || '[]') as ShoppingAutoExclusion[];
      return all.filter((entry) => entry.user_id === userId);
    },
    listActive: async (userId: string, weekKey?: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(SHOPPING_AUTO_EXCLUSIONS_KEY) || '[]') as ShoppingAutoExclusion[];
      return all.filter((entry) => {
        if (entry.user_id !== userId) return false;
        if (!entry.week_key) return true;
        return entry.week_key === weekKey;
      });
    },
    upsert: async (exclusion: ShoppingAutoExclusion) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(SHOPPING_AUTO_EXCLUSIONS_KEY) || '[]') as ShoppingAutoExclusion[];
      const normalizedIngredientKey = exclusion.ingredient_key.trim().toLowerCase();
      const index = all.findIndex((entry) => (
        entry.user_id === exclusion.user_id
        && entry.ingredient_key.trim().toLowerCase() === normalizedIngredientKey
        && entry.week_key === exclusion.week_key
      ));

      const normalized: ShoppingAutoExclusion = {
        user_id: exclusion.user_id,
        ingredient_key: normalizedIngredientKey,
        week_key: exclusion.week_key
      };

      if (index !== -1) {
        all[index] = normalized;
      } else {
        all.push(normalized);
      }

      localStorage.setItem(SHOPPING_AUTO_EXCLUSIONS_KEY, JSON.stringify(all));
      return normalized;
    },
    delete: async (userId: string, ingredientKey: string, weekKey?: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(SHOPPING_AUTO_EXCLUSIONS_KEY) || '[]') as ShoppingAutoExclusion[];
      const normalizedIngredientKey = ingredientKey.trim().toLowerCase();
      const filtered = all.filter((entry) => !(
        entry.user_id === userId
        && entry.ingredient_key.trim().toLowerCase() === normalizedIngredientKey
        && entry.week_key === weekKey
      ));
      localStorage.setItem(SHOPPING_AUTO_EXCLUSIONS_KEY, JSON.stringify(filtered));
    },
    clearForWeek: async (userId: string, weekKey: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(SHOPPING_AUTO_EXCLUSIONS_KEY) || '[]') as ShoppingAutoExclusion[];
      const filtered = all.filter((entry) => !(entry.user_id === userId && entry.week_key === weekKey));
      localStorage.setItem(SHOPPING_AUTO_EXCLUSIONS_KEY, JSON.stringify(filtered));
    },
    clearAllForUser: async (userId: string) => {
      await delay(50);
      const all = JSON.parse(localStorage.getItem(SHOPPING_AUTO_EXCLUSIONS_KEY) || '[]') as ShoppingAutoExclusion[];
      const filtered = all.filter((entry) => entry.user_id !== userId);
      localStorage.setItem(SHOPPING_AUTO_EXCLUSIONS_KEY, JSON.stringify(filtered));
    }
  },
  shoppingItems: {
    list: async (userId: string) => {
      await delay(200);
      const all = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
      return all.filter((i: ShoppingItem) => i.user_id === userId);
    },
    add: async (item: Omit<ShoppingItem, 'id' | 'created_at'>) => {
      await delay(100);
      const all = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
      const newItem = { ...item, id: Date.now().toString() + Math.random(), created_at: Date.now() };
      all.push(newItem);
      localStorage.setItem(ITEMS_KEY, JSON.stringify(all));
      return newItem;
    },
    update: async (id: string, updates: Partial<ShoppingItem>) => {
      await delay(100);
      const all = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
      const idx = all.findIndex((i: ShoppingItem) => i.id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates };
        localStorage.setItem(ITEMS_KEY, JSON.stringify(all));
      }
    },
    delete: async (id: string) => {
      await delay(100);
      let all = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
      all = all.filter((i: ShoppingItem) => i.id !== id);
      localStorage.setItem(ITEMS_KEY, JSON.stringify(all));
    },
    deleteByMealId: async (mealId: string) => {
      await delay(100);
      let all = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
      all = all.filter((i: ShoppingItem) => i.meal_id !== mealId);
      localStorage.setItem(ITEMS_KEY, JSON.stringify(all));
    }
  }
};
