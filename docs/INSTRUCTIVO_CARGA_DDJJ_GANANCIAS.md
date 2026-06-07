# Instructivo de carga - DDJJ Ganancias Personas Humanas

Fecha: 2026-06-06.

Aplicacion: Ganancias JABA.

Objetivo: cargar una declaracion jurada de Ganancias de persona humana con tercera categoria de forma agil, consistente y auditable, evitando duplicaciones y errores de calculo.

## Principios de carga

- Cargar primero datos base y despues ajustes. No empezar por deducciones o AXI si todavia faltan ventas, compras, patrimonio o existencias.
- Cada importe debe cargarse una sola vez. Si una compra integra CMV, no debe volver a cargarse como gasto general.
- La app no hace "magia": sugiere, compila y controla, pero el criterio contable/impositivo lo confirma el usuario.
- Los archivos AFIP de ventas/compras pueden subirse tal como se descargan, mes por mes. No hace falta unirlos manualmente.
- Al finalizar cada bloque, revisar totales de control antes de seguir.
- Antes de cerrar, generar el Legajo de Carga PDF y guardar la DDJJ.

## Orden recomendado

1. Paso 1: contribuyente, periodo fiscal, parametros y saldos iniciales.
2. Paso 2: ventas e ingresos.
3. Paso 3: compras, gastos y existencias.
4. Paso 4: patrimonio comercial/personal, bancos, efectivo, creditos, deudas y bienes de uso.
5. Paso 5: deducciones, retenciones, JVP y Ajuste por Inflacion.
6. Paso 6: liquidacion final, controles y cierre.

## Paso 1 - Contribuyente y saldos iniciales

### Que cargar

- CUIT del contribuyente.
- Nombre o razon social/titular.
- Periodo fiscal.
- Resolucion o set de parametros aplicable.
- Activo total al inicio.
- Pasivo total al inicio.
- Bienes no computables al inicio.
- Saldo a favor del periodo anterior.
- Quebrantos anteriores, si corresponden.

### Criterio

- Los saldos iniciales deben coincidir con el patrimonio de cierre del ejercicio anterior o con el papel de trabajo usado como base.
- Si se va a usar Ajuste Estatico AXI desde contabilidad, cargar primero los datos de Paso 3 y Paso 4 y luego usar Paso 5 > Ajuste por Inflacion (AXI) > Sugerir desde Contabilidad.
- El boton "Sugerir desde Contabilidad" completa la grilla AXI y sincroniza los saldos iniciales de Paso 1.

### Errores frecuentes

- Cargar saldos iniciales manuales y despues volver a usar el sugerido sin revisar diferencias.
- Confundir activo total con activo computable.
- Cargar saldos a favor o anticipos como creditos computables cuando corresponden a bienes no computables.
- Dejar CUIT o periodo fiscal incompletos y calcular igual.

## Paso 2 - Ventas e ingresos

### Carga por archivos AFIP

- Descargar de AFIP los archivos mensuales de ventas.
- Subir los 12 archivos, uno por mes, sin consolidarlos manualmente.
- La app compila internamente los registros.
- Si se sube dos veces el mismo comprobante, la app intenta detectarlo por comprobante, CUIT contraparte, fecha e importe.

### Carga manual

- Usar solo cuando no exista archivo o sea necesario ajustar un registro puntual.
- Cargar fecha, tipo/comprobante, cliente, CUIT contraparte, importe neto, IVA y total si esta disponible.
- Marcar correctamente si la venta es gravada o exenta/no gravada.

### Controles

- Total de ventas gravadas.
- Total de ventas exentas/no gravadas.
- Cantidad de comprobantes importados.
- Duplicados omitidos.
- Meses faltantes.

### Errores frecuentes

- Subir archivos de compras en ventas.
- Subir el mismo mes dos veces y no revisar duplicados omitidos.
- Cargar importes totales con IVA cuando el campo esperado es neto.
- Marcar ventas gravadas como exentas por error.

