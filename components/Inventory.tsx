import React, { useEffect, useMemo, useState } from 'react';
import { mockDb } from '../services/mockDb';
import { InventoryItem } from '../types';
import { Archive, Loader2, Plus, Trash2, Minus } from 'lucide-react';

interface InventoryProps {
  userId: string;
}

const parseQuantityInput = (value: string): number | 'm' | null => {
  const clean = value.trim().toLowerCase();

  if (clean === 'm') return 'm';

  const numeric = Number(clean);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const quarters = numeric * 4;
  if (!Number.isInteger(quarters)) return null;

  return numeric;
};

const Inventory: React.FC<InventoryProps> = ({ userId }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingredientName, setIngredientName] = useState('');
  const [quantity, setQuantity] = useState('1');

  const loadInventory = async () => {
    setLoading(true);
    const data = await mockDb.inventory.list(userId);
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    loadInventory();
  }, [userId]);

  const addOrUpdateItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedIngredient = ingredientName.trim();
    if (!normalizedIngredient) return;

    const parsedQuantity = parseQuantityInput(quantity);
    if (parsedQuantity === null) return;

    await mockDb.inventory.upsertByName(userId, normalizedIngredient, parsedQuantity);
    setIngredientName('');
    setQuantity('1');
    loadInventory();
  };

  const deleteItem = async (id: string) => {
    await mockDb.inventory.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const adjustItemQuantity = async (item: InventoryItem, delta: number) => {
    if (item.quantity === 'm') return;

    const nextQuantity = Number((item.quantity + delta).toFixed(2));
    if (nextQuantity <= 0) {
      await mockDb.inventory.delete(item.id);
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
      return;
    }

    await mockDb.inventory.upsertByName(userId, item.ingredient_name, nextQuantity);
    setItems((prev) => prev.map((existing) =>
      existing.id === item.id ? { ...existing, quantity: nextQuantity } : existing
    ));
  };

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name)),
    [items]
  );

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-600" /></div>;

  const canSubmit = ingredientName.trim().length > 0 && parseQuantityInput(quantity) !== null;

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Archive size={22} className="text-orange-600" />
          Inventario
        </h2>
        <p className="text-sm text-gray-500 mt-1">Ingredientes disponibles en nevera, congelador y despensa.</p>
      </div>

      <div className="px-4 mb-5">
        <form onSubmit={addOrUpdateItem} className="grid grid-cols-[minmax(0,1fr)_72px_40px] gap-2">
          <input
            type="text"
            value={ingredientName}
            onChange={(e) => setIngredientName(e.target.value)}
            placeholder="Ingrediente"
            className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
          />
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Cant./m"
            className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-orange-600 text-white rounded-lg w-10 h-10 flex items-center justify-center hover:bg-orange-700 disabled:opacity-50"
          >
            <Plus size={20} />
          </button>
        </form>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
          <span>Ingredientes</span>
          <span>Cantidad</span>
        </div>

        {sortedItems.length === 0 ? (
          <div className="text-center py-10 text-gray-400">Aún no hay ingredientes en inventario.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedItems.map((item) => (
              <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 bg-white">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-gray-800 font-medium break-words">{item.ingredient_name}</span>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-gray-300 hover:text-red-500 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => adjustItemQuantity(item, -1)}
                    disabled={item.quantity === 'm'}
                    className="w-7 h-7 rounded border border-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-12 text-center text-gray-700 text-sm">{item.quantity}</span>
                  <button
                    onClick={() => adjustItemQuantity(item, 1)}
                    disabled={item.quantity === 'm'}
                    className="w-7 h-7 rounded border border-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-40"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
