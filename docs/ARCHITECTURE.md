# FitTrack – Fase 1: análisis y arquitectura

## 1. Limitaciones reales (condicionan todo)

| Requisito | Qué permite iOS | Consecuencia |
|---|---|---|
| HealthKit | **Solo apps nativas.** Safari/PWA no tienen acceso. | Hace falta contenedor nativo (Capacitor) + plugin HealthKit. Requiere **Mac con Xcode** y cuenta Apple Developer (gratis: firma 7 días; 99 €/año: 1 año y TestFlight). |
| Notificaciones push en PWA | iOS 16.4+, solo si la PWA está instalada en pantalla de inicio. Poco fiables, sin programación local. | Para recordatorios fiables: **notificaciones locales** (`@capacitor/local-notifications`), sin servidor ni APNs. |
| Cámara / códigos de barras | PWA: `getUserMedia` funciona, `BarcodeDetector` no existe en Safari. | En nativo: ML Kit (`@capacitor-mlkit/barcode-scanning`). En web/escritorio: fallback ZXing. |
| Lectura de HealthKit en segundo plano | Limitada; iOS bloquea lecturas con el teléfono bloqueado. | Sincronizar al abrir la app + al volver a primer plano. Sin sync "en vivo". |
| Datos de báscula | Llegan a Health solo si la app de la báscula escribe allí. | Se importan si existen; si no, registro manual. Nunca se inventan. |

**Decisión:** una sola base de código React. Se empaqueta con **Capacitor** para iPhone (HealthKit, notificaciones locales, escáner nativo). La misma build funciona como PWA/escritorio con las funciones nativas degradadas (sin Health, escáner ZXing, sin recordatorios programados).

## 2. Stack (mínimo necesario)

- **Monorepo npm workspaces**: `apps/web`, `apps/api`, `packages/shared` (tipos + esquemas Zod compartidos).
- **Frontend**: React + TypeScript + Vite (no Next.js: no hay SSR ni SEO que justifique su peso, y Capacitor quiere una SPA estática), Tailwind CSS, TanStack Query, Recharts, React Router.
- **Backend**: Node + Fastify + TypeScript, Zod para validar toda entrada, Prisma + PostgreSQL.
- **Auth**: usuario único; contraseña con argon2, JWT de acceso corto + refresh en cookie httpOnly (web) / Keychain (iOS). Sin endpoint de registro: la cuenta se crea con un script CLI (`npm run create-user`).
- **IA**: interfaz `LLMProvider` con adaptadores Anthropic / Gemini / OpenAI; modelo configurable por tarea (`nutritionist`, `food_recognition`, `weekly_analysis`). Claves **solo en el backend**, cifradas en BD (AES-256-GCM con clave maestra en env).
- **OCR**: foto de etiqueta → modelo con visión del proveedor elegido (fiable) con edición obligatoria antes de guardar; sin dependencias OCR pesadas en el cliente.
- **Infra**: Docker Compose (api + postgres + Caddy para HTTPS), migraciones Prisma, `pg_dump` diario con rotación, logs con pino.
- **Nativo**: Capacitor 6 + plugin HealthKit (se evalúa `@perfood/capacitor-healthkit`; si no cubre sueño/entrenos/pasos agrupados, **pequeño plugin Swift propio** en `apps/web/ios/…/FitTrackHealth`).

## 3. Estructura

```
fittrack/
  apps/web/        React + Capacitor (ios/)
  apps/api/        Fastify + Prisma
    src/modules/{auth,nutrition,food,activity,sleep,weight,ai,reminders,health-sync,export}
    src/ai/providers/{anthropic,gemini,openai}.ts
  packages/shared/ Zod schemas + tipos
  docker-compose.yml  docs/  scripts/backup.sh
```

## 4. Modelo de datos (Prisma, resumen)

Fechas: `timestamptz` en UTC + `tz` (IANA) y `localDate` (`date`) en cada registro diario, para agrupar por día del usuario aunque viaje.

- `UserProfile` (edad/nacimiento, sexo, altura, actividad, tz, objetivos kcal/P/G/fibra/agua, alergias, preferencias, consentimiento IA)
- `WeightEntry` (kg, grasa %, músculo kg, agua %, `source`: MANUAL|HEALTH, `externalId`)
- `BodyMeasurement` (cintura, pecho, cadera, brazo, muslo) · `ProgressPhoto` (ruta privada, acceso por URL firmada)
- `Food`, `FoodProduct` (barcode único, por 100 g, `servingG`, origen OFF|MANUAL|OCR|SEED) · `Recipe`+`RecipeItem`
- `Meal` (tipo, fecha) · `MealEntry` (food/product ref, gramos reales, nutrientes **calculados al guardar** y `isEstimate`)
- `DailyNutrition` (agregado cacheado, recalculable) · `WaterIntake`
- `ActivityRecord` (pasos, activa, reposo, distancia, min ejercicio, FC) por día+fuente · `Workout` · `SleepRecord` (acostarse, dormir, despertar, calidad, despertares, fuente)
- `Goal`, `Reminder`, `AIProviderConfig` (por tarea, clave cifrada), `AIConversation`, `AIMessage`
- `HealthSyncRecord` (`sampleUUID` único + tipo + hash → upsert idempotente: **sin duplicados**)

