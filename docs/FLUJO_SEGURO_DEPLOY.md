# Flujo Seguro de Deploy y Base de Datos

Fecha: 2026-06-07

## Objetivo

Trabajar con tranquilidad: probar cambios antes de publicarlos, mantener `main` como produccion y evitar que ambientes de prueba escriban por accidente en la base real de Hostinger.

Procedimiento operativo obligatorio: `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`.

## Ambientes

| Ambiente | Rama | Vercel | Base de datos |
| --- | --- | --- | --- |
| Produccion | `main` | Production Deployment | `u669600172_ganancias_jaba` |
| Prueba | `staging` | Preview Deployment | sin `DATABASE_URL` o DB staging separada |
| Desarrollo local | rama de trabajo | maquina local | `.env` local controlado |

## Regla principal

- `main` es la unica rama que debe publicar produccion.
- `staging` sirve para probar cambios antes de pasarlos a `main`.
- Preview/Staging no debe usar la base productiva.
- Las migraciones de base no se ejecutan automaticamente en build.
- Antes de migraciones productivas importantes, exportar backup SQL desde Hostinger.

## Proteccion automatica agregada

Se agrego `scripts/check-deployment-db-safety.mjs` y se conecto como `prebuild`.

Comportamiento:

- En local bloquea cualquier intento de usar la base productiva.
- En Vercel Production exige `DATABASE_URL`.
- En Vercel Production bloquea si la rama detectada no es `main`.
- En Vercel Preview permite no tener `DATABASE_URL`, porque asi no puede escribir en produccion.
- En Vercel Preview bloquea si `DATABASE_URL` apunta a `srv1199.hstgr.io` / `193.203.175.56` y a `u669600172_ganancias_jaba`.
- En Vercel Preview permite una base staging separada, por ejemplo `u669600172_ganancias_jaba_staging`.

Variables opcionales del script:

```env
PRODUCTION_DATABASE_HOSTS="srv1199.hstgr.io,193.203.175.56"
PRODUCTION_DATABASE_NAME="u669600172_ganancias_jaba"
```

No existe una bandera de excepciÃ³n para conectar Preview o localhost a producciÃ³n.

## Configuracion recomendada en Vercel

En Environment Variables:

- `DATABASE_URL`: marcar solo `Production`.
- Preview: dejar sin `DATABASE_URL` por ahora, o crear una segunda DB en Hostinger para staging.
- No cargar passwords en GitHub ni en archivos del repo.

Si Vercel actualmente tiene `DATABASE_URL` marcada como `Production and Preview`, cambiarla a `Production` solamente. Si no se cambia, los futuros previews fallaran por diseno para proteger la base real.

Verificacion 2026-06-21:

- Se reprodujo localmente la misma guarda con una URL que apunta a Hostinger productivo: Preview queda bloqueado con el mensaje `Preview/Staging no puede usar la base productiva`.
- Sin `DATABASE_URL` en Preview, la guarda permite compilar. Esto confirma que los errores de Preview de la rama IVA/IIBB son una proteccion esperada, no una modificacion de `main` ni una falla funcional del modulo.

## Flujo diario de trabajo

1. Trabajar cambios en una rama de desarrollo o en `staging`.
2. Ejecutar verificacion local antes de integrar.
3. Pushear a GitHub.
4. Revisar CI de GitHub.
5. Revisar Preview de Vercel desde `staging`.
6. Cuando este OK, integrar a `main`.
7. Vercel publica produccion desde `main`.

Comandos utiles:

```powershell
node scripts/check-deployment-db-safety.mjs
npm run test
npm run typecheck
npm run prisma:validate
npm run build
```

En esta maquina, si `npm` no esta disponible en el runtime de Codex, usar los comandos directos documentados en `docs/CONTINUAR_AQUI.md`.

## Migraciones y resguardo de datos

No usar `prisma db push` sobre produccion.

Proceso seguro para cambios de schema productivos:

1. Crear migracion versionada con Prisma.
2. Probar local/staging.
3. Exportar backup SQL desde Hostinger.
4. Ejecutar `prisma migrate deploy` contra produccion.
5. Verificar tablas/datos criticos.
6. Registrar fecha, commit y resultado en `docs/REGISTRO_PROYECTO.md`.

Seeds:

- El seed inicial ya fue ejecutado.
- No ejecutar seeds destructivos en produccion.
- Si se necesita un seed nuevo, debe ser idempotente y estar probado.

## CI GitHub

Se agrego `.github/workflows/ci.yml`.

Corre en:

- push a `main`,
- push a `staging`,
- pull request hacia `main` o `staging`.

Verifica:

- `npm run test`,
- `npm run typecheck`,
- `npm run prisma:validate`,
- `npm run build`.

## Checklist antes de publicar a produccion

- CI verde.
- Preview revisado.
- `DATABASE_URL` productiva solo en Production.
- No hay `.env` ni credenciales en Git.
- Si hubo migracion, backup SQL descargado antes.
- Registro actualizado.
