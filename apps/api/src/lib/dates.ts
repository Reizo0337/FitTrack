/** 'YYYY-MM-DD' (día natural del usuario) <-> Date a medianoche UTC para columnas @db.Date */
export const toDbDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fromDbDate(new Date(toDbDate(s).getTime() + n * 86400_000));