Producto Prozis: se inserta con un **seed** (`prisma/seed.ts`) leyendo un JSON de datos, no hardcodeado en lógica. La ración de 60 g y los valores por ración se derivan de los de 100 g.

## 5. Reglas de dominio

- BMR: Mifflin-St Jeor (con Katch-McArdle si hay % de grasa). TDEE inicial = BMR × 1,2 (sedentario). Con datos de Health: TDEE = reposo + activa (sin sumar dos veces; la meta de ingesta **no** sube por actividad).
- Ritmo: 112→90 kg en 7-9 meses ≈ 0,6-0,75 kg/semana. La app avisa si el ritmo real supera ~1 % del peso/semana o si el objetivo cae por debajo de BMR; nunca sugiere déficits agresivos.
- Peso: tendencia con media móvil de 7 días; "estancamiento" = media sin bajar ≥ 3 semanas con ≥ 6 pesajes/semana. Peso ≠ grasa: solo se habla de grasa si hay medición.
- Prozis: avisa si > 2 batidos/día o si el resto de la dieta no cubre fibra/verdura/grasas; no asume que sea nutricionalmente completo.
- IA: solo recibe datos agregados y mínimos, tras consentimiento; respuestas distinguen dato real vs. estimación; prompt de sistema con límites (sin diagnóstico, sin dietas extremas, derivar a profesional). Control de coste: caché por hash de petición, límites diarios, modelo barato por defecto para reconocimiento.

## 6. Fases y verificación

1. **Base**: monorepo, Docker, Prisma + migraciones + seed, auth, layout y tema claro/oscuro. *Prueba:* login, tests de API, arranque con `docker compose up`.
2. **Núcleo**: alimentos, Open Food Facts (búsqueda + barcode), diario, Prozis, peso, dashboard. *Prueba:* tests de cálculo + navegador.
3. **Integraciones**: escáner, OCR, Capacitor + HealthKit (+ sueño), notificaciones locales. *Prueba:* en tu iPhone (requiere Mac).
4. **IA**: capa de proveedores, registro por texto/foto, recomendaciones, menú semanal, nutricionista, informe dominical.
5. **Extras**: retos y rachas, lista de la compra, despensa, supermercado, exportar/borrar datos.
6. **Cierre**: seguridad, accesibilidad, rendimiento, documentación de despliegue y backups.

## 6b. Decisiones tras confirmar con el usuario (sin Mac, hosting gratuito)

**Apple Health sin Mac, en dos niveles:**
1. **Nivel 1 (gratis, sin Mac, el que se construye primero):** endpoint `POST /api/health/ingest` protegido con token personal de larga duración (solo escritura de datos de salud). Un **Atajo de iOS** (app Atajos + automatización diaria) lee Health (pasos, energía activa/en reposo, distancia, entrenos, sueño, peso) y lo envía por HTTPS. Idempotente por día+tipo. Limitación: las automatizaciones de Atajos se ejecutan en horarios fijos y pueden pedir confirmación; no hay sync en vivo.
2. **Nivel 2 (opcional, de pago):** app Capacitor + HealthKit nativo compilada con un runner macOS de GitHub Actions y distribuida por TestFlight. Requiere Apple Developer Program (~99 €/año): las cuentas gratuitas normalmente no pueden habilitar HealthKit (a confirmar en la documentación de Apple). El código del plugin se deja preparado, no se da por funcionando hasta probarlo.
- Notificaciones: sin app nativa, solo push de PWA instalada (iOS 16.4+, menos fiable). Los recordatorios programados fiables llegarían con el nivel 2.

**Hosting gratuito recomendado:** API en **Render** (web service gratis, se duerme tras inactividad → primera petición lenta) + base de datos en **Neon** (Postgres gratuito, escala a cero). *No* usar el Postgres gratuito de Render (caduca a los 30 días). Supabase es alternativa pero pausa proyectos inactivos. Los límites cambian a menudo: verificar en las páginas oficiales antes de desplegar. Backups: `pg_dump` programado con GitHub Actions hacia un artefacto/almacenamiento privado, más exportación manual desde la app.
Fuentes de la comparación: [Koyeb](https://www.koyeb.com/blog/top-postgresql-database-free-tiers-in-2026), [free-postgres-hosting](https://github.com/freebase-cloud/free-postgres-hosting).

## 7. Qué no puedo verificar desde aquí
Compilar y probar en iPhone (Xcode), HealthKit real y notificaciones locales requieren tu Mac e iPhone. El resto (API, BD, web, cálculos, Open Food Facts) lo ejecuto y pruebo aquí.
