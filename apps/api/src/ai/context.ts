import { ageFromBirthDate, detectTrend, mean, weeklyWindows } from '@fittrack/shared';
import type { PrismaClient } from '@prisma/client';
import { addDays, fromDbDate, toDbDate } from '../lib/dates';
import { buildDiary } from '../modules/diary/service';

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

type Day = { date: string; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null; steps: number | null; activeKcal: number | null; sleepH: number | null; logged: boolean };

async function dayRows(db: PrismaClient, userId: string, endDate: string, days: number): Promise<Day[]> {
  const from = addDays(endDate, -(days - 1));
  const range = { gte: toDbDate(from), lte: toDbDate(endDate) };
  const [nut, act, sleep] = await Promise.all([
    db.dailyNutrition.findMany({ where: { userId, localDate: range } }),
    db.activityRecord.findMany({ where: { userId, localDate: range } }),
    db.sleepRecord.findMany({ where: { userId, localDate: range } }),
  ]);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const n = nut.find((x) => fromDbDate(x.localDate) === date);
    const a = act.filter((x) => fromDbDate(x.localDate) === date);
    const h = a.find((x) => x.source === 'HEALTH'), m = a.find((x) => x.source === 'MANUAL');
    const s = sleep.filter((x) => fromDbDate(x.localDate) === date);
    const sl = s.find((x) => x.source === 'HEALTH') ?? s[0];
    const logged = !!n && n.kcal > 0;
    return {
      date, logged, kcal: logged ? Math.round(n!.kcal) : null, protein: logged ? r1(n!.protein) : null, carbs: logged ? r1(n!.carbs) : null,
      fat: logged ? r1(n!.fat) : null, fiber: logged ? r1(n!.fiber) : null,
      steps: h?.steps ?? m?.steps ?? null, activeKcal: r1(h?.activeKcal ?? m?.activeKcal ?? null), sleepH: sl?.totalMin != null ? r1(sl.totalMin / 60) : null,
    };
  });
}

/** Datos mínimos y SIN identificadores (ni nombre ni email) que se envían al modelo, solo con consentimiento. */
export async function buildContext(db: PrismaClient, userId: string, date: string, days = 14) {
  const [profile, weights, rows, diary] = await Promise.all([
    db.userProfile.findUniqueOrThrow({ where: { userId } }),
    db.weightEntry.findMany({ where: { userId, localDate: { gte: toDbDate(addDays(date, -60)), lte: toDbDate(date) } }, orderBy: { localDate: 'asc' } }),
    dayRows(db, userId, date, days),
    buildDiary(db, userId, date),
  ]);
  const pts = weights.map((w) => ({ date: fromDbDate(w.localDate), value: w.weightKg }));
  const current = pts.at(-1)?.value ?? null;
  const trend = detectTrend(weeklyWindows(pts, date, 4), current ?? profile.startWeightKg);
  return {
    perfil: {
      edad: ageFromBirthDate(profile.birthDate), sexo: profile.sex === 'MALE' ? 'hombre' : 'mujer', alturaCm: profile.heightCm,
      pesoInicialKg: profile.startWeightKg, pesoActualKg: current, pesoObjetivoKg: profile.goalWeightKg, nivelActividad: profile.activityLevel,
    },
    objetivosDiarios: { kcal: profile.targetKcal, proteinaG: profile.targetProteinG, grasasG: profile.targetFatG, carbohidratosG: diary.targets.carbs, fibraG: profile.targetFiberG, aguaMl: profile.targetWaterMl },
    alergiasIntolerancias: profile.allergies, alimentosRechazados: profile.dislikedFoods,
    hoy: { fecha: date, consumido: diary.totals, restante: diary.remaining, aguaMl: diary.waterMl, avisosProductos: diary.productAlerts.map((a) => a.messages[0]).filter(Boolean) },
    ultimosDias: rows,
    pesosUltimos60Dias: pts.slice(-30),
    tendenciaPeso: { estado: trend.status, cambioKgPorSemana: trend.changePerWeekKg, mensaje: trend.message },
    nota: 'Los campos null significan SIN DATO (no registrado), no cero. Los pesos son pesajes reales. Los nutrientes de entradas estimadas por IA son aproximados.',
  };
}

/** Estadísticas semanales deterministas (no dependen de la IA). */
export async function weeklyStats(db: PrismaClient, userId: string, endDate: string) {
  const profile = await db.userProfile.findUniqueOrThrow({ where: { userId } });
  const rows = await dayRows(db, userId, endDate, 7);
  const water = await db.waterIntake.groupBy({ by: ['localDate'], where: { userId, localDate: { gte: toDbDate(addDays(endDate, -6)), lte: toDbDate(endDate) } }, _sum: { ml: true } });
  const w = await db.weightEntry.findMany({ where: { userId, localDate: { gte: toDbDate(addDays(endDate, -34)), lte: toDbDate(endDate) } }, orderBy: { localDate: 'asc' } });
  const pts = w.map((x) => ({ date: fromDbDate(x.localDate), value: x.weightKg }));
  const win = weeklyWindows(pts, endDate, 5);
  const inWeek = pts.filter((p) => p.date > addDays(endDate, -7));
  const logged = rows.filter((d) => d.logged);
  const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber') => r1(mean(logged.map((d) => d[k] as number)));
  const num = (k: 'steps' | 'activeKcal' | 'sleepH') => r1(mean(rows.filter((d) => d[k] != null).map((d) => d[k] as number)));
  const waterMl = water.map((x) => x._sum.ml ?? 0);
  const trend = detectTrend(win, pts.at(-1)?.value ?? profile.startWeightKg);
  return {
    desde: addDays(endDate, -6), hasta: endDate,
    registro: { diasConComidas: logged.length, de: 7 },
    nutricion: { kcalMedia: avg('kcal'), kcalObjetivo: profile.targetKcal, proteinaMediaG: avg('protein'), proteinaObjetivoG: profile.targetProteinG, carbosMediaG: avg('carbs'), grasasMediaG: avg('fat'), fibraMediaG: avg('fiber'), aguaMediaMl: waterMl.length ? Math.round(mean(waterMl)!) : null },
    cumplimiento: {
      diasProteinaObjetivo: logged.filter((d) => (d.protein ?? 0) >= profile.targetProteinG * 0.9).length,
      diasDentroDeKcal: logged.filter((d) => (d.kcal ?? 0) <= profile.targetKcal * 1.05 && (d.kcal ?? 0) >= profile.targetKcal * 0.8).length,
      diasConAgua: waterMl.filter((ml) => ml >= profile.targetWaterMl * 0.8).length,
    },
    actividad: { pasosMedios: num('steps'), kcalActivasMedias: num('activeKcal'), diasConDatosPasos: rows.filter((d) => d.steps != null).length },
    sueno: { horasMedias: num('sleepH'), nochesConDato: rows.filter((d) => d.sleepH != null).length },
    peso: {
      pesajesEstaSemana: inWeek.length, primeroKg: inWeek[0]?.value ?? null, ultimoKg: inWeek.at(-1)?.value ?? null,
      mediaSemanaKg: win[0]?.avg ?? null, mediaSemanaAnteriorKg: win[1]?.avg ?? null,
      cambioMediaSemanalKg: win[0]?.avg != null && win[1]?.avg != null ? Math.round((win[0].avg - win[1].avg) * 100) / 100 : null,
    },
    tendencia: trend,
    dias: rows,
  };
}
