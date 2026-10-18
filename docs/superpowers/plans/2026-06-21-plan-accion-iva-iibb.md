# Plan de acción — Completar módulo IVA + IIBB mensual

Fecha: 2026-06-21
Estado: PLAN para ejecutar. Combina dos devoluciones externas (Ganancias y módulo IVA+IIBB) con los hallazgos de la sesión del 2026-06-10.
Código del módulo: worktree `C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual`, rama `feature/iva-iibb-mensual-core` (commit base `da13c5e`). NO está en el working tree principal de Ganancias.

## 1. Estado real del módulo (consolidado de ambas devoluciones)

Construido y sano (compila, tipa, pasa lint; 213 tests / 5 skip en la rama del módulo):

- Modelo de datos Prisma completo y versionado: `FiscalPeriod`, `FiscalDocument` + `FiscalDocumentVatLine` (desglose por alícuota) + `FiscalDocumentAllocation`, `TaxCreditRecord`, `VatSettlement`, `GrossIncomeSettlement`, `ClientTaxProfileVersion`, coeficiente CM versionado, `AnnualFiscalConsolidationSnapshot/Period`.
- Decisión arquitectónica ACERTADA: libro mensual desacoplado; NO se migraron los comprobantes de Ganancias. Cero riesgo para el motor anual (sus tests siguen verdes), aditivo y reversible.
- Importador AFIP mensual con IVA por alícuota, persistencia idempotente (documentKey + @@unique), API de alta de período con zod/audit, dashboard mensual de estados. Docker aislado por worktree (puerto 3318).

Falta para el recorrido completo (crear período -> importar -> ver IVA e IIBB -> consolidar):

- Motor IVA: existe (`vatSettlement.ts`) y la fórmula es correcta, pero tiene 1 solo test. Es la pieza de mayor riesgo fiscal con la menor cobertura.
- Motor IIBB: NO existe (`grossIncomeSettlement.ts` ausente). Modelo + UI con datos vacíos.
- Endpoint de importación por período: no conectado (el importador de dominio existe, falta la ruta HTTP).
- Consolidación a Ganancias: modelada (tablas) pero sin el mapper que arme la entrada de Ganancias desde los 12 períodos.
- Pantallas de liquidación IVA/IIBB: no existen.

## 2. Principio rector (la lección que cruza todo el proyecto)

El 2026-06-10 comprobamos que el sistema pasaba 194 tests verdes y aun así multiplicaba por 100 los importes de los CSV reales de AFIP (los tests usaban .xlsx sintéticos, no CSV con coma decimal). Hoy el motor IVA tiene 1 test.

Conclusión que gobierna este plan: **"verde" no es "correcto".** Cada motor fiscal se cierra con DOS condiciones, no una:

1. Batería de tests de casos límite (no romper / regresión).
2. Un caso REAL contrastado al peso contra una liquidación oficial (IVA F2002, IIBB ARBA). El caso real es el único que prueba que el número que se presenta es el correcto.

Sin la condición 2, ningún motor se declara "listo para producción".

## 3. Fases priorizadas

Orden eficiente (del análisis del módulo) + capa de validación fiscal (de la devolución de Ganancias). Cada fase: TDD primero, luego implementación, luego caso real, luego verificación y deploy controlado.

### Fase 1 — Blindar el motor IVA  [CRÍTICA]

Batería de tests que hoy faltan en `vatSettlement.test.ts`:
- crédito > débito -> `technicalCarryForward` > 0, `amountDue` = 0 (arrastre al mes siguiente).
- débito > crédito -> `amountDue` correcto.
- `previousTechnicalBalance` impactando a favor (reduce a pagar) y en contra.
- compras no computables excluidas del crédito.
- múltiples alícuotas (21/10,5/27/5/2,5) sumadas en el débito.
- `freeAvailabilityBalance` cuando percepciones/retenciones exceden el impuesto.
- encadenamiento: saldo técnico de un mes entra como inicial del siguiente; aviso si se liquida un mes salteado.

Caso real de control: tomar una DDJJ de IVA real (F2002) de un mes de un cliente, cargarla y verificar débito, crédito, saldo a pagar y arrastre al peso.

Cierre: motor IVA con cobertura de casos límite + 1 caso real validado.

### Fase 2 — Motor IIBB  [CRÍTICA]

- `grossIncomeSettlement.ts`, régimen LOCAL primero: base imponible × alícuota por jurisdicción/actividad, restar percepciones/retenciones de IIBB -> saldo por jurisdicción.
- Luego Convenio Multilateral: aplicar el coeficiente unificado (ya validado suma=1) para repartir la base entre jurisdicciones.
- Tests de casos + caso real de IIBB de una jurisdicción contra liquidación real.

Cierre: IIBB local con tests + caso real; CM como segundo corte de la fase.

