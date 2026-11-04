import { Link } from 'react-router-dom';
import { ApiError } from '../../api';
import { Badge, Notice } from '../../ui/primitives';

export const friendly = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.code === 'AI_CONSENT_REQUIRED') return 'Activa el consentimiento de IA en Ajustes para que pueda consultar tus datos.';
    if (e.code === 'AI_KEY_MISSING') return 'Falta la clave API del proveedor. Añádela en Ajustes → Asistente de IA.';
    if (e.code === 'AI_DAILY_LIMIT') return 'Has alcanzado el límite diario de consultas.';
    if (e.code === 'AI_PROVIDER_AUTH') return 'El proveedor rechazó la clave API. Revísala en Ajustes.';
    if (e.code === 'AI_BAD_OUTPUT') return 'El modelo no devolvió una respuesta utilizable. Inténtalo de nuevo.';
    if (e.detail) return e.detail;
  }
  return 'No se pudo obtener respuesta. Inténtalo de nuevo.';
};

/** Error de IA con enlace a Ajustes cuando falta algo por configurar. */
export function AIError({ e }: { e: unknown }) {
  if (!e) return null;
  const code = e instanceof ApiError ? e.code : '';
  const fixable = code === 'AI_CONSENT_REQUIRED' || code === 'AI_KEY_MISSING' || code === 'AI_PROVIDER_AUTH' || code === 'AI_MODEL_NOT_FOUND';
  return <Notice tone="danger">{friendly(e)} {fixable && <Link to="/settings#ia" className="font-semibold underline">Ir a Ajustes</Link>}</Notice>;
}

export const Estimate = () => <Badge tone="warn">estimado</Badge>;

/** Chip seleccionable (categorías, sugerencias). */
export const chipClass = (on: boolean) =>
  `min-h-10 rounded-full border px-3.5 text-sm transition active:scale-[.98] ${on ? 'border-accent bg-accent-soft font-medium text-accent-strong' : 'border-line-strong bg-surface hover:bg-surface-2'}`;
