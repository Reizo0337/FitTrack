# Fase 6 – Cierre: privacidad, seguridad, constancia y despliegue

## Privacidad
- **Exportar** (`GET /api/account/export`, `?photos=1` para incluir fotos): JSON con todos tus datos. Nunca incluye hashes de contraseña, tokens ni claves API.
- **Borrar todo** (`DELETE /api/account`): exige contraseña y escribir `BORRAR TODO`; elimina la cuenta y todo lo asociado en cascada (comidas, peso, fotos, claves de IA, conversaciones…). Verificado en tests contando 20 tablas a cero.
- **Cambiar contraseña** (`POST /api/account/password`): cierra todas las demás sesiones.
- **Fotos de progreso**: guardadas en la base de datos (el disco de los hosting gratuitos es efímero), validadas por sus bytes (JPEG/PNG/WebP, ≤ 3 MB), reducidas en el navegador a 1280 px (sin EXIF/GPS) y servidas solo con URL firmada de 5 minutos ligada a foto y usuario (`no-store`, `nosniff`).

## Seguridad
Cookie de sesión HttpOnly + SameSite=Lax + Secure (producción); comprobación de `Origin` en las rutas de sesión; límite global de peticiones por IP (300/min) además de los específicos (login, refresh, exportar, borrar…); CSP estricta (`frame-ancestors 'none'`, `object-src 'none'`); `trustProxy` en producción. La web se sirve **desde el mismo origen** que la API (`STATIC_DIR`), imprescindible para que iOS no bloquee la cookie.

### Dependencias (`npm audit --omit=dev`)
Se actualizaron `@fastify/jwt` 10 (crítica), `zod` 4, `react-router-dom` 7 y Prisma (parche): 8 avisos → 3. **Quedan 3 de gravedad alta** en la CLI de Prisma (`deepmerge-ts` vía `@prisma/config`, agotamiento de pila con objetos recursivos). Solo procesa el `schema`/config del propio proyecto, no entradas externas; el arreglo automático exige un salto mayor de versión de herramientas. Revísalo al migrar a Prisma 7.

## Constancia (retos)
Metas configurables (pasos, proteína, agua, sueño, registrar comidas, entrenos/semana), rachas (siguen vivas si hoy aún no se cumple), mejor racha, cumplimiento a 30 días **solo sobre días con dato** (sin dato no es fallo), hitos de peso cada 2 kg y mensajes discretos sin culpabilizar.

## Despensa y lista de la compra
Despensa propia (la IA la usa si no indicas qué tienes) y lista de la compra generada del último menú semanal, con cantidades sumadas y lo que ya tienes aparte; casillas guardadas en el dispositivo.

## Rendimiento y accesibilidad
Páginas secundarias en carga diferida (el bundle inicial baja de ~460 kB a ~270 kB; escáner y OCR solo se cargan al usarlos), `prefers-reduced-motion`, foco visible, `Esc` cierra el diálogo, barras de progreso con `role="progressbar"`, etiquetas ARIA.

## Despliegue
`Dockerfile`, `render.yaml`, `.github/workflows/backup.yml` y `docs/DEPLOY.md` (Neon + Render, iPhone, notificaciones, copias y restauración).

## Fallos encontrados y corregidos durante la verificación
- Los formularios usaban `e.currentTarget` después de un `await` (React lo anula): el guardado funcionaba pero la lista no se refrescaba ni el formulario se limpiaba (despensa, tokens, peso, medidas, sueño, actividad, contraseña, claves). Corregido capturando el formulario antes.
- `.env.example` con variables vacías hacía inválida la configuración; ahora se tratan como no definidas.

## No verificado
Dockerfile/render.yaml/workflows (sin Docker ni acceso a Render, Neon o GitHub); service worker y notificaciones push (el navegador integrado no registró el service worker); cámara del escáner; comportamiento en iPhone real; modelos de IA reales.