### Fase 3 — Endpoint de importación por período  [ALTA]

- `POST /api/clientes/[id]/fiscal-periods/[periodId]/documents` usando `persistFiscalDocuments`; devuelve `inserted`/`duplicates`.
- Heurística de `creditComputable` en importación: factura C / monotributo -> no computable; bienes de uso -> marcar para revisión. Hoy asume todo computable.
- Warning de cuadre por fila cuando `|total - (neto + iva)| > epsilon`.

### Fase 4 — Consolidación a Ganancias  [ALTA]

- Mapper que lee los 12 `FiscalPeriod` y arma `AnnualFiscalConsolidationSnapshot` -> entrada de Ganancias.
- Fidelidad fiscal: IVA neutro; IVA de compras NO computable -> costo deducible; percepciones/retenciones de GANANCIAS (no de IVA/IIBB) -> pagos a cuenta de Ganancias.
- `sourceHash` para detectar si un período cambió y reconsolidar.
- El motor de Ganancias NO se toca: solo cambia de dónde lee la entrada.
- Requiere resolver el flujo de `FiscalDocumentAllocation.needsReview` (confirmación de imputación) antes de consolidar en automático.

### Fase 5 — Pantallas de liquidación IVA/IIBB  [MEDIA]

- Wizard mensual corto: cargar/importar -> ver IVA (débito/crédito/saldo) -> ver IIBB por jurisdicción -> cerrar mes.
- Flujo de confirmación de allocations (needsReview -> consolidable).
- Comparación contra lo declarado en ARCA (`officialAmount`/`officialReference`).

### Transversal (aplicar dentro de las fases)

- BLOQUEAR el cierre/liquidación si faltan parámetros normativos vigentes (alícuotas IVA, alícuotas IIBB por jurisdicción, coeficiente CM), no solo advertir. (Toma la recomendación #3 de la devolución de Ganancias y la aplica al módulo.)
- Validar con el contador, ANTES de cualquier piloto real, los parámetros: alícuotas IVA y casos 2,5/5/10,5/27, alícuotas IIBB por actividad, reglas CM05, vencimientos, RG vigentes (Libro IVA Digital / F2002).
- `createMany` en persistencia para lotes grandes (rendimiento).

## 4. Tabla de prioridades consolidada

| # | Prioridad | Acción | Origen |
|---|-----------|--------|--------|
| 1 | Crítica | Batería de tests del motor IVA (arrastre, libre disponibilidad, no computables, multi-alícuota) + caso real F2002 | Dev IVA #1 + principio rector |
| 2 | Crítica | Implementar motor IIBB local con tests + caso real; CM como 2º corte | Dev IVA #2 |
| 3 | Alta | Endpoint de importación por período (inserted/duplicates) | Dev IVA #3 |
| 4 | Alta | Mapper de consolidación anual a Ganancias (IVA no computable al costo) | Dev IVA #4 + Plan 2026-06-10 |
| 5 | Alta | Bloquear cierre si faltan parámetros normativos (no solo warning) | Dev Ganancias #3 |
| 6 | Media | Pantalla de liquidación IVA/IIBB + flujo de allocations needsReview | Dev IVA #5 |
| 7 | Media | Warning de cuadre en importador (total ≠ neto+iva) | Dev IVA #6 |
| 8 | Media | Heurística creditComputable (factura C/monotributo) | Dev IVA #7 |
| 9 | Baja | createMany en persistencia | Dev IVA #8 |
| 10 | Baja | Validación normativa de parámetros con el contador antes del piloto | Dev IVA #9 + Plan original |

## 5. Precondiciones operativas (antes de retomar el módulo)

Pendientes de la sesión del 2026-06-10 que deben cerrarse primero, porque afectan producción:
- Rotar `AUTH_PASSWORD`, `AUTH_SECRET` y la password de la base (estuvieron expuestos).
- Confirmar que no quedaron datos x100 en producción de pruebas de importación.
- Restringir `DATABASE_URL` a Production en Vercel.

## 6. Criterios de cierre globales

- Cada motor fiscal: tests de casos límite EN VERDE + 1 caso real contrastado al peso.
- Recorrido completo funcionando de punta a punta: crear período -> importar CSV -> ver IVA e IIBB calculados -> consolidar -> alimentar Ganancias.
- `vitest run` + `tsc --noEmit` + `eslint` + `next build` en verde; deploy por fases, sin tocar el motor de Ganancias ni los comprobantes existentes.

## 7. Lo que NO se toca

- El motor de Ganancias (`determinacionImpuesto.ts`) y sus tests.
- Los `SalesInvoice`/`PurchaseInvoice` colgados de `TaxReturn` (no migrar).
- La rama `main` hasta que cada fase esté validada en la rama del módulo.
