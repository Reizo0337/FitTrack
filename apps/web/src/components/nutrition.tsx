import { MEAL_LABELS } from '@fittrack/shared';
import { Coffee, Cookie, Moon, Plus, Soup, Sun, Trash2, Repeat, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Diary, Entry, MealDay } from '../types';
import { Badge, Card, IconButton, cx } from '../ui/primitives';
import { MacroIndicator, ProgressRing } from '../ui/progress';

const MEAL_ICON: Record<string, LucideIcon> = { BREAKFAST: Coffee, LUNCH: Sun, AFTERNOON_SNACK: Cookie, DINNER: Moon, SNACKS: Soup };
const kcal = (n: number) => Math.round(n).toLocaleString('es');

/** Calorías del día: anillo + macros. Es el resumen central de Inicio y Alimentación. */
export function CalorieSummary({ d, compact }: { d: Diary; compact?: boolean }) {
  const left = Math.round(d.remaining.kcal ?? 0);
  const over = left < 0;
  return (
    <Card>
      <div className="flex items-center gap-5">
        <ProgressRing value={d.totals.kcal / d.targets.kcal} size={compact ? 112 : 128} tone={over ? 'warn' : 'accent'} label="Calorías del día">
          <span className="num t-title leading-none">{kcal(Math.abs(left))}</span>
          <span className="t-meta mt-1 text-[0.6875rem]">{over ? 'kcal de más' : 'kcal restantes'}</span>
        </ProgressRing>
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-y-3">
          <div><dt className="t-meta">Consumidas</dt><dd className="num t-head">{kcal(d.totals.kcal)}</dd></div>
          <div><dt className="t-meta">Objetivo</dt><dd className="num t-head">{kcal(d.targets.kcal)}</dd></div>
          <div className="col-span-2"><dt className="t-meta">Proteína pendiente</dt><dd className="num t-head">{Math.max(0, Math.round(d.remaining.protein ?? 0))} g</dd></div>
        </dl>
      </div>
      <div className="mt-5 flex gap-4 border-t border-line pt-4">
        <MacroIndicator name="Proteínas" value={d.totals.protein} target={d.targets.protein} tone="protein" />
        <MacroIndicator name="Carbohidratos" value={d.totals.carbs} target={d.targets.carbs} tone="carbs" />
        <MacroIndicator name="Grasas" value={d.totals.fat} target={d.targets.fat} tone="fat" />
      </div>
    </Card>
  );
}

export const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : null);

export function FoodItem({ e, onEdit, onDelete }: { e: Entry; onEdit?: () => void; onDelete?: () => void }) {
  const t = fmtTime(e.at);
  return (
    <li className="flex items-center gap-1 border-t border-line first:border-0">
      <button onClick={onEdit} disabled={!onEdit} className="min-h-14 min-w-0 flex-1 py-2 text-left disabled:cursor-default" aria-label={onEdit ? `Editar cantidad de ${e.name}` : undefined}>
        <span className="flex items-center gap-2"><span className="truncate font-medium">{e.name}</span>{e.isEstimate && <Badge tone="warn">estimado</Badge>}</span>
        <span className="t-meta num block">{e.grams} g · P {e.nutrients.protein} · C {e.nutrients.carbs} · G {e.nutrients.fat}{t ? ` · ${t}` : ''}</span>
      </button>
      <span className="num w-12 text-right text-[0.9375rem] font-semibold">{kcal(e.nutrients.kcal)}</span>
      {onDelete && <IconButton icon={Trash2} label={`Eliminar ${e.name}`} onClick={onDelete} className="!size-10" />}
    </li>
  );
}

export function MealCard({ meal, onAdd, onRepeat, onEdit, onDelete, readOnly }: {
  meal: MealDay; onAdd?: () => void; onRepeat?: () => void; onEdit?: (e: Entry) => void; onDelete?: (e: Entry) => void; readOnly?: boolean;
}) {
  const Icon = MEAL_ICON[meal.type] ?? Soup;
  const last = meal.entries.map((e) => e.at).filter(Boolean).sort().at(-1);
  const empty = meal.entries.length === 0;
  return (
    <Card as="article" className="!p-0">
      <header className="flex items-center gap-3 px-4 py-3">
        <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-full', empty ? 'bg-surface-2 text-ink-3' : 'bg-accent-soft text-accent-strong')}><Icon className="size-[18px]" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="t-head leading-tight">{MEAL_LABELS[meal.type]}</h3>
          <p className="t-meta num">{empty ? 'Sin registrar' : `${kcal(meal.totals.kcal)} kcal · P ${Math.round(meal.totals.protein)} · C ${Math.round(meal.totals.carbs)} · G ${Math.round(meal.totals.fat)}${fmtTime(last) ? ` · ${fmtTime(last)}` : ''}`}</p>
        </div>
        {!readOnly && onRepeat && empty && <IconButton icon={Repeat} label={`Repetir ${MEAL_LABELS[meal.type].toLowerCase()} de ayer`} onClick={onRepeat} />}
        {!readOnly && onAdd && <IconButton icon={Plus} label={`Añadir a ${MEAL_LABELS[meal.type].toLowerCase()}`} tone="accent" onClick={onAdd} />}
      </header>
      {!empty && <ul className="border-t border-line px-4">{meal.entries.map((e) => <FoodItem key={e.id} e={e} onEdit={onEdit && (() => onEdit(e))} onDelete={onDelete && (() => onDelete(e))} />)}</ul>}
    </Card>
  );
}

export function NutritionDetail({ d }: { d: Diary }): ReactNode {
  const rows: [string, number, string][] = [['Fibra', d.totals.fiber, 'g'], ['Grasas saturadas', d.totals.satFat, 'g'], ['Azúcares', d.totals.sugars, 'g'], ['Sal', d.totals.salt, 'g']];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      {rows.map(([k, v, u]) => <div key={k}><dt className="t-meta">{k}</dt><dd className="num font-semibold">{Math.round(v * 10) / 10} {u}</dd></div>)}
    </dl>
  );
}
