import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MealTypeId } from '@fittrack/shared';
import { AddFood } from './components/AddFood';
import { QuickActions } from './components/QuickActions';
import { WeightSheet } from './components/WeightSheet';
import { shiftDate, todayStr } from './ui/DateSelector';

export { shiftDate, todayStr };
export const defaultMeal = (): MealTypeId => {
  const h = new Date().getHours();
  return h < 11 ? 'BREAKFAST' : h < 16 ? 'LUNCH' : h < 19 ? 'SNACKS' : h < 23 ? 'DINNER' : 'SNACKS';
};

type AddInit = { type?: MealTypeId; tab?: 'search' | 'scan' | 'create' };
type Ctx = {
  date: string; setDate: (d: string) => void;
  /** Se incrementa cada vez que cambian datos (alimentos, peso…): las pantallas se vuelven a cargar solas. */
  version: number; bump: () => void;
  openAdd: (init?: AddInit) => void;
  openQuick: () => void;
  openWeight: () => void;
};
const C = createContext<Ctx>(null!);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(todayStr());
  const [version, setVersion] = useState(0);
  const [add, setAdd] = useState<AddInit | null>(null);
  const [quick, setQuick] = useState(false);
  const [weight, setWeight] = useState(false);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo<Ctx>(() => ({
    date, setDate, version, bump,
    openAdd: (init = {}) => { setQuick(false); setAdd(init); },
    openQuick: () => setQuick(true),
    openWeight: () => { setQuick(false); setWeight(true); },
  }), [date, version, bump]);
  return (
    <C.Provider value={value}>
      {children}
      <QuickActions open={quick} onClose={() => setQuick(false)} />
      {add && <AddFood init={add} onClose={() => setAdd(null)} />}
      <WeightSheet open={weight} onClose={() => setWeight(false)} />
    </C.Provider>
  );
}
