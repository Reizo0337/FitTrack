import { describe, expect, it } from 'vitest';
import { plainSpeech } from './voice';

describe('plainSpeech (lectura en voz alta)', () => {
  it('quita negritas, listas y símbolos de Markdown', () => {
    const md = 'Revisando tus datos, tienes **registradas** 185 kcal.\n\n- **Pollo** 200 g\n- Arroz *cocido*\n\n1. Cocina\n2. Plancha';
    const out = plainSpeech(md);
    expect(out).not.toMatch(/[*_#`|]/);
    expect(out).toContain('registradas 185 kcal');
    expect(out).toContain('Pollo 200 g');
    expect(out).toContain('Arroz cocido');
    expect(out).not.toMatch(/^\d\./m);
  });
  it('lee el texto de los enlaces y no la URL; omite el código', () => {
    const out = plainSpeech('Mira [esta guía](https://example.com/x) y `kcal`.\n```js\nconsole.log(1)\n```');
    expect(out).toContain('esta guía');
    expect(out).not.toContain('https');
    expect(out).not.toContain('console');
  });
  it('trata encabezados y tablas sin leer las barras', () => {
    const out = plainSpeech('## Cena\n\n| Alimento | Kcal |\n|---|---|\n| Pollo | 220 |');
    expect(out).toContain('Cena');
    expect(out).toContain('Pollo');
    expect(out).not.toContain('|');
    expect(out).not.toContain('---');
  });
  it('no deja signos pegados al unir líneas (p. ej. «arroz:.»)', () => {
    expect(plainSpeech('Te sugiero pollo:\n\n- Pollo 200 g\n- Arroz')).toBe('Te sugiero pollo: Pollo 200 g. Arroz');
  });
  it('texto vacío da vacío', () => {
    expect(plainSpeech('')).toBe('');
  });
});
