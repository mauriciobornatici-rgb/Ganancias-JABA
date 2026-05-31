# Fase 1 - Validacion contra Excel y parametros

Ultima actualizacion: 2026-05-31

## Objetivo

Construir una base verificable para que la aplicacion pueda compararse contra la planilla Excel usada actualmente por el estudio.

La meta no es copiar ciegamente toda la planilla, sino usarla como referencia para detectar diferencias relevantes, decidir si son errores o mejoras intencionales, y dejar cada decision documentada.

## Alcance inicial

### Libro principal

Archivo:

- `C:\Dev\Ganancia\Persona Fisica\DJ Ganancias 2025 - Tercera Categoria.xlsx`

Hojas prioritarias:

- `IG 25`
- `ER`
- `JVP`
- `Ded. Gen.`
- `Bienes de Uso`
- `Ventas`
- `Compras`
- `Retenciones`
- `Banco`
- `Creditos`
- `Pasivo`

Valores candidatos para test inicial:

- `IG 25!F17`: resultado neto de categorias antes de deducciones relevantes.
- `IG 25!F32`: total deducciones generales computables.
- `IG 25!F34`: ganancia neta.
- `IG 25!F38`: total deducciones personales.
- `IG 25!F58`: ganancia neta sujeta a impuesto.
- `IG 25!F60`: impuesto determinado por escala.
- `ER!C68`: resultado neto de tercera categoria segun estado de resultados.
- `JVP!C17`, `JVP!D17`, `JVP!C19`: patrimonio/consumo/justificacion patrimonial.

### Libro AXI

Archivo:

- `C:\Dev\Ganancia\Persona Fisica\AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`

Hojas prioritarias:

- `AXI.Estatico`
- `AXI.Dinamico`
- `A-R`

Valores candidatos:

- Resultado de AXI estatico.
- Resultado de AXI dinamico.
- Coeficientes y factores usados por movimiento.

### Libro indices

Archivo:

- `C:\Dev\Ganancia\Persona Fisica\Indices de actualizacion hasta 2025 (1).xlsx`

Hoja prioritaria:

- `Coeficiente de reexpresion`

Valores candidatos:

- Coeficiente dic24-dic25.
- Coeficiente promedio 2025.
- Meses y coeficientes mensuales usados por AXI dinamico.

## Estrategia tecnica

### Paso A - Fixture de lectura Excel

Estado: iniciado.

Crear un test que abra los libros reales y confirme:

- Que existen las hojas esperadas.
- Que las celdas clave tienen valores numericos o formulas esperadas.
- Que el archivo de indices no se interpreta como meses `1..12` si trae fechas seriales de Excel.

Avance 2026-05-30:

- Se agrego test automatico para el libro de indices real.
- El test valida que fechas seriales de Excel se conviertan a meses 1..12 para 2025.
- El test valida IPC de enero y diciembre 2025.
- El test valida coeficiente dic24-dic25 y promedio 2025.
- Se agrego test automatico para el libro principal de Ganancias.
- El test valida hojas esperadas y formulas clave de `IG 25`, `ER`, `JVP` y `Bienes de Uso`.
- Se agrego test de dominio para la deduccion locador/locatario al 10%.
- Se agregaron tests de dominio para amortizaciones de bienes de uso segun anios al cierre.

### Paso B - Parser de parametros/indices

Estado: iniciado.

Refactorizar la importacion para:

- Detectar estructura real del archivo.
- Validar formato antes de guardar parametros.
- Rechazar datos ambiguos con mensajes claros.
- Registrar fuente de datos y fecha de carga.

Avance 2026-05-30:

- Se creo `src/domain/ganancias/mappers/parameterImporter.ts`.
- Se conecto `/api/parametros/import` al parser de dominio.
- La API devuelve `warnings` y `usefulCoefficients` en la respuesta de importacion.
- Pendiente: guardar trazabilidad de fuente/fecha en el modelo de datos.

### Paso C - Comparacion app vs Excel

