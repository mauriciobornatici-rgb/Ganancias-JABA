# Instructivo de carga - Caso Excel/Capturas Ganancias 2025

Fecha: 2026-06-08.

Aplicacion: Ganancias JABA.

Objetivo: cargar un caso numerico completo para verificar que la app reproduce los importes de la planilla/capturas usadas como control del estudio.

## Fuente del caso

Archivo revisado:

`C:\Dev\Ganancia\Persona Fisica\DJ Ganancias 2025 - Tercera Categoría.xlsx`

Observacion importante:

- El archivo fisico ubicado en esa ruta conserva estructura y formulas, pero al abrirlo desde el proyecto aparece como plantilla sin datos operativos: ventas, compras, ESP, JVP e IG 25 estan en cero.
- Para esta prueba se usa el caso numerico de las capturas aportadas el 06/06/2026 y el test interno `src/domain/ganancias/tests/simulacionUsuario.test.ts`.
- No mezclar este caso con la guia PDF anterior ni con la captura de AXI estatico que muestra ajuste `-429.715,06`; ese valor pertenece a otro escenario.

## Regla de carga de importes

En la app, los campos numericos son `type=number`. Para evitar errores:

- Escribir sin separador de miles.
- Usar punto decimal.
- Ejemplo: para `55.188.790,74`, cargar `55188790.74`.
- Las deudas se cargan positivas. La app las resta donde corresponde.
- Los conceptos de JVP se cargan positivos y se indica la columna I o II.

## Resultado esperado del caso

Estos son los controles principales que debe devolver la app.

| Control | Esperado con centavos Excel | Esperado redondeado app |
| --- | ---: | ---: |
| Ventas gravadas | 55.188.790,74 | 55.188.791 |
| Compras imputables a CMV | 55.516.958,16 | 55.516.958 |
| Existencia inicial | 155.496,41 | 155.496 |
| Existencia final | 7.856.322,00 | 7.856.322 |
| Costo de ventas | 47.816.132,57 | 47.816.133 |
| Gastos deducibles no costo | 1.922.775,10 | 1.922.775 |
| Utilidad antes de AXI | 5.449.883,07 | 5.449.883 |
| AXI neto | -225.273,03 | -225.273 |
| Resultado impositivo | 5.224.610,04 | 5.224.610 |
| Patrimonio neto al inicio | -4.520.316,58 | -4.520.317 |
| Patrimonio neto al cierre | -7.150.516,11 | -7.150.516 |
| Consumo por diferencia | 10.031.052,72 | 10.031.053 |
| JVP columna I | 4.229.566,49 | 4.229.566 |
| JVP columna II | 4.229.566,49 | 4.229.566 |
| Diferencia JVP | 0,00 | 0 |

## Paso 0 - Preparar el contribuyente

Antes de entrar al wizard, verificar que exista el cliente.

| Pantalla | Campo | Valor visual | Valor a cargar |
| --- | --- | ---: | --- |
| Clientes | Nombre o razon social | Lobato Francisco | `Lobato Francisco` |
| Clientes | CUIT | 20-34590216-4 | `20-34590216-4` |
| Clientes | Condicion fiscal | Responsable inscripto/autonomo, si se requiere completar | Segun corresponda |

Si el cliente ya existe, no crearlo de nuevo: seleccionarlo desde el Paso 1.

## Paso 1 - Identificacion y saldos iniciales

Entrar por `Nueva Liquidacion` o `Declaraciones > Crear > Wizard`.

### Datos del contribuyente

| Campo en la app | Valor visual | Valor a cargar | Nota |
| --- | ---: | --- | --- |
| Nombre o Razon Social | Lobato Francisco | `Lobato Francisco` | Debe seleccionarse del padron de clientes. |
| CUIT | 20-34590216-4 | `20-34590216-4` | CUIT valido para que no bloquee el paso. |
| Periodo Fiscal | 2024 | `2024` | Las capturas corresponden al cierre 31/12/2024. |
| Resolucion Normativa / Escala Aplicable | La disponible para 2024 | Seleccionar la vigente/historica | Para este caso se controlan resultado y JVP; el impuesto final puede variar si cambian parametros. |

