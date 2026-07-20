# Base Docker de Pruebas

Fecha: 2026-06-07

## Objetivo

Simular una base MySQL local para pruebas sin tocar la base productiva de Hostinger.

Procedimiento completo de trabajo: `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`.

Esta base sirve para:

- probar cambios antes de pasarlos a `main`,
- cargar datos ficticios,
- validar migraciones,
- usar la app local con persistencia real separada.

## Datos de conexion

La base Docker usa:

```env
DATABASE_URL="mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test"
```

No es la base productiva.

Para generar migraciones Prisma tambien usa una segunda base local de trabajo:

```env
TEST_SHADOW_DATABASE_URL="mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test_shadow"
```

El runner la fuerza como `SHADOW_DATABASE_URL`; ambas URLs se validan contra `127.0.0.1` y las credenciales Docker antes de ejecutar Prisma.

## Worktrees paralelos

El puerto por defecto es `3317`. Si otra rama ya tiene una base Docker levantada, elegir un puerto libre para este worktree antes de ejecutar cualquier comando:

```powershell
$env:JABA_TEST_DB_PORT = '3318'
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run dev:testdb
```

Los scripts forman las URL principal y shadow a partir de ese puerto y rechazan una URL que no sea `127.0.0.1/.../ganancias_jaba_test` o `127.0.0.1/.../ganancias_jaba_test_shadow`. Docker ya no usa un nombre fijo de contenedor, por lo que los worktrees pueden convivir sin detenerse ni compartir volumenes.

La base productiva sigue siendo:

```text
Host: srv1199.hstgr.io
DB: u669600172_ganancias_jaba
```

## Comandos recomendados

Desde `C:\Dev\Ganancia\Persona Fisica\ganancias-jaba`:

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run dev:testdb
```

Luego abrir:

```text
http://localhost:3000
```

## Ver la base

Para abrir Prisma Studio contra Docker:

```powershell
npm run db:test:studio
```

## Reiniciar la base de prueba

Esto borra solo el volumen Docker de pruebas, no Hostinger:

```powershell
npm run db:test:reset
npm run db:test:migrate
npm run db:test:seed
```

## Apagar la base local

```powershell
npm run db:test:down
```

## Reglas de seguridad

- No copiar la `DATABASE_URL` productiva en `.env.docker.example`.
- No usar `prisma db push` contra produccion.
- `npm run dev` y `npm run dev:testdb` son equivalentes y fuerzan siempre la base Docker.
- `npm run dev:turbopack` y `npm start` tambiÃ©n pasan por el runner aislado.
- La conexiÃ³n productiva estÃ¡ bloqueada en runtime fuera de Vercel Production/main.
- No ejecutar `next dev` directamente; aun asÃ­, la guardia bloquearÃ¡ Hostinger si se intenta.

## Flujo recomendado

1. Trabajar cambios en `staging` o rama de feature.
2. Levantar Docker con `npm run db:test:up`.
3. Aplicar migraciones con `npm run db:test:migrate`.
4. Cargar datos iniciales con `npm run db:test:seed`.
5. Probar la app con `npm run dev` y confirmar la franja `ENTORNO DE PRUEBA`.
6. Si todo esta correcto, pasar cambios a `main`.
