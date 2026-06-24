# Commit seguro — Flujo de liquidación de IVA + consolidación anual

> Ejecutar en Windows, **dentro del worktree** `C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual`.
> No afecta `main` ni producción: todo vive en la rama `feature/iva-iibb-mensual-core`.

## 1. Cliente Prisma + migración

El cliente ya se regenera con `npx prisma generate` (no necesita base; lee el schema). Eso es lo único
necesario para que compile.

```powershell
cd "C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual"
npx prisma generate
```

**La migración SQL ya está creada a mano** en `prisma/migrations/20260624120000_add_included_in_settlement/`
(un simple `ADD COLUMN includedInSettlement BOOLEAN NOT NULL DEFAULT true`, que calca el output de Prisma).

> ⚠️ **No corras `prisma migrate dev` contra la base de producción** — es destructivo (puede resetear).
> Para aplicar la columna de forma segura usá `migrate deploy` (solo aplica migraciones pendientes, no destructivo):
>
> ```powershell
> # Apuntá DATABASE_URL a la base correcta (dev primero; prod cuando corresponda) y:
> npx prisma migrate deploy
> ```
>
> El error "datasource.url required" que viste es porque el worktree no tiene `.env` (no se comparte entre
> worktrees). Copiá tu `.env` con `DATABASE_URL` al worktree, o seteá la variable antes de `migrate deploy`.

## 2. Dejar la rama verde

```powershell
npm run build      # tsc + Next: debe compilar sin errores
npx vitest run     # toda la batería, incluidos los tests nuevos del flujo IVA y la consolidación
```

Tests nuevos a verificar (deberían pasar):
- `settlementBuilders.test.ts` — regresión NC al lado contrario + libre disponibilidad.
- `fiscalSettlementPersistence.test.ts` — cotejo completo/parcial, versionado, estados.
- `annualConsolidation.test.ts` — compuerta CLOSED.
- `annualConsolidationAssembler.test.ts` — imputación inferida + consolidación.
- `annualConsolidationSnapshot.test.ts` — snapshot idempotente + obsolescencia.

## 3. Commit (sin push)

```powershell
git add prisma/schema.prisma prisma/migrations
git add src/app/api/clientes
git add src/app/clientes
git add src/domain/ganancias/fiscalLedger src/domain/ganancias/persistence src/domain/ganancias/tests
git add docs/REGISTRO_PROYECTO.md docs/COMMIT_FLUJO_IVA_ANUAL.md
git status            # revisar que solo entre lo del módulo IVA/IIBB

git commit -m "feat(iva): flujo completo de liquidacion de IVA (subir, revisar, cotejar, guardar) + consolidacion anual con compuerta CLOSED

- includedInSettlement por comprobante (seleccion de filas) + endpoints de listado y seleccion
- settlement GET/save: recalculo server-side, cotejo exigiendo los 3 importes, versionado con reintento
- arrastre tecnico y de libre disponibilidad solo desde liquidaciones CLOSED
- pantalla de liquidacion (subir CSV AFIP, grilla con seleccion, totales F2002, cotejo, guardar)
- imputacion inferida + ensamblador anual + reader DB + snapshot durable (solo meses cotejados alimentan Ganancias)
- correcciones de revision de codigo (cotejo parcial, mensaje condicional, normalizacion AR)"
```

## 4. Recién cuando esté verde y validado contra la DB real

```powershell
git push origin feature/iva-iibb-mensual-core
```

> No mergear a `main` hasta probar el flujo end-to-end con los CSV reales contra la base.
