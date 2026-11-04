import { useEffect, useState } from 'react';

type Profile = {
  startWeightKg: number; goalWeightKg: number; targetKcal: number; targetProteinG: number;
  targetFatG: number; targetFiberG: number; targetWaterMl: number;
};
type Derived = {
  bmr: number; tdee: number; expectedWeeklyLossKg: number; weeksToGoal: number | null;
  pace: { message: string; level: string }; warnings: string[];
};

export function Home({ fetchProfile }: { fetchProfile: () => Promise<{ profile: Profile; derived: Derived }> }) {
  const [data, setData] = useState<{ profile: Profile; derived: Derived } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetchProfile().then(setData).catch(() => setError(true));
  }, [fetchProfile]);

  if (error) return <p role="alert" className="text-red-500">No se pudo cargar el perfil.</p>;
  if (!data) return <p className="text-slate-500">Cargando…</p>;
  const { profile: p, derived: d } = data;
  const carbsG = Math.round((p.targetKcal - p.targetProteinG * 4 - p.targetFatG * 9) / 4);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Tu plan inicial</h1>
      <section className="card">
        <p className="text-sm text-slate-500">Peso inicial → objetivo</p>
        <p className="text-3xl font-bold">{p.startWeightKg} kg → {p.goalWeightKg} kg</p>
        <p className="mt-1 text-sm text-slate-500">Aún no hay pesajes registrados; el progreso real aparecerá cuando los añadas.</p>
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Objetivos diarios (configurables)</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Calorías</dt><dd>{p.targetKcal} kcal</dd>
          <dt className="text-slate-500">Proteínas</dt><dd>{p.targetProteinG} g</dd>
          <dt className="text-slate-500">Grasas</dt><dd>{p.targetFatG} g</dd>
          <dt className="text-slate-500">Carbohidratos (resto)</dt><dd>{carbsG} g</dd>
          <dt className="text-slate-500">Fibra</dt><dd>{p.targetFiberG} g</dd>
          <dt className="text-slate-500">Agua</dt><dd>{p.targetWaterMl} ml</dd>
        </dl>
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Estimaciones energéticas <span className="text-xs font-normal text-amber-500">(fórmulas, no valores médicos)</span></h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Metabolismo basal (Mifflin-St Jeor)</dt><dd>≈ {d.bmr} kcal</dd>
          <dt className="text-slate-500">Gasto diario estimado</dt><dd>≈ {d.tdee} kcal</dd>
          <dt className="text-slate-500">Pérdida esperada</dt><dd>≈ {d.expectedWeeklyLossKg} kg/semana</dd>
          <dt className="text-slate-500">Plazo hasta el objetivo</dt><dd>{d.weeksToGoal != null ? `≈ ${(d.weeksToGoal / 4.345).toFixed(1)} meses` : '—'}</dd>
        </dl>
        <p className="mt-2 text-sm">{d.pace.message}</p>
        {d.warnings.map((w) => <p key={w} className="mt-1 text-sm text-amber-500">⚠ {w}</p>)}
      </section>
    </div>
  );
}