### Perfil impositivo y cargas de familia

Para reproducir el caso de control, dejar todo sin deducciones personales.

| Campo en la app | Valor a cargar |
| --- | --- |
| Conyuge o conviviente a cargo | Desmarcado |
| Jubilado con 8+ Haberes Minimos | Desmarcado |
| Cantidad de Hijos a cargo | `0` |
| Hijos Incapacitados para el Trabajo | `0` |
| Tipo de Deduccion Especial | `Ninguna` |

### Saldos iniciales

Estos saldos tambien pueden sincronizarse luego desde Paso 5 > AXI > `Sugerir desde Contabilidad`. Para una carga didactica, cargarlos ahora y luego verificar que el boton sugiera los mismos importes.

| Campo en la app | Valor visual | Valor a cargar | Fuente de control |
| --- | ---: | ---: | --- |
| Activo Total al Inicio ($) | 1.757.024,05 | `1757024.05` | Disponibilidades + creditos + bienes de cambio al 31/12/2023 |
| Pasivo Total al Inicio ($) | 1.565.731,18 | `1565731.18` | Deudas comerciales/fiscales al 31/12/2023 |
| Bienes No Computables al Inicio ($) | 0,00 | `0` | En este caso todo el activo inicial cargado es computable |

Control mental:

`1.757.024,05 - 1.565.731,18 = 191.292,87`

Ese es el capital afectado inicial que aparece en la captura de patrimonio.

## Paso 2 - Ventas e ingresos comerciales

Para esta simulacion se puede cargar una sola fila manual por el total anual. En una DDJJ real, lo ideal es importar los 12 archivos mensuales de AFIP.

Click en `Anadir Fila Manual`.

| Columna de la grilla | Valor visual | Valor a cargar |
| --- | ---: | --- |
| Fecha | 31/12/2024 | `2024-12-31` |
| Importe Neto ($) | 55.188.790,74 | `55188790.74` |
| Tipo de Ingreso | Gravado | `Gravado (Ganancias)` |

No cargar ventas exentas para este caso.

Control esperado en el panel superior del Paso 2:

| Control | Valor esperado |
| --- | ---: |
| Total Ventas | 55.188.790,74 |
| Gravado | 55.188.790,74 |
| Exento | 0,00 |

## Paso 3 - Gastos comerciales y existencias

En este caso hay tres filas manuales: una integra CMV y dos son gastos deducibles no imputables al costo.

### Compras y gastos

Click en `Anadir Fila Manual` tres veces.

| Fila | Concepto operativo | Fecha | Importe visual | Valor a cargar | Tratamiento | Tipo Gasto |
| ---: | --- | --- | ---: | ---: | --- | --- |
| 1 | Compras de mercaderia/insumos | 31/12/2024 | 55.516.958,16 | `55516958.16` | Deducible en Ganancias | Materia Prima / Insumos |
| 2 | Ingresos Brutos | 31/12/2024 | 1.265.940,70 | `1265940.70` | Deducible en Ganancias | Gastos Generales |
| 3 | Autonomos | 31/12/2024 | 656.834,40 | `656834.40` | Deducible en Ganancias | Gastos Generales |

Nota de criterio para este caso:

- Para reproducir la captura, `Autonomos` se carga en Paso 3 como gasto deducible no costo.
- No volver a cargar `Autonomos` en Paso 5 > Deducciones Generales.
- Si en una DDJJ real se decide tratar autonomos como deduccion general, no duplicarlo como gasto.

### Existencias

En la seccion `Valuacion Impositiva de Bienes de Cambio`, cargar:

| Campo en la app | Valor visual | Valor a cargar |
| --- | ---: | ---: |
| Existencia Inicial (al 01/01/2024) | 155.496,41 | `155496.41` |
| Existencia Final (al 31/12/2024) | 7.856.322,00 | `7856322.00` |

Control esperado de CMV:

