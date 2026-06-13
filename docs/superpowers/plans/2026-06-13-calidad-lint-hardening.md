# Calidad Lint Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la aplicacion sin errores de lint y con verificaciones completas, sin modificar calculos fiscales ni datos productivos.

**Architecture:** La limpieza se hace en capas: primero diagnostico reproducible, despues errores mecanicos, luego hooks/tipos en pantallas y APIs, y por ultimo verificacion completa. No se cambian reglas de negocio salvo que una correccion de calidad revele un bug concreto.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma, Vitest, ESLint.

---

### Task 1: Diagnostico y alcance

**Files:**
- Read: `eslint.config.mjs`
- Read: `package.json`
- Read: salida de `eslint --format json`

- [x] **Step 1: Confirmar rama y estado**

Run: `git status --short --branch`
Expected: rama de trabajo identificada y sin cambios no revisados.

- [x] **Step 2: Agrupar errores por regla**

Run: `eslint --format json`
Expected: identificar reglas dominantes antes de tocar codigo.

### Task 2: Correcciones mecanicas seguras

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `test_db.js`
- Modify: componentes con imports/variables no usadas

- [x] **Step 1: Eliminar o utilizar variables no usadas**

Expected: bajar errores/warnings sin alterar comportamiento.

- [x] **Step 2: Resolver imports CommonJS no permitidos**

Expected: convertir `test_db.js` a ESM o excluirlo si es script obsoleto.

### Task 3: Hooks React y pantalla principal

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/declaraciones/crear/wizard/page.tsx`

- [x] **Step 1: Corregir funciones usadas antes de declararse**

Expected: `loadResolutions` y funciones relacionadas quedan estables antes de usarse.

- [x] **Step 2: Resolver efectos con setState sincronico cuando aplique**

Expected: eliminar errores de `react-hooks/set-state-in-effect` sin cambiar la navegacion actual.

### Task 4: Tipado seguro

**Files:**
- Modify: `src/app/api/**/*.ts`
- Modify: `src/app/declaraciones/**/*.tsx`
- Modify: archivos de dominio afectados por `no-explicit-any`

- [x] **Step 1: Reemplazar `any` por tipos locales o `unknown` controlado**

Expected: mantener compatibilidad con payloads JSON y Prisma sin degradar seguridad de tipos.

- [x] **Step 2: Validar que los casts queden encapsulados**

Expected: los accesos dinamicos quedan en helpers pequeños y revisables.

### Task 5: Verificacion

**Files:**
- No code changes expected.

- [x] **Step 1: Ejecutar lint**

Run: `eslint`
Expected: exit 0.

- [x] **Step 2: Ejecutar tests**

Run: `vitest run`
Expected: suite completa OK.

- [x] **Step 3: Ejecutar TypeScript y Prisma**

Run: `tsc --noEmit` y `prisma validate --schema prisma/schema.prisma`
Expected: ambos exit 0.

- [x] **Step 4: Ejecutar build**

Run: `next build --webpack`
Expected: build OK.

- [x] **Step 5: Ejecutar smoke DB solo lectura**

Run: `SELECT 1 AS ok`
Expected: conexion OK sin modificar datos.
