import { Meal, ShoppingItem, User, InventoryItem } from "../types";

// Keys for localStorage
const MEALS_KEY = 'planifia_meals';
const ITEMS_KEY = 'planifia_items';
const USER_KEY = 'planifia_user';
const NOTES_KEY = 'planifia_shopping_notes';
const INVENTORY_KEY = 'planifia_inventory';
const INVENTORY_SYNC_KEY = 'planifia_inventory_sync';

// Mock delay to simulate network
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface InventorySyncState {
  weekKey: string;
  consumed: Record<string, number>;
}

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
    delete: async (id: string) => {
      await delay(200);
      let all = JSON.parse(localStorage.getItem(MEALS_KEY) || '[]');
      all = all.filter((m: Meal) => m.id !== id);
      localStorage.setItem(MEALS_KEY, JSON.stringify(all));
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