`155.496,41 + 55.516.958,16 - 7.856.322,00 = 47.816.132,57`

La app puede mostrarlo redondeado como `47.816.133`.

## Paso 4 - Patrimonio y activos fijos

### Bienes de uso afectados

Para este caso no cargar bienes de uso.

| Seccion | Accion |
| --- | --- |
| Bienes de Uso Afectados | Dejar sin filas |

Control esperado:

| Concepto | Valor |
| --- | ---: |
| Amortizacion bienes de uso | 0,00 |
| Bienes de uso al cierre | 0,00 |

### Disponibilidades y saldos bancarios comerciales

Click en `Anadir Cuenta Bancaria`.

| Campo en la app | Valor visual | Valor a cargar |
| --- | ---: | --- |
| Entidad Financiera | Disponibilidades-Bancos | `Disponibilidades-Bancos` |
| Nro Cuenta | Control total anual | `CONTROL-2024` |
| Moneda | ARS | `ARS` |
| Saldo Inicial | 580.157,00 | `580157.00` |
| Saldo Cierre | 1.416.741,00 | `1416741.00` |
| Intereses ($) | 0,00 | `0` |

### Auxiliares ESP: efectivo, creditos y pasivos

Abrir `Auxiliares ESP: efectivo, creditos y pasivos`.

#### Efectivo comercial

No cargar efectivo comercial en este caso. El efectivo de `795.000,00` es personal y se carga mas abajo como activo personal.

#### Creditos

Click en `Anadir credito` dos veces.

| Fila | Concepto | Tipo | Inicial visual | Inicial a cargar | Cierre visual | Cierre a cargar |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | Creditos comerciales | Comercial | 825.842,83 | `825842.83` | 299.858,95 | `299858.95` |
| 2 | Creditos fiscales | Fiscal | 195.527,81 | `195527.81` | 533.667,49 | `533667.49` |

Nota:

- En esta captura los creditos fiscales integran el capital afectado inicial.
- No cargarlos en la linea no computable de AXI, porque cambiaria el resultado esperado.

#### Pasivos comerciales

Click en `Anadir pasivo`.

| Campo en la app | Valor visual | Valor a cargar |
| --- | ---: | --- |
| Concepto | Deudas comerciales y fiscales | `Deudas comerciales y fiscales` |
| Tipo | Proveedores | `Proveedores` |
| Inicial | 1.565.731,18 | `1565731.18` |
| Cierre | 2.950.866,99 | `2950866.99` |

Recordatorio:

- Aunque la planilla muestre deudas con signo negativo, en la app se cargan positivas.

### Activos y bienes personales

Click en `Anadir Activo / Bien Personal` dos veces.

| Fila | Descripcion | Tipo de Activo | Valor inicial visual | Inicial a cargar | Valor cierre visual | Cierre a cargar |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | Depositos bancarios | Otros Bienes / Creditos Personales | 771.902,84 | `771902.84` | 380.000,00 | `380000.00` |
| 2 | Efectivo | Tenencia de Dinero en Efectivo | 795.000,00 | `795000.00` | 0,00 | `0` |

No cargar inmuebles, automoviles, participaciones societarias ni cuentas particulares en sociedades, porque en esta captura estan en cero o sin importe.

### Pasivos y deudas personales

Click en `Anadir Pasivo / Deuda`.

| Campo en la app | Valor visual | Valor a cargar |
| --- | ---: | --- |
| Descripcion de la Deuda / Acreedor | Deudas personales | `Deudas personales` |
| Saldo Inicial ($) | 6.278.512,29 | `6278512.29` |
| Saldo Cierre ($) | 14.686.238,56 | `14686238.56` |

### Otras justificaciones patrimoniales

Click en `Anadir Justificacion JVP` tres veces.

| Fila | Concepto | Columna JVP | Importe visual | Valor a cargar |
| ---: | --- | --- | ---: | ---: |
| 1 | Intereses prestamo | Columna I - Erogaciones / PN final | 956.882,98 | `956882.98` |
| 2 | Impuesto determinado anio anterior | Columna I - Erogaciones / PN final | 392.146,90 | `392146.90` |
| 3 | Blanqueo | Columna II - Justifica / PN inicial | 3.300.000,00 | `3300000.00` |

