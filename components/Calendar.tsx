import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Meal, MealType } from '../types';
import { mockDb } from '../services/mockDb';
import { syncCurrentWeekShoppingAndInventoryIncremental, syncWeeklyShoppingAndInventory } from '../services/planningSync';
import { format, addDays, startOfWeek, isSameDay, isSameWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Plus, Trash2, CalendarRange, Pencil } from 'lucide-react';

interface CalendarProps {
  userId: string;
}

const Calendar: React.FC<CalendarProps> = ({ userId }) => {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(() => new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<MealType>(MealType.LUNCH);
  const [dishName, setDishName] = useState('');
  const [addingMeal, setAddingMeal] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);

  const currentWeekStart = useMemo(() => startOfWeek(now, { weekStartsOn: 1 }), [now]);
  const currentWeekKey = useMemo(() => format(currentWeekStart, 'yyyy-MM-dd'), [currentWeekStart]);

  const loadMeals = useCallback(async () => {
    setLoading(true);
    const data = await mockDb.meals.list(userId);
    setMeals(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);


  useEffect(() => {
    let cancelled = false;

    const syncWhenWeekChanges = async () => {
      const syncState = await mockDb.inventorySync.get(userId);
      const syncedWeekKey = syncState?.weekKey;

      if (!cancelled && syncedWeekKey !== currentWeekKey) {
        await syncWeeklyShoppingAndInventory(userId, now);
      }
    };

    void syncWhenWeekChanges();

    return () => {
      cancelled = true;
    };
  }, [currentWeekKey, now, userId]);

  const viewStartDate = addDays(currentWeekStart, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(viewStartDate, i));

  const handleSaveMeal = async () => {
    if (!dishName.trim()) return;
    setAddingMeal(true);

    if (editingMealId) {
      await mockDb.meals.delete(editingMealId);
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    await mockDb.meals.add({
      user_id: userId,
      date: dateStr,
      meal_type: modalType,
      dish_name: dishName
    });

    if (isSameWeek(selectedDate, now, { weekStartsOn: 1 })) {
      await syncCurrentWeekShoppingAndInventoryIncremental(userId, now);
    }

    setDishName('');
    setEditingMealId(null);
    setAddingMeal(false);
    setIsModalOpen(false);
    loadMeals();
  };

  const handleDeleteFromModal = async () => {
    if (!editingMealId) return;

    if (window.confirm('¿Dejar este hueco vacío?')) {
      setAddingMeal(true);
      await mockDb.meals.delete(editingMealId);
      if (isSameWeek(selectedDate, now, { weekStartsOn: 1 })) {
        await syncCurrentWeekShoppingAndInventoryIncremental(userId, now);
      }
      setAddingMeal(false);
      setIsModalOpen(false);
      loadMeals();
    }
  };

  const openModal = (date: Date, type: MealType, existingMeal?: Meal) => {
    setSelectedDate(date);
    setModalType(type);
    if (existingMeal) {
      setDishName(existingMeal.dish_name);
      setEditingMealId(existingMeal.id);
    } else {
      setDishName('');
      setEditingMealId(null);
    }
    setIsModalOpen(true);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-600" /></div>;

  return (
    <div className="pb-24">
      <h2 className="text-xl font-bold mb-4 px-4 pt-4 flex items-center gap-2">
        <CalendarRange size={24} className="text-orange-600" />
        Calendario
      </h2>

      <div className="px-4 mb-4 flex gap-2">
        <button
          onClick={() => setWeekOffset(0)}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors border ${
            weekOffset === 0
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Semana Actual
        </button>
        <button
          onClick={() => setWeekOffset(1)}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors border ${
            weekOffset === 1
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Semana Siguiente
        </button>
      </div>

      <div className="space-y-4 px-4">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayMeals = meals.filter((m) => m.date === dateStr);
          const lunch = dayMeals.find((m) => m.meal_type === MealType.LUNCH);
          const dinner = dayMeals.find((m) => m.meal_type === MealType.DINNER);
          const isToday = isSameDay(day, now);

          return (
            <div key={dateStr} className={`bg-white rounded-xl shadow-sm border ${isToday ? 'border-orange-400 ring-1 ring-orange-400' : 'border-gray-100'} overflow-hidden`}>
              <div className={`px-4 py-2 ${isToday ? 'bg-orange-50 text-orange-800' : 'bg-gray-50 text-gray-700'} font-medium flex justify-between items-center`}>
                <span className="capitalize">{format(day, 'EEEE d MMM', { locale: es })}</span>
                {isToday && <span className="text-xs bg-orange-200 px-2 py-0.5 rounded-full">Hoy</span>}
              </div>

              <div className="p-4 grid grid-cols-1 gap-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold text-gray-400 w-16">COMIDA</span>
                  {lunch ? (
                    <div
                      onClick={() => openModal(day, MealType.LUNCH, lunch)}
                      className="flex-1 min-w-0 flex items-start justify-between gap-2 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <span className="text-sm text-gray-800 font-medium whitespace-normal break-words leading-snug">{lunch.dish_name}</span>
                      <Pencil size={14} className="text-orange-300" />
                    </div>
                  ) : (
                    <button
                      onClick={() => openModal(day, MealType.LUNCH)}
                      className="flex-1 flex items-center justify-center border border-dashed border-gray-300 rounded-lg py-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors text-sm"
                    >
                      <Plus size={16} className="mr-1" /> Añadir
                    </button>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold text-gray-400 w-16">CENA</span>
                  {dinner ? (
                    <div
                      onClick={() => openModal(day, MealType.DINNER, dinner)}
                      className="flex-1 min-w-0 flex items-start justify-between gap-2 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      <span className="text-sm text-gray-800 font-medium whitespace-normal break-words leading-snug">{dinner.dish_name}</span>
                      <Pencil size={14} className="text-orange-300" />
                    </div>
                  ) : (
                    <button
                      onClick={() => openModal(day, MealType.DINNER)}
                      className="flex-1 flex items-center justify-center border border-dashed border-gray-300 rounded-lg py-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors text-sm"
                    >
                      <Plus size={16} className="mr-1" /> Añadir
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {modalType} - {format(selectedDate, 'd MMM', { locale: es })}
              </h3>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del plato</label>
              <input
                autoFocus
                type="text"
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                placeholder="Ej. Tortilla de patata"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                {isSameWeek(selectedDate, now, { weekStartsOn: 1 })
                  ? 'Se sincronizará con compra según inventario.'
                  : 'Semana futura: se calculará al llegar su semana.'}
              </p>
            </div>
            <div className="p-4 bg-gray-50 flex justify-between items-center gap-2">
              {editingMealId ? (
                <button
                  onClick={handleDeleteFromModal}
                  className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm font-medium px-2 py-2 rounded hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={16} />
                  Eliminar
                </button>
              ) : (
                <div></div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMeal}
                  disabled={addingMeal || !dishName.trim()}
                  className="px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center"
                >
                  {addingMeal && <Loader2 size={16} className="animate-spin mr-2" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
