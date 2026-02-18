
export interface User {
  id: string;
  email: string;
}

export enum MealType {
  LUNCH = 'Comida',
  DINNER = 'Cena',
}

export interface Meal {
  id: string;
  user_id: string;
  date: string; // ISO Date string YYYY-MM-DD
  meal_type: MealType;
  dish_name: string;
}

export interface ShoppingItem {
  id: string;
  user_id: string;
  ingredient_name: string;
  category: string;
  purchased: boolean;
  created_at: number;
  manual: boolean; // True if added manually by user, false if from meal
  meal_id?: string; // Optional: Links the item to a specific meal for updates/deletions
  required_quantity?: number; // Optional: Deficit quantity for auto-generated shopping items
}

export interface InventoryItem {
  id: string;
  user_id: string;
  ingredient_name: string;
  quantity: number | 'm';
  created_at: number;
}

export const CRITICAL_DICTIONARY: Record<string, string[]> = {
  "Ensalada": ["Lechuga", "Tomate"],
  "Ensalada de garbanzos": ["Garbanzos", "Cebolla", "Pimiento", "Atún"],
  "Ensalada Sergio": ["Queso Cottage", "Sardinas", "Huevos cocidos", "Lechuga", "Tomate"],
  "Ensalada de pasta": ["Macarrones", "jamón york", "Pepinillos", "Sardinas"],
  "Fajitas": ["Pan de fajita", "Carne picada", "Pimiento", "Cebolla"],
  "Tortilla de patata": ["Huevos", "Patatas", "Cebolla"],
  "Pizza casera": ["Masa de pizza", "Tomate frito", "Queso"],
  "Pizza": ["Pizza"],
  "Macarrones": ["Macarrones", "Tomate frito"],
  "Macarrones con pesto": ["Macarrones", "Pesto"],
  "Arroz": ["Arroz", "Tomate frito"],
  "Arroz con pollo": ["Arroz", "Pollo"],
  "Sopa": ["Sopa"],
  "Alubias": ["Alubias", "Zanahoria", "Carne"],
  "Huevos": ["Huevos"],
  "Patatas": ["Patatas"]
};
