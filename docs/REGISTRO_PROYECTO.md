# Registro del proyecto - Ganancias JABA Persona Fisica

Ultima actualizacion: 2026-05-31

## Objetivo

Construir y estabilizar una aplicacion para un estudio contable chico/unipersonal, orientada a preparar declaraciones juradas de Ganancias Persona Fisica - Tercera Categoria.

Prioridades del producto:

- Carga agil.
- Automatizacion donde aporte eficiencia real.
- Sin "magia": cada calculo debe ser visible, explicable y auditable.
- Uso inicial por una sola persona.
- La planilla Excel actual se toma como referencia funcional porque ya se usa en produccion profesional.

## Archivos base de referencia

Ubicacion: `C:\Dev\Ganancia\Persona Fisica`

- `DJ Ganancias 2025 - Tercera Categoria.xlsx`
- `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`
- `Indices de actualizacion hasta 2025 (1).xlsx`

Pendiente:

- No se encontro un archivo claramente identificado como "tipos de cambio". En la planilla base hay campos de tipo de cambio en cuentas/bancos/compras, pero no un archivo complementario especifico detectado en la carpeta.

## Aplicacion analizada

Ubicacion: `C:\Dev\Ganancia\Persona Fisica\ganancias-jaba`

Stack detectado:

- Next.js 16
- React 19
- Prisma 7
- MariaDB/MySQL
- decimal.js
- xlsx
- zod
- Vitest
- ESLint

## Estado de verificacion inicial

Comandos relevantes ya ejecutados:

- Tests de dominio con Vitest: pasaron 5 tests en 2 archivos.
- Build de produccion con Next: paso correctamente usando ejecucion con permisos elevados por descarga de fuentes Google.
- Lint: fallo con 205 problemas aproximados, mayormente `no-explicit-any` y variables sin uso, pero tambien hay problemas reales de hooks/orden de declaracion.
- Dev server con Turbopack: fallo en sandbox por permisos al crear procesos.
- Dev server con Webpack: respondio 200 en rutas API principales.
- Git: no esta disponible en el PATH de PowerShell en esta maquina.
- Browser plugin: no pudo usarse por error de sandbox en `node_repl`.

## Hallazgos principales

### H1 - "Sincronizar ARCA" no es una sincronizacion real

Estado: resuelto como mitigacion de producto.

La aplicacion muestra una accion de sincronizacion ARCA, pero actualmente genera parametros hardcodeados/simulados.

Riesgo:

- Alto riesgo funcional y profesional si el usuario interpreta que los parametros vienen realmente de una fuente oficial.

Accion esperada:

- Accion renombrada a carga de base interna.
- Dejar claro si los parametros son importados desde Excel, cargados manualmente o simulados.

### H2 - Importacion de indices incompatible con el archivo real

Estado: parcialmente resuelto.

El archivo `Indices de actualizacion hasta 2025 (1).xlsx` usa fechas seriales de Excel y coeficientes distribuidos en una estructura que el importador actual no valida correctamente.

Riesgo:

- Coeficientes IPC mal cargados.
- Ajustes por inflacion incorrectos.

Accion esperada:

- Parser especifico creado para normalizar fechas seriales de Excel a meses 1..12.
- Test agregado contra el archivo real de indices.
- Pendiente: definir como persistir y aplicar coeficientes utiles en AXI estatico/dinamico, porque el modelo actual solo guarda `ipcValue` mensual.

### H3 - Deducciones generales no equivalen completamente a la planilla base

Estado: parcialmente resuelto.

La planilla aplica topes y formulas especificas, incluyendo rubros que no estan completos en el modelo actual.

Riesgo:

- Diferencias entre la aplicacion y la planilla usada por el estudio.

Accion esperada:

- Mapear rubro por rubro contra `IG 25` y `Ded. Gen.`.
- Deduccion locador/locatario 10% agregada al motor y al wizard.
- Alinear formulas con la planilla o documentar diferencias intencionales.

### H4 - AXI esta simplificado frente a la planilla

Estado: abierto.

La planilla de AXI tiene apertura estatica y dinamica mucho mas detallada que el modelo actual.

Riesgo:

- Resultado AXI incompleto para casos reales.

Accion esperada:

- Separar AXI estatico y dinamico por secciones equivalentes a la planilla.
- Definir una carga guiada que sea rapida pero auditable.

