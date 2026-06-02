# Mapeo de deducciones generales contra Excel base

Fecha de relevamiento: 2026-06-02.

Archivo fuente:

- `C:\Dev\Ganancia\Persona Fisica\DJ Ganancias 2025 - Tercera Categoría.xlsx`.

## Objetivo

Dejar una tabla rubro por rubro para el frente P5, indicando formula de planilla, equivalente en la app y estado.

## Resumen ejecutivo

- La app cubre los rubros que impactan `IG 25!F20:F31`.
- Las formulas principales ya tienen tests para locador/locatario, prepagas, honorarios medicos y donaciones.
- La principal brecha actual no es de calculo agregado, sino de trazabilidad documental: la hoja `Ded. Gen.` contiene detalle por fecha/comprobante/concepto y la app guarda importes agregados por rubro en `variablesSnapshot`.

## Tabla de equivalencia

| IG 25 | Rubro | Fuente Excel | Formula/tope Excel | Campo app | Estado |
| --- | --- | --- | --- | --- | --- |
| F20 | Autonomos | `Ded. Gen.!F100` | Sin tope si `D20=0`; computa real | `generalDeductions.autonomos` | Igual a Excel agregado |
| F21 | Servicio domestico | `Ded. Gen.!E144` | Tope `IG 25!E41`/MNI | `generalDeductions.servicioDomestico` + `topeServicioDomestico` | Igual a Excel agregado |
| F22 | Seguro de vida | `Ded. Gen.!F31` | Tope fijo `573817.13` o parametro | `generalDeductions.seguroVida` + `topeSeguroVida` | Igual a Excel agregado |
| F23 | Seguro de retiro | `Ded. Gen.!F47` | Tope fijo `573817.13` o parametro | `generalDeductions.seguroRetiro` + `topeSeguroRetiro` | Igual a Excel agregado |
| F24 | Gastos de sepelio | `Ded. Gen.!F55` | Tope fijo `996.23` o parametro | `generalDeductions.gastosSepelio` + `topeGastosSepelio` | Igual a Excel agregado |
| F25 | Intereses hipotecarios | `Ded. Gen.!F127` | Tope fijo `20000` o parametro | `generalDeductions.interesesHipoteca` + `topeInteresHipoteca` | Igual a Excel agregado |
| F26 | Gastos educativos | `Ded. Gen.!F248` | Tope `IG 25!E41 * 0.4` en planilla | `generalDeductions.gastosEducativos` + `topeGastosEducativos` | Igual a Excel agregado; el importador deriva el tope como `MNI * 40%` si no viene explicito |
| F27 | Alquiler casa habitacion | `Ded. Gen.!F208` | `MIN(IG 25!E42, C27*0.4)` | `generalDeductions.alquilerCasaHabitacion`; tope MNI | Igual a Excel agregado |
| F28 | Locador / locatario | `Ded. Gen.!F216` | 10% del monto informado | `generalDeductions.deduccionLocadorLocatario` | Igual a Excel agregado, con test |
| F29 | Cuota medico asistencial | `Ded. Gen.!F23` | Tope 5% con base encadenada `F17 - F20:F28`; si base negativa, 0 | `generalDeductions.medicosAsistencial` | Igual a Excel agregado, con test |
| F30 | Honorarios medicos | `Ded. Gen.!F160` | 40% del comprobante y tope 5% luego de `F20:F28` | `generalDeductions.honorariosMedicos` | Igual a Excel agregado, con test |
| F31 | Donaciones | `Ded. Gen.!F152` | Tope 5% sobre `F17 - F20:F23` | `generalDeductions.donaciones` | Igual a Excel agregado, con test |
| F32 | Total deducciones generales | `SUM(F20:F31)` | Suma deducciones admitidas | `deduccionesGenerales.totalDeduccionesGeneralesAdmitidas` | Igual a Excel agregado |

## Detalle documental en Ded. Gen.

La hoja `Ded. Gen.` conserva detalle por rubro con columnas de fecha, comprobante, numero, concepto y total.

Ejemplos:

- Cuota medico asistencial: `B8:F23`.
- Seguro de vida: `B27:F31`.
- Seguro de retiro: `B43:F47`.
- Gastos de sepelio: `B51:F55`.
- Autonomos: `B99:F103`.
- Intereses hipotecarios: `B123:F127`.
- Servicio domestico: `B131:E144`.
- Donaciones: `B148:F152`.
- Honorarios medicos: `B156:F160`.
- Alquiler casa habitacion: `B204:F208`.
- Locador / locatario: `B212:F216`.
- Gastos educativos: `B244:F248`.

## Brechas y decisiones

### Cubierto ahora

- Calculo de rubros admitidos como importes agregados.
- Calculo de excedentes no admitidos que Excel expone en `IG 25!E32`.
- El excedente se suma a JVP columna I como erogacion no admitida por tope y se muestra en el wizard.
- Preview y papel de trabajo muestran desglose por rubro admitido con referencia `IG 25`.
- Wizard prioriza los rubros frecuentes y deja adicionales colapsados para no sobrecargar la carga.

### Pendiente de decision

- Si el estudio necesita auditoria comprobante por comprobante, conviene crear una tabla hija `GeneralDeductionItem` o conservar un snapshot estructurado por rubro.
- Si se mantiene el enfoque agil, el agregado por rubro es suficiente para liquidar, pero no reemplaza el archivo de respaldo documental.
- Gastos educativos: fuente anual documentada. Excel lo expresa como `MNI * 40%`; la app conserva el campo parametrico `topeGastosEducativos`, pero el importador lo deriva desde MNI cuando el archivo no trae un tope explicito.

## Recomendacion

Mantener por ahora carga agregada por rubro para no ralentizar el flujo. Agregar detalle comprobante por comprobante solo si se define que la app tambien sera repositorio documental de auditoria, no solo motor de liquidacion.
