import { Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { login, logout, restoreSession } from './api';
import { AppProvider, useApp } from './ctx';
import { Activity } from './pages/Activity';
import { AI } from './pages/AI';
import { Food } from './pages/Food';
import { Home } from './pages/Home';
import { Progress } from './pages/Progress';
import { Settings } from './pages/Settings';
import { BottomNavigation, Sidebar } from './ui/nav';
import { ToastProvider } from './ui/overlays';
import { Button, FormField } from './ui/primitives';

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try { await login(String(f.get('email')), String(f.get('password'))); onDone(); }
    catch { setError('Credenciales incorrectas o demasiados intentos. Espera un minuto.'); }
    finally { setBusy(false); }
  }
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <span className="mb-4 flex size-11 items-center justify-center rounded-[14px] bg-accent text-accent-ink"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h4l3-8 4 16 3-8h4" /></svg></span>
        <h1 className="t-title">FitTrack</h1>
        <p className="t-meta mt-1">Acceso privado.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FormField label="Email" name="email" type="email" autoComplete="username" required />
        <FormField label="Contraseña" name="password" type="password" autoComplete="current-password" required minLength={8} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={busy} block>Entrar</Button>
      </form>
    </main>
  );
}

function QuickAddButton() {
  const { openQuick } = useApp();
  return (
    <button onClick={openQuick} aria-label="Registrar comida, peso o escanear"
      className="fixed right-4 z-20 flex size-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[var(--shadow-pop)] transition hover:bg-accent-strong active:scale-95 lg:hidden"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}>
      <Plus className="size-7" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { openQuick } = useApp();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const chat = pathname.startsWith('/ai');
  return (
    <div className="min-h-dvh lg:pl-60">
      <Sidebar onQuickAdd={openQuick} />
      <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-safe lg:max-w-5xl lg:px-10 lg:pb-12 lg:pt-8">
        <div key={pathname} className="page-in">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/food" element={<Food />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/ai" element={<AI />} />
            <Route path="/settings" element={<Settings onLogout={onLogout} />} />
          </Routes>
        </div>
      </main>
      <BottomNavigation />
      {!chat && <QuickAddButton />}
    </div>
  );
}

export function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  useEffect(() => { restoreSession().then((ok) => setState(ok ? 'in' : 'out')); }, []);

  if (state === 'loading') return <div className="grid min-h-dvh place-items-center" role="status" aria-label="Cargando"><div className="skeleton size-10 !rounded-full" /></div>;
  if (state === 'out') return <ToastProvider><Login onDone={() => setState('in')} /></ToastProvider>;
  return (
    <ToastProvider>
      <AppProvider>
        <Shell onLogout={async () => { await logout(); setState('out'); }} />
      </AppProvider>
    </ToastProvider>
  );
}