### H5 - El importador pierde detalle auditable

Estado: abierto.

Ventas, compras y retenciones importadas se reducen a pocos campos genericos.

Riesgo:

- Menor trazabilidad ante revision.
- Reproceso manual si hay que justificar un dato.

Accion esperada:

- Preservar datos relevantes: fecha, comprobante, punto de venta, numero, CUIT, razon social, moneda, tipo de cambio, IVA, no gravado, exento, total, regimen/certificado de retencion, etc.

### H6 - Doble calculo entre frontend y backend

Estado: abierto con primera mitigacion.

El wizard calcula en cliente y el backend vuelve a calcular al guardar.

Riesgo:

- Diferencias entre lo que ve el usuario y lo que queda guardado.

Accion esperada:

- Centralizar calculo en dominio/backend.
- El frontend debe pedir preview/calculo y mostrar resultado, no ser una segunda fuente de verdad.
- Primeros pasos aplicados: el wizard y la pagina independiente de papel de trabajo ya usan un mapper testeado para no recalcular con datos parciales o divergentes.

### H7 - Campos patrimoniales y JVP incompletos

Estado: abierto.

La planilla usa una justificacion de variaciones patrimoniales amplia. La app tiene arreglos vacios o simplificados para efectivo, creditos, pasivos y otras justificaciones.

Riesgo:

- Consumo/justificacion patrimonial poco confiable.

Accion esperada:

- Incorporar carga por rubros equivalentes a planilla.
- Mantener calculo visible en papel de trabajo.

## Decisiones tomadas

### D1 - La planilla Excel es el oraculo funcional inicial

Fecha: 2026-05-30

Se decide que los calculos de la app se validaran contra la planilla base antes de cambiar formulas sensibles.

### D2 - Primero se crea una red de pruebas, luego se corrige logica

Fecha: 2026-05-30

Se evita reescribir calculos fiscales sin tests de resguardo.

### D3 - Toda mejora debe quedar registrada

Fecha: 2026-05-30

Este archivo funcionara como bitacora y estado vivo del proyecto. Cada bloque de trabajo debe registrar:

- Que se hizo.
- Que se verifico.
- Que queda pendiente.
- Riesgos o decisiones abiertas.

## Plan inmediato

Fase 1 - Validacion Excel y parametros:

- Crear extractor/fixture de valores clave desde los Excel base.
- Agregar tests de lectura de planillas.
- Corregir o endurecer importacion de indices.
- Registrar cualquier diferencia entre app y Excel.
- No tocar formulas fiscales complejas sin una prueba que exponga la diferencia.

## Bitacora

### 2026-05-30 - Auditoria inicial

Se reviso estructura del proyecto, planillas Excel y calculos principales.

Resultado:

- La app compila en produccion.
- Los tests existentes pasan.
- Lint falla y requiere limpieza.
- Hay inconsistencias funcionales relevantes frente a la planilla.
- Se identifico que el flujo de carga ya esta avanzado, pero necesita robustez fiscal, trazabilidad y validacion.

### 2026-05-30 - Registro persistente

Se crea este registro para no depender de la conversacion y trabajar de forma ordenada.

Pendiente inmediato:

- Crear plan tecnico detallado de Fase 1.
- Implementar primera prueba/fixture contra Excel.
- Actualizar esta bitacora luego de cada cambio.

### 2026-05-30 - Fase 1, primer cambio: parser de indices

Se implemento un mapper puro para importar parametros desde Excel:

- Archivo nuevo: `src/domain/ganancias/mappers/parameterImporter.ts`.
- Test nuevo: `src/domain/ganancias/tests/parameterImporter.test.ts`.
- Ruta actualizada: `src/app/api/parametros/import/route.ts`.

Resultado funcional:

- El archivo real `Indices de actualizacion hasta 2025 (1).xlsx` ya no se interpreta como meses `45658`, `45689`, etc.
- El parser normaliza enero-diciembre 2025 como `monthIndex` 1..12.
- Se capturan coeficientes utiles del archivo:
- Coeficiente dic24-dic25: `1.3154876051`.
- Coeficiente promedio 2025: `1.128840454`.

Verificacion:

- `vitest run`: 3 archivos, 6 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos tocados: OK.
- `next build`: OK ejecutado fuera del sandbox por bloqueo de descarga de Google Fonts.

Pendiente:

