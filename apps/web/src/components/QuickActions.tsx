import { ChevronRight, ScanBarcode, Scale, Sparkles, Utensils, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../ctx';
import { Sheet } from '../ui/overlays';

type Action = { icon: LucideIcon; title: string; text: string; run: () => void };

/** Hoja de acciones rápidas, accesible desde cualquier pantalla principal. */
export function QuickActions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openAdd, openWeight } = useApp();
  const nav = useNavigate();
  const actions: Action[] = [
    { icon: Utensils, title: 'Registrar comida', text: 'Buscar, crear o repetir un alimento', run: () => openAdd({}) },
    { icon: ScanBarcode, title: 'Escanear alimento', text: 'Código de barras con la cámara', run: () => openAdd({ tab: 'scan' }) },
    { icon: Scale, title: 'Registrar peso', text: 'Peso y composición corporal', run: openWeight },
    { icon: Sparkles, title: 'Consultar a la IA', text: 'Pregunta a tu asistente nutricional', run: () => { onClose(); nav('/ai'); } },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Registrar">
      <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
        {actions.map(({ icon: Icon, title, text, run }) => (
          <li key={title} className="border-b border-line last:border-0">
            <button onClick={run} className="flex min-h-16 w-full items-center gap-3 px-4 text-left transition hover:bg-surface-2 active:bg-surface-2">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-strong"><Icon className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="t-meta block">{text}</span></span>
              <ChevronRight className="size-4 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
