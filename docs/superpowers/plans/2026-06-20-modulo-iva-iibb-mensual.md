# Modulo IVA + IIBB Mensual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar un libro fiscal mensual seguro para preparar IVA Simple, IIBB local ARBA y Convenio Multilateral regimen general, reutilizable por Ganancias sin modificar DDJJ anuales existentes.

**Architecture:** El nuevo libro fiscal es paralelo a `TaxReturn`: persiste periodos, comprobantes y lineas tributarias mensuales; IVA e IIBB calculan sobre ese libro con snapshots y estados propios. Ganancias consume una consolidacion anual inmutable de los periodos seleccionados, manteniendo intactas las cargas anuales historicas.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, MySQL 8 Docker, MariaDB/Hostinger para produccion futura, Decimal.js, Vitest, Zod.

**Safety rules:** Trabajar solo en `feature/iva-iibb-mensual-core`; usar una base Docker aislada en puerto 3318 para esta rama; no ejecutar `prisma db push`; no tocar Hostinger, Vercel ni `main`; antes de una migracion productiva se requiere backup SQL, Preview validado y aprobacion explicita.

---

## File map

- `docker-compose.yml`: elimina el nombre fijo de contenedor y parametriza el puerto de la base Docker.
- `scripts/testDbConfig.mjs`: centraliza URL/puerto de la base de prueba y rechaza destinos no locales.
- `scripts/run-test-db-command.mjs`: ejecuta Prisma, Vitest y Next contra la URL Docker configurada, incluso al generar migraciones.
- `scripts/seed-test-db.mjs`: siembra perfiles fiscales y parametros de prueba en la base elegida.
- `prisma/schema.prisma`: agrega el libro fiscal mensual, liquidaciones, parametros y snapshots anuales sin reapuntar modelos existentes.
- `prisma/migrations/<timestamp>_add_fiscal_monthly_ledger/migration.sql`: crea las nuevas tablas e indices, sin borrar ni modificar datos anuales.
- `src/domain/ganancias/fiscalLedger/*`: dominio puro de perfiles, documentos, IVA, IIBB, CM y consolidacion Ganancias.
- `src/domain/ganancias/mappers/afipFiscalLedgerImporter.ts`: transforma CSV/XLSX ARCA en borradores de comprobantes con lineas por alicuota.
- `src/domain/ganancias/persistence/fiscalLedgerPersistence.ts`: persiste documentos, evita duplicados y crea snapshots.
- `src/app/api/clientes/[id]/fiscal-profile/route.ts`: perfil fiscal versionado del cliente.
- `src/app/api/clientes/[id]/fiscal-periods/route.ts`: alta/listado de periodos mensuales.
- `src/app/api/fiscal-periods/[id]/*`: importacion, revisiones, liquidaciones y cierre mensual.
- `src/app/api/declaraciones/[id]/monthly-consolidation/route.ts`: previsualiza y confirma la consolidacion anual hacia Ganancias.
- `src/app/clientes/[id]/periodos-fiscales/page.tsx`: tablero de doce meses por cliente.
- `src/app/clientes/[id]/periodos-fiscales/[periodId]/page.tsx`: wizard corto de carga, IVA e IIBB.
- `src/app/declaraciones/[id]/wizard/page.tsx`: agrega la accion de consolidacion mensual sin alterar la carga anual historica.
- `src/domain/ganancias/tests/*`: pruebas de dominio, persistencia Docker, importacion, API y regresion Ganancias.

## Task 1: Aislar Docker por worktree

**Files:**
- Modify: `docker-compose.yml`
- Create: `scripts/testDbConfig.mjs`
- Modify: `scripts/run-test-db-command.mjs`
- Modify: `scripts/seed-test-db.mjs`
- Modify: `.env.docker.example`
- Modify: `docs/BASE_DOCKER_PRUEBAS.md`
- Test: `src/domain/ganancias/tests/testDbConfig.test.ts`

- [x] **Step 0: Preparar dependencias sin modificar lockfiles**

El worktree no comparte automaticamente `node_modules`. Para no reinstalar ni modificar `package-lock.json`, crear una junction local ignorada hacia las dependencias ya verificadas del checkout original:

```powershell
New-Item -ItemType Junction -Path node_modules -Target 'C:\Dev\Ganancia\Persona Fisica\ganancias-jaba\node_modules'
```

Expected: el worktree puede ejecutar Node, Prisma, Next y Vitest; los artefactos `.next` y datos Docker permanecen propios de la rama.

- [x] **Step 1: Escribir el test rojo de URL Docker aislada**

```ts
import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../scripts/testDbConfig.mjs';

describe('resolveTestDatabaseUrl', () => {
  it('usa el puerto elegido para el worktree', () => {
    expect(resolveTestDatabaseUrl({ JABA_TEST_DB_PORT: '3318' }))
      .toBe('mysql://jaba_test:jaba_test_pass@127.0.0.1:3318/ganancias_jaba_test');
  });

  it('rechaza una URL que no sea localhost de pruebas', () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: 'mysql://user:pass@srv1199.hstgr.io/db' }))
      .toThrow('La base de pruebas debe ser local');
  });
});
```

- [x] **Step 2: Ejecutar el test y confirmar rojo**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/testDbConfig.test.ts
```

Expected: falla porque `scripts/testDbConfig.mjs` aun no existe.

- [x] **Step 3: Implementar configuracion aislada**

```js
const DEFAULT_TEST_PORT = '3317';
const DEFAULT_TEST_DATABASE_URL = (port) =>
  `mysql://jaba_test:jaba_test_pass@127.0.0.1:${port}/ganancias_jaba_test`;

export function resolveTestDatabaseUrl(env = process.env) {
  const candidate = env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL(env.JABA_TEST_DB_PORT ?? DEFAULT_TEST_PORT);
  const parsed = new URL(candidate);
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/ganancias_jaba_test') {
    throw new Error('La base de pruebas debe ser local y llamarse ganancias_jaba_test.');
  }
  return candidate;
}
```

- [x] **Step 4: Parametrizar Compose y scripts**

Aplicar estas reglas:

```yaml
services:
  mysql-test:
    image: mysql:8.0
    # No usar container_name: permite coexistencia de worktrees.
    ports:
      - '${JABA_TEST_DB_PORT:-3317}:3306'
```

`run-test-db-command.mjs` y `seed-test-db.mjs` deben importar `resolveTestDatabaseUrl`. Agregar al `commandMap` una entrada `create-migration` que ejecute `prisma migrate dev --create-only --schema prisma/schema.prisma` con `DATABASE_URL` forzada por el helper; el runner debe anexar `process.argv.slice(3)` solamente para ese comando, para recibir el nombre de migracion. Asi ninguna migracion lee la `.env` normal. Para esta rama, todos los comandos Docker se ejecutan anteponiendo:

```powershell
$env:JABA_TEST_DB_PORT = '3318'
```

- [x] **Step 5: Verificar verde y levantar la base exclusiva**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/testDbConfig.test.ts
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:up
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:migrate
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:seed
```

Expected: test verde; Docker crea un contenedor propio de esta rama en `3318`; el contenedor existente de `3317` no se recrea ni se detiene.

- [x] **Step 6: Commit**

```powershell
git add docker-compose.yml scripts/testDbConfig.mjs scripts/run-test-db-command.mjs scripts/seed-test-db.mjs .env.docker.example docs/BASE_DOCKER_PRUEBAS.md src/domain/ganancias/tests/testDbConfig.test.ts
git commit -m "chore: aislar docker de pruebas por worktree"
```

## Task 1A: Shadow database fija para migraciones locales

**Files:**
- Modify: `scripts/testDbConfig.mjs`
- Modify: `scripts/run-test-db-command.mjs`
- Modify: `prisma.config.ts`
- Modify: `docker-compose.yml`
- Create: `docker/mysql-test-init/01-shadow-database.sql`
- Modify: `.env.docker.example`
- Modify: `docs/BASE_DOCKER_PRUEBAS.md`
- Test: `src/domain/ganancias/tests/testDbMigrationSafetyConfig.test.ts`

- [x] **Step 1: Registrar prueba roja para una URL shadow local separada**
- [x] **Step 2: Confirmar que Prisma fallaba al crear una shadow database dinamica por permisos Docker acotados**
- [x] **Step 3: Configurar `ganancias_jaba_test_shadow` con permisos limitados al usuario Docker**
- [x] **Step 4: Regenerar solo el volumen Docker de `3318`, generar la migracion y comprobar ambas bases locales**

Resultado: `prisma migrate dev --create-only` ya no requiere permiso global `CREATE DATABASE`; usa exclusivamente las dos bases locales del worktree.

## Task 2: Perfil fiscal versionado y schema del libro mensual

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_fiscal_monthly_ledger/migration.sql`
- Modify: `src/generated/client/*`
- Modify: `scripts/seed-test-db.mjs`
- Modify: `src/domain/ganancias/tests/excelCaptureCaseDockerPersistence.test.ts`
- Test: `src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts`
- Test: `src/domain/ganancias/tests/fiscalLedgerSeedDocker.test.ts`

- [x] **Step 1: Escribir tests rojos de arquitectura de schema**

```ts
it('conserva SalesInvoice y PurchaseInvoice vinculadas a TaxReturn', () => {
  expect(schema).toContain('taxReturnId   String');
  expect(schema).not.toContain('monthlyPeriodId');
});

it('crea FiscalPeriod unico por cliente, ano y mes', () => {
  expect(schema).toContain('@@unique([clientId, year, month])');
});

it('versiona perfiles, coeficientes y snapshots sin borrar declaraciones anuales', () => {
  expect(schema).toContain('model ClientTaxProfileVersion');
  expect(schema).toContain('model ConventionCoefficientVersion');
  expect(schema).toContain('model AnnualFiscalConsolidationSnapshot');
});
```

- [x] **Step 2: Ejecutar test y confirmar rojo**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts
```

Expected: falla por los modelos aun inexistentes.

- [x] **Step 3: Agregar enums y modelos nuevos sin alterar relaciones existentes**

Crear enums `VatCondition`, `GrossIncomeRegime`, `ConventionRegime`, `FiscalDocumentDirection`, `VatSettlementStatus`, `GrossIncomeSettlementStatus`, `TaxCreditKind` y `GainsAllocationKind`.

Agregar los siguientes modelos y relaciones:

```prisma
model FiscalPeriod {
  id        String   @id @default(uuid())
  clientId  String
  year      Int
  month     Int
  notes     String?  @db.Text
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  documents FiscalDocument[]
  taxCredits TaxCreditRecord[]
  vatSettlements VatSettlement[]
  grossIncomeSettlements GrossIncomeSettlement[]

  @@unique([clientId, year, month])
  @@index([clientId, year])
}

model FiscalDocument {
  id          String @id @default(uuid())
  fiscalPeriodId String
  documentKey String
  direction   FiscalDocumentDirection
  issueDate   DateTime
  voucherType String
  voucherNumber String
  counterpartyCuit String?
  netAmount   Decimal @db.Decimal(18, 2)
  totalAmount Decimal @db.Decimal(18, 2)
  fiscalPeriod FiscalPeriod @relation(fields: [fiscalPeriodId], references: [id], onDelete: Cascade)
  vatLines    FiscalDocumentVatLine[]
  allocation  FiscalDocumentAllocation?

  @@unique([fiscalPeriodId, documentKey])
  @@index([fiscalPeriodId, issueDate])
}
```

Completar el resto de modelos definidos en el diseno: `ClientTaxProfileVersion`, `ClientTaxActivity`, `ClientTaxJurisdiction`, `FiscalDocumentVatLine`, `FiscalDocumentAllocation`, `TaxCreditRecord`, `VatSettlement`, `VatSettlementLine`, `GrossIncomeSettlement`, `GrossIncomeJurisdictionLine`, `ConventionCoefficientVersion`, `ConventionCoefficientLine`, `AnnualFiscalConsolidationSnapshot` y `AnnualFiscalConsolidationPeriod`.

- [x] **Step 4: Crear migracion Prisma y probarla solo en Docker 3318**

Run:

```powershell
$env:JABA_TEST_DB_PORT = '3318'; node scripts/run-test-db-command.mjs create-migration add_fiscal_monthly_ledger
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:migrate
```

Expected: crea solo tablas nuevas; `SalesInvoice`, `PurchaseInvoice`, `TaxReturn` y sus filas existentes permanecen sin cambios destructivos.

- [x] **Step 5: Sembrar dos perfiles de prueba y verificar verde**

Crear un cliente ARBA local y uno CM regimen general, con actividades, jurisdicciones y coeficientes cuya suma sea 1. Ejecutar:

```powershell
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:seed
npm run test -- src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts
npm run prisma:validate
```

Expected: tests verdes y schema valido.

- [x] **Step 6: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations src/generated/client scripts/seed-test-db.mjs src/domain/ganancias/tests/fiscalLedgerSchemaArchitecture.test.ts src/domain/ganancias/tests/fiscalLedgerSeedDocker.test.ts src/domain/ganancias/tests/excelCaptureCaseDockerPersistence.test.ts
git commit -m "feat: agregar libro fiscal mensual base"
```

## Task 3: Importacion mensual con lineas de IVA y duplicados

**Files:**
- Create: `src/domain/ganancias/fiscalLedger/types.ts`
- Create: `src/domain/ganancias/mappers/afipFiscalLedgerImporter.ts`
- Modify: `src/domain/ganancias/mappers/afipImporter.ts`
- Create: `src/domain/ganancias/tests/afipFiscalLedgerImporter.test.ts`
- Create: `src/domain/ganancias/fiscalLedger/documentKey.ts`
- Create: `src/domain/ganancias/tests/documentKey.test.ts`

- [x] **Step 1: Escribir tests rojos de importacion por alicuota**

```ts
it('conserva las bases e IVA de 10,5 y 21 por separado', () => {
  const result = parseAfipFiscalLedgerDocuments(realSalesCsv, { ownerCuit: '20-11111111-1' });
  expect(result.documents[0].vatLines).toEqual([
    expect.objectContaining({ rate: new Decimal('0.105'), taxableBase: new Decimal('1000'), vatAmount: new Decimal('105') }),
    expect.objectContaining({ rate: new Decimal('0.21'), taxableBase: new Decimal('2000'), vatAmount: new Decimal('420') }),
  ]);
});

it('no duplica un comprobante al reimportar el mismo archivo mensual', () => {
  expect(buildFiscalDocumentKey(draft)).toBe(buildFiscalDocumentKey({ ...draft, sourceFileName: 'copia.csv' }));
});
```

- [x] **Step 2: Ejecutar tests y confirmar rojo**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/afipFiscalLedgerImporter.test.ts src/domain/ganancias/tests/documentKey.test.ts
```

Expected: falla porque el importador mensual y la clave deterministica no existen.

- [x] **Step 3: Implementar tipos y adaptador sin romper el importador anual**

El nuevo importador debe reutilizar la lectura robusta de CSV Latin-1, separador `;`, coma decimal y notas de credito de `afipImporter.ts`, pero devolver `FiscalDocumentDraft[]`. No reemplaza `parseAfipExportFiles`, que debe conservar su salida actual para Ganancias existente.

```ts
export type FiscalDocumentDraft = {
  documentKey: string;
  direction: 'SALE' | 'PURCHASE';
  issueDate: Date;
  voucherType: string;
  voucherNumber: string;
  counterpartyCuit?: string;
  netAmount: Decimal;
  totalAmount: Decimal;
  vatLines: Array<{ taxableBase: Decimal; rate: Decimal; vatAmount: Decimal; kind: 'TAXED' | 'EXEMPT' | 'NON_TAXED'; creditComputable: boolean }>;
};
```

- [x] **Step 4: Probar verde y regresion del importador actual**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/afipFiscalLedgerImporter.test.ts src/domain/ganancias/tests/documentKey.test.ts src/domain/ganancias/tests/importer.test.ts
```

Expected: el nuevo importador preserva lineas, y el importador actual sigue aceptando los archivos AFIP existentes sin importes x100.

- [x] **Step 5: Commit**

```powershell
git add src/domain/ganancias/fiscalLedger src/domain/ganancias/mappers/afipFiscalLedgerImporter.ts src/domain/ganancias/mappers/afipImporter.ts src/domain/ganancias/tests/afipFiscalLedgerImporter.test.ts src/domain/ganancias/tests/documentKey.test.ts
git commit -m "feat: importar comprobantes mensuales con iva por alicuota"
```

## Task 4: Perfil fiscal, parametros y API mensual

**Files:**
- Create: `src/domain/ganancias/fiscalLedger/profileValidation.ts`
- Create: `src/domain/ganancias/fiscalLedger/parameterValidation.ts`
- Create: `src/domain/ganancias/tests/profileValidation.test.ts`
- Create: `src/app/api/clientes/[id]/fiscal-profile/route.ts`
- Create: `src/app/api/clientes/[id]/fiscal-periods/route.ts`
- Create: `src/app/api/fiscal-periods/[id]/documents/route.ts`
- Create: `src/app/api/fiscal-periods/[id]/import/route.ts`
- Create: `src/domain/ganancias/persistence/fiscalLedgerPersistence.ts`
- Create: `src/domain/ganancias/tests/fiscalLedgerPersistence.test.ts`

- [ ] **Step 1: Escribir tests rojos de perfil y persistencia**

```ts
it('rechaza CM sin coeficientes aprobados que sumen exactamente uno', () => {
  expect(() => validateClientTaxProfile(cmProfileWithoutCoefficients)).toThrow('coeficientes CM05');
});

it('acepta IIBB local ARBA sin coeficientes CM', () => {
  expect(validateClientTaxProfile(arbaLocalProfile).grossIncomeRegime).toBe('ARBA_LOCAL');
});

it('informa el comprobante duplicado y no vuelve a insertarlo', async () => {
  const first = await persistFiscalDocuments(periodId, [draft]);
  const second = await persistFiscalDocuments(periodId, [draft]);
  expect(first.inserted).toBe(1);
  expect(second.duplicates).toBe(1);
});
```

- [ ] **Step 2: Ejecutar tests y confirmar rojo**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/profileValidation.test.ts src/domain/ganancias/tests/fiscalLedgerPersistence.test.ts
```

Expected: falla por validadores y repositorio inexistentes.

- [ ] **Step 3: Implementar validacion Zod, repositorio y rutas**

Las rutas deben requerir `clientId`, validar mes `1..12`, usar `documentKey` como deduplicacion, registrar `AuditLog` y devolver resumen `inserted/duplicates/rejected`. Las cargas con perfil `CM_SPECIAL` devuelven `422` con el mensaje: `El regimen especial de Convenio Multilateral aun no esta habilitado para calculo automatico.`

- [ ] **Step 4: Probar API y Docker**

```powershell
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:migrate
npm run test -- src/domain/ganancias/tests/profileValidation.test.ts src/domain/ganancias/tests/fiscalLedgerPersistence.test.ts
npm run typecheck
```

Expected: perfil local y CM general persisten; duplicados no se duplican; CM especial queda bloqueado.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/ganancias/fiscalLedger src/domain/ganancias/persistence/fiscalLedgerPersistence.ts src/app/api/clientes/[id]/fiscal-profile src/app/api/clientes/[id]/fiscal-periods src/app/api/fiscal-periods src/domain/ganancias/tests
git commit -m "feat: persistir perfiles y periodos fiscales mensuales"
```

## Task 5: Motor de IVA Simple y conciliacion

**Files:**
- Create: `src/domain/ganancias/fiscalLedger/vatSettlement.ts`
- Create: `src/domain/ganancias/tests/vatSettlement.test.ts`
- Create: `src/app/api/fiscal-periods/[id]/vat-settlements/route.ts`
- Create: `src/app/api/vat-settlements/[id]/route.ts`
- Modify: `src/domain/ganancias/persistence/fiscalLedgerPersistence.ts`

- [ ] **Step 1: Escribir tests rojos del motor IVA**

```ts
it('determina debito por alicuota menos credito computable y arrastre tecnico', () => {
  const result = calculateVatSettlement({
    sales: [vatLine('10000', '0.21', '2100')],
    purchases: [computableVatLine('4000', '0.21', '840')],
    previousTechnicalBalance: new Decimal('300'),
    taxCredits: [],
  });
  expect(result.debitFiscal).toEqual(new Decimal('2100'));
  expect(result.creditFiscal).toEqual(new Decimal('840'));
  expect(result.balanceAfterTechnicalCarry).toEqual(new Decimal('960'));
});

it('separa saldo tecnico de percepciones y retenciones', () => {
  const result = calculateVatSettlement({ ...creditBalanceInput, taxCredits: [vatPerception('1400')] });
  expect(result.technicalCarryForward).toEqual(new Decimal('500'));
  expect(result.freeAvailabilityBalance).toEqual(new Decimal('1400'));
});

it('rechaza cierre si falta el periodo anterior requerido', () => {
  expect(() => assertVatClosure({ year: 2026, month: 5, previousPeriodExists: false })).toThrow('abril 2026');
});
```

- [ ] **Step 2: Ejecutar test y confirmar rojo**

```powershell
npm run test -- src/domain/ganancias/tests/vatSettlement.test.ts
```

Expected: falla por motor inexistente.

- [ ] **Step 3: Implementar motor puro y persistencia de snapshot**

`calculateVatSettlement` recibe lineas ya clasificadas, arrastre tecnico y creditos por tipo. Devuelve importes separados, detalle por alicuota y alertas. El endpoint solo persiste el snapshot de entrada/salida y permite registrar manualmente `officialAmount`, `officialReference`, fecha de presentacion y motivo de diferencia.

- [ ] **Step 4: Probar verde, persistencia y rectificativa**

```powershell
npm run test -- src/domain/ganancias/tests/vatSettlement.test.ts src/domain/ganancias/tests/fiscalLedgerPersistence.test.ts
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:validate
```

Expected: una liquidacion presentada no se pisa; una rectificativa crea version siguiente vinculada a la original.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/ganancias/fiscalLedger/vatSettlement.ts src/domain/ganancias/tests/vatSettlement.test.ts src/domain/ganancias/persistence/fiscalLedgerPersistence.ts src/app/api/fiscal-periods/[id]/vat-settlements src/app/api/vat-settlements
git commit -m "feat: calcular y conciliar iva mensual"
```

## Task 6: Motor IIBB ARBA local y Convenio Multilateral general

**Files:**
- Create: `src/domain/ganancias/fiscalLedger/grossIncomeSettlement.ts`
- Create: `src/domain/ganancias/tests/grossIncomeSettlement.test.ts`
- Create: `src/app/api/fiscal-periods/[id]/gross-income-settlements/route.ts`
- Create: `src/app/api/gross-income-settlements/[id]/route.ts`
- Modify: `src/domain/ganancias/persistence/fiscalLedgerPersistence.ts`

- [ ] **Step 1: Escribir tests rojos de IIBB local y CM**

```ts
it('liquida ARBA local sobre base gravada, alicuota vigente y percepciones', () => {
  const result = calculateGrossIncomeSettlement(localInput({ base: '100000', rate: '0.035', credits: '800' }));
  expect(result.lines).toEqual([expect.objectContaining({ jurisdiction: 'ARBA', determinedTax: new Decimal('3500'), balance: new Decimal('2700') })]);
});

it('distribuye Convenio Multilateral general por coeficientes CM05', () => {
  const result = calculateGrossIncomeSettlement(cmInput({ base: '100000', coefficients: { ARBA: '0.6', CABA: '0.4' } }));
  expect(result.lines.map(line => line.assignedBase)).toEqual([new Decimal('60000'), new Decimal('40000')]);
});

it('bloquea CM especial y coeficientes cuya suma difiere de uno', () => {
  expect(() => calculateGrossIncomeSettlement(cmSpecialInput)).toThrow('regimen especial');
  expect(() => calculateGrossIncomeSettlement(cmInput({ coefficients: { ARBA: '0.7', CABA: '0.4' } }))).toThrow('suman 1');
});
```

- [ ] **Step 2: Ejecutar test y confirmar rojo**

Run:

```powershell
npm run test -- src/domain/ganancias/tests/grossIncomeSettlement.test.ts
```

Expected: falla por motor inexistente.

- [ ] **Step 3: Implementar reglas puras y conciliacion externa**

El motor acepta solo `ARBA_LOCAL` o `CM_REGIMEN_GENERAL`. Usa ingresos marcados como gravados IIBB, alicuota parametrica vigente y creditos de la misma jurisdiccion. Persiste por linea jurisdiccion, actividad, coeficiente, base, impuesto, creditos y saldo. La presentacion oficial registra acuse/importe externo sin enviar datos a ARBA o SIFERE.

- [ ] **Step 4: Probar verde y control de cierre**

```powershell
npm run test -- src/domain/ganancias/tests/grossIncomeSettlement.test.ts
npm run typecheck
```

Expected: ARBA local y CM general son deterministas; CM especial no se puede cerrar automaticamente.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/ganancias/fiscalLedger/grossIncomeSettlement.ts src/domain/ganancias/tests/grossIncomeSettlement.test.ts src/domain/ganancias/persistence/fiscalLedgerPersistence.ts src/app/api/fiscal-periods/[id]/gross-income-settlements src/app/api/gross-income-settlements
git commit -m "feat: liquidar iibb local y convenio general"
```

## Task 7: Consolidacion inmutable hacia Ganancias

**Files:**
- Create: `src/domain/ganancias/fiscalLedger/annualConsolidation.ts`
- Create: `src/domain/ganancias/tests/annualConsolidation.test.ts`
- Modify: `src/domain/ganancias/mappers/calculationInputMapper.ts`
- Modify: `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`
- Create: `src/app/api/declaraciones/[id]/monthly-consolidation/route.ts`
- Modify: `prisma/schema.prisma`
- Test: `src/domain/ganancias/tests/excelCaptureCaseDockerPersistence.test.ts`

- [ ] **Step 1: Escribir tests rojos de consolidacion**

```ts
it('consolida los doce meses sin contar dos veces el mismo documento', () => {
  const result = consolidateAnnualFiscalPeriods(periodsFor2026);
  expect(result.salesNet).toEqual(new Decimal('1200000'));
  expect(result.purchaseInventory).toEqual(new Decimal('300000'));
  expect(result.deductibleExpenses).toEqual(new Decimal('180000'));
});

it('no permite snapshot cuando falta un mes o hay documentos sin clasificar', () => {
  expect(() => consolidateAnnualFiscalPeriods(periodsMissingMay)).toThrow('mayo');
  expect(() => consolidateAnnualFiscalPeriods(periodsWithPendingAllocation)).toThrow('clasificacion');
});

it('mantiene el snapshot anual aunque cambie un periodo despues del cierre', () => {
  const snapshot = createAnnualSnapshot(periodsFor2026);
  const changed = updatePeriodDocument(periodsFor2026, 'junio', '999999');
  expect(snapshot.salesNet).not.toEqual(consolidateAnnualFiscalPeriods(changed).salesNet);
});
```

- [ ] **Step 2: Ejecutar test y confirmar rojo**

```powershell
npm run test -- src/domain/ganancias/tests/annualConsolidation.test.ts
```

Expected: falla por consolidacion inexistente.

- [ ] **Step 3: Implementar snapshot y adaptador de Ganancias**

La ruta de consolidacion debe:

1. validar doce periodos del mismo cliente/ano;
2. exigir IVA/IIBB revisados o excepcion auditada;
3. validar todas las asignaciones Ganancias;
4. crear `AnnualFiscalConsolidationSnapshot` y sus lineas de periodo;
5. devolver un preview para el wizard;
6. no borrar ni sobrescribir `SalesInvoice`/`PurchaseInvoice` historicas.

`calculationInputMapper.ts` debe preferir el snapshot mensual cuando exista y mantener el comportamiento actual para DDJJ anuales historicas sin snapshot.

- [ ] **Step 4: Probar verde y regresion Excel/Docker**

```powershell
npm run test -- src/domain/ganancias/tests/annualConsolidation.test.ts src/domain/ganancias/tests/calculationInputMapper.test.ts
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:validate:excel
```

Expected: el caso Excel existente conserva sus totales; la consolidacion mensual alimenta Ganancias sin duplicar IVA, compras ni pagos a cuenta.

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations src/domain/ganancias/fiscalLedger/annualConsolidation.ts src/domain/ganancias/tests/annualConsolidation.test.ts src/domain/ganancias/mappers/calculationInputMapper.ts src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts src/app/api/declaraciones/[id]/monthly-consolidation
git commit -m "feat: consolidar libro mensual hacia ganancias"
```

## Task 8: Tablero mensual, wizard y soportes profesionales

**Files:**
- Create: `src/app/clientes/[id]/periodos-fiscales/page.tsx`
- Create: `src/app/clientes/[id]/periodos-fiscales/[periodId]/page.tsx`
- Create: `src/app/clientes/[id]/periodos-fiscales/MonthlyFiscalDashboard.tsx`
- Create: `src/app/clientes/[id]/periodos-fiscales/MonthlySettlementPrint.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/declaraciones/[id]/wizard/page.tsx`
- Test: `src/domain/ganancias/tests/monthlyFiscalDashboardState.test.ts`
- Test: `src/domain/ganancias/tests/monthlySettlementPrint.test.ts`

- [~] **Step 1: Escribir tests rojos de estado visual**

```ts
it('marca un mes como pendiente cuando falta IVA, IIBB o conciliacion', () => {
  expect(buildMonthlyDashboardState(periodWithVatOnly)).toMatchObject({ status: 'PendienteIIBB', blocking: true });
});

it('muestra alerta cuando un periodo cerrado tiene diferencia contra el portal', () => {
  expect(buildMonthlyDashboardState(periodWithOfficialDifference).alerts)
    .toContain('La diferencia con la declaracion oficial debe justificarse.');
});
```

- [~] **Step 2: Ejecutar tests y confirmar rojo**

```powershell
npm run test -- src/domain/ganancias/tests/monthlyFiscalDashboardState.test.ts src/domain/ganancias/tests/monthlySettlementPrint.test.ts
```

Expected: falla por helpers y pantallas inexistentes.

- [~] **Step 3: Implementar pantallas sin alterar wizard actual**

El tablero muestra doce meses, estado IVA, estado IIBB, saldo, alertas y acceso al periodo. El wizard mensual tiene tres pasos: importar/revisar documentos, IVA, IIBB. El PDF incluye cliente, periodo, perfil fiscal, detalle por alicuota/jurisdiccion, creditos, conciliacion, parametros, usuario y fecha. La pantalla anual agrega un boton `Previsualizar consolidacion mensual` que no guarda nada hasta confirmacion explicita.

Avance parcial registrado 2026-06-21: se implemento el tablero de doce meses, sus estados puros testeados, el acceso desde Clientes y el alta/listado real de `FiscalPeriod`. El wizard de detalle, PDF y consolidacion anual todavia no se implementaron.

- [ ] **Step 4: Verificar UI local con Docker aislado**

```powershell
$env:JABA_TEST_DB_PORT = '3318'; npm run dev:testdb
```

Expected: permite crear un periodo, importar un archivo de prueba, revisar IVA/IIBB y generar un PDF sin acceder a Hostinger.

- [ ] **Step 5: Commit**

```powershell
git add src/app/clientes src/app/page.tsx src/app/declaraciones/[id]/wizard/page.tsx src/domain/ganancias/tests/monthlyFiscalDashboardState.test.ts src/domain/ganancias/tests/monthlySettlementPrint.test.ts
git commit -m "feat: agregar tablero mensual iva iibb"
```

## Task 9: Prueba piloto, controles y documentacion operativa

**Files:**
- Create: `docs/GUIA_PRUEBA_PILOTO_IVA_IIBB.md`
- Create: `docs/INSTRUCTIVO_CARGA_IVA_IIBB.md`
- Modify: `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`
- Modify: `docs/FLUJO_SEGURO_DEPLOY.md`
- Modify: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/REGISTRO_PROYECTO.md`
- Modify: `docs/BACKLOG_PRIORIZADO.md`

- [ ] **Step 1: Documentar dos casos piloto reproducibles**

Caso A: Responsable Inscripto, IIBB ARBA local, ventas 21%, compras con IVA computable/no computable, percepcion IIBB y arrastre IVA.  
Caso B: Responsable Inscripto, CM regimen general, dos jurisdicciones, coeficientes que suman 1, retencion por jurisdiccion y doce meses consolidados a Ganancias.

- [ ] **Step 2: Ejecutar matriz final de verificacion**

Run:

```powershell
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:reset
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:migrate
$env:JABA_TEST_DB_PORT = '3318'; npm run db:test:seed
npm run lint
npm run test
npm run typecheck
npm run prisma:validate
npm run build
```

Expected: todo verde; ninguna URL, log o artefacto apunta a Hostinger; los dos pilotos dejan evidencia, PDF y snapshot de Ganancias.

- [ ] **Step 3: Publicar Preview y validar sin DB productiva**

Subir la rama a GitHub, comprobar que Vercel Preview no recibe `DATABASE_URL` productiva y validar navegacion/errores. Si se requiere persistencia en Preview, crear una DB staging separada; nunca reutilizar Hostinger produccion.

- [ ] **Step 4: Checklist antes de produccion**

1. Resolver primero el deploy fallido actual de `main`.
2. Revisar Preview y dos casos piloto con el contador.
3. Descargar backup SQL de Hostinger y probar restauracion en Docker.
4. Revisar migracion SQL y ejecutar `prisma migrate deploy` manualmente solo con aprobacion.
5. Integrar a `staging`, validar, integrar a `main` y comprobar post-deploy sin modificar datos existentes.

- [ ] **Step 5: Commit**

```powershell
git add docs
git commit -m "docs: registrar prueba piloto iva iibb"
```

## Plan self-review

- Cobertura: Task 1 aisla Docker; Task 2 crea el modelo no destructivo; Task 3 importa lineas IVA; Task 4 persiste perfiles/periodos; Task 5 liquida IVA; Task 6 liquida ARBA/CM; Task 7 integra Ganancias; Task 8 incorpora UX/PDF; Task 9 verifica y documenta publicacion.
- Consistencia: `FiscalPeriod` es el unico contenedor mensual; `FiscalDocument` usa `documentKey` para deduplicacion; `AnnualFiscalConsolidationSnapshot` es la unica fuente mensual de Ganancias.
- Alcance: los regimenes CM especiales, Monotributo Unificado y presentacion oficial automatica permanecen fuera de la primera entrega y se bloquean explicitamente.
- Seguridad: cada comando de base usa puerto Docker 3318 en esta rama; Hostinger no participa en desarrollo ni pruebas.
