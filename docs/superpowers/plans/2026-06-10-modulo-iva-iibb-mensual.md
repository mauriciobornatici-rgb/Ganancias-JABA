# Plan de diseño — Módulo IVA + IIBB mensual integrado con Ganancias

Fecha: 2026-06-10
Estado: DISEÑO para revisión del usuario (no implementado todavía).

## Decisiones del usuario (2026-06-10)

1. Impuestos: **IVA (nacional) + IIBB Buenos Aires + Convenio Multilateral**.
2. Arquitectura de carga: **fuente única mensual** — los comprobantes se cargan una vez por mes y se reutilizan en Ganancias anual sin recarga.
3. Alcance IVA: **completo** (débito/crédito por alícuota, percepciones/retenciones, saldo técnico y de libre disponibilidad, arrastre mensual).
4. Avance: **diagrama y plan primero**, implementación recién tras aprobación.

## Advertencia normativa (IMPORTANTE)

El buscador web no estuvo disponible al redactar este plan. La MECÁNICA descrita (débito menos crédito, arrastre de saldo técnico, coeficiente unificado de Convenio Multilateral) es estructural y estable. Pero **los parámetros vigentes deben validarse contra normativa actual antes de implementar y antes de liquidar**:

- Alícuotas de IVA aplicables y casos de 2,5% / 5% / 10,5% / 27%.
- Número y vigencia de las RG de Libro IVA Digital y del formulario de DDJJ de IVA (F2002 u otro).
- Alícuotas de IIBB por actividad y jurisdicción (ARBA y demás).
- Reglas y fechas del coeficiente unificado de Convenio Multilateral (CM05) y régimen general vs especiales.
- Vencimientos por terminación de CUIT.

Estos valores se cargan como PARÁMETROS (igual que hoy las escalas de Ganancias), nunca hardcodeados.

## Aclaración conceptual: qué impuesto es de quién

- **IVA**: nacional (ARCA/AFIP). Mensual. Débito fiscal (ventas) menos crédito fiscal (compras).
- **IIBB**: provincial. En Buenos Aires lo administra ARBA. Anticipos mensuales. Base = ingresos gravados, por alícuota de actividad.
- **Convenio Multilateral**: cuando el cliente opera en varias jurisdicciones, reparte la base imponible de IIBB entre provincias según un coeficiente unificado (50% ingresos + 50% gastos del año anterior).
- **Ganancias**: nacional, anual. Para un Responsable Inscripto el IVA es NEUTRO (no es ingreso ni gasto); lo que pasa a Ganancias es el NETO sin IVA. Por eso los mismos comprobantes sirven para ambos.

## Principio de diseño: una sola fuente de comprobantes

Hoy `SalesInvoice`/`PurchaseInvoice` cuelgan de `TaxReturn` (la declaración ANUAL de Ganancias). Para "fuente única mensual" se invierte la relación: los comprobantes pasan a colgar de un **período mensual del cliente**, y tanto la liquidación de IVA del mes como la de Ganancias del año los leen desde ahí.

```
Cliente
  └── MonthlyPeriod (cliente, año, mes)        ← NUEVO, núcleo del módulo
        ├── SalesInvoice[]      (con desglose por alícuota)   ← se mueven aquí
        ├── PurchaseInvoice[]   (con crédito fiscal computable) ← se mueven aquí
        ├── TaxPerceptionWithholding[]  (percep./ret. IVA e IIBB sufridas)  ← NUEVO
        ├── VatReturn           (liquidación IVA del mes)      ← NUEVO
        └── GrossIncomeReturn   (liquidación IIBB/CM del mes)  ← NUEVO

TaxReturn (Ganancias anual)
  └── lee los 12 MonthlyPeriod del cliente/año → consolida netos
```

## Modelo de datos propuesto (Prisma)

### Nuevas entidades

- `MonthlyPeriod`: `id, clientId, year, month (1-12), status (Abierto/LiquidadoIVA/LiquidadoIIBB/Cerrado), notes`. Único por `[clientId, year, month]`.
- `VatReturn` (IVA del mes): débito por alícuota, crédito computable, crédito no computable, percepciones, retenciones, pagos a cuenta, saldo técnico del período, saldo técnico arrastrado del mes anterior, saldo a pagar, saldo de libre disponibilidad, estado.
- `GrossIncomeReturn` (IIBB del mes): por jurisdicción → base imponible asignada, coeficiente CM, alícuota, impuesto determinado, percepciones, retenciones, saldo. Cabecera con total provincia + total general.
- `JurisdictionCoefficient`: coeficiente unificado de CM por cliente/año/jurisdicción (se recalcula anualmente).
- `TaxRateParameter`: alícuotas de IVA e IIBB por concepto/actividad/jurisdicción y vigencia (paramétrico, editable como hoy las escalas de Ganancias).

### Cambios a entidades existentes

- `SalesInvoice` / `PurchaseInvoice`:
  - Reapuntar de `taxReturnId` a `monthlyPeriodId`.
  - Agregar desglose por alícuota: el CSV de ARCA ya trae "Neto Gravado IVA 21%", "Importe IVA 21%", 10,5%, 27%, etc. Guardar líneas de IVA o columnas por alícuota (hoy hay un solo `ivaAmount`). Esto es imprescindible para liquidar IVA correctamente y ya viene en el archivo.
  - Compras: marcar `creditoFiscalComputable` (no todo el IVA de compras es computable).
