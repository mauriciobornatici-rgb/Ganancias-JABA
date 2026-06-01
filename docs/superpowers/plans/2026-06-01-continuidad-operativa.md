# Continuidad Operativa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una forma simple y confiable de retomar el proyecto sin recorrer toda la documentacion ni reabrir frentes sin prioridad.

**Architecture:** Se agrega una puerta de entrada corta (`docs/CONTINUAR_AQUI.md`) y un backlog priorizado (`docs/BACKLOG_PRIORIZADO.md`). `docs/REGISTRO_PROYECTO.md` sigue como bitacora historica larga, pero deja de ser el primer archivo para retomar.

**Tech Stack:** Markdown, Git, flujo TDD/verificacion existente del proyecto.

---

### Task 1: Puerta de Entrada de Continuidad

**Files:**
- Create: `docs/CONTINUAR_AQUI.md`
- Modify: `docs/REGISTRO_PROYECTO.md`

- [ ] **Step 1: Crear archivo de retoma rapida**

Contenido esperado:

```markdown
# Continuar Aqui - Ganancias JABA

Ultima actualizacion: 2026-06-01

## Leer primero

1. Revisar estado Git.
2. Leer prioridad activa.
3. Trabajar solo el primer item pendiente salvo instruccion explicita.
4. Registrar avance y commit/push antes de cambiar de frente.
```

- [ ] **Step 2: Agregar enlace al registro largo**

En `docs/REGISTRO_PROYECTO.md`, agregar al inicio:

```markdown
## Para retomar rapido

Leer primero `docs/CONTINUAR_AQUI.md`.
```

- [ ] **Step 3: Verificar**

Run:

```powershell
Get-Content docs\CONTINUAR_AQUI.md -TotalCount 80
```

Expected: el archivo muestra estado actual, prioridad activa y protocolo.

### Task 2: Backlog Priorizado

**Files:**
- Create: `docs/BACKLOG_PRIORIZADO.md`
- Modify: `docs/CONTINUAR_AQUI.md`

- [ ] **Step 1: Crear backlog**

Incluir como minimo:

```markdown
# Backlog Priorizado

## P0 - Continuidad y control
Estado: activo.

## P1 - Reducir riesgo de doble calculo / deuda del wizard
Estado: siguiente.

## P2 - AXI e indices
Estado: pendiente.
```

- [ ] **Step 2: Enlazar desde Continuar Aqui**

Agregar:

```markdown
Backlog completo: `docs/BACKLOG_PRIORIZADO.md`.
```

- [ ] **Step 3: Verificar**

Run:

```powershell
Select-String -Path docs\BACKLOG_PRIORIZADO.md -Pattern 'P0|P1|P2'
```

Expected: aparecen los bloques priorizados.

### Task 3: Registro de la Etapa

**Files:**
- Modify: `docs/REGISTRO_PROYECTO.md`
- Modify: `docs/FASE_1_VALIDACION_EXCEL.md`

- [ ] **Step 1: Registrar cambio**

Agregar una entrada con:

```markdown
### 2026-06-01 - Control operativo de continuidad

Se agrego una puerta de entrada y un backlog priorizado para retomar sin perder contexto.
```

- [ ] **Step 2: Verificar**

Run:

```powershell
Select-String -Path docs\REGISTRO_PROYECTO.md -Pattern 'Control operativo de continuidad'
```

Expected: aparece la entrada nueva.

### Task 4: Commit y Push

**Files:**
- Stage all documentation files from Tasks 1-3.

- [ ] **Step 1: Revisar diff**

Run:

```powershell
git diff --stat
git diff --check
```

Expected: sin errores de whitespace.

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs
git commit -m "Document project continuity workflow"
```

- [ ] **Step 3: Push**

Run:

```powershell
git push origin feature/wizard-optimizado
```

Expected: rama remota actualizada.

## Self-Review

- Spec coverage: cubre bitacora, plan, registro y continuidad de trabajo.
- Placeholder scan: no hay `TBD`, `TODO`, ni pasos sin comando esperado.
- Type consistency: no aplica a codigo; rutas y nombres son consistentes.