No cargar manualmente:

| Concepto de la captura | Motivo |
| --- | --- |
| Monto consumido | Lo calcula la app por diferencia. |
| Patrimonio neto al cierre | Lo calcula la app desde patrimonio comercial + personal. |
| Resultado impositivo | Lo calcula la app en Paso 6. |
| Patrimonio neto al inicio | Lo calcula la app desde saldos iniciales. |
| Ajuste impositivo 225.273,03 | Lo genera la app desde AXI negativo y lo lleva a JVP columna II. |

## Paso 5 - Deducciones, retenciones y AXI

### Subpestana Deducciones y Retenciones

Para este caso dejar deducciones generales en cero.

| Campo | Valor a cargar |
| --- | ---: |
| Aportes Autonomos | `0` |
| Prepagas / Asistencial | `0` |
| Gastos Educativos | `0` |
| Servicio Domestico | `0` |
| Seguro de Vida | `0` |
| Seguro de Retiro | `0` |
| Gastos de Sepelio | `0` |
| Intereses Creditos Hipotecarios | `0` |
| Alquiler Casa Habitacion | `0` |
| Locador / Locatario | `0` |
| Donaciones | `0` |
| Honorarios Medicos | `0` |

Retenciones:

| Seccion | Accion |
| --- | --- |
| Retenciones, Percepciones y Pagos a Cuenta | Dejar sin filas |

Creditos y quebrantos:

| Campo | Valor a cargar |
| --- | ---: |
| Saldo a Favor del Periodo Anterior ($) | `0` |
| Quebrantos de Periodos Anteriores a Compensar ($) | `0` |

### Subpestana Ajuste por Inflacion (AXI)

#### Indices IPC

Cargar estos indices para que la tasa estatica sea la del caso.

| Campo en la app | Valor a cargar |
| --- | ---: |
| Diciembre (Ant.) 2023 | `3533.1955` |
| Enero 2024 | `4261.5324` |
| Febrero 2024 | `4825.7881` |
| Marzo 2024 | `5357.0929` |
| Abril 2024 | `5830.2271` |
| Mayo 2024 | `6073.7165` |
| Junio 2024 | `6351.7145` |
| Julio 2024 | `6607.7479` |
| Agosto 2024 | `6883.4412` |
| Septiembre 2024 | `7122.2421` |
| Octubre 2024 | `7313.9542` |
| Noviembre 2024 | `7491.4314` |
| Diciembre 2024 | `7694.0075` |

Luego hacer click en `Guardar Indices`.

Control esperado:

| Control AXI | Valor esperado |
| --- | ---: |
| Coef. Ajuste IPC | 1,177634 aprox. |

#### Ajuste estatico

Hacer click en `Sugerir desde Contabilidad`.

Verificar que la grilla quede asi:

| Rubro AXI | Total al Inicio | Computable Inicio |
| --- | ---: | ---: |
| Disponibilidades-Bancos | 580.157,00 | 580.157,00 |
| Retenciones de Ganancias | 0,00 | 0,00 |
| Ganancias Anticipos | 0,00 | 0,00 |
| Credito Fiscal (IVA/IIBB) | 0,00 | 0,00 |
| IVA SAF | 0,00 | 0,00 |
| SAF IIBB | 0,00 | 0,00 |
| Impuesto Ley Computable | 0,00 | 0,00 |
| Deudores por Ventas | 1.021.370,64 | 1.021.370,64 |
| Bienes de Cambio | 155.496,41 | 155.496,41 |
| Bienes de Uso | 0,00 | 0,00 |
| Deudas Sociales | 0,00 | 0,00 |
| Deudas Fiscales | 0,00 | 0,00 |
| Deudas Comerciales | 1.565.731,18 | 1.565.731,18 |
| Prestamos | 0,00 | 0,00 |

