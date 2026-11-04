import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Accesibilidad del sistema de diseño: los pares texto/fondo de los tokens (index.css) deben cumplir WCAG AA (4,5:1).
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const tokens = (selector: string) => {
  const body = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
};
const light = tokens(':root');
const dark = { ...light, ...tokens('\\.dark') };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

const PAIRS: [string, string][] = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['ink-2', 'bg'], ['ink-2', 'surface'], ['ink-2', 'surface-2'],
  ['ink-3', 'bg'], ['ink-3', 'surface'], ['ink-3', 'surface-2'],
  ['accent-strong', 'bg'], ['accent-strong', 'surface'], ['accent-strong', 'accent-soft'],
  ['accent-ink', 'accent'], ['accent-ink', 'accent-strong'],
  ['warn', 'bg'], ['warn', 'surface'], ['warn', 'warn-soft'], ['danger', 'surface'], ['danger', 'danger-soft'],
  ['ink', 'warn-soft'], ['ink', 'accent-soft'], ['ink', 'danger-soft'],
];

describe.each([['claro', light], ['oscuro', dark]] as const)('contraste WCAG AA, tema %s', (_name, t) => {
  it.each(PAIRS)('%s sobre %s ≥ 4,5:1', (fg, bg) => {
    expect(t[fg], `falta el token ${fg}`).toBeTruthy();
    expect(t[bg], `falta el token ${bg}`).toBeTruthy();
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});
