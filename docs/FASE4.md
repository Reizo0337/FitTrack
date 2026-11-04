# Fase 4 – Integraciones

## Apple Health (sin Mac)
Una web no puede leer HealthKit. Se usa un **Atajo de iOS** que envía los datos a `POST /api/health/ingest` con un token personal.
- Ajustes → Apple Health → crear token (se muestra una sola vez; en BD solo queda su hash SHA-256). Solo permite *escribir* datos de salud: no abre ninguna otra ruta.
- Acepta `days` (pasos, energía activa y en reposo, distancia, minutos de ejercicio, FC), `sleep`, `weights` y `workouts`. Todo opcional; lo ausente queda sin dato.
- **Idempotente:** cada dato guarda un hash en `HealthSyncRecord`; reenviar lo mismo se omite, y un cambio actualiza en vez de duplicar.
- **Sin doble conteo:** si un día hay datos de Health y manuales, gana Health campo a campo; nunca se suman. Gasto total = reposo + activa; sin reposo de Health se usa el basal estimado y se marca «est.».
- La ingesta no sube el objetivo calórico por la actividad.
- Limitaciones: las automatizaciones de Atajos corren a horas fijas y iOS puede pedir confirmación; no hay sincronización en vivo.
- Apple Health nativo (Capacitor + HealthKit) **no está construido**: requiere Mac/CI de macOS y Apple Developer Program de pago (ver ARCHITECTURE.md §6b).

## Sueño y actividad
Registro manual (acostarse, dormir, despertar, duración, calidad 1-5, despertares) o importado. Estadísticas: media 7 días y semana previa, regularidad (desviación típica de horas de dormir/despertar en tu zona horaria) y relaciones (Pearson) solo con ≥ 7 días con ambos datos. No implica causalidad. El hambre aún no se registra.

## OCR de etiquetas
En «Crear» → foto de la etiqueta. Se lee **en el navegador** con Tesseract.js (la imagen no se sube a ningún servidor; la primera vez descarga el modelo de idioma). Rellena el formulario como propuesta: siempre editable y avisa si no detecta «por 100 g». Probado con una etiqueta sintética limpia (8/8 valores); las fotos reales con mala luz o curvas fallarán más.

## Recordatorios y notificaciones (PWA)
- Todos **desactivados por defecto**, horas y días configurables. Un aviso por tipo y día, y solo si la condición sigue pendiente (no avisa del desayuno si ya está registrado).
- No es posible «llevas horas sin moverte» (haría falta movimiento en tiempo real).
- **iPhone:** solo funcionan con la app instalada («Añadir a pantalla de inicio», iOS 16.4+), tras permitirlo explícitamente.
- Servidor: genera claves VAPID `npx web-push generate-vapid-keys` y ponlas en `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; define `CRON_SECRET` (≥ 24 caracteres).
- Como el hosting gratuito duerme, `.github/workflows/reminders.yml` llama cada 30 min a `/api/internal/tick` (secretos `API_URL` y `CRON_SECRET`).
- **No verificado en un iPhone real**: la lógica de envío está probada con un emisor simulado; el envío push real y la recepción en iOS requieren desplegar con HTTPS.