- `Client`: ya tiene `mainActivity` con jurisdicción ("CABA, Buenos Aires, Convenio Multilateral"). Agregar relación a jurisdicciones donde está inscripto y su número de IIBB.
- `TaxReturn` (Ganancias): deja de tener comprobantes propios; los toma de los `MonthlyPeriod` del año. El motor de Ganancias actual no cambia su lógica, solo cambia de dónde lee la entrada.

## Cálculo IVA mensual

1. Débito fiscal = suma del IVA de ventas, separado por alícuota (21 / 10,5 / 27 / 5 / 2,5).
2. Crédito fiscal = suma del IVA de compras computable (excluye no computable y comprobantes sin discriminar de monotributistas, que para IVA no dan crédito).
3. Posición del mes = débito − crédito.
4. Si débito > crédito: hay impuesto del período. Se le restan percepciones, retenciones y pagos a cuenta de IVA sufridos → saldo a pagar.
5. Si crédito > débito: saldo técnico a favor → se arrastra al mes siguiente (no se pide devolución salvo casos especiales).
6. El excedente de percepciones/retenciones sobre el impuesto es saldo de LIBRE DISPONIBILIDAD (compensable con otros impuestos, transferible).

El arrastre encadena los meses: el saldo técnico de mayo entra como crédito inicial de junio. El módulo debe respetar ese encadenamiento y avisar si se liquida un mes salteado.

## Cálculo IIBB + Convenio Multilateral mensual

1. Base imponible = ingresos gravados del mes (netos, según criterio de cada jurisdicción).
2. Si el cliente es de Convenio Multilateral: la base se reparte entre jurisdicciones aplicando el coeficiente unificado del año (50% por ingresos + 50% por gastos del período base anterior).
3. Por jurisdicción: base asignada × alícuota de la actividad = impuesto.
4. Se restan percepciones y retenciones de IIBB de esa jurisdicción → saldo a pagar o a favor por provincia.
5. Régimen local (sin CM): toda la base va a la única jurisdicción.

## Integración con Ganancias (lo que pediste)

Al armar la DDJJ de Ganancias del año, el sistema ya tiene los 12 `MonthlyPeriod` del cliente cargados. Consolida automáticamente:

- Ventas netas de los 12 meses → ingresos gravados de 3ª categoría.
- Compras/gastos netos de los 12 meses → costo y gastos deducibles.
- Las percepciones/retenciones de GANANCIAS (no las de IVA/IIBB) → pagos a cuenta de Ganancias.
- El IVA en sí no entra (es neutro); solo el IVA de compras NO computable puede sumarse al costo deducible.

Resultado: cero recarga. El contador trabaja todo el año cargando el mes para IVA/IIBB, y Ganancias "se arma sola" con esa base, dejándole solo lo anual (amortizaciones, AXI, deducciones personales, JVP).

## Pantallas / UX (misma filosofía ágil que Ganancias)

- **Tablero mensual por cliente**: grilla de 12 meses × estado (cargado, IVA liquidado, IIBB liquidado, cerrado), con saldos.
- **Wizard mensual** (corto, 3 pasos): 1) cargar/importar comprobantes del mes (reusa el importador CSV ya corregido y multiarchivo), 2) revisar liquidación IVA (débito/crédito/saldo), 3) revisar IIBB/CM por jurisdicción. Cierra el mes.
- **Vista anual → Ganancias**: botón "consolidar año" que arma la base de Ganancias desde los 12 meses.
- Controles de cuadre como en Ganancias: avisos por mes salteado, saldo técnico mal arrastrado, comprobante sin alícuota, jurisdicción sin coeficiente.

## Plan por fases (propuesto)

- **Fase 0** — Parámetros: cargar alícuotas IVA, alícuotas IIBB por jurisdicción y coeficientes CM como parámetros editables. Validar valores vigentes con el contador.
- **Fase 1** — `MonthlyPeriod` + mover comprobantes ahí + desglose por alícuota en la importación (el CSV ya lo trae). Migración de datos existentes.
- **Fase 2** — Liquidación IVA mensual completa con arrastre de saldos. Tests con casos reales.
- **Fase 3** — Liquidación IIBB local (una jurisdicción) y luego Convenio Multilateral con coeficiente.
- **Fase 4** — Consolidación automática a Ganancias (los 12 meses → base anual). El motor de Ganancias no cambia, solo su fuente de entrada.
- **Fase 5** — UX: tablero mensual, wizard mensual, controles de cuadre, exportaciones.

Cada fase cierra con tests, verificación y deploy controlado, igual que P29/P31.

## Riesgos y puntos a confirmar antes de implementar

1. Migración de datos: hoy hay comprobantes colgando de `TaxReturn`. Mover a `MonthlyPeriod` requiere migración cuidadosa (y backup previo).
2. Desglose por alícuota: cambia el modelo de comprobante. Hay que reimportar o migrar los existentes.
3. Convenio Multilateral es la pieza más compleja (coeficientes, régimenes especiales por actividad). Conviene arrancar por IVA + IIBB local y sumar CM al final.
4. Validación normativa de todos los parámetros con el contador.
5. Volumen: 12 meses × comprobantes por cliente × varios clientes. Las grillas ya están paginadas (P31), pero conviene revisar índices de base.
