import { GoogleGenAI, Type } from "@google/genai";
import { CRITICAL_DICTIONARY } from "../types";

// Helper to normalize strings for comparison
const normalize = (str: string) => str.trim().toLowerCase();

// Helper to check for equivalence (Case insensitive + Singular/Plural)

const normalizeIngredientLabel = (ingredient: string): string => {
  const clean = ingredient.trim();
  const normalized = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('huevo')) {
    return 'Huevos';
  }

  if (normalized.includes('patatas fritas')) {
    return 'Patatas';
  }

  return clean;
};

const areEquivalent = (input: string, key: string): boolean => {
    const a = normalize(input);
    const b = normalize(key);
    
    if (a === b) return true;
    
    // Check for 's' pluralization (English/Spanish common rule)
    if (a === b + 's' || b === a + 's') return true;
    
    // Check for 'es' pluralization (Spanish)
    if (a === b + 'es' || b === a + 'es') return true;

    return false;
}

export const getIngredientsForDish = async (dishName: string): Promise<{ ingredients: string[], category?: string }> => {
  // PRIORITY 1: Check if the FULL dish name exists in the dictionary defined exceptions.
  // This prevents "Arroz con pollo" from splitting into "Arroz" (which defaults to Arroz + Tomate) and "Pollo".
  for (const key in CRITICAL_DICTIONARY) {
    if (areEquivalent(dishName, key)) {
      console.log(`[GeminiService] Exact dictionary match for "${dishName}" matched with "${key}"`);
      return { ingredients: CRITICAL_DICTIONARY[key].map(normalizeIngredientLabel), category: 'Diccionario' };
    }
  }

  // PRIORITY 2: Split by conjunctions -> Match against Dictionary (Smart) -> Fallback to Input Name
  const separators = [" con ", " y ", " and ", ",", " w/ ", " \\+ "];
  // Regex to split by separators, case insensitive
  const regex = new RegExp(separators.join('|'), 'i');
  
  const parts = dishName.split(regex).map(p => p.trim()).filter(p => p.length > 0);
  
  const allIngredients: string[] = [];
  let allFoundInDict = true;

  for (const part of parts) {
    let found = false;
    
    // Check against dictionary with smart matching
    for (const key in CRITICAL_DICTIONARY) {
      if (areEquivalent(part, key)) {
        console.log(`[GeminiService] Dictionary hit for part "${part}" matched with "${key}"`);
        allIngredients.push(...CRITICAL_DICTIONARY[key]);
        found = true;
        break;
      }
    }
    
    if (!found) {
        // Fallback: Use the part name as is.
        // Capitalize first letter for better UI
        const capitalizedPart = part.charAt(0).toUpperCase() + part.slice(1);
        allIngredients.push(capitalizedPart);
        allFoundInDict = false;
    }
  }

  return { ingredients: allIngredients.map(normalizeIngredientLabel), category: allFoundInDict ? 'Generado' : 'Mixto' };
};