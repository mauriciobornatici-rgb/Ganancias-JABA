# Piloto IVA AFIP Mayo 2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar un piloto de IVA mensual reproducible: importar los CSV AFIP de compras y ventas, permitir excluir comprobantes, calcular la posicion mensual, cotejarla contra F2002 y guardar una liquidacion cerrada reutilizable por Ganancias.

**Architecture:** El libro mensual sigue siendo paralelo a `TaxReturn`. Los CSV crean o actualizan solamente `FiscalDocument` del `FiscalPeriod`; la seleccion se conserva con `includedInSettlement`. El servidor recalcula siempre desde los comprobantes seleccionados y solo una liquidacion `CLOSED`, completa y cotejada puede generar arrastres o alimentar una futura consolidacion anual.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, MySQL 8 Docker en puerto 3318, Decimal.js, Vitest y Zod.

**Safety rules:** Ejecutar solo en `feature/iva-iibb-mensual-core` y Docker `ganancias_jaba_test` / `ganancias_jaba_test_shadow` de este worktree. No usar `prisma db push`; no tocar `main`, Hostinger, Vercel ni la DB productiva. No subir a Git CSV reales con CUIT, denominaciones o datos comerciales.

---

## Caso AFIP validado

Fuente externa local, no versionada:

- `C:\Users\mauri\Downloads\dudas\comprobantes_compras.csv` - 39 filas.
- `C:\Users\mauri\Downloads\dudas\comprobantes_ventas.csv` - 48 filas.
- `C:\Users\mauri\Downloads\dudas\iva.jpeg` - cotejo F2002 / Portal IVA.

Resultado esperado despues de seleccionar todos los comprobantes y aplicar NC en el lado opuesto:

| Concepto | Importe |
| --- | ---: |
| Debito fiscal | 9.090.888,61 |
| Credito fiscal | 2.630.946,77 |
| Saldo tecnico anterior | 6.078.277,49 |
| Saldo tecnico ARCA | 381.664,35 |
| Libre disponibilidad anterior neta de usos | 167.342,88 |
| Retenciones, percepciones y pagos a cuenta IVA | 34.590,12 |
| Saldo de impuesto a favor de ARCA | 179.731,35 |

Reglas confirmadas por el caso:

- CSV: separador `;`, coma decimal, valores entrecomillados y columnas por alicuota.
- NC compra tipo 3: IVA 14.131,15, se suma al debito fiscal.
- NC venta tipo 3: IVA 191.224,07, se suma al credito fiscal.
- Los arrastres anteriores no vienen de estos CSV: proceden exclusivamente de una liquidacion IVA previa `CLOSED` o de una excepcion auditada.

