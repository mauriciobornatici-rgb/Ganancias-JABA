# Base de Datos Hostinger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar la arquitectura MySQL de Ganancias JABA para Hostinger/Vercel con tablas completas, migracion inicial, conexion segura y persistencia estructurada de la carga fiscal.

**Architecture:** Mantener Prisma como contrato unico de base de datos y separar la configuracion de conexion en un helper testeable. La DDJJ conserva el snapshot de auditoria, pero los datos operativos claves pasan a tablas relacionales para busqueda, reapertura, control de duplicados, importacion AFIP y soporte documental.

**Tech Stack:** Next.js 16, Prisma 7, MySQL/MariaDB Hostinger, Vercel, Vitest, TypeScript.

---

## File Structure

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260607000100_initial_hostinger_mysql/migration.sql`
- Create: `src/domain/ganancias/persistence/databaseConnection.ts`
- Modify: `src/domain/ganancias/prisma.ts`
- Modify: `prisma/seed.ts`
- Modify: `test_db.js`
- Modify: `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`
- Modify: `src/domain/ganancias/persistence/taxReturnReadMapper.ts`
- Modify: `src/app/api/declaraciones/[id]/route.ts`
- Create: `src/domain/ganancias/tests/databaseConnection.test.ts`
- Create: `src/domain/ganancias/tests/databaseSchemaArchitecture.test.ts`
- Modify: `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`
- Modify: `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `docs/ARQUITECTURA_BASE_DATOS_HOSTINGER.md`
- Modify: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/BACKLOG_PRIORIZADO.md`
- Modify: `docs/REGISTRO_PROYECTO.md`

## Task 1: Failing Tests

- [x] Add tests for safe DB URL parsing, masking, missing `DATABASE_URL`, and special characters in Hostinger passwords.
- [x] Add schema architecture tests asserting core tables/columns for invoices, deductions, AXI static rows, import batches/files and attachment blobs.
- [x] Add persistence tests for CUIT de contraparte, bajas de bienes de uso, deducciones estructuradas and AXI static breakdown.
- [x] Run focused Vitest command and confirm RED.

## Task 2: Connection Helper

- [x] Create `buildMariaDbConnectionConfig` using the standard `URL` parser.
- [x] Remove silent local fallback from runtime Prisma client and seed.
- [x] Mask `DATABASE_URL` in test scripts/logging so credentials are not printed.

## Task 3: Schema Architecture

- [x] Add relational columns for `counterpartyCuit` on sales/purchases.
- [x] Add retirement/loss columns on fixed assets.
- [x] Add `GeneralDeduction` and `PersonalDeduction` one-to-one tables.
- [x] Add `ImportBatch` and `ImportFile` for monthly AFIP files.
- [x] Add `AttachmentBlob` with `Bytes @db.LongBlob` for DB-backed support files.
- [x] Add indexes for fiscal navigation, duplicate checks and imports.

## Task 4: Persistence And Reopen

- [x] Persist the new structured fields while keeping `variablesSnapshot` as audit support.
- [x] Reopen DDJJ using relational values first and snapshot fallback for legacy data.
- [x] Keep optional guards so tests and older generated client code do not crash while migrations are being introduced.

## Task 5: Migration And Docs

- [x] Generate initial MySQL migration from the Prisma schema.
- [x] Add `.env.example` without real credentials.
- [x] Document Hostinger names, Vercel variables, remote access choices, migration command, backup and operating rules.

## Task 6: Verification

- [x] Run focused tests for DB/persistence.
- [x] Run full `vitest run`.
- [x] Run `tsc --noEmit`.
- [x] Run `prisma validate`.
- [x] Run `next build --webpack`.
- [x] Run `git diff --check`.
- [ ] Commit and push.

## Hostinger Naming Recommendation

- Database suffix: `ganancias_jaba`
- Full database name shown by Hostinger: `u669600172_ganancias_jaba`
- User suffix: `jaba_app`
- Full user shown by Hostinger: `u669600172_jaba_app`

Use a strong generated password and paste it only into Hostinger/Vercel/local `.env`. Do not commit it.