## Paso 3 - Compras, gastos y existencias

### Carga por archivos AFIP

- Descargar de AFIP los archivos mensuales de compras.
- Subir los 12 archivos tal como se descargan.
- Revisar resumen de archivos procesados, registros incorporados y duplicados omitidos.

### Clasificacion de compras

- MateriaPrima o Mercaderia: integran el CMV.
- GastosGenerales: integran gastos deducibles, no CMV.
- No deducible: no reduce resultado impositivo y puede requerir justificacion patrimonial.
- Exento/no gravado: revisar caso por caso.

### Existencias

- Existencia inicial: valor de bienes de cambio al inicio.
- Existencia final: valor de bienes de cambio al cierre.
- CMV esperado: existencia inicial + compras imputables a costo - existencia final.

### Controles

- Compras imputables a CMV.
- Gastos deducibles no imputables a costo.
- Existencia inicial.
- Existencia final.
- CMV calculado.

### Errores frecuentes

- Cargar toda compra deducible como gasto y tambien usarla para CMV.
- No cargar existencia final, generando un CMV artificialmente alto.
- Cargar compra de bien de uso como gasto o mercaderia.
- Cargar importes con IVA cuando se requiere neto.

## Paso 4 - Patrimonio, bancos, efectivo, creditos, deudas y bienes de uso

### Bienes de uso

- Cargar nombre del bien.
- Tipo: rodado, inmueble, equipamiento u otro.
- Fecha de compra.
- Costo de origen.
- Vida util.
- Años transcurridos o dato equivalente.
- Coeficiente de reexpresion si corresponde.
- Marcar baja si el bien fue vendido, retirado o dejado de afectar.

### Bancos

- Cargar banco, cuenta, moneda, saldo inicial y saldo final.
- Para moneda extranjera, cargar tipo de cambio aplicable.
- Intereses bancarios, si corresponden, deben quedar identificados.

### Efectivo

- Cargar moneda, nominal inicial, nominal final y tipo de cambio de cierre.
- No duplicar efectivo si ya esta incluido dentro de bancos.

### Creditos

- Separar creditos comerciales, fiscales y financieros.
- Creditos comerciales: clientes/deudores por ventas.
- Creditos fiscales genericos pueden integrar capital afectado si asi surge del papel de trabajo.
- Saldos a favor, retenciones o anticipos deben revisarse porque pueden ser bienes no computables para AXI.

### Deudas

- Proveedores y deudas comerciales.
- Deudas fiscales.
- Deudas sociales.
- Prestamos.

### Patrimonio personal

- Inmuebles, automotores, depositos personales, efectivo personal, deudas personales y otros activos/pasivos no comerciales.
- Cargar inicio y cierre para justificar variacion patrimonial.

### Controles

- Patrimonio comercial de inicio.
- Patrimonio comercial de cierre.
- Diferencias entre auxiliares ESP y saldos agregados.
- Bienes de uso dados de baja no deben quedar duplicados como activo de cierre.

### Errores frecuentes

- Cargar un bien de uso como compra/gasto y tambien como activo.
- No marcar baja de un bien vendido.
- Cargar deudas con signo negativo. La app espera importes positivos en la grilla de pasivos.
- Duplicar efectivo entre banco y caja.

## Paso 5 - Deducciones, retenciones, JVP y AXI

### Deducciones generales

- Autonomos.
- Servicio domestico.
- Seguro de vida.
- Seguro de retiro.
- Gastos de sepelio.
- Intereses hipotecarios.
- Gastos educativos.
- Alquiler casa habitacion.
- Donaciones.
- Medicina prepaga.
- Honorarios medicos.

La app aplica topes cuando corresponde. El excedente no admitido puede impactar en JVP.

### Deducciones personales

