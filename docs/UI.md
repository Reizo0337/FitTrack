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

## Reglas
- Zonas táctiles ≥ 44 px (`min-h-11`), también en enlaces de texto.
- Sin colores ni tamaños sueltos (`slate-*`, `#hex`, `dark:`): se usan los tokens.
- Los iconos son de `lucide-react`; sin emojis como iconos.
- «Sin dato» se muestra como tal (no como 0); las estimaciones llevan `Badge`/`Notice` de aviso.
- Los formularios que hacen `await` guardan `const form = e.currentTarget` **antes** del `await` (React lo anula después).
- Las pantallas secundarias se cargan con `React.lazy` (ver `App.tsx`).
