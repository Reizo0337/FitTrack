import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { login, logout, restoreSession } from './api';
import { AppProvider, useApp } from './ctx';
import { Food } from './pages/Food';
import { Home } from './pages/Home';
import { Activity } from './pages/Activity';
import { Progress } from './pages/Progress';
import { Settings } from './pages/Settings';
import { Soon } from './pages/Soon';

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await login(String(f.get('email')), String(f.get('password')));
      onDone();
    } catch {
      setError('Credenciales incorrectas o demasiados intentos. Espera un minuto.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">FitTrack</h1>
      <p className="text-slate-500">Acceso privado.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="Email" className="input" required />
        <label className="sr-only" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Contraseña" className="input" required minLength={8} />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}

const tabs = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/food', label: 'Alimentación', icon: '🍽️' },
  { to: '/activity', label: 'Actividad', icon: '👟' },
  { to: '/progress', label: 'Progreso', icon: '📈' },
  { to: '/ai', label: 'IA', icon: '✨' },
];

function ScanFab() {
  const { openAdd } = useApp();
  return (
    <button onClick={() => openAdd({ tab: 'scan' })} aria-label="Escanear código de barras"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-10 flex size-14 items-center justify-center rounded-full bg-accent text-2xl shadow-lg active:scale-95">▮▯▮</button>
  );
}

export function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  useEffect(() => {
    restoreSession().then((ok) => setState(ok ? 'in' : 'out'));
  }, []);

  if (state === 'loading') return <p className="p-6 text-slate-500">Cargando…</p>;
  if (state === 'out') return <Login onDone={() => setState('in')} />;

  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  };

  return (
    <AppProvider>
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-4 flex justify-end gap-2 text-sm">
        <NavLink to="/settings" className="rounded-lg px-3 py-1 text-slate-500" aria-label="Ajustes">⚙️</NavLink>
        <button onClick={toggleTheme} className="rounded-lg px-3 py-1 text-slate-500" aria-label="Cambiar tema claro/oscuro">🌓</button>
        <button onClick={async () => { await logout(); setState('out'); }} className="rounded-lg px-3 py-1 text-slate-500">Salir</button>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/food" element={<Food />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/ai" element={<Soon title="IA" phase="Fase 5: nutricionista y menús" />} />
      </Routes>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-[#0b0f14]/90">
        <ul className="mx-auto flex max-w-2xl">
          {tabs.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink to={t.to} end className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-accent' : 'text-slate-500'}`}>
                <span className="text-xl" aria-hidden>{t.icon}</span>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <ScanFab />
    </div>
    </AppProvider>
  );
}
