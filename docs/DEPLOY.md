# Despliegue, uso en iPhone y copias de seguridad

> Estado real: la aplicación y los tests se han ejecutado en local (Windows). **El `Dockerfile`, `render.yaml` y los workflows de GitHub no se han podido probar** (no hay Docker aquí ni acceso a Render/Neon/GitHub Actions). Sigue la guía y corrige lo que el primer despliegue muestre.

## 1. Ejecutar en local
Ver README. Resumen: `npm install`, `.env` en `apps/api`, `npm run dev:db`, `prisma migrate deploy`, `npm run create-user -- email "contraseña-12+"`, `npm run dev:api` y `npm run dev:web`.
Para probar el modo «un solo servicio»: `npm run build -w @fittrack/web` y arranca la API con `STATIC_DIR=apps/web/dist` (abre `http://localhost:3000`).

## 2. Arquitectura de despliegue (gratis)
Un único servicio **Render** (Docker) sirve la API y la web compilada desde el mismo origen + **Neon** (PostgreSQL). Mismo origen es imprescindible: Safari/iOS bloquea las cookies de terceros, así que web y API en dominios distintos no mantendrían la sesión.

### 2.1 Base de datos (Neon)
El proyecto ya está enlazado con `neon init` (fichero `neon.ts`, rama `production`). Neon da **dos** cadenas de conexión por rama, y la app usa ambas:

| Variable | Para qué | Host |
|---|---|---|
| `DATABASE_URL` | tráfico normal de la API | con `-pooler` (PgBouncer). `src/db.ts` añade `pgbouncer=true` solo |
| `DATABASE_URL_UNPOOLED` | migraciones (`directUrl` de Prisma) | directo |

- `neon env pull` las escribe en `.env.local` (ignorado por git). **No uses el Postgres gratuito de Render** (caduca a los 30 días).
- Prueba en una rama antes de producción: `neon checkout dev --create` (caduca a los 7 días), `npm run neon:migrate`, `npm run neon:create-user -- email "contraseña"`, `npm run neon:start`. Vuelve con `neon checkout production`.
- Los scripts `neon:*` leen `.env.local` pero conservan `MASTER_KEY` y `JWT_SECRET` de `apps/api/.env`, así que tu base local no se mezcla.
- En Render pon **las dos** variables (copia los valores de `.env.local` de la rama `production`). Al arrancar, el `Dockerfile` ejecuta `prisma migrate deploy` con la directa.
- Neon escala a cero tras inactividad: la primera consulta puede tardar 1-2 s.
### 2.2 Servicio web (Render)
1. Sube el repositorio a GitHub (privado) y crea un *Blueprint* en Render apuntando a `render.yaml`.
2. Variables (Render las pide al crear el blueprint):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | cadena de Neon |
| `MASTER_KEY` | 64 hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — **guárdala**: sin ella no se pueden descifrar las claves de IA guardadas |
| `JWT_SECRET`, `CRON_SECRET` | generadas por Render |
| `CORS_ORIGINS` | tu URL pública (`https://….onrender.com`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `AI_DAILY_LIMIT` | límite diario de llamadas a IA |

3. Las migraciones se aplican solas al arrancar (`prisma migrate deploy`).
4. **Crear tu usuario** (no hay registro público ni shell en el plan gratuito): en tu PC, con `DATABASE_URL` de Neon en `apps/api/.env`, ejecuta `npm run create-user -- tu@email.com "contraseña-larga"`.
5. Límite del plan gratuito: el servicio se duerme tras ~15 min sin tráfico (primera carga de ~30-60 s). Los recordatorios lo despiertan (ver 4).

## 3. Instalar en el iPhone
1. Abre la URL en **Safari** (HTTPS) → Compartir → **Añadir a pantalla de inicio**. Ábrela desde el icono.
2. Cámara del escáner: Safari pedirá permiso (solo funciona con HTTPS).
3. Ajustes → IA: pega tu clave API y activa el consentimiento (Objetivos).

## 4. Notificaciones
- iOS 16.4+ y la app instalada desde Safari. Ajustes → Recordatorios → «Activar notificaciones en este dispositivo» → permitir.
- Programador: en GitHub añade los secretos `API_URL` (tu URL) y `CRON_SECRET` (el mismo del servidor). El workflow `reminders.yml` llama cada 30 min.
- No verificado en un iPhone real. Si no llegan: comprueba VAPID en Render, el permiso en Ajustes de iOS y los logs del workflow.

## 5. Apple Health (Atajo)
Ajustes → Apple Health: crea el token y sigue los pasos. HealthKit nativo (Capacitor) **no está construido**: requiere Mac y cuenta de desarrollador de pago.

## 6. Copias de seguridad y restauración
- **Automática:** `.github/workflows/backup.yml` (secretos `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`). Cada noche guarda un volcado cifrado (AES-256) como artefacto 30 días. Úsalo en repositorio privado.
- **Manual desde la app:** Ajustes → Privacidad → Exportar datos (JSON, opcionalmente con fotos).
- **Restaurar:**
```bash
gpg --batch --passphrase "TU_PASSPHRASE" -d fittrack-AAAA-MM-DD.sql.gz.gpg | gunzip | psql "$DATABASE_URL_DESTINO"
```
- Prueba una restauración en una base vacía al menos una vez; una copia sin probar no es una copia.
- Neon también ofrece restauración a un punto en el tiempo (ventana corta en el plan gratuito).

## 7. Seguridad (resumen)
HTTPS obligatorio (Render), sesión con token de 15 min + refresh rotatorio HttpOnly/SameSite=Lax/Secure, comprobación de Origin, límites de peticiones (global y específicos), CSP estricta, claves de IA cifradas (AES-256-GCM), fotos solo con URL firmada de 5 min, exportar y borrar todos los datos. La CSP permite `cdn.jsdelivr.net` y `tessdata.projectnaptha.com` únicamente para el OCR local (Tesseract.js descarga su motor e idioma); si prefieres no depender de un CDN, hay que alojar esos archivos tú mismo.

## 8. Actualizar
`git push` → Render reconstruye y migra. Antes de cambios de esquema, comprueba que existe una copia reciente.
