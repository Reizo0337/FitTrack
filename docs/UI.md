# Sistema de diseño (apps/web/src/ui)

Una sola fuente de verdad visual. Para que todo siga siendo uniforme, **las pantallas nuevas deben usar estos componentes y tokens, no clases sueltas**.

## Tokens (`index.css`)
Paleta reducida: neutros cálidos + un verde de acento (progreso/objetivo cumplido). Variables CSS `--bg`, `--surface`, `--surface-2`, `--line`, `--ink`, `--ink-2`, `--ink-3`, `--accent`, `--warn`, `--danger` y los colores de macros (`protein`, `carbs`, `fat`). El modo oscuro está diseñado aparte (no es una inversión). El tema (sistema/claro/oscuro) se gestiona en `ui/theme.ts`.
Tipografía: `t-display`, `t-title`, `t-head`, `t-body`, `t-meta`, `t-over`; cifras con `num`. Radios: `rounded-card` (16 px) y `rounded-ctl` (12 px).

## Componentes (`ui/primitives.tsx`, `ui/overlays.tsx`, `ui/progress.tsx`, `ui/nav.tsx`)
| Necesito… | Usar |
|---|---|
| Botón / icono | `Button` (primary, secondary, ghost, danger; `size="sm"`), `IconButton` |
| Contenedor | `Card` (título **dentro** de la tarjeta con `t-head`; o `SectionHeader` fuera cuando la tarjeta es el contenido de la sección) |
| Campos | `FormField`, `SelectField`, `TextAreaField`, `Segmented` |
| Avisos | `Notice` (warn, info, danger, accent), `Badge` |
| Estados | `LoadingState`, `EmptyState`, `ErrorState` |
| Diálogos y confirmaciones | `Sheet`, `ConfirmSheet` (nunca `alert`/`confirm`/`prompt`) |
| Mensajes de éxito/error | `useToast()` |
| Progreso | `ProgressRing`, `ProgressBar`, `MacroIndicator`, `Stat` |
| Gráficas | `TrendChart` |
| Cabecera de pantalla | `PageHeader` |
| Datos de la API | `useData` (recarga sola cuando cambian los datos) |

## Accesibilidad (se comprueba en `ui/contrast.test.ts`)
- **Contraste**: todo par texto/fondo de los tokens cumple WCAG AA (≥ 4,5:1) en los dos temas. Si cambias un color de `index.css`, `npm test -w @fittrack/web` falla cuando deja de cumplirse. `--ink-3` es solo para texto secundario/marcadores y también cumple.
- **Lectores de pantalla**: una región `aria-live` solo envuelve contenido que se va añadiendo (la conversación del chat es un `role="log"`); nunca un contenedor entero de formularios.
- **Foco**: al abrir una vista dentro de otra el foco va a su título (`tabIndex={-1}`); al cerrarla vuelve al control que la abrió. Los diálogos usan `Sheet`, que atrapa el foco y cierra con `Esc`.
- Los botones con estado (modo voz, micrófono) mantienen una **etiqueta fija** y expresan el estado con `aria-pressed`.
- Toda entrada de texto tiene etiqueta (`FormField`/`aria-label`); un solo `h1` por pantalla y sin saltos de nivel.

## Móvil
- Entradas a 16 px (evita el zoom automático de iOS). El teclado **tapa** la página, no la mueve ni la encoge: `html/body` no hacen scroll (cada pantalla scrollea en el contenedor de `Shell`), el meta viewport lleva `interactive-widget=overlays-content` y `ui/viewport.ts` (montado en `App`) publica `--kb` (altura del teclado) y `kb-open` en `<html>`. Lo que debe verse sobre el teclado (cuadro del chat, `Sheet`) se levanta con `--kb`; la barra inferior y lo marcado con `kb-hide` (botón «+») se ocultan. No uses scroll de ventana (`window.scrollTo`) en pantallas nuevas.
- El chat de IA detecta (`detectIntent` en `packages/shared/src/intent.ts`, reglas en español sin coste de IA) cuando pides registrar una comida, ideas de qué comer, el menú semanal o el informe, y abre esa función ejecutándola sola; el resto es conversación normal.
- Tras enviar un mensaje el foco se queda en el cuadro de texto (el teclado no se cierra); el cuadro crece con lo que escribes hasta 8 rem.
- Probar siempre en un móvil pequeño y bajo (≈ 360 × 560): ninguna pantalla debe desbordar en horizontal.

## Reglas
- Zonas táctiles ≥ 44 px (`min-h-11`), también en enlaces de texto, botones `sm` (en móvil), iconos y `summary`. Excepción: grupos densos de opciones (`Segmented`, días de la semana) ≥ 40 px con separación.
- Sin colores ni tamaños sueltos (`slate-*`, `#hex`, `dark:`): se usan los tokens.
- Los iconos son de `lucide-react`; sin emojis como iconos.
- «Sin dato» se muestra como tal (no como 0); las estimaciones llevan `Badge`/`Notice` de aviso.
- Los formularios que hacen `await` guardan `const form = e.currentTarget` **antes** del `await` (React lo anula después).
- Las pantallas secundarias se cargan con `React.lazy` (ver `App.tsx`).
