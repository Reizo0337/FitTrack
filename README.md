# FitTrack

App personal de pérdida de grasa y nutrición. Monorepo: `apps/web` (React), `apps/api` (Fastify + Prisma + PostgreSQL), `packages/shared` (cálculos y esquemas Zod). Plan completo en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Estado
Fase 2 completa: monorepo, esquema de BD completo + migración, login privado (sin registro público), perfil con estimaciones (BMR/TDEE/ritmo), seed de Prozis Army, shell web con tema claro/oscuro. Las pestañas Alimentación/Actividad/Progreso/IA están marcadas como "no implementado" hasta las fases 3-5.

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
