import { Bell, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const greeting = () => {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};

/** Cabecera de pantalla: título + acciones (avisos y perfil). */
export function PageHeader({ title, overline, actions, bare }: { title: string; overline?: string; actions?: ReactNode; bare?: boolean }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {overline && <p className="t-meta first-letter:uppercase">{overline}</p>}
        <h1 className="t-title mt-0.5">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {!bare && (
          <>
            <Link to="/settings#notificaciones" aria-label="Notificaciones y recordatorios" className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"><Bell className="size-5" aria-hidden /></Link>
            <Link to="/settings" aria-label="Perfil y ajustes" className="inline-flex size-11 items-center justify-center"><span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2"><User className="size-[18px]" aria-hidden /></span></Link>
          </>
        )}
      </div>
    </header>
  );
}