- Conectar los coeficientes utiles con el calculo AXI cuando se amplie el modelo.
- Evitar dependencia de Google Fonts en build para que no requiera red.
- Continuar con fixture de celdas clave del libro principal `DJ Ganancias 2025 - Tercera Categoria.xlsx`.

### 2026-05-30 - Fase 1, segundo cambio: oraculo de planilla principal

Se agrego un test de oraculo para la planilla base de Ganancias:

- Archivo nuevo: `src/domain/ganancias/tests/excelOracle.test.ts`.

Resultado funcional:

- Se valida que existan las 21 hojas esperadas del libro principal.
- Se fijan formulas clave de `IG 25`, `ER`, `JVP` y `Bienes de Uso`.
- Queda documentada por test la deduccion locador/locatario 10% en `IG 25!C28/D28/F28`, actualmente faltante o no equivalente en el motor.

Verificacion:

- `vitest run`: 4 archivos, 8 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos tocados: OK.

Pendiente:

- Agregar comparaciones contra resultados esperados cuando haya casos de carga reales/no vacios.
- Mapear deducciones generales de la app contra `IG 25` y `Ded. Gen.` rubro por rubro.
- Formula de amortizaciones de `Bienes de Uso` revisada y ajustada al criterio de anios al cierre.

### 2026-05-30 - Mejora de build local sin red

Se elimino la dependencia de `next/font/google` en `src/app/layout.tsx`.

Archivos modificados:

- `src/app/layout.tsx`.
- `src/app/globals.css`.
- `package.json`.

Resultado:

- La aplicacion ya no necesita descargar Geist desde Google Fonts para compilar.
- `next build --webpack` pasa dentro del sandbox sin permisos elevados.
- Los scripts `dev` y `build` quedan configurados con Webpack por defecto.
- Se agregan `dev:turbopack` y `build:turbopack` para probar Turbopack de forma explicita.
- `next build` con Turbopack sigue fallando en este entorno por `Acceso denegado` al crear procesos; se considera limitacion del sandbox, no error fiscal/funcional de la app.

Verificacion:

- `vitest run`: 4 archivos, 8 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos TS/TSX tocados: OK.
- `next build --webpack`: OK.

### 2026-05-30 - Fase 1, tercer cambio: deduccion locador/locatario

Se agrego la deduccion general "Nueva deduccion - Locador / Locatario" que existe en la planilla base.

Referencia Excel:

- `Ded. Gen.` bloque "Nueva deduccion - Locador / Locatario".
- `IG 25!C28`: toma el total desde `Ded. Gen.!F216`.
- `IG 25!D28`: calcula el 10%.
- `IG 25!F28`: computa el importe admitido.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/deduccionesGenerales.test.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- El usuario puede cargar la base de la deduccion locador/locatario en el Paso 5.
- El motor admite el 10% del importe informado.
- La API guarda/recupera el campo en el estado extra del borrador.
- Los borradores antiguos siguen siendo compatibles: si el campo no existe, se toma cero.

Verificacion:

- `vitest run`: 5 archivos, 9 tests, todo OK.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- `eslint` completo sobre wizard/API sigue fallando por deuda preexistente (`any`, reglas de hooks/purity), no bloquea build pero queda pendiente de limpieza.

Pendiente:

- Agregar desglose visible de deducciones generales admitidas en el papel de trabajo final.

### 2026-05-30 - Fase 1, cuarto cambio: topes encadenados de deducciones generales

Se ajusto el motor para replicar el orden de topes de la planilla `IG 25` en:

- Cuota medico asistencial 5%.
- Honorarios medicos 40% + 5%.
- Donaciones 5%.

Referencia Excel:

- `IG 25!D29/F29`.
- `IG 25!D30/F30`.
- `IG 25!D31/F31`.

Resultado funcional:

- El motor ya no calcula estos topes como 5% simple del resultado neto bruto.
- Ahora considera las deducciones previamente admitidas segun los rangos usados por la planilla (`F20:F23` y `F20:F28`).
- Se agrego test especifico para capturar esa diferencia.

Verificacion:

- `vitest run`: 5 archivos, 10 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos de dominio tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Agregar desglose visible por rubro en el resultado/papel de trabajo.
- Revisar si conviene exponer en UI el importe admitido por cada deduccion mientras se carga.

### 2026-05-30 - Fase 1, quinto cambio: amortizaciones de bienes de uso

