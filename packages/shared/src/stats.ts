export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function stdDev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Pearson. Devuelve null con menos de `minN` pares o varianza cero (no se inventa relación). */
export function pearson(pairs: [number, number][], minN = 7): number | null {
  if (pairs.length < minN) return null;
  const mx = mean(pairs.map((p) => p[0]))!, my = mean(pairs.map((p) => p[1]))!;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

/** Minutos desde las 18:00 (para que 23:30 y 00:30 queden cerca): sirve para medir regularidad del horario. */
export const minutesSince18 = (d: Date, tzOffsetMin = 0) => {
  const local = new Date(d.getTime() + tzOffsetMin * 60000);
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return (m - 18 * 60 + 1440) % 1440;
};
export const fmtClockFrom18 = (m: number) => {
  const t = (m + 18 * 60) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
};
