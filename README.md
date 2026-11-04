# FitTrack

App personal de pérdida de grasa y nutrición. Monorepo: `apps/web` (React), `apps/api` (Fastify + Prisma + PostgreSQL), `packages/shared` (cálculos y esquemas Zod). Plan completo en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Estado
Fases 2 a 6 completas. Fase 2: monorepo, esquema de BD completo + migración, login privado (sin registro público), perfil con estimaciones (BMR/TDEE/ritmo), seed de Prozis Army, shell web con tema claro/oscuro. 

## Fase 3 (núcleo) — hecho
Diario de comidas (5 tipos, gramos o unidades/raciones, repetir el día anterior, editar/borrar), base de alimentos propios y favoritos, producto Prozis con comprobación de las indicaciones del fabricante, búsqueda y escáner de códigos de barras con Open Food Facts (valores siempre por 100 g; los campos que faltan no se inventan), alimentos manuales, agua, peso con media de 7 días y comparación semanal/mensual, medidas corporales y panel con gráficas. El botón de escáner está accesible desde cualquier pantalla.
**Pendiente:** desplegar y probar en tu iPhone (Dockerfile y workflows sin probar), HealthKit nativo (requiere Mac), probar la IA con un modelo real. La cámara del escáner no se ha podido probar en un dispositivo real: la búsqueda por código escrito sí.

## Fase 4 (integraciones) — hecho
Apple Health por Atajos con token de ingesta e importación idempotente, actividad y sueño (manual o importado, sin doble conteo), estadísticas de sueño, OCR de etiquetas, ajustes de objetivos, recordatorios configurables con notificaciones push de PWA y programador externo. Detalle y límites en [docs/FASE4.md](docs/FASE4.md).

## Fase 5 (IA) — hecho
Capa de proveedores intercambiable (Claude, Gemini, OpenAI) con modelo por tarea, claves cifradas solo en el servidor, consentimiento, registro de comidas por texto con confirmación, recomendaciones, menú semanal con filtro de alergias, nutricionista por chat, informe semanal y detector de estancamiento, con límites de coste. **Probado con proveedores simulados, no con un modelo real.** Detalle en [docs/FASE5.md](docs/FASE5.md).

## Fase 6 (cierre) — hecho
Exportar y borrar todos tus datos, cambio de contraseña, fotos de progreso privadas, metas y rachas, despensa y lista de la compra, endurecimiento de seguridad, web servida desde el mismo origen, y guía de despliegue y copias. Detalle en [docs/FASE6.md](docs/FASE6.md) y [docs/DEPLOY.md](docs/DEPLOY.md).

## Ejecutar en local (Windows/Mac/Linux, sin Docker)
```bash
npm install
cp apps/api/.env.example apps/api/.env   # rellena JWT_SECRET y MASTER_KEY (instrucciones dentro)
npm run dev:db                            # PostgreSQL embebido en el puerto 5433 (déjalo abierto)
npm -w @fittrack/api exec prisma migrate deploy
npm run create-user -- tu@email.com "contraseña-de-12+-caracteres"
npm run dev:api                           # http://localhost:3000
npm run dev:web                           # http://localhost:5173
npm test                                  # requiere la BD en marcha
```

## Decisiones respecto al plan
- Contraseñas con **scrypt** (módulo `crypto` de Node, sin dependencias nativas) en lugar de argon2.
- Access token (15 min) en memoria + refresh token rotatorio en cookie httpOnly; el refresh se guarda hasheado.
- Claves de IA: se cifrarán con AES-256-GCM (`MASTER_KEY`) en BD; ya existe `security.ts` con tests.
- El botón global de escaneo no existe aún: se añadirá con el escáner (Fase 3) para no dejar botones sin función.
