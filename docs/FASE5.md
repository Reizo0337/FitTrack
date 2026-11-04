# Fase 5 – Inteligencia artificial

## Arquitectura
- `apps/api/src/ai/providers.ts`: un adaptador por proveedor (Anthropic, OpenAI, Gemini) con la misma interfaz. Para añadir otro basta con un adaptador nuevo.
- **Modelo y proveedor por tarea** (`NUTRITIONIST`, `FOOD_RECOGNITION`, `WEEKLY_ANALYSIS`), configurables en Ajustes → Inteligencia artificial. Los nombres de modelo por defecto son editables; cambian con el tiempo y deben verificarse en la documentación de cada proveedor.
- **Claves API solo en el backend**, cifradas con AES-256-GCM (`MASTER_KEY`). Nunca se devuelven al navegador ni aparecen en errores. La web solo sabe si hay clave o no.
- **Consentimiento**: sin activarlo en Ajustes no se envía nada a ningún modelo (403 antes de cualquier llamada).
- **Minimización de datos**: el registro por texto envía únicamente el texto escrito. El resto envía datos agregados sin nombre ni email (`ai/context.ts`).

## Funciones
| Función | Endpoint | Notas |
|---|---|---|
| Registro por lenguaje natural | `POST /api/ai/food/parse` y `/food/confirm` | Estima cantidades y nutrientes, marca `isEstimate`, detecta kcal incoherentes y **no guarda nada hasta confirmar** (editable). |
| Qué comer | `POST /api/ai/recommend` | Según lo que queda hoy, categoría, presupuesto y alimentos disponibles. Las opciones con alergias/rechazos se **descartan en el servidor** aunque el modelo las proponga. |
| Menú semanal | `POST /api/ai/menu/weekly`, `GET /menu/latest` | 7 días. Si hay ingredientes excluidos, un reintento con los errores; si persisten, se muestran como advertencia. Avisa de días por debajo del mínimo de seguridad (1500/1200 kcal) o ±20 % del objetivo. |
| Nutricionista (chat) | `POST /api/ai/chat` | Historial persistido, prompt con reglas de seguridad (no médico, sin dietas extremas, derivar a profesionales). |
| Informe semanal | `GET /api/insights/weekly` (sin IA) y `POST /api/ai/weekly-analysis` | Las cifras se calculan en el servidor; la IA solo redacta sobre ellas. |
| Estancamiento | `GET /api/insights/status` (sin IA) | Compara medias semanales de peso (≥ 3 pesajes/semana, ≥ 2 semanas); no propone recortar calorías automáticamente. |

## Control de costes
Caché de respuestas idénticas (recomendaciones 3 h, menús 1 h, análisis semanal 24 h), modelo más barato por defecto para el reconocimiento de comidas, y contador de uso visible en Ajustes.

## Qué está verificado y qué no
- Verificado con **proveedores simulados** (82 tests): formato de las peticiones a cada proveedor, cabeceras de clave, cambio de proveedor por tarea, reintento por salida inválida, límites, caché, consentimiento y filtrado de alergias.
- **No verificado con un modelo real**: no se ha usado ninguna clave API. La calidad de las estimaciones nutricionales y de los menús, y que los nombres de modelo por defecto existan hoy, hay que comprobarlo con tu clave. Si un modelo ya no existe el proveedor devolverá error y se cambia en Ajustes.
- No hay reconocimiento de comidas por foto del plato; el OCR de etiquetas (Fase 4) sigue siendo local.
- El hambre aún no se registra, así que el asistente no puede relacionarla con el sueño.

## Base de datos
PostgreSQL debe usar codificación **UTF-8** (Neon y los Postgres habituales ya lo hacen). La BD de desarrollo embebida se inicializa con `--encoding=UTF8`; una creada antes con la codificación de Windows (WIN1252) rechaza caracteres como «→».
