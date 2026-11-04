export function Soon({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="card">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Aún no implementado. Previsto en {phase}.</p>
    </section>
  );
}
