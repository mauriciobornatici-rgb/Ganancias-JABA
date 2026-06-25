# Procedimiento de Desarrollo Seguro

Fecha: 2026-06-07

## Objetivo

Este procedimiento es obligatorio para agregar funcionalidades, corregir errores o modificar calculos sin romper:

- la aplicacion publicada en Vercel;
- la base productiva de Hostinger;
- las declaraciones ya cargadas;
- el flujo de trabajo ordenado del proyecto.

## Regla de oro

Nunca probar cambios nuevos contra la base productiva.

Para desarrollo y pruebas locales se usa Docker:

```env
DATABASE_URL="mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test"
```

La base productiva de Hostinger queda reservada para la aplicacion publicada desde `main`.

## Mapa de ambientes

| Uso | Rama | Comando/App | Base |
| --- | --- | --- | --- |
| Produccion real | `main` | Vercel Production | Hostinger `u669600172_ganancias_jaba` |
| Prueba previa | `staging` | Vercel Preview | sin DB o DB staging separada |
| Desarrollo local seguro | `staging` o feature | `npm run dev:testdb` | Docker `ganancias_jaba_test` |

## Comandos de inicio para trabajar localmente

Desde:

```powershell
C:\Dev\Ganancia\Persona Fisica\ganancias-jaba
```

Ejecutar:

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run dev:testdb
```

Abrir:

```text
http://localhost:3000
```

## Validacion automatica del caso Excel/capturas

Para validar el caso patron Lobato 2024 contra MySQL Docker:

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:validate:excel
```

Que cubre:

- prepara el escenario 2024 en la base Docker `ganancias_jaba_test`;
- carga el fixture documentado en `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md`;
- guarda la DDJJ usando la misma persistencia que usa la app;
- recalcula y compara CMV, AXI, resultado, patrimonio, consumo y JVP;
- vuelve a leer las tablas estructuradas para verificar que la reapertura conserva la carga.

Regla de seguridad:

- el comando falla si `DATABASE_URL` no apunta a `mysql://jaba_test:jaba_test_pass@127.0.0.1:<JABA_TEST_DB_PORT>/ganancias_jaba_test`.
- al generar migraciones, `SHADOW_DATABASE_URL` tambien debe apuntar a la base Docker local `ganancias_jaba_test_shadow` del mismo puerto.
- no se debe adaptar este comando para Hostinger produccion.

## Comandos que NO deben usarse para pruebas comunes

No usar para desarrollo normal:

```powershell
npm run dev
```

Motivo: `npm run dev` lee la `.env` normal. Si esa `.env` apunta a Hostinger, se trabajaria contra datos reales.

No usar contra produccion:

```powershell
prisma db push
```

Motivo: puede alterar schema sin migracion versionada.

No ejecutar seeds destructivos en produccion.

## Flujo para agregar una funcionalidad

1. Confirmar estado:

```powershell
git status --short --branch
```

2. Trabajar en `staging` o en una rama feature.

3. Levantar base Docker:

```powershell
npm run db:test:up
```

4. Si hubo cambios de schema, crear migracion versionada y probarla en Docker.

5. Aplicar migraciones de prueba:

```powershell
npm run db:test:migrate
```

6. Cargar datos de prueba:

```powershell
npm run db:test:seed
```

7. Probar la app local:

```powershell
npm run dev:testdb
```

8. Ejecutar verificacion:

```powershell
npm run test
npm run typecheck
npm run prisma:validate
npm run build
```

9. Registrar en:

- `docs/CONTINUAR_AQUI.md`;
- `docs/BACKLOG_PRIORIZADO.md`, si cambia prioridad/estado;
- `docs/REGISTRO_PROYECTO.md`.

10. Commit y push.

11. Revisar Preview/CI.

12. Solo si esta correcto, pasar a `main`.

## Flujo para cambios de base de datos

Para cambios de schema:

1. Crear migracion Prisma versionada.
2. Probar migracion en Docker.
3. Validar app con `npm run dev:testdb`.
4. Ejecutar tests/build.
5. Hacer commit.
6. Probar en `staging`.
7. Antes de produccion, exportar backup SQL desde Hostinger.
8. Ejecutar `prisma migrate deploy` contra produccion solo cuando se decida publicar.
9. Registrar fecha, commit, migracion y resultado.

## Protecciones ya configuradas

- `scripts/check-deployment-db-safety.mjs` bloquea Vercel Preview si intenta usar la DB productiva.
- `prebuild` ejecuta esa guarda antes de compilar.
- `.github/workflows/ci.yml` verifica `main` y `staging`.
- `npm run dev:testdb` fuerza la base Docker aunque exista `.env` productiva.
- `.env.docker.example` documenta la URL local segura.

## Checklist antes de pasar a produccion

- Base local Docker probada.
- CI verde.
- Build local verde.
- Preview revisado.
- No hay credenciales reales en Git.
- `DATABASE_URL` en Vercel esta solo en Production.
- Si hubo migracion productiva: backup SQL descargado.
- Registro actualizado.

## Si algo sale mal

- No hacer `git reset --hard`.
- No borrar volumenes ni tablas productivas.
- Detenerse y registrar el error.
- Si el problema fue en Docker, se puede reiniciar solo la base de prueba:

```powershell
npm run db:test:reset
npm run db:test:migrate
npm run db:test:seed
```

Esto borra solo el volumen local de Docker, no Hostinger.
