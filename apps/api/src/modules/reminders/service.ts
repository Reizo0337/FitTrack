import type { PrismaClient, Reminder } from '@prisma/client';
import { toDbDate } from '../../lib/dates';

export type PushPayload = { title: string; body: string; url: string; tag: string };
export type Sender = (sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload) => Promise<'ok' | 'gone'>;

/** Ventana de recuperación: el cron externo puede llegar tarde; cada recordatorio se envía como mucho una vez al día. */
const CATCH_UP_MIN = 90;
const WALK_STEPS_THRESHOLD = 6000; // umbral fijo de aviso, no un objetivo médico

export function localParts(now: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const wd = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[p.weekday!]!;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: wd };
}

const MSG: Record<string, { title: string; body: string; url: string }> = {
  WAKE: { title: 'Buenos días', body: '¿A qué hora te despertaste? Regístralo cuando quieras.', url: '/activity' },
  WATER: { title: 'Agua', body: 'Un vaso de agua te acerca a tu objetivo de hoy.', url: '/' },
  BREAKFAST: { title: 'Desayuno', body: 'Aún no has registrado el desayuno.', url: '/food' },
  LUNCH: { title: 'Comida', body: 'Aún no has registrado la comida.', url: '/food' },
  DINNER: { title: 'Cena', body: 'Aún no has registrado la cena.', url: '/food' },
  LOG_DINNER: { title: 'Cierre del día', body: 'Completa el registro de hoy para ver tu resumen.', url: '/food' },
  WALK: { title: 'Un paseo', body: 'Hoy llevas pocos pasos; un paseo corto suma.', url: '/activity' },
  BEDTIME: { title: 'Hora de descansar', body: 'Si te acuestas ya, registra tu hora de acostarte mañana.', url: '/activity' },
  WEEKLY_REPORT: { title: 'Informe semanal', body: 'Tu resumen de la semana está listo.', url: '/ai' },
  WEIGH_IN: { title: 'Pesaje', body: 'Hoy toca pesarte (mejor por la mañana, en ayunas).', url: '/progress' },
};

/** ¿Tiene sentido enviar este recordatorio ahora? Evita avisar de algo ya hecho. */
async function conditionMet(db: PrismaClient, userId: string, r: Reminder, date: string, minutes: number, waterTargetMl: number): Promise<boolean> {
  const day = toDbDate(date);
  const hasMeal = async (type: 'BREAKFAST' | 'LUNCH' | 'DINNER') =>
    (await db.mealEntry.count({ where: { meal: { userId, localDate: day, type } } })) > 0;
  switch (r.kind) {
    case 'WAKE': return (await db.sleepRecord.count({ where: { userId, localDate: day } })) === 0;
    case 'WATER': {
      const ml = (await db.waterIntake.aggregate({ where: { userId, localDate: day }, _sum: { ml: true } }))._sum.ml ?? 0;
      const expected = waterTargetMl * Math.max(0, Math.min(1, (minutes / 60 - 7) / 14));
      return ml < expected;
    }
    case 'BREAKFAST': return !(await hasMeal('BREAKFAST'));
    case 'LUNCH': return !(await hasMeal('LUNCH'));
    case 'DINNER': case 'LOG_DINNER': return !(await hasMeal('DINNER'));
    case 'WALK': {
      const a = await db.activityRecord.findMany({ where: { userId, localDate: day } });
      const steps = a.find((x) => x.source === 'HEALTH')?.steps ?? a.find((x) => x.source === 'MANUAL')?.steps ?? null;
      return steps == null || steps < WALK_STEPS_THRESHOLD;
    }
    case 'WEIGH_IN': return (await db.weightEntry.count({ where: { userId, localDate: day } })) === 0;
    case 'BEDTIME': case 'WEEKLY_REPORT': return true;
    default: return false;
  }
}

export async function tick(db: PrismaClient, now: Date, send: Sender) {
  const reminders = await db.reminder.findMany({ where: { enabled: true }, include: { user: { include: { profile: true, pushSubs: true } } } });
  const out = { sent: 0, skipped: 0 };
  for (const r of reminders) {
    const profile = r.user.profile;
    if (!profile || !r.user.pushSubs.length) { out.skipped++; continue; }
    const lt = localParts(now, profile.timezone);
    const [h, m] = r.timeLocal.split(':').map(Number) as [number, number];
    const due = h * 60 + m, late = lt.minutes - due;
    if (!r.weekdays.includes(lt.weekday) || late < 0 || late >= CATCH_UP_MIN) { out.skipped++; continue; }
    if (r.lastSentAt && localParts(r.lastSentAt, profile.timezone).date === lt.date) { out.skipped++; continue; }
    if (!(await conditionMet(db, r.userId, r, lt.date, lt.minutes, profile.targetWaterMl))) { out.skipped++; continue; }
    const base = MSG[r.kind];
    if (!base) { out.skipped++; continue; }
    for (const s of r.user.pushSubs) {
      const res = await send(s, { ...base, tag: `ft-${r.kind}` }).catch(() => 'ok' as const);
      if (res === 'gone') await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
    }
    await db.reminder.update({ where: { id: r.id }, data: { lastSentAt: now } });
    out.sent++;
  }
  return out;
}
