# PR: Módulo IVA + IIBB + Convenio Multilateral mensual, con integración a Ganancias

`feature/iva-iibb-mensual-core` → `main`

## Qué agrega

Un módulo de liquidación **mensual** de IVA e Ingresos Brutos (incluido Convenio Multilateral), cuyos
datos cotejados alimentan la **liquidación anual de Ganancias** ya existente. Diseño de fuente única:
los comprobantes se cargan una vez por mes y se reutilizan en la anual.

### Circuito IVA mensual
- Importación de comprobantes de AFIP/ARCA (compras y ventas, "Mis Comprobantes", CSV Latin-1).
- Grilla de revisión con selección de filas por comprobante (`includedInSettlement`).
- Importación del archivo de **retenciones y percepciones** (un solo CSV, ret/perc mezcladas; filtra
  IVA 767; valida el mes; tolera el formato re-encomillado por Excel).
- Cálculo Art. 18/24: débito/crédito por alícuota, notas de crédito al lado opuesto (criterio F2002),
  saldo técnico arrastrado, percep/ret aplicadas y excedente como **libre disponibilidad**.
- Cotejo contra AFIP (exige débito, crédito y saldo) → guardado versionado (CLOSED) → reapertura.
- **Validado al peso** contra un F2002 real (débito 9.090.888,61 / crédito 2.630.946,77 / saldo 179.731,35).

### Circuito IIBB + Convenio Multilateral
- Perfil fiscal del cliente (condición IVA + régimen IIBB + Convenio), creable/editable desde la UI.
- Configuración de jurisdicciones con alícuotas y coeficientes unificados CM (validación suma = 1).
- Cálculo por jurisdicción (base × coeficiente × alícuota) → cotejo del saldo → guardado/cierre.

### Integración anual
- Consolidación de los meses cotejados (compuerta: solo CLOSED alimenta la anual).
- Reporte de avance "a hoy" por cliente/año.
- Inyección al wizard de Ganancias ("Importar del módulo mensual"), comprobante por comprobante, con
  imputación inferida (mercadería/gasto/bien de uso) confirmable. NO modifica la matemática de la
  determinación (caso Mariano idéntico: golden/pilot/simulación verdes).

## Cambios de base de datos (5 migraciones, todas ADITIVAS / no destructivas)

- `20260622002033_add_fiscal_monthly_ledger` — tablas del libro fiscal mensual.
- `20260624120000_add_included_in_settlement` — flag selección de comprobantes.
- `20260624130000_add_taxreturn_monthly_import_link` — vínculo anual↔mensual.
- `20260624140000_add_taxcredit_included_in_settlement` — flag selección ret/perc.
- `20260624150000_add_jurisdiction_tax_rate` — alícuota IIBB por jurisdicción.

## Calidad

- 4 gates en verde: `tsc --noEmit`, `eslint .`, `next build`, `vitest` (~290 tests, 5 skipped).
- Sin secretos commiteados; sin restos de debug; sin mojibake.
- Validación end-to-end en base de prueba (Docker).

## Deploy (ver `docs/CHECKLIST_PRE_MERGE_PRODUCCION.md`)

**Orden obligatorio:** backup prod → `prisma migrate deploy` en prod → rotar credenciales
(DB / AUTH_PASSWORD / AUTH_SECRET) → merge a main → smoke test. Las migraciones deben aplicarse ANTES
de que el código nuevo despliegue. Rollback de código seguro (migraciones aditivas).

## Fuera de alcance (fase siguiente)

Alícuota IIBB por actividad, regímenes especiales de CM, vencimientos/acuses de presentación y pago,
refactor de pantallas grandes (wizard).