Una vez que el fixture funcione, preparar casos de comparacion:

- Entrada minima.
- Caso comercial con ventas/compras/existencias.
- Caso con bienes de uso.
- Caso con deducciones generales.
- Caso con AXI.

Avance 2026-05-30:

- Se corrigio el primer rubro de deducciones generales faltante: locador/locatario 10%.
- Se alinearon topes encadenados de prepagas, honorarios medicos y donaciones contra `IG 25`.
- Se alineo la semantica de amortizaciones con `Bienes de Uso`.
- Se agrego fecha de compra visible y calculo automatico de anios al cierre.
- Se elimino el lenguaje de falsa sincronizacion ARCA; la carga base queda identificada como interna.
- Se agrego desglose admitido por rubro en el resumen final del wizard.
- Se llevo el mismo desglose a la pagina independiente de papel de trabajo.
- Se corrigio la pagina independiente para incluir la deduccion locador/locatario en el input de calculo.
- Se agrego un mapper testeado para que el papel de trabajo independiente no omita pasivos personales ni AXI dinamico al recalcular.
- Se conecto el wizard al mismo mapper de calculo para reducir duplicacion y diferencias de normalizacion.
- Se corrigio la carga de parametros del papel de trabajo para usar la resolucion default del anio si la DDJJ no tiene `taxParameterSetId`.
- Se conecto la API de guardado al mapper comun de calculo y se cubrieron decimales tipo Prisma.
- Se agrego aviso visible en el papel de trabajo cuando se usan parametros default por falta de resolucion explicita.
- Se agrego confirmacion antes de cerrar desde el wizard si faltan parametros activos o resolucion explicita.
- Se corrigio el alta nueva desde wizard para que, luego del `POST`, persista toda la carga mediante `PUT` al nuevo ID.
- Si ese `PUT` completo falla, el wizard intenta eliminar la cabecera recien creada para evitar DDJJ incompletas en la base.
- El `POST /api/declaraciones` ahora guarda un `variablesSnapshot` inicial completo si recibe payload de carga.
- El wizard ahora conserva el ID persistido activo y usa `PUT` en guardados posteriores aunque la ruta todavia no se haya refrescado desde `/crear`.
- El auto-alta del wizard envia payload completo al `POST /api/declaraciones`.
- El backend ahora detecta payload operativo en `POST /api/declaraciones` y persiste detalle relacional/calculo dentro de la misma transaccion de creacion.
- El `PUT` y el `POST` completo comparten rutina de persistencia para reducir divergencias.
- El wizard ya no ejecuta un `PUT` redundante despues de un `POST` exitoso; el backend queda como fuente de verdad de la creacion atomica.
- Si ya existe una DDJJ original para el mismo cliente y periodo, el `POST` responde con codigo funcional e ID existente para continuar sobre esa declaracion.
- La lectura de DDJJ desde base ahora formatea fechas de forma segura; fechas nulas o invalidas vuelven vacias en vez de romper el wizard.
- Se agrego `POST /api/declaraciones/preview` como endpoint backend de calculo para empezar a retirar el calculo duplicado del frontend.
- El preview backend ya tiene serializacion JSON y rehidratacion a `Decimal` para integrarse con la UI actual del wizard.

## Criterios de aceptacion

La fase se considera cerrada cuando:

- Hay tests automatizados que leen los Excel base.
- La importacion de indices no acepta datos mal interpretados.
- La app distingue parametros simulados, manuales e importados.
- Las diferencias detectadas contra Excel quedan listadas como errores o decisiones intencionales.
- `docs/REGISTRO_PROYECTO.md` queda actualizado con lo realizado.

## Riesgos

- El paquete `xlsx` no recalcula formulas; solo lee valores cacheados en el archivo.
- Si la planilla se guarda sin recalcular, algunos valores cacheados pueden no reflejar formulas actuales.
- Para una comparacion exacta a futuro podria requerirse recalculo con Excel/LibreOffice o mantener fixtures normalizados.