- Conyuge.
- Hijos.
- Hijos incapacitados.
- Tipo de deduccion especial: Autonomo, Emprendedor, Dependiente o Ninguna.
- Caso jubilado con ocho haberes, si corresponde.

### Retenciones y percepciones

- Importe.
- Impuesto.
- CUIT agente.
- Nombre agente.
- Regimen.
- Fecha.
- Certificado.
- Descripcion de operacion.

### JVP

- Columna I: conceptos que justifican erogaciones o disminuciones patrimoniales.
- Columna II: conceptos que justifican origen de fondos o incrementos patrimoniales.
- Usar presets cuando correspondan.
- Revisar que la diferencia JVP quede en cero o explicada.

### Ajuste por Inflacion - AXI

- Cargar indices IPC.
- En subpestaña AXI, usar "Sugerir desde Contabilidad" despues de cargar existencias, bancos, creditos, deudas y bienes de uso.
- Revisar la grilla de Ajuste Estatico.
- Cargar movimientos de Ajuste Dinamico: retiros, aportes, dividendos u otros.
- Confirmar coeficientes y resultado AXI.

### Errores frecuentes

- Cargar retenciones sin certificado o fecha.
- Cargar deducciones sin revisar topes.
- Usar AXI sugerido antes de cargar patrimonio.
- No revisar si creditos fiscales corresponden como computables o no computables.
- Cargar retiros/aportes dinamicos con fecha incorrecta.

## Paso 6 - Liquidacion y cierre

### Revisar

- Ventas gravadas.
- CMV.
- Gastos deducibles.
- Amortizaciones.
- Baja de bienes de uso.
- AXI.
- Resultado comercial neto.
- Deducciones generales y personales.
- Ganancia neta sujeta a impuesto.
- Impuesto determinado.
- Retenciones.
- Saldo final.
- JVP columna I y II.
- Consumo y diferencia patrimonial.

### Antes de guardar

- Generar el Legajo de Carga PDF.
- Revisar controles y advertencias.
- Guardar como borrador si falta documentacion o revision.
- Cerrar solo cuando los datos esten revisados y el resultado sea consistente.

## Legajo de Carga PDF

El boton "Generar Legajo de Carga (PDF)" sirve para conservar soporte de la informacion cargada.

El legajo incluye:

- Datos del contribuyente.
- Periodo fiscal.
- Fecha de emision.
- Cantidad de ventas, compras y retenciones.
- Saldos iniciales.
- Totales de ventas/compras/existencias.
- Patrimonio, bancos, creditos, deudas y bienes.
- Deducciones, retenciones, JVP y AXI.
- Resultado calculado.
- Advertencias de control.

El legajo no reemplaza:

- Comprobantes AFIP.
- Papeles de trabajo contables.
- Extractos bancarios.
- Inventarios respaldatorios.
- Documentacion de bienes de uso.

## Checklist final de carga

- CUIT y periodo fiscal correctos.
- Parametros fiscales correctos.
- Ventas de los 12 meses importadas o justificadas.
- Compras de los 12 meses importadas o justificadas.
- Duplicados revisados.
- Existencias inicial/final cargadas.
- Bienes de uso cargados y bajas marcadas.
- Bancos, efectivo, creditos y deudas conciliados.
- Patrimonio personal cargado.
- Deducciones generales revisadas contra topes.
- Deducciones personales correctas.
- Retenciones con agente, CUIT, fecha y certificado.
- AXI estatico sugerido/revisado.
- AXI dinamico cargado si corresponde.
- JVP sin diferencia o con explicacion.
- Legajo PDF generado.
- DDJJ guardada.

## Criterio de trabajo recomendado

- Si el resultado no coincide con Excel, no corregir importes "a mano" para forzar el resultado.
- Identificar el rubro que difiere.
- Comparar contra papel de trabajo Excel.
- Corregir clasificacion o carga de origen.
- Generar nuevo legajo PDF.
- Registrar la diferencia y la correccion aplicada.
