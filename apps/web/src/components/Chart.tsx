import { useState } from 'react';

export type Pt = { x: string; y: number };
type Props = {
  series: { name: string; color: string; pts: Pt[]; dots?: boolean }[];
  goal?: { y: number; label: string };
  unit?: string;
  height?: number;
  bars?: boolean;
};

/** Gráfico SVG sin dependencias; pulsa/desliza para ver el valor de cada punto. */
export function Chart({ series, goal, unit = '', height = 160, bars = false }: Props) {
  const [tip, setTip] = useState<string>('');
  const W = 320, P = { l: 34, r: 8, t: 8, b: 20 };
  const xs = [...new Set(series.flatMap((s) => s.pts.map((p) => p.x)))].sort();
  const ys = series.flatMap((s) => s.pts.map((p) => p.y)).concat(goal ? [goal.y] : []);
  if (!xs.length) return <p className="py-6 text-center text-sm text-slate-500">Sin datos todavía</p>;
  let min = bars ? 0 : Math.min(...ys), max = Math.max(...ys);
  if (min === max) max = min + 1;
  const pad = (max - min) * 0.1;
  if (!bars) min -= pad;
  max += pad;
  const X = (i: number) => P.l + (xs.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (xs.length - 1));
  const Y = (v: number) => P.t + (height - P.t - P.b) * (1 - (v - min) / (max - min));
  const idx = new Map(xs.map((x, i) => [x, i]));
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  const ticks = [min, (min + max) / 2, max];
  const show = (x: string) => setTip(`${x.slice(5).split('-').reverse().join('/')}: ` + series.map((s) => { const p = s.pts.find((q) => q.x === x); return p ? `${s.name} ${fmt(p.y)}${unit}` : ''; }).filter(Boolean).join(' · '));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (xs.length - 1));
    const x = xs[Math.max(0, Math.min(xs.length - 1, i))];
    if (x) show(x);
  };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full touch-none select-none" onPointerDown={onMove} onPointerMove={onMove} role="img" aria-label="Gráfico de evolución">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
            <text x={P.l - 4} y={Y(t) + 3} textAnchor="end" fontSize="9" className="fill-slate-500">{fmt(t)}</text>
          </g>
        ))}
        {goal && <g><line x1={P.l} x2={W - P.r} y1={Y(goal.y)} y2={Y(goal.y)} stroke="#f59e0b" strokeDasharray="4 3" /><text x={W - P.r} y={Y(goal.y) - 3} textAnchor="end" fontSize="9" fill="#f59e0b">{goal.label}</text></g>}
        {series.map((s) =>
          bars ? (
            s.pts.map((p) => <rect key={p.x} x={X(idx.get(p.x)!) - 4} y={Y(p.y)} width={8} height={Y(min) - Y(p.y)} rx={2} fill={s.color} opacity={0.85} />)
          ) : (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={s.pts.map((p) => `${X(idx.get(p.x)!)},${Y(p.y)}`).join(' ')} />
              {s.dots && s.pts.map((p) => <circle key={p.x} cx={X(idx.get(p.x)!)} cy={Y(p.y)} r={2.5} fill={s.color} />)}
            </g>
          ),
        )}
        <text x={P.l} y={height - 4} fontSize="9" className="fill-slate-500">{xs[0]?.slice(5)}</text>
        <text x={W - P.r} y={height - 4} textAnchor="end" fontSize="9" className="fill-slate-500">{xs[xs.length - 1]?.slice(5)}</text>
      </svg>
      <p className="min-h-5 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">{tip}</p>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {series.map((s) => <span key={s.name}><i className="mr-1 inline-block size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}

export function Ring({ pct, size = 96, color = '#22c55e', children }: { pct: number; size?: number; color?: string; children?: React.ReactNode }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} stroke={color} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">{children}</div>
    </div>
  );
}

export function Bar({ label, value, target, color, unit = 'g' }: { label: string; value: number; target: number; color: string; unit?: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span>{Math.round(value)} / {Math.round(target)} {unit}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (value / Math.max(1, target)) * 100)}%`, background: color }} /></div>
    </div>
  );
}
