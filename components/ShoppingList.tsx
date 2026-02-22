import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingItem } from '../types';
import { mockDb } from '../services/mockDb';
import { registerSuppressedAutoIngredient } from '../services/planningSync';
import { Check, Plus, Trash2, ShoppingCart, Loader2, NotebookPen } from 'lucide-react';

interface ShoppingListProps {
  userId: string;
}

interface GroupedItem {
  name: string;
  ids: string[];
  purchased: boolean;
  manual: boolean;
  requiredQuantity: number;
}

const ShoppingList: React.FC<ShoppingListProps> = ({ userId }) => {
  const [rawItems, setRawItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [notes, setNotes] = useState('');
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [items, savedNotes] = await Promise.all([
      mockDb.shoppingItems.list(userId),
      mockDb.shoppingNotes.get(userId)
    ]);
    setRawItems(items);
    setNotes(savedNotes);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  useEffect(() => {
    if (!notesRef.current) return;
    notesRef.current.style.height = 'auto';
    notesRef.current.style.height = `${notesRef.current.scrollHeight}px`;
  }, [notes]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void mockDb.shoppingNotes.update(userId, notes);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [notes, userId]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, GroupedItem> = {};

    rawItems.forEach((item) => {
      const key = `${item.manual ? 'manual' : 'auto'}:${item.ingredient_name.trim().toLowerCase()}`;
      const qty = item.manual ? 1 : item.required_quantity || 1;

      if (!groups[key]) {
        const displayName = item.ingredient_name.trim();
        const formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

        groups[key] = {
          name: formattedName,
          ids: [item.id],
          purchased: item.purchased,
          manual: item.manual,
          requiredQuantity: qty
        };
      } else {
        groups[key].ids.push(item.id);
        groups[key].purchased = groups[key].purchased && item.purchased;
        groups[key].requiredQuantity += qty;
      }
    });

    return Object.values(groups).sort((a, b) => {
      if (a.purchased === b.purchased) {
        return a.name.localeCompare(b.name);
      }
      return a.purchased ? 1 : -1;
    });
  }, [rawItems]);

  const togglePurchased = async (group: GroupedItem) => {
    const newState = !group.purchased;

    setRawItems((prev) => prev.map((item) =>
      group.ids.includes(item.id)
        ? { ...item, purchased: newState }
        : item
    ));

    await Promise.all(group.ids.map((id) =>
      mockDb.shoppingItems.update(id, { purchased: newState })
    ));
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const tempId = Date.now().toString();
    const newItemBase = {
      ingredient_name: newItemName.trim(),
      category: 'Manual',
      purchased: false,
      manual: true,
      user_id: userId
    };

    setRawItems((prev) => [
      { ...newItemBase, id: tempId, created_at: Date.now() },
      ...prev
    ]);
    setNewItemName('');

    await mockDb.shoppingItems.add(newItemBase);
    loadData();
  };

  const deleteItem = async (group: GroupedItem) => {
    setRawItems((prev) => prev.filter((item) => !group.ids.includes(item.id)));

    await Promise.all(group.ids.map((id) =>
      mockDb.shoppingItems.delete(id)
    ));

    if (!group.manual) {
      await registerSuppressedAutoIngredient(userId, group.name, group.requiredQuantity);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-600" /></div>;

  const purchasedCount = groupedItems.filter((i) => i.purchased).length;
  const totalCount = groupedItems.length;

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 mb-4">
        <h2 className="text-xl font-bold flex items-center justify-between">
          Lista de la Compra
          <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {purchasedCount}/{totalCount}
          </span>
        </h2>
      </div>

      <div className="px-4 mb-6">
        <form onSubmit={addItem} className="flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Añadir extra (ej. Leche, Pan)"
            className="flex-1 border rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 outline-none shadow-sm"
          />
          <button
            type="submit"
            disabled={!newItemName.trim()}
            className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={24} />
          </button>
        </form>
      </div>

      <div className="space-y-2 px-4">
        {groupedItems.length === 0 ? (
          <div className="text-center py-10 text-gray-400 flex flex-col items-center">
            <ShoppingCart size={48} className="mb-2 opacity-20" />
            <p>Tu lista está vacía.</p>
            <p className="text-sm">Añade comidas al calendario para generar ingredientes.</p>
          </div>
        ) : (
          groupedItems.map((item) => (
            <div
              key={`${item.manual ? 'manual' : 'auto'}-${item.name}`}
              className={`group flex items-center p-3 rounded-lg border transition-all duration-200 ${
                item.purchased
                  ? 'bg-gray-50 border-gray-100'
                  : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              <button
                onClick={() => togglePurchased(item)}
                className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center transition-colors ${
                  item.purchased
                    ? 'bg-green-500 border-green-500'
                    : 'border-gray-300 hover:border-orange-500'
                }`}
              >
                {item.purchased && <Check size={14} className="text-white" />}
              </button>

              <span className={`flex-1 font-medium ${item.purchased ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {item.manual ? item.name : `${item.name} (${item.requiredQuantity})`}
              </span>

              {item.manual && (
                <span className="text-[10px] uppercase font-bold text-gray-400 mr-2 border border-gray-200 px-1 rounded">
                  Manual
                </span>
              )}

              <button
                onClick={() => deleteItem(item)}
                className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="px-4 mt-6">
        <label htmlFor="shopping-notes" className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <NotebookPen size={16} className="text-orange-600" />
          Notas
        </label>
        <textarea
          id="shopping-notes"
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Añade aquí recordatorios para la compra..."
          className="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 outline-none shadow-sm text-sm leading-6"
        />
      </div>
    </div>
  );
};

export default ShoppingList;