Se alineo la semantica de amortizaciones con la planilla `Bienes de Uso`.

Referencia Excel:

- `Bienes de Uso!F4`: `$B$1-E4+1`.
- `Bienes de Uso!J4`: `I4/G4`.
- `Bienes de Uso!K4`: `J4*H4`.
- `Bienes de Uso!L4`: `I4-(J4*F4)`.
- `Bienes de Uso!M4`: `I4*H4-(K4*F4)`.

Archivos modificados:

- `src/domain/ganancias/calculations/amortizaciones.ts`.
- `src/domain/ganancias/tests/amortizaciones.test.ts`.
- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/exports/excelGenerator.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- `yearsElapsed` ahora significa anios amortizados al cierre.
- En el ultimo anio de vida util se computa amortizacion anual y el residual queda en cero.
- Un bien nuevo cargado desde el wizard arranca con `1` anio al cierre.
- El exportador Excel del sistema usa el mismo criterio.
- Si `yearsElapsed` supera la vida util, no computa nueva amortizacion anual y deja residual cero.

Verificacion:

- `vitest run`: 6 archivos, 12 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos de dominio/export tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Revisar si conviene bloquear edicion manual de anios al cierre o dejarlo editable para casos especiales.

### 2026-05-31 - Fase 1, septimo cambio: fecha de compra y anios al cierre automaticos

Se agrego calculo automatico de anios al cierre para bienes de uso.

Referencia Excel:

- `Bienes de Uso!E4`: `YEAR(D4)`.
- `Bienes de Uso!F4`: `$B$1-E4+1`.

Archivos modificados:

- `src/domain/ganancias/calculations/amortizaciones.ts`.
- `src/domain/ganancias/tests/amortizaciones.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- La grilla de bienes de uso ahora muestra `Fecha Compra`.
- Al cambiar la fecha de compra, el wizard recalcula `Anios al Cierre`.
- El calculo se centralizo en `calculateYearsElapsedAtClose`.
- Un bien comprado en 2023 para periodo 2025 calcula 3 anios al cierre.
- Una fecha vacia o futura se trata conservadoramente como 1 anio.

Verificacion:

- `vitest run`: 6 archivos, 13 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre amortizaciones y test tocado: OK.
- `next build --webpack`: OK.

Pendiente:

- Evaluar UX: dejar `Anios al Cierre` editable manualmente o convertirlo en solo lectura con override explicito.

### 2026-05-31 - Fase 1, octavo cambio: desglose visible de deducciones generales

Se agrego desglose por rubro de deducciones generales admitidas.

Referencia Excel:

- `IG 25!F20:F31`.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/deduccionesGenerales.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- El motor ahora expone importes admitidos de autonomos, prepagas y donaciones, que antes quedaban solo dentro del total.
- El resumen final del wizard muestra el detalle por rubro cuando el importe admitido es distinto de cero.
- Esto facilita controlar visualmente contra la planilla `IG 25`.

Verificacion:

- `vitest run`: 6 archivos, 13 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos de dominio tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Resuelto en cambio posterior: el mismo desglose se llevo a la pagina independiente `/declaraciones/[id]/papel-de-trabajo`.

### 2026-05-30 - Fase 1, sexto cambio: eliminar falsa sincronizacion ARCA

Se cambio el lenguaje de producto para evitar que el usuario crea que la aplicacion consulta una fuente oficial externa.

Archivos modificados:

- `src/app/page.tsx`.
- `src/app/api/parametros/route.ts`.

Resultado funcional:

- El boton ya no dice `Sincronizar ARCA`.
- Ahora dice `Cargar base interna` / `Cargar base {anio}`.
- La API ya no devuelve mensajes de "servidor oficial de ARCA".
- La fuente queda como `Plantilla interna JABA - verificar normativa oficial`.
- Los mensajes advierten que debe verificarse/importarse normativa oficial antes de presentar.

Verificacion:

- `vitest run`: 6 archivos, 12 tests, todo OK.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.

Pendiente:

- Si se desea una integracion oficial real, hay que definir fuente, proceso de actualizacion y control de version normativa.

### 2026-05-31 - Fase 1, noveno cambio: desglose en papel de trabajo independiente

Se llevo el desglose de deducciones generales admitidas a la pagina independiente de papel de trabajo.

Referencia Excel:

- `IG 25!F20:F31`.

Archivos modificados:

- `src/domain/ganancias/presentation/deductionsBreakdown.ts`.
- `src/domain/ganancias/tests/deductionsBreakdown.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.

