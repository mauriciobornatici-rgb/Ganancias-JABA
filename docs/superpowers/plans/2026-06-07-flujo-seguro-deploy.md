# Flujo Seguro de Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger la base productiva de Hostinger y ordenar el flujo GitHub + Vercel para probar antes de publicar.

**Architecture:** La proteccion vive en un script Node independiente que corre como `prebuild` y decide segun variables de Vercel si un deploy puede continuar. CI valida tests, tipos, Prisma y build sobre `main` y `staging`; la documentacion define el flujo operativo y backups.

**Tech Stack:** Next.js 16, Node.js, Vitest, Prisma, GitHub Actions, Vercel, Hostinger MySQL.

---

### Task 1: Guarda de DB por entorno

**Files:**
- Create: `scripts/check-deployment-db-safety.mjs`
- Test: `src/domain/ganancias/tests/deploymentDbSafety.test.ts`

- [x] **Step 1: Write the failing test**

Cubrir local, production sin `DATABASE_URL`, production desde `main`, preview sin DB, preview con DB productiva, preview con DB staging y excepcion explicita.

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/domain/ganancias/tests/deploymentDbSafety.test.ts
```

Expected: FAIL porque `scripts/check-deployment-db-safety.mjs` no existe.

- [x] **Step 3: Write minimal implementation**

Crear `evaluateDeploymentDatabaseSafety(env)` y CLI con salida sin secretos.

- [x] **Step 4: Run test to verify it passes**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/domain/ganancias/tests/deploymentDbSafety.test.ts
```

Expected: PASS.

### Task 2: Scripts y CI

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Add npm scripts**

Agregar `prebuild`, `test`, `typecheck`, `prisma:validate` y `verify`.

- [x] **Step 2: Add GitHub Actions**

Ejecutar `npm ci`, tests, typecheck, Prisma validate y build en pushes/PRs de `main` y `staging`.

### Task 3: Documentacion operativa

**Files:**
- Create: `docs/FLUJO_SEGURO_DEPLOY.md`
- Modify: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/BACKLOG_PRIORIZADO.md`
- Modify: `docs/REGISTRO_PROYECTO.md`
- Modify: `docs/ARQUITECTURA_BASE_DATOS_HOSTINGER.md`
- Modify: `.env.example`

- [x] **Step 1: Document environments**

Definir `main` como produccion, `staging` como prueba y Preview sin DB productiva.

- [x] **Step 2: Document backup/migration rules**

Registrar backup SQL antes de migraciones productivas y prohibir `prisma db push` en produccion.

### Task 4: Branching

**Files:**
- Git remote state

- [x] **Step 1: Create staging branch**

Run:

```powershell
git branch staging
git push -u origin staging
```

Expected: `origin/staging` creado desde el estado verificado de `main`.

### Task 5: Verification and commit

**Files:**
- All changed files

- [x] **Step 1: Run verification**

Run tests, typecheck, Prisma validate, build and `git diff --check`.

- [x] **Step 2: Commit and push**

Commit:

```powershell
git commit -m "chore: proteger deploys y staging"
git push origin main
```
