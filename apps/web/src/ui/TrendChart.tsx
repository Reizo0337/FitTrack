import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from './primitives';

export type Pt = { x: string; y: number }; // x = 'YYYY-MM-DD'
export type Serie = { name: string; color: string; pts: Pt[]; dots?: boolean; dashed?: boolean; width?: number };
type Props = { series: Serie[]; kind?: 'line' | 'bar'; goal?: { y: number; label: string }; unit?: string; height?: number; decimals?: number; className?: string; label: string; domain?: [number, number] };

const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const DAY = 86400000;
export const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' });

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Gráfico propio, sin dependencias: eje X proporcional al tiempo, ejes con valores y fechas, y tooltip táctil/ratón. */
export function TrendChart({ series, kind = 'line', goal, unit = '', height = 190, decimals = 0, className, label, domain }: Props) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const P = { l: 40, r: 10, t: 14, b: 24 };
  const all = useMemo(() => series.flatMap((s) => s.pts), [series]);

  const geo = useMemo(() => {
    if (!all.length) return null;
    const ts = all.map((p) => t(p.x));
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (kind === 'bar') { t0 -= DAY * 0.5; t1 += DAY * 0.5; }
    if (t1 === t0) { t0 -= DAY; t1 += DAY; }
    const ys = all.map((p) => p.y);
    let lo = domain ? domain[0] : kind === 'bar' ? 0 : Math.min(...ys), hi = domain ? domain[1] : Math.max(...ys);
    if (lo === hi) hi = lo + 1;
    let goalVisible = false;
    if (!domain) {
      // La meta solo entra en la escala si está cerca de los datos; si no, aplastaría la tendencia.
      if (goal) { const r = hi - lo; if (goal.y >= lo - r * 0.6 && goal.y <= hi + r * 0.6) { lo = Math.min(lo, goal.y); hi = Math.max(hi, goal.y); goalVisible = true; } }
      const pad = (hi - lo) * 0.1;
      if (kind !== 'bar') lo -= pad;
      hi += pad;
      // Marcas con números redondos (1, 2, 5 × 10ⁿ).
      const raw = (hi - lo) / 3, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
      const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
      lo = kind === 'bar' ? 0 : Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
      return { t0, t1, lo, hi, step, goalVisible };
    }
    goalVisible = !!goal && goal.y >= lo && goal.y <= hi;
    return { t0, t1, lo, hi, step: (hi - lo) / 3, goalVisible };
  }, [all, goal, kind, domain]);

  if (!geo) return <p className="py-8 text-center text-sm text-ink-3">Sin datos en este periodo</p>;
  const plotW = W - P.l - P.r, plotH = height - P.t - P.b;
  const X = (d: string) => P.l + ((t(d) - geo.t0) / (geo.t1 - geo.t0)) * plotW;
  const Y = (v: number) => P.t + plotH * (1 - (v - geo.lo) / (geo.hi - geo.lo));
  const fmt = (v: number) => v.toLocaleString('es', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  const yTicks = Array.from({ length: Math.round((geo.hi - geo.lo) / geo.step) + 1 }, (_, i) => geo.lo + geo.step * i);
  const days = Math.max(1, Math.round((geo.t1 - geo.t0) / DAY));
  const xTicks = Array.from({ length: Math.min(4, days + 1) }, (_, i) => new Date(geo.t0 + ((geo.t1 - geo.t0) * i) / Math.max(1, Math.min(3, days))).toISOString().slice(0, 10));

  const xs = [...new Set(all.map((p) => p.x))].sort();
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = geo.t0 + (((e.clientX - r.left) - P.l) / plotW) * (geo.t1 - geo.t0);
    let best = 0, d = Infinity;
    xs.forEach((x, i) => { const dd = Math.abs(t(x) - tx); if (dd < d) { d = dd; best = i; } });
    setHover(best);
  };
  const hx = hover != null ? xs[hover] : null;
  const rows = hx ? series.map((s) => ({ s, p: s.pts.find((q) => q.x === hx) })).filter((r) => r.p) : [];
  const barW = Math.max(3, Math.min(18, (plotW / days) * 0.62));
  const summary = `${label}. ${series.map((s) => `${s.name}: ${s.pts.length} valores`).join(', ')}.`;

  return (
    <div ref={box} className={cx('relative w-full', className)}>
      <svg width={W} height={height} role="img" aria-label={summary} className="touch-pan-y select-none" onPointerDown={onMove} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeDasharray={i === 0 ? undefined : '2 4'} />
            <text x={P.l - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" className="num">{fmt(v)}</text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={d} x={X(d)} y={height - 6} fontSize="11" fill="var(--ink-3)" textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{fmtDay(d)}</text>
        ))}
        {goal && geo.goalVisible && (
          <g>
            <line x1={P.l} x2={W - P.r} y1={Y(goal.y)} y2={Y(goal.y)} stroke="var(--warn)" strokeDasharray="5 4" strokeWidth={1.25} />
            <text x={W - P.r} y={Y(goal.y) - 5} textAnchor="end" fontSize="11" fill="var(--warn)">{goal.label}</text>
          </g>
        )}
        {series.map((s) => kind === 'bar' ? (
          s.pts.map((p) => <rect key={p.x} x={X(p.x) - barW / 2} y={Y(p.y)} width={barW} height={Math.max(0, Y(geo.lo) - Y(p.y))} rx={Math.min(4, barW / 2)} fill={s.color} opacity={hx && hx !== p.x ? 0.4 : 1} />)
        ) : (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={s.width ?? 2.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '1 5' : undefined}
              points={[...s.pts].sort((a, b) => t(a.x) - t(b.x)).map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />
            {s.dots && s.pts.map((p) => <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={2.75} fill="var(--surface)" stroke={s.color} strokeWidth={1.75} />)}
          </g>
        ))}
        {hx && (
          <g>
            <line x1={X(hx)} x2={X(hx)} y1={P.t} y2={P.t + plotH} stroke="var(--line-strong)" />
            {kind === 'line' && rows.map((r) => <circle key={r.s.name} cx={X(hx)} cy={Y(r.p!.y)} r={4.5} fill={r.s.color} stroke="var(--surface)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hx && rows.length > 0 && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-ctl border border-line bg-surface px-2.5 py-1.5 text-xs shadow-[var(--shadow-pop)]"
          style={{ left: Math.min(Math.max(X(hx) - 56, 4), W - 124) }}>
          <p className="font-semibold">{fmtDay(hx)}</p>
          {rows.map((r) => <p key={r.s.name} className="num whitespace-nowrap text-ink-2"><i className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: r.s.color }} />{r.s.name} <b className="text-ink">{fmt(r.p!.y)}{unit}</b></p>)}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1">
        {series.map((s) => <span key={s.name} className="t-meta inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />{s.name}</span>)}
        {goal && <span className="t-meta inline-flex items-center gap-1.5"><i className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: 'var(--warn)' }} aria-hidden />{goal.label}{!geo.goalVisible && ' (fuera de escala)'}</span>}
      </div>
    </div>
  );
}
