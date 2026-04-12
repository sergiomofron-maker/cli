import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { History as HistoryIcon, Loader2, RotateCcw, ChevronLeft, Pin, PinOff } from 'lucide-react';
import { mockDb } from '../services/mockDb';
import { MealType, WeeklyHistoryEntry } from '../types';

interface HistoryProps {
  userId: string;
}

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const getRelativeLabel = (index: number): string => {
  if (index < 0) return 'Hace 1 semana';
  if (index === 0) return 'Hace 1 semana';
  if (index === 1) return 'Hace 2 semanas';
  return 'Hace 3 semanas';
};

const History: React.FC<HistoryProps> = ({ userId }) => {
  const [entries, setEntries] = useState<WeeklyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [repeating, setRepeating] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    await mockDb.weeklyHistory.syncOnAppOpen(userId, new Date());
    const data = await mockDb.weeklyHistory.list(userId);
    setEntries(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.week_key === selectedWeekKey) || null,
    [entries, selectedWeekKey]
  );

  const groupedMeals = useMemo(() => {
    if (!selectedEntry) return [];
    const weekStart = parseISO(selectedEntry.week_start);

    return Array.from({ length: 7 }, (_, dayIndex) => {
      const currentDate = format(addDays(weekStart, dayIndex), 'yyyy-MM-dd');
      const lunches = selectedEntry.meals.filter((meal) => meal.date === currentDate && meal.meal_type === MealType.LUNCH);
      const dinners = selectedEntry.meals.filter((meal) => meal.date === currentDate && meal.meal_type === MealType.DINNER);

      return {
        label: DAY_LABELS[dayIndex],
        date: currentDate,
        lunch: lunches[0]?.dish_name || '—',
        dinner: dinners[0]?.dish_name || '—'
      };
    });
  }, [selectedEntry]);

  const handleRepeat = async (weekKey: string) => {
    setRepeating(weekKey);
    await mockDb.weeklyHistory.repeatIntoNextWeek(userId, weekKey, new Date());
    setRepeating(null);
    window.alert('Semana copiada en el calendario de la semana siguiente.');
  };

  const handleTogglePin = async (entry: WeeklyHistoryEntry) => {
    const isUnpinning = entry.pinned;

    if (isUnpinning) {
      const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const entryWeekStart = parseISO(entry.week_start);
      const weeksElapsed = differenceInCalendarWeeks(currentWeekStart, entryWeekStart, { weekStartsOn: 1 });
      if (weeksElapsed > 3) {
        const shouldContinue = window.confirm('Al desfijar esta semana, su información se borrará del historial porque tiene más de 3 semanas. ¿Quieres continuar?');
        if (!shouldContinue) {
          return;
        }
      }
    }

    await mockDb.weeklyHistory.togglePin(userId, entry.week_key, !entry.pinned);
    await loadHistory();
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin text-orange-600" />
      </div>
    );
  }

  if (selectedEntry) {
    return (
      <div className="pb-24">
        <div className="px-4 pt-4 mb-4 flex items-center justify-between">
          <button
            onClick={() => setSelectedWeekKey(null)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ChevronLeft size={16} /> Volver
          </button>

          <button
            onClick={() => handleRepeat(selectedEntry.week_key)}
            disabled={repeating === selectedEntry.week_key}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-60"
            title="Repetir en semana siguiente"
          >
            {repeating === selectedEntry.week_key ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Repetir
          </button>
        </div>

        <h2 className="text-xl font-bold mb-4 px-4 flex items-center gap-2">
          <HistoryIcon size={24} className="text-orange-600" />
          {getRelativeLabel(entries.findIndex((entry) => entry.week_key === selectedEntry.week_key))}
        </h2>

        <div className="space-y-3 px-4">
          {groupedMeals.map((day) => (
            <div key={day.date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 text-gray-700 font-medium">
                {day.label} · {format(parseISO(day.date), 'd MMM', { locale: es })}
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="w-16 text-gray-400 font-semibold">COMIDA</span>
                  <span className="text-gray-800">{day.lunch}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-16 text-gray-400 font-semibold">CENA</span>
                  <span className="text-gray-800">{day.dinner}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <h2 className="text-xl font-bold mb-4 px-4 pt-4 flex items-center gap-2">
        <HistoryIcon size={24} className="text-orange-600" />
        Historial
      </h2>

      <div className="space-y-3 px-4">
        {entries.map((entry, index) => (
          <div
            key={entry.week_key}
            onClick={() => setSelectedWeekKey(entry.week_key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedWeekKey(entry.week_key);
              }
            }}
            role="button"
            tabIndex={0}
            className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-orange-200 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">{getRelativeLabel(index)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {format(parseISO(entry.week_start), "d MMM", { locale: es })} - {format(addDays(parseISO(entry.week_start), 6), 'd MMM', { locale: es })}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    handleTogglePin(entry);
                  }}
                  className={`inline-flex items-center justify-center rounded-lg border p-2 ${
                    entry.pinned
                      ? 'border-orange-500 text-orange-600 bg-orange-50 hover:bg-orange-100'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  title={entry.pinned ? 'Desfijar semana' : 'Fijar semana'}
                >
                  {entry.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRepeat(entry.week_key);
                  }}
                  disabled={repeating === entry.week_key}
                  className="mt-1 inline-flex items-center justify-center rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 p-2 disabled:opacity-60"
                  title="Repetir en semana siguiente"
                >
                  {repeating === entry.week_key ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default History;
