# Legajo De Carga PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the wizard print button into a professional printable loading-support report and add a detailed loading instruction guide.

**Architecture:** Keep the browser print flow, but replace the printed content with a dedicated print-only report generated from the wizard state. Extract the report summary model into a pure presentation helper so counts, totals and validation notices can be tested without rendering the full wizard.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind print utilities, Vitest.

---

### Task 1: Report Summary Model

**Files:**
- Create: `src/domain/ganancias/presentation/wizardLoadReport.ts`
- Test: `src/domain/ganancias/tests/wizardLoadReport.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that builds a report summary with one sale, one purchase, one withholding, stock values, AXI values and a warning. Assert title metadata, section count, total rows and checklist warnings.

- [ ] **Step 2: Run the focused test**

Run:

```powershell
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\node_modules\vitest\vitest.mjs run src\domain\ganancias\tests\wizardLoadReport.test.ts
```

Expected: FAIL because `buildWizardLoadReport` does not exist.

- [ ] **Step 3: Implement the helper**

Create a small model with metadata, metrics, sections and validation notices. Totals should use `wizardMoneyToNumber` and simple sums over current wizard arrays.

- [ ] **Step 4: Run the focused test again**

Expected: PASS.

### Task 2: Print-Only Report UI

**Files:**
- Modify: `src/app/declaraciones/crear/wizard/page.tsx`

- [ ] **Step 1: Import `buildWizardLoadReport`**

Build `loadReport` from current wizard state after `calculationResult` is available.

- [ ] **Step 2: Replace button label/action**

Keep `window.print()`, but change the user-facing label to `Generar Legajo de Carga (PDF)`.

- [ ] **Step 3: Add print-only JSX**

Render a white A4-style report with:

- Cover header.
- Control summary.
- Sections for all 6 wizard steps.
- Totals and selected row details.
- Warning/checklist panel.
- Footer/legend.

- [ ] **Step 4: Hide normal UI on print**

Wrap the interactive wizard content with `print:hidden` and show the report with `hidden print:block`.

### Task 3: Loading Instruction Guide

**Files:**
- Create: `docs/INSTRUCTIVO_CARGA_DDJJ_GANANCIAS.md`
- Modify: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/BACKLOG_PRIORIZADO.md`
- Modify: `docs/REGISTRO_PROYECTO.md`

- [ ] **Step 1: Write the guide**

Include order of loading, field-by-field criteria, AFIP monthly files, stocks/CMV, assets, ESP/JVP, AXI, deductions, retentions, final checks and common mistakes.

- [ ] **Step 2: Register the unit**

Add a P14 entry to the continuity docs and project log.

### Task 4: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\node_modules\vitest\vitest.mjs run src\domain\ganancias\tests\wizardLoadReport.test.ts src\domain\ganancias\tests\wizardStateTypes.test.ts
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\node_modules\vitest\vitest.mjs run
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\node_modules\typescript\bin\tsc --noEmit
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\node_modules\next\dist\bin\next build --webpack
```

- [ ] **Step 3: Check diff**

Run:

```powershell
& "C:\Users\mauri\AppData\Local\GitHubDesktop\app-3.5.8\resources\app\git\mingw64\bin\git.exe" -c safe.directory="C:/Dev/Ganancia/Persona Fisica/ganancias-jaba" diff --check
```

Expected: no whitespace errors; CRLF warnings are acceptable.
