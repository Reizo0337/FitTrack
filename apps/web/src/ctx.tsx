import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MealTypeId } from '@fittrack/shared';
import { AddFood } from './components/AddFood';

export const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const shiftDate = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const defaultMeal = (): MealTypeId => {
  const h = new Date().getHours();
  return h < 11 ? 'BREAKFAST' : h < 16 ? 'LUNCH' : h < 19 ? 'AFTERNOON_SNACK' : h < 23 ? 'DINNER' : 'SNACKS';
};

type AddInit = { type?: MealTypeId; tab?: 'search' | 'scan' | 'create' };
type Ctx = {
  date: string; setDate: (d: string) => void;
  version: number; bump: () => void;
  openAdd: (init?: AddInit) => void;
};
const C = createContext<Ctx>(null!);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(todayStr());
  const [version, setVersion] = useState(0);
  const [add, setAdd] = useState<AddInit | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const openAdd = useCallback((init: AddInit = {}) => setAdd(init), []);
  const value = useMemo(() => ({ date, setDate, version, bump, openAdd }), [date, version, bump, openAdd]);
  return (
    <C.Provider value={value}>
      {children}
      {add && <AddFood init={add} onClose={() => setAdd(null)} />}
    </C.Provider>
  );
}
