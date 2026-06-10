# P29 - Paridad de calculo con Excel IG 25 (pagos a cuenta, anticipos, quebrantos, deducciones)

Fecha: 2026-06-09
Origen: revision integral app vs `DJ Ganancias 2025 - Tercera Categoría.xlsx` (hojas IG 25, Anticipos, JVP, ER, Bienes de Uso, Ded. Gen.) y `AXI Inflación IMPOSITIVO Comercial 2025.xlsx`.

## Decisiones del usuario (2026-06-09)

1. Criterio ante errores internos del Excel: **criterio legal**, documentando cada divergencia con comentario y test.
2. Alcance: **nucleo critico**. Venta de bienes de uso con precio de venta queda como pendiente en backlog (no entra en este corte).

## Divergencias detectadas (app vs Excel)

| # | Tema | Excel | App (antes de P29) | Resolucion |
|---|------|-------|--------------------|------------|
| 1 | Pagos a cuenta | IG 25 F61:F67: saldo a favor, anticipos cancelados IDCB/efectivo/Mis Facilidades, computo IDCB, combustibles, retenciones. F70: saldo IDCB trasladable no computable | Solo retenciones (todas, incluso `taxCode='Otros'`) + saldo a favor | Implementar los 7 conceptos via `taxCode` extendido + logica F68/F70. Excluir `Otros` del computo |
| 2 | Anticipos proyectados | Anticipos!E24: `(Impuesto proyectado - Retenciones - ITC)/5`, piso $5.000, coef IPC jul->dic (D5=1,142939) | 5 cuotas de 20% del impuesto proyectado, sin restar retenciones, sin piso, coef IPC dic/ene | Replicar Excel/RG 5211: restar retenciones y combustibles, piso $5.000, coef = IPC dic / IPC jul con advertencia si faltan indices |
| 3 | Quebranto del ejercicio | F38 puede ser negativo y G38 marca "Quebranto" (trasladable 5 ejercicios) | Se clampa a 0 y se pierde la informacion | Exponer `quebrantoTrasladable` en el resultado + warning |
| 4 | JVP D14 | Usa F38 (despues de quebrantos) | Usa F34 (antes de quebrantos) | JVP pasa a usar resultado despues de quebrantos (con signo) |
| 5 | Doceava parte (F50) | Si D49=1: `(F41+F42+F43+F44+F49)/12` se adiciona a la deduccion especial de dependientes | No existe | Implementar para `tipoDeduccionEspecial='Dependiente'` |
| 6 | Jubilados 8 haberes | E53 parametrizado en planilla | Montos hardcodeados por anio en el codigo | Nuevo parametro opcional `deduccionEspecificaJubilados` en `TaxParameters`; fallback a los valores actuales con warning |
| 7 | Prepaga D29 | Tope con base `F17-SUM(F20:F23)` pero condicion con F20:F28 (rango inconsistente en el Excel) | Base F20:F28 en condicion y valor | Se mantiene criterio legal (base F20:F28). Divergencia documentada, sin cambio |
| 8 | Honorarios D30 base negativa | Admite C30*0,4 completo | Admite 0 | Se mantiene criterio legal (0). Divergencia documentada, sin cambio |
| 9 | Alquiler D27 | Topa con E42 (conyuge; error de la planilla, deberia ser E41=MNI) | Topa con MNI | Se mantiene criterio legal (MNI). Corregir el Excel cuando se pueda |

## Cambios por archivo

1. `src/domain/ganancias/types.ts`
   - `TaxWithholdingInput.taxCode`: union extendida `'Ganancias' | 'AnticipoEfectivo' | 'AnticipoIDCB' | 'AnticipoMisFacilidades' | 'IDCB' | 'Combustibles' | 'Otros'` (la columna DB ya es String, sin migracion).
   - `TaxParameters.deduccionEspecificaJubilados?: Decimal`.
   - `PersonalDeductionsOutput.deduccionEspecialDoceavaParte`.
   - `TaxCalculationResult`: `anticiposCanceladosEfectivo`, `anticiposCanceladosIdcb`, `anticiposCanceladosMisFacilidades`, `computoIdcb`, `computoCombustibles`, `saldoTrasladableIdcb`, `quebrantoTrasladable`, `impuestoProyectadoAnticipos`.
2. `src/domain/ganancias/calculations/determinacionImpuesto.ts`
   - Pagos a cuenta por categoria de `taxCode`; `Otros` no computa (warning si hay montos en `Otros`).
   - Saldo final replicando F68/F70: IDCB computable hasta el impuesto determinado, excedente IDCB trasladable, resto de creditos generan saldo a favor de libre disponibilidad.
   - Anticipos: coef IPC jul->dic, base F38 actualizada, deducciones y escala proyectadas, `cuota = max(0,(impuestoProyectado - retenciones - combustibles)/5)`, piso $5.000 con leyenda en warnings.
   - `quebrantoTrasladable` cuando F34 - quebrantos anteriores < 0.
   - JVP con resultado despues de quebrantos.
   - Doceava parte dependientes.
   - Jubilados: parametro con fallback.
3. `src/domain/ganancias/mappers/calculationInputMapper.ts`: normalizacion de `taxCode` extendida.
4. `src/app/declaraciones/crear/wizard/page.tsx`: opciones nuevas en el selector de tipo de credito (Paso 5).
5. Tests nuevos: `pagosACuenta.test.ts` (conceptos F61:F67, F68 ambas ramas, F70), `anticiposProyectados.test.ts` (formula RG 5211, piso, coef jul->dic), `quebrantosYDeduccionesPersonales.test.ts` (quebranto trasladable, doceava parte, jubilados parametrizable). `taxReturnPreview.test.ts` actualizado al nuevo comportamiento de anticipos.
6. `src/app/declaraciones/[id]/informe-cliente/page.tsx` y `papel-de-trabajo/page.tsx`: la deduccion especial mostrada incluye la doceava parte.
7. `taxReturnDetailsPersistence.ts`: `quebrantosApplied` real y `totalPaymentsOnAccount` con todos los conceptos F62:F67 netos del F70.

## Resultado de verificacion (2026-06-09, sandbox Linux)

- 38 archivos de test de dominio, 147 tests OK (16 nuevos de P29; golden sin regresion).
- Suites no ejecutables en sandbox por entorno (correr en Windows): excelOracle, importer, parameterImporter, databaseSchemaArchitecture, excelCaptureCaseDockerPersistence, deploymentDbSafety.
- Pendiente Windows: `vitest run` completo, `tsc --noEmit`, `prisma validate`, `next build --webpack`, commits separados P21/P29.

## Criterio de cierre

- Todos los conceptos F61:F67 y F70 calculados y expuestos en el resultado.
- Anticipos = (impuesto proyectado - retenciones - ITC)/5 con piso $5.000.
- Quebranto del ejercicio visible y persistible via snapshot existente.
- Doceava parte aplicada solo a dependientes.
- `vitest run` completo en verde en maquina Windows del usuario (el sandbox Linux no puede ejecutar node_modules win32).
- Registro en `docs/REGISTRO_PROYECTO.md` y backlog actualizado.

## Pendientes que abre este frente (van al backlog)

- P30: venta de bienes de uso con precio de venta (resultado por venta, requiere schema).
- Corregir en la planilla Excel D27 (E42 -> E41) y unificar rangos de D29.
- Unificar convencion de redondeo (peso entero vs centavos) entre app y Excel.
