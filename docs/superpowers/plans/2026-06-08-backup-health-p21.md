# P21 Backup y Salud Operativa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darle a la app un control operativo basico para saber si la base responde y dejar un procedimiento seguro de backup/restauracion sin tocar produccion accidentalmente.

**Architecture:** Agregar un helper puro testeado para armar el reporte de salud, exponerlo en `/api/health` con una consulta `SELECT 1`, y documentar backup Hostinger + restauracion en Docker. No se agregan migraciones ni escrituras en base.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest, Docker local.

---

### Task 1: Helper de salud operativa

**Files:**
- Create: `src/domain/ganancias/operations/operationalHealth.ts`
- Test: `src/domain/ganancias/tests/operationalHealth.test.ts`

- [x] **Step 1: Write failing tests**

Cubrir:
- reporte OK cuando la DB responde;
- reporte `degraded` cuando falla la DB;
- la URL de base se muestra enmascarada sin usuario/password;
- host y database quedan visibles para diagnostico.

- [x] **Step 2: Run test to verify fail**

Run:

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run src/domain/ganancias/tests/operationalHealth.test.ts
```

- [x] **Step 3: Implement minimal helper**

- [x] **Step 4: Run focused test**

### Task 2: Endpoint `/api/health`

**Files:**
- Create: `src/app/api/health/route.ts`

- [x] **Step 1: Implement endpoint**

El endpoint debe ejecutar una consulta liviana y devolver 200 si todo esta OK, 503 si esta degradado.

- [x] **Step 2: Typecheck/build**

### Task 3: Procedimiento de backup/restauracion

**Files:**
- Create: `docs/BACKUP_RESTAURACION_OPERATIVA.md`
- Modify: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/BACKLOG_PRIORIZADO.md`
- Modify: `docs/REGISTRO_PROYECTO.md`

- [x] **Step 1: Documentar backup Hostinger**

Incluir pasos manuales por hPanel/phpMyAdmin, nombre sugerido de archivo, frecuencia y resguardo.

- [x] **Step 2: Documentar restauracion en Docker**

Incluir restaurar primero en `ganancias_jaba_test`, nunca directo en produccion.

- [x] **Step 3: Registrar avance**

### Task 4: Verificacion y commit

- [x] **Step 1: Run verification**

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run src/domain/ganancias/tests/operationalHealth.test.ts
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\typescript\bin\tsc' --noEmit
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\next\dist\bin\next' build --webpack
```

- [ ] **Step 2: Commit and push branch**
