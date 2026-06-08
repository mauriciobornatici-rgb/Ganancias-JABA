# P20 Workflow Profesional de DDJJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger el ciclo de vida de una DDJJ para que una declaracion cerrada/presentada no se modifique ni se borre por accidente.

**Architecture:** Implementar reglas puras de workflow en dominio, aplicarlas en API y ajustar dashboard para anular en vez de borrar. No se modifican formulas, motor de calculo ni schema en esta unidad.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest.

---

### Task 1: Reglas puras de workflow

**Files:**
- Create: `src/domain/ganancias/workflow/taxReturnWorkflow.ts`
- Test: `src/domain/ganancias/tests/taxReturnWorkflow.test.ts`

- [x] **Step 1: Write the failing test**

Cubrir:
- `Borrador` y `En Revisión` son editables.
- `Cerrada`, `Presentada`, `Rectificada` y `Anulada` son inmutables.
- una DDJJ cerrada solo puede reabrirse con motivo.
- anular requiere motivo y devuelve estado `Anulada`.
- `En_Revision` se normaliza a `En Revisión`.

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run src/domain/ganancias/tests/taxReturnWorkflow.test.ts
```

Expected: FAIL because helper file does not exist.

- [x] **Step 3: Write minimal implementation**

Crear helpers de estado, validacion de update y validacion de anulacion.

- [x] **Step 4: Run test to verify it passes**

Run same focused test. Expected: PASS.

### Task 2: Aplicar reglas en API

**Files:**
- Modify: `src/app/api/declaraciones/[id]/route.ts`
- Test: `src/domain/ganancias/tests/taxReturnWorkflow.test.ts`

- [x] **Step 1: Write/extend failing tests**

Agregar tests puros que expresen las respuestas esperadas de la politica:
- bloquear update normal de una DDJJ `Cerrada`;
- permitir `workflowAction: "reopen"` con motivo;
- permitir `DELETE` tecnico solo como rollback;
- convertir borrado operativo en anulacion.

- [x] **Step 2: Run focused tests to verify fail**

- [x] **Step 3: Implement route policy**

PUT debe bloquear mutaciones sobre estados inmutables salvo reapertura con motivo. DELETE debe anular con motivo; solo rollback tecnico puede hacer delete fisico.

- [x] **Step 4: Run focused tests and typecheck**

### Task 3: Dashboard operativo

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`
- Test: `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`

- [x] **Step 1: Write failing test**

El rollback tecnico debe enviar header `X-JABA-Rollback: true`.

- [x] **Step 2: Run test to verify fail**

- [x] **Step 3: Implement dashboard**

Cambiar textos de borrar por anular, pedir motivo y llamar DELETE con motivo. Ocultar anuladas del listado normal desde API.

- [x] **Step 4: Run focused tests**

### Task 4: Registro y verificacion

**Files:**
- Modify: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/BACKLOG_PRIORIZADO.md`
- Modify: `docs/REGISTRO_PROYECTO.md`

- [x] **Step 1: Run verification**

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run src/domain/ganancias/tests/taxReturnWorkflow.test.ts src/domain/ganancias/tests/taxReturnSaveFlow.test.ts
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\typescript\bin\tsc' --noEmit
```

- [x] **Step 2: Update docs**

Registrar alcance, verificacion y pendientes.

- [ ] **Step 3: Commit and push branch**

Commit en `feature/p20-workflow-ddjj`; no mergear a `main`.
