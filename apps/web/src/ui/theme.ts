export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'theme';

export const getThemePref = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
};

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0d0f' : '#f5f5f1');
}

export function setThemePref(pref: ThemePref) {
  try { pref === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref); } catch { /* almacenamiento no disponible */ }
  applyTheme(pref);
}

/** Aplica el tema guardado y reacciona a los cambios del sistema mientras la preferencia sea «sistema». */
export function initTheme() {
  applyTheme(getThemePref());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getThemePref() === 'system') applyTheme('system'); });
}
