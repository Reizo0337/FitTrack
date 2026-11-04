import { z } from 'zod';

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');

export const fastingConfigSchema = z.object({
  enabled: z.boolean(),
  breakfastTime: hhmm,
  lunchTime: hhmm,
  snackTime: hhmm,
  dinnerTime: hhmm,
});
export type FastingConfig = z.infer<typeof fastingConfigSchema>;

export const DEFAULT_FASTING: FastingConfig = { enabled: true, breakfastTime: '08:00', lunchTime: '14:00', snackTime: '17:30', dinnerTime: '21:00' };

const H = 3600_000;

/** Diferencia (ms) entre la hora local de `tz` y UTC en el instante `ms`. */
function tzOffset(ms: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - Math.floor(ms / 1000) * 1000;
}

/** 'YYYY-MM-DD' + 'HH:mm' en la zona `tz` -> instante UTC. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h, mi);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz); // segunda pasada: cambios de hora (DST)
  return new Date(t);
}

export const localDateIn = (at: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const shiftDay = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export type FastEntry = { type: string; at: Date; localDate: string };
export type FastingState = 'off' | 'waiting' | 'fasting' | 'done';
export type FastingStatus = {
  state: FastingState;
  startAt: string | null; // última comida (inicio del ayuno)
  startSource: 'logged' | 'schedule' | null;
  plannedEndAt: string | null; // hora del desayuno según tu horario
  endAt: string | null; // cuando rompiste el ayuno (solo en 'done')
  elapsedHours: number;
  plannedHours: number;
  kcalBurned: number;
  kcalPerHour: number;
  nextStartAt: string | null;
  overdue: boolean; // pasó la hora prevista y sigues sin comer
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Ayuno nocturno automático: empieza tras la cena (la registrada o, si no la hay, la hora configurada)
 * y termina con la primera comida registrada después. Las kcal son el gasto en reposo (BMR/24 por hora): una estimación.
 */
export function computeFasting(opts: { now: Date; tz: string; cfg: FastingConfig; bmr: number; entries: FastEntry[] }): FastingStatus {
  const { now, tz, cfg, bmr } = opts;
  const kcalPerHour = bmr / 24;
  const base: FastingStatus = { state: 'off', startAt: null, startSource: null, plannedEndAt: null, endAt: null, elapsedHours: 0, plannedHours: 0, kcalBurned: 0, kcalPerHour: Math.round(kcalPerHour * 10) / 10, nextStartAt: null, overdue: false };
  if (!cfg.enabled) return base;

  const today = localDateIn(now, tz);
  // Solo cuentan los registros hechos el mismo día de la comida (los añadidos a posteriori no dicen cuándo comiste).
  const valid = opts.entries.filter((e) => localDateIn(e.at, tz) === e.localDate).sort((a, b) => a.at.getTime() - b.at.getTime());

  const dinnerStart = (day: string) => {
    const logged = valid.filter((e) => e.type === 'DINNER' && e.localDate === day).map((e) => e.at.getTime());
    return logged.length
      ? { at: new Date(Math.max(...logged)), source: 'logged' as const }
      : { at: zonedToUtc(day, cfg.dinnerTime, tz), source: 'schedule' as const };
  };

  const todays = dinnerStart(today);
  const anchor = now >= todays.at ? todays : dinnerStart(shiftDay(today, -1));
  const anchorDay = localDateIn(anchor.at, tz);
  let plannedEnd = zonedToUtc(anchorDay, cfg.breakfastTime, tz);
  if (plannedEnd <= anchor.at) plannedEnd = zonedToUtc(shiftDay(anchorDay, 1), cfg.breakfastTime, tz);
  const plannedHours = (plannedEnd.getTime() - anchor.at.getTime()) / H;

  const nextDinner = zonedToUtc(today, cfg.dinnerTime, tz);
  const nextStartAt = (nextDinner > now ? nextDinner : zonedToUtc(shiftDay(today, 1), cfg.dinnerTime, tz)).toISOString();

  const broke = valid.find((e) => e.at > anchor.at);
  const common = { startAt: anchor.at.toISOString(), startSource: anchor.source, plannedEndAt: plannedEnd.toISOString(), plannedHours: r1(plannedHours), nextStartAt };

  if (broke) {
    const hours = (broke.at.getTime() - anchor.at.getTime()) / H;
    return { ...base, ...common, state: 'done', endAt: broke.at.toISOString(), elapsedHours: r1(hours), kcalBurned: Math.round(kcalPerHour * hours) };
  }
  const elapsed = (now.getTime() - anchor.at.getTime()) / H;
  if (elapsed > 24) return { ...base, state: 'waiting', nextStartAt };
  return { ...base, ...common, state: 'fasting', elapsedHours: r1(elapsed), kcalBurned: Math.round(kcalPerHour * elapsed), overdue: now > plannedEnd };
}

/** Horas entre comidas consecutivas del horario (el último hueco es el ayuno nocturno hasta el desayuno siguiente). */
export function mealGaps(cfg: FastingConfig): { from: string; to: string; hours: number }[] {
  const order = [
    ['Desayuno', cfg.breakfastTime], ['Comida', cfg.lunchTime], ['Merienda', cfg.snackTime], ['Cena', cfg.dinnerTime],
  ] as const;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return order.map(([name, t], i) => {
    const [next, nt] = order[(i + 1) % order.length]!;
    let diff = mins(nt) - mins(t);
    if (diff <= 0) diff += 1440;
    return { from: name, to: next, hours: r1(diff / 60) };
  });
}
