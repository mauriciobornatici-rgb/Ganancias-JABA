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
- Para desarrollo local con Docker, preferir `npm run dev:testdb` en lugar de `npm run dev`.
- `npm run dev` usa la `.env` normal; si esa `.env` apunta a Hostinger, trabajara contra Hostinger.
- `npm run dev:testdb` fuerza la base Docker aunque exista `.env` productiva.

## Flujo recomendado

1. Trabajar cambios en `staging` o rama de feature.
2. Levantar Docker con `npm run db:test:up`.
3. Aplicar migraciones con `npm run db:test:migrate`.
4. Cargar datos iniciales con `npm run db:test:seed`.
5. Probar la app con `npm run dev:testdb`.
6. Si todo esta correcto, pasar cambios a `main`.
