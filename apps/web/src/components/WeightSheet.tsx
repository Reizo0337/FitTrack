import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useApp } from '../ctx';
import { Sheet, useToast } from '../ui/overlays';
import { Button, FormField } from '../ui/primitives';
import { todayStr } from '../ui/DateSelector';

const num = (v: FormDataEntryValue | null) => (v ? Number(String(v).replace(',', '.')) : undefined);

/** Registro de peso (con composición opcional). Se usa desde Inicio, Progreso y las acciones rápidas. */
export function WeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    try {
      await api('/weight', { method: 'POST', body: JSON.stringify({ date: String(f.get('date')), weightKg: num(f.get('weightKg')), bodyFatPct: num(f.get('bodyFatPct')), muscleKg: num(f.get('muscleKg')), bodyWaterPct: num(f.get('bodyWaterPct')) }) });
      toast('Peso guardado'); bump(); onClose();
    } catch (er) {
      setErr(er instanceof ApiError && er.status === 400 ? 'Revisa los valores: peso 30–400 kg, grasa 2–70 %.' : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Registrar peso">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Peso (kg)" name="weightKg" inputMode="decimal" required autoFocus placeholder="110,4" />
          <FormField label="Fecha" name="date" type="date" defaultValue={todayStr()} max={todayStr()} required />
        </div>
        <details className="rounded-ctl border border-line bg-surface px-3 py-2">
          <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-2">Composición corporal (opcional)</summary>
          <div className="grid grid-cols-2 gap-3 pb-2 pt-2">
            <FormField label="% grasa" name="bodyFatPct" inputMode="decimal" />
            <FormField label="Músculo (kg)" name="muscleKg" inputMode="decimal" />
            <FormField label="% agua corporal" name="bodyWaterPct" inputMode="decimal" className="col-span-2" />
          </div>
          <p className="t-meta pb-1">Solo si tu báscula lo mide. Sin estos datos no se puede afirmar cuánta grasa has perdido.</p>
        </details>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" loading={busy} block>Guardar</Button>
      </form>
    </Sheet>
  );
}