## Task 1: Recuperar integridad de schema y compilacion

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_fiscal_document_selection/migration.sql`
- Modify: `src/generated/client/*` (generado por Prisma)
- Test: `src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts`

- [ ] **Step 1: Escribir prueba roja de arquitectura para `includedInSettlement`**

La prueba debe exigir el campo con default `true` y confirmar que el schema anual no cambia.

- [ ] **Step 2: Ejecutar la prueba y confirmar rojo**

Run:

```powershell
& $node node_modules\vitest\vitest.mjs run src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts
```

- [ ] **Step 3: Generar migracion solo en Docker 3318 y regenerar Prisma**

La migracion agrega una columna no nula con `DEFAULT true`; no recrea ni migra datos anuales.

- [ ] **Step 4: Aplicar en Docker y verificar types**

Run:

```powershell
$env:JABA_TEST_DB_PORT = '3318'
& $node scripts/run-test-db-command.mjs create-migration add_fiscal_document_selection
& $node scripts/run-test-db-command.mjs migrate
& $node node_modules\typescript\bin\tsc --noEmit
```

- [ ] **Step 5: Commit local**

```powershell
git add prisma src/generated/client src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts
git commit -m "fix: versionar seleccion de comprobantes mensuales"
```

## Task 2: Blindar cierre y arrastres IVA

**Files:**
- Modify: `src/domain/ganancias/persistence/fiscalSettlementPersistence.ts`
- Modify: `src/app/api/clientes/[id]/fiscal-periods/[periodId]/settlement/route.ts`
- Modify: `src/app/api/clientes/[id]/fiscal-periods/[periodId]/settlement/save/route.ts`
- Test: `src/domain/ganancias/tests/fiscalSettlementPersistence.test.ts`
- Test: `src/domain/ganancias/tests/vatSettlement.test.ts`

- [ ] **Step 1: Escribir pruebas rojas de importes AFIP y cierre completo**

Cubrir: normalizacion `9.090.888,61 -> 9090888.61`; un cotejo con referencia sola o con un solo importe no puede quedar `CLOSED`; tres importes coincidentes si; el arrastre ignora `DRAFT` e `IN_REVIEW`.

- [ ] **Step 2: Ejecutar las pruebas y confirmar rojo**

```powershell
& $node node_modules\vitest\vitest.mjs run src/domain/ganancias/tests/fiscalSettlementPersistence.test.ts src/domain/ganancias/tests/vatSettlement.test.ts
```

- [ ] **Step 3: Implementar reglas minimas de cierre**

- Normalizar separadores argentinos en un helper unico y testeado.
- Exigir debito, credito y saldo a pagar oficiales para `CLOSED`.
- Sin cotejo completo: `DRAFT`; con diferencias confirmadas: `IN_REVIEW` mas motivo obligatorio.
- Leer tecnico y libre disponibilidad solo desde la ultima liquidacion `CLOSED` del mes inmediatamente anterior.
- Si no existe mes anterior cerrado y el usuario requiere arrastre, devolver bloqueo o permitir una excepcion auditada explicita.

- [ ] **Step 4: Verificar verde**

```powershell
& $node node_modules\vitest\vitest.mjs run src/domain/ganancias/tests/fiscalSettlementPersistence.test.ts src/domain/ganancias/tests/vatSettlement.test.ts
& $node node_modules\typescript\bin\tsc --noEmit
```

- [ ] **Step 5: Commit local**

```powershell
git add src/domain/ganancias/persistence/fiscalSettlementPersistence.ts src/app/api/clientes/[id]/fiscal-periods/[periodId]/settlement src/domain/ganancias/tests
git commit -m "fix: blindar cotejo y arrastres de iva mensual"
```

## Task 3: Regresion anonimizada AFIP y cierre idempotente

**Files:**
- Create: `src/domain/ganancias/fixtures/ivaMay2026AfipFixture.ts`
- Create: `src/domain/ganancias/tests/ivaMay2026AfipRegression.test.ts`
- Modify: `src/domain/ganancias/persistence/fiscalSettlementPersistence.ts`
- Test: `src/domain/ganancias/tests/fiscalSettlementPersistence.test.ts`

- [ ] **Step 1: Crear prueba roja del caso AFIP mayo 2026**

El fixture conserva tipos de comprobante, importes por alicuota y las dos NC, pero sustituye CUIT, nombres, puntos de venta y numeros reales. Debe producir los siete importes de la tabla de este plan.

- [ ] **Step 2: Ejecutar y confirmar rojo**

```powershell
& $node node_modules\vitest\vitest.mjs run src/domain/ganancias/tests/ivaMay2026AfipRegression.test.ts
```

- [ ] **Step 3: Hacer el guardado idempotente y concurrencia segura**

Usar una transaccion o una clave de solicitud para que doble click/reintento no cree versiones iguales ni devuelva error 500. Una nueva version solo se crea cuando cambia la base o se pide rectificativa con motivo.

- [ ] **Step 4: Verificar el caso y versionado**

```powershell
& $node node_modules\vitest\vitest.mjs run src/domain/ganancias/tests/ivaMay2026AfipRegression.test.ts src/domain/ganancias/tests/fiscalSettlementPersistence.test.ts
```

- [ ] **Step 5: Commit local**

```powershell
git add src/domain/ganancias/fixtures src/domain/ganancias/tests src/domain/ganancias/persistence/fiscalSettlementPersistence.ts
git commit -m "test: fijar regresion iva afip mayo 2026"
```

## Task 4: Probar el flujo HTTP en Docker

**Files:**
- Test: `src/domain/ganancias/tests/fiscalLedgerDockerIntegration.test.ts`
- Modify: `scripts/seed-test-db.mjs` solo si faltan datos ficticios de prueba.
- Modify: `docs/GUIA_PRUEBA_PILOTO_IVA_IIBB.md`

- [ ] **Step 1: Escribir prueba roja de integracion**

Probar en Docker: crear periodo ficticio, importar ventas/compras con formato AFIP, excluir una fila, recalcular, rechazar cotejo incompleto, cerrar cotejo completo y verificar que el registro queda en el cliente/mes correcto.

- [ ] **Step 2: Ejecutar contra Docker 3318 y confirmar rojo**

```powershell
$env:JABA_TEST_DB_PORT = '3318'
& $node scripts/run-test-db-command.mjs validate
```

- [ ] **Step 3: Completar las rutas necesarias sin confiar en montos del navegador**

El endpoint guarda seleccion y recalcula desde DB; la pantalla solo solicita acciones. El cierre guarda referencia AFIP, valores oficiales, diferencias y usuario/auditoria.

- [ ] **Step 4: Verificar verde y smoke local**

```powershell
$env:JABA_TEST_DB_PORT = '3318'
& $node scripts/run-test-db-command.mjs validate
& $node node_modules\typescript\bin\tsc --noEmit
& $node node_modules\next\dist\bin\next build --webpack
```

- [ ] **Step 5: Actualizar guia y commit local**

```powershell
git add src/domain/ganancias/tests scripts docs/GUIA_PRUEBA_PILOTO_IVA_IIBB.md
git commit -m "test: validar flujo iva mensual contra docker"
```

## Task 5: Pantalla IVA y evidencia operativa

**Files:**
- Modify: `src/app/clientes/[id]/periodos-fiscales/[periodId]/liquidacion-iva/VatSettlementWorkspace.tsx`
- Modify: `src/app/clientes/[id]/periodos-fiscales/MonthlyFiscalDashboard.tsx`
- Test: `src/domain/ganancias/tests/monthlyFiscalDashboardState.test.ts`

- [ ] **Step 1: Escribir prueba roja de mensaje y estado**

El dashboard y la pantalla solo deben indicar "disponible para Ganancias" si IVA esta `CLOSED`; `DRAFT` e `IN_REVIEW` deben explicar el bloqueo.

- [ ] **Step 2: Ejecutar prueba roja**

- [ ] **Step 3: Implementar mensajes, controles y estado de carga**

La UI muestra debito, credito, tecnico anterior, tecnico del mes, libre disponibilidad anterior, creditos del mes y saldo final. El boton de cierre se habilita solo con cotejo completo. "Guardar con observacion" exige motivo y nunca habilita Ganancias.

- [ ] **Step 4: Prueba visual manual en Docker**

Ruta: cliente ficticio -> mayo 2026 -> subir CSV -> excluir/restaurar una fila -> calcular -> cotejar -> cerrar. Guardar captura o soporte de la prueba sin incluir los CSV reales en Git.

- [ ] **Step 5: Commit local**

```powershell
git add src/app/clientes src/domain/ganancias/tests/monthlyFiscalDashboardState.test.ts
git commit -m "feat: completar experiencia de cotejo iva mensual"
```

## Task 6: Gate para IIBB y Ganancias

**Files:**
- Modify: `src/domain/ganancias/fiscalLedger/grossIncomeSettlement.ts`
- Create: parametros y rutas IIBB segun plan maestro.
- Modify: `src/domain/ganancias/fiscalLedger/annualConsolidation.ts`
- Create: integracion de snapshot hacia Ganancias segun plan maestro.

- [ ] **Step 1: No habilitar IIBB como funcional hasta tener alicuota versionada, jurisdiccion y prueba real**

- [ ] **Step 2: Implementar IIBB ARBA local y CM general con pruebas Docker**

- [ ] **Step 3: Conectar solo periodos IVA/IIBB cerrados a un snapshot anual inmutable**

- [ ] **Step 4: Ejecutar regresion Excel de Ganancias y prueba piloto completa**

## Gate de integracion a Produccion

No se abre PR ni se integra a `main` hasta completar todos estos puntos:

1. Docker reset, migrate, seed e integracion IVA verdes.
2. Lint, Vitest completo, TypeScript, Prisma validate y build verdes.
3. Caso AFIP mayo 2026 reproducible con fixture anonimizado y cotejo documentado.
4. Prueba manual de pantalla aprobada por el estudio.
5. IIBB no se muestra como cerrado hasta tener parametros reales y sus pruebas.
6. Consolidacion Ganancias conserva regresion Excel y snapshot inmutable.
7. Commit locales revisados; Preview usa DB staging o no recibe `DATABASE_URL` productiva.
8. Backup Hostinger y restauracion Docker verificados antes de cualquier migracion productiva.
