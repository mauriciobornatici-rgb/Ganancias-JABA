# Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the audit findings that can cause fiscal data loss, silent save failure, stale overwrites, or unreliable recovery in the Ganancias wizard.

**Architecture:** Keep the high-risk behavior behind small presentation/workflow/persistence helpers with focused Vitest coverage, then wire those helpers into the large wizard/API files. Favor conservative server-side rejection over silent coercion, visible UI warnings over console-only errors, and database transactions with explicit timeout budgets.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, Vitest, browser `localStorage`.

---

## File Structure

- Create `src/domain/ganancias/presentation/wizardServerSync.ts` for user-facing server sync messages.
- Create `src/domain/ganancias/persistence/taxReturnPersistencePolicy.ts` for transaction timing and invalid payload messages.
- Modify `src/domain/ganancias/presentation/wizardDraftRecovery.ts` for clock-skew tolerance, new-draft discovery, local draft parsing, and cleanup helpers.
- Modify `src/domain/ganancias/workflow/taxReturnWorkflow.ts` for stale-write concurrency decisions.
- Modify `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts` for strict invalid number/date rejection and calculation history retention.
- Modify `src/app/api/declaraciones/route.ts` and `src/app/api/declaraciones/[id]/route.ts` to apply transaction options, stale-write checks, and updated timestamps.
- Modify `src/app/declaraciones/crear/wizard/page.tsx` to show server sync errors, recover orphan new drafts, preserve newest local data on create, clean local drafts after final saves, block ambiguous padron failures, and exclude mock fallbacks in production.
- Modify `src/app/page.tsx` to remove local wizard drafts when a declaration/client is annulled/deleted.
- Test `src/domain/ganancias/tests/wizardDraftRecovery.test.ts`, `wizardServerSync.test.ts`, `taxReturnWorkflow.test.ts`, `taxReturnDetailsPersistence.test.ts`, and `taxReturnPersistencePolicy.test.ts`.

## Tasks

### Task 1: Local Recovery Helpers

- [x] Add failing tests for clock-skew-tolerant recovery, discovery of the latest `jaba_wizard_state_new_` draft, safe parsing without `savedAt`, and cleanup key generation.
- [x] Run the focused wizard recovery tests and confirm the new tests fail for missing behavior.
- [x] Implement the helper functions in `wizardDraftRecovery.ts`.
- [x] Re-run the focused wizard recovery tests and confirm they pass.

### Task 2: Visible Server Sync State

- [x] Add failing tests for server sync warning copy and retry labels in `wizardServerSync.test.ts`.
- [x] Implement `wizardServerSync.ts`.
- [x] Wire `page.tsx` so autosave failures set visible state, successes clear it, and manual retry is available without changing fiscal data.
- [x] Re-run the focused server sync and wizard recovery tests.

### Task 3: Transaction Timeout and Stale Write Protection

- [x] Add failing tests for explicit transaction options and stale-write decisions.
- [x] Implement `taxReturnPersistencePolicy.ts` and stale-write helper in `taxReturnWorkflow.ts`.
- [x] Use the transaction options in declaration create/update routes.
- [x] Add `lastKnownUpdatedAt` to wizard save payloads and return refreshed `updatedAt` from successful saves.
- [x] Re-run the focused policy/workflow tests.

### Task 4: Strict Invalid Payload Rejection and Calculation History

- [x] Add failing tests proving invalid numeric/date payloads reject instead of becoming zero/today.
- [x] Update persistence input conversion to throw clear errors for invalid non-empty values and missing required dates.
- [x] Stop deleting previous `calculationRun` records so calculation history remains available.
- [x] Re-run `taxReturnDetailsPersistence.test.ts`.

### Task 5: Wizard/Data-Loss Edge Cases

- [x] Recover latest unsaved new-declaration draft when the user returns to `/declaraciones/crear/wizard`.
- [x] When create succeeds, migrate the newest local `new_<cuit>` draft to the persisted declaration id and remove the orphan key.
- [x] Clean local draft keys after closing a declaration and when dashboard annul/delete operations succeed.
- [x] Show an explicit padron-load error instead of treating an API failure as "contribuyente no registrado".
- [x] Restrict mock fallbacks to non-production builds.

### Task 6: Verification and Release Readiness

- [x] Run focused Vitest suites for the changed helpers and persistence.
- [x] Run the full Vitest suite.
- [x] Run TypeScript typecheck.
- [x] Run Prisma schema validation.
- [x] Run Next production build, including deployment DB safety check.
- [x] Run ESLint.
- [x] Review `git diff` and produce a concise production rollout note.