Resultado funcional:

- El desglose por rubro ya no queda duplicado manualmente en el wizard.
- El papel de trabajo independiente muestra los importes admitidos no nulos con referencia a la celda de `IG 25`.
- La pagina independiente ahora tambien incluye `deduccionLocadorLocatario` al construir el input de calculo, evitando diferencias contra el wizard.

Verificacion:

- `vitest run`: 7 archivos, 15 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- En una iteracion posterior, limpiar deuda global de lint en pantallas grandes para poder usar `eslint` completo como control obligatorio.

### 2026-05-31 - Fase 1, decimo cambio: mapper testeado para recalculo del papel de trabajo

Se detecto que el papel de trabajo independiente reconstruia manualmente el input del motor y omitia datos que la API si entrega.

Riesgo corregido:

- `personalLiabilities` quedaba vacio en el recalculo de la pagina independiente.
- `axiDynamic` quedaba vacio en el recalculo de la pagina independiente.
- Esto podia generar diferencias entre lo visto en wizard/backend y el papel de trabajo final.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.

Resultado funcional:

- La pagina independiente ahora arma el `TaxReturnCalculationInput` con un mapper de dominio testeado.
- El mapper conserva `deduccionLocadorLocatario`, pasivos personales y movimientos AXI dinamicos.
- Queda una base reutilizable para ir eliminando duplicacion de calculo entre frontend y backend.

Verificacion:

- `vitest run`: 8 archivos, 16 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Reutilizar este mapper tambien en el wizard y/o API, o avanzar hacia un endpoint unico de preview/calculo.

### 2026-05-31 - Fase 1, undecimo cambio: wizard conectado al mapper de calculo

Se redujo duplicacion entre el wizard y el papel de trabajo para construir el input del motor impositivo.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- El mapper ahora acepta las dos formas de parametros usadas por la app:
- Forma directa del papel de trabajo: `brackets` + `ipcIndices`.
- Forma activa del wizard: `parameterSet` + `brackets` + `indices`.
- El wizard conserva sus parametros fallback 2025, pero delega la conversion a `TaxReturnCalculationInput` en el mapper testeado.
- Se elimina una construccion manual larga de `Decimal` dentro del componente de UI.

Verificacion:

- `vitest run`: 8 archivos, 17 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre mapper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Evaluar exponer un endpoint unico de calculo/preview para terminar de cerrar H6.

### 2026-05-31 - Fase 1, duodecimo cambio: parametros por defecto en papel de trabajo

Se corrigio un caso borde de carga del papel de trabajo independiente.

Riesgo corregido:

- Si una declaracion no tenia `taxParameterSetId` guardado, la pagina no cargaba parametros y no podia recalcular.
- La API `/api/parametros` ya soporta elegir la resolucion por defecto del anio si no se envia `resolutionId`, pero la pantalla no aprovechaba ese fallback.

Archivos modificados:

- `src/domain/ganancias/presentation/taxParameterRequest.ts`.
- `src/domain/ganancias/tests/taxParameterRequest.test.ts`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.

Resultado funcional:

- El papel de trabajo siempre intenta cargar parametros por anio fiscal.
- Si existe `taxParameterSetId`, lo usa.
- Si no existe, omite `resolutionId` y deja que la API seleccione la resolucion vigente/default del anio.

Verificacion:

- `vitest run`: 9 archivos, 19 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Mostrar una advertencia visible cuando la pantalla use parametros default por falta de resolucion explicita en la DDJJ.

### 2026-05-31 - Fase 1, decimotercer cambio: API de guardado conectada al mapper de calculo

Se conecto la API `PUT /api/declaraciones/[id]` al mapper comun de `TaxReturnCalculationInput`.

Archivos modificados:

- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Wizard, papel de trabajo y API de guardado comparten la misma normalizacion hacia el motor impositivo.
- Se redujo una fuente importante de divergencia de calculo.
- El mapper ahora acepta valores decimales tipo Prisma que exponen `toString()`, evitando convertir parametros de base a cero.

Verificacion:

- `vitest run`: 9 archivos, 20 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre mapper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Crear un endpoint unico de preview/calculo para que el frontend no tenga que calcular localmente en el largo plazo.