Controles esperados:

| Control AXI | Valor esperado |
| --- | ---: |
| Activo total inicio | 1.757.024,05 |
| Activo computable inicio | 1.757.024,05 |
| Pasivo total/computable inicio | 1.565.731,18 |
| Capital computable | 191.292,87 |
| Coeficiente | 1,177634 aprox. |
| Ajuste estatico | -225.273,03 |

El boton tambien debe sincronizar los saldos del Paso 1:

| Campo Paso 1 | Valor esperado luego de sugerir |
| --- | ---: |
| Activo Total al Inicio | 1.757.024,05 |
| Pasivo Total al Inicio | 1.565.731,18 |
| Bienes No Computables al Inicio | 0,00 |

#### Ajuste dinamico

Para este caso, dejar la grilla vacia.

| Control | Valor esperado |
| --- | ---: |
| Movimientos AXI dinamico | 0 |
| Ajuste dinamico | 0,00 |

No presionar `Copiar a Variaciones` para este caso. La captura muestra una determinacion de retiro/aporte, pero el ajuste dinamico esperado del caso es `0,00`.

## Paso 6 - Liquidacion y cierre

Revisar la liquidacion antes de cerrar.

### Controles determinativos

| Control en la app | Valor esperado redondeado |
| --- | ---: |
| Ventas gravadas | 55.188.791 |
| Costo de ventas | 47.816.133 |
| Gastos deducibles | 1.922.775 |
| Amortizaciones bienes de uso | 0 |
| AXI | -225.273 |
| Resultado comercial neto | 5.224.610 |
| Resultado impositivo neto | 5.224.610 |

### Controles patrimoniales

| Control en la app | Valor esperado redondeado |
| --- | ---: |
| Patrimonio al Inicio | -4.520.317 |
| Patrimonio al Cierre | -7.150.516 |
| Consumo por diferencia | 10.031.053 |
| JVP Columna I | 4.229.566 |
| JVP Columna II | 4.229.566 |
| Diferencia JVP | 0 |

### Comparacion con captura de JVP

Columna I esperada:

| Concepto | Importe |
| --- | ---: |
| Monto consumido | 10.031.052,72 |
| Impuesto determinado anio anterior | 392.146,90 |
| Patrimonio neto al cierre | -7.150.516,11 |
| Intereses prestamo | 956.882,98 |
| Total columna I | 4.229.566,49 |

Columna II esperada:

| Concepto | Importe |
| --- | ---: |
| Ajuste impositivo | 225.273,03 |
| Blanqueo | 3.300.000,00 |
| Resultado impositivo | 5.224.610,04 |
| Patrimonio neto al inicio | -4.520.316,58 |
| Total columna II | 4.229.566,49 |

## Checklist de errores frecuentes

Antes de concluir la prueba, revisar:

| Error | Consecuencia |
| --- | --- |
| Cargar `Autonomos` en Paso 3 y tambien en Paso 5 | Duplica el gasto y baja indebidamente el resultado. |
| Cargar `Creditos fiscales` como no computables en AXI | Cambia el capital computable y no da `-225.273,03`. |
| Cargar deudas con signo negativo | La app las resta otra vez y altera patrimonio. |
| Presionar `Copiar a Variaciones` en AXI dinamico | Genera un ajuste dinamico no esperado. |
| Cargar `Monto consumido` manualmente en JVP | Duplica un resultado que la app calcula por diferencia. |
| Usar coma decimal en campos numericos | El navegador puede rechazar o truncar el valor. |
| Usar el escenario AXI `-429.715,06` junto con estas capturas | Mezcla dos casos y rompe el cuadre. |

## Cierre operativo

Cuando los controles coincidan:

1. Guardar la declaracion como borrador.
2. Generar `Legajo de Carga (PDF)`.
3. Revisar que el legajo muestre los mismos totales de venta, compras, patrimonio, JVP y AXI.
4. No cerrar/bloquear si la diferencia JVP no esta en cero o si el resultado no coincide con esta guia.
