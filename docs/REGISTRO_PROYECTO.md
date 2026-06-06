# Registro del proyecto - Ganancias JABA Persona Fisica

Ultima actualizacion: 2026-06-02

## Para Retomar Rapido

Leer primero `docs/CONTINUAR_AQUI.md`.

Ese archivo resume estado actual, prioridad activa, comandos utiles y la regla de continuidad. Este registro queda como bitacora historica larga y evidencia de decisiones, pero no como punto de entrada principal.

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

Estado: parcialmente resuelto.

La planilla de AXI tiene apertura estatica y dinamica mucho mas detallada que el modelo actual.

Riesgo:

- Resultado AXI incompleto para casos reales.

Accion esperada:

- Separar AXI estatico y dinamico por secciones equivalentes a la planilla.
- Definir una carga guiada que sea rapida pero auditable.

### H5 - El importador pierde detalle auditable

Estado: parcialmente resuelto.

Ventas, compras y retenciones importadas se reducen a pocos campos genericos.

Riesgo:

- Menor trazabilidad ante revision.
- Reproceso manual si hay que justificar un dato.

Accion esperada:

- Preservar datos relevantes: fecha, comprobante, punto de venta, numero, CUIT, razon social, moneda, tipo de cambio, IVA, no gravado, exento, total, regimen/certificado de retencion, etc.
- Avance aplicado: ventas y compras importadas conservan comprobante, numero, contraparte, CUIT, IVA y total durante importacion, carga en wizard, persistencia relacional y reapertura.
- Limitacion vigente: el CUIT de contraparte queda en `variablesSnapshot` porque las tablas `SalesInvoice` y `PurchaseInvoice` no tienen columna propia para ese dato. Queda pendiente evaluar migracion si se quiere consulta directa por CUIT.

### H6 - Doble calculo entre frontend y backend

Estado: abierto con mitigaciones incrementales.

El wizard calcula en cliente y el backend vuelve a calcular al guardar.

Riesgo:

- Diferencias entre lo que ve el usuario y lo que queda guardado.

Accion esperada:

- Centralizar calculo en dominio/backend.
- El frontend debe pedir preview/calculo y mostrar resultado, no ser una segunda fuente de verdad.
- Primeros pasos aplicados: el wizard y la pagina independiente de papel de trabajo ya usan un mapper testeado para no recalcular con datos parciales o divergentes.
- Se agrego un endpoint backend de preview/cÃ¡lculo (`POST /api/declaraciones/preview`) que usa el mapper comun y devuelve resultado serializado apto para UI.

### H8 - Alta nueva de DDJJ no persistia toda la carga inicial

Estado: resuelto.

Cuando el wizard creaba una declaracion nueva desde `/declaraciones/crear/wizard`, el `POST /api/declaraciones` creaba cabecera y un `CalculationRun` inicial, pero no persistia ventas, compras, bienes, bancos, deducciones, patrimonio ni AXI cargados en ese mismo cierre/guardado.

Riesgo:

- La informacion podia quedar solo en `localStorage` del navegador despues de la creacion inicial.
- Al consultar desde otra sesion/dispositivo o desde la base, la DDJJ podia aparecer incompleta.

Accion aplicada:

- El wizard conserva en memoria el `id` real ya persistido para que los guardados siguientes usen `PUT` aunque la ruta todavia venga de `/crear`.
- El auto-alta del wizard envia payload completo al `POST /api/declaraciones`.
- El backend ahora detecta cuando el `POST /api/declaraciones` trae carga operativa y persiste detalle relacional/calculo dentro de la misma transaccion de creacion.
- El exito del modal se muestra solo si ese `POST` atomico devuelve confirmacion.
- Si ya existe una DDJJ original para el mismo cliente y periodo, el backend responde con codigo funcional e ID existente, y el wizard abre esa declaracion en lugar de mostrar un error tecnico.

Pendiente:

- Validar manualmente contra base local con un caso real de wizard.
- Mitigacion adicional aplicada: el `POST` guarda en `variablesSnapshot` todo el payload operativo recibido cuando no dispara persistencia relacional completa.

### H9 - Reapertura de DDJJ con fechas incompletas podia fallar

Estado: resuelto como mitigacion de robustez.

La API `GET /api/declaraciones/[id]` formateaba fechas con `toISOString()` directo. Esto era fragil para campos opcionales como la fecha de movimientos AXI dinamicos.

Riesgo:

- Una DDJJ con datos historicos o importados con fecha nula podia fallar al abrirse en el wizard.
- El usuario podia perder agilidad justo al intentar continuar una carga ya persistida.

Accion aplicada:

- Se agrego un formateador testeado para convertir fechas persistidas a formato `YYYY-MM-DD`.
- Si la fecha es nula o invalida, la API devuelve cadena vacia en vez de romper la respuesta.
- Se conecto el helper a ventas, compras, bienes de uso y AXI dinamico.

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

### D4 - La continuidad operativa se gestiona desde un tablero corto

Fecha: 2026-06-01

Se decide que `docs/CONTINUAR_AQUI.md` es la puerta de entrada para retomar el proyecto. `docs/BACKLOG_PRIORIZADO.md` define el orden de trabajo y `docs/REGISTRO_PROYECTO.md` queda como bitacora historica detallada.

Regla operativa:

- Al retomar, no recorrer todo el proyecto.
- Leer `CONTINUAR_AQUI`.
- Tomar el primer item activo/siguiente del backlog.
- Al cerrar una unidad, actualizar registro, verificar, commitear y pushear.

## Plan inmediato

Fase 1 - Validacion Excel y parametros:

- Crear extractor/fixture de valores clave desde los Excel base.
- Agregar tests de lectura de planillas.
- Corregir o endurecer importacion de indices.
- Registrar cualquier diferencia entre app y Excel.
- No tocar formulas fiscales complejas sin una prueba que exponga la diferencia.

## Bitacora

### 2026-06-01 - Control operativo de continuidad

Se agrego una capa de continuidad para retomar el proyecto sin reconstruir contexto desde cero.

Riesgo mitigado:

- La bitacora historica ya contiene mucha informacion y obliga a releer demasiado para saber por donde seguir.
- Habia frentes abiertos en distinto grado de avance, con pendientes viejos mezclados con pendientes reales.
- Retomar sin un tablero corto aumenta el riesgo de duplicar trabajo o abrir nuevos frentes sin cerrar los activos.

Archivos modificados:

- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/superpowers/plans/2026-06-01-continuidad-operativa.md`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- `CONTINUAR_AQUI` queda como puerta de entrada para proximas sesiones.
- `BACKLOG_PRIORIZADO` ordena los frentes por prioridad y estado.
- El registro historico enlaza al tablero corto y conserva la evidencia larga.
- H5 se reclasifico como parcialmente resuelto porque ventas/compras ya conservan detalle importado, aunque quedan mejoras de CUIT en columna propia y retenciones.
- Al cerrar esta unidad, P0 queda resuelto y la prioridad activa pasa a P1: reducir riesgo operativo/deuda del wizard.

Verificacion prevista:

- Lectura de los documentos nuevos.
- Busqueda de enlaces y prioridades.
- `git diff --check`.

Pendiente:

- Mantener estos documentos actualizados en cada cierre de bloque.
- Continuar por P1: reducir riesgo operativo/deuda del wizard.

### 2026-06-01 - P1 primer corte: formato monetario fuera del wizard

Se inicio la reduccion incremental de deuda del wizard sin reescribir la pantalla completa.

Riesgo mitigado:

- El wizard tenia helpers inline con `any`, mezclando presentacion, formato y UI.
- Cada cambio en esa pantalla aumenta riesgo si no se extraen piezas testeables.
- El objetivo de P1 es mejorar verificabilidad por cortes chicos, no una refactorizacion masiva.

Archivos modificados:

- `src/domain/ganancias/presentation/moneyFormat.ts`.
- `src/domain/ganancias/tests/moneyFormat.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agregaron `formatCurrencyWhole` y `formatCurrencyCents`.
- Se retiro del wizard el helper local `formatDecimal` con `any`.
- Se retiro el helper local `formatVal` usado para topes con centavos.
- Se elimino el import no usado `Info`.
- El comportamiento de formato queda cubierto por tests.

Verificacion:

- TDD rojo confirmado: `moneyFormat.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/moneyFormat.test.ts`: 1 archivo, 3 tests, todo OK.
- `vitest run`: 20 archivos, 58 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevo: OK.
- `next build --webpack`: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa, ahora con 31 problemas (26 errores, 5 warnings).

Pendiente:

- Siguiente subcorte recomendado: tipar o extraer bloque de carga/cache inicial del wizard.
- Resolver progresivamente reglas de hooks (`setState` en efectos) y `Date.now` en creacion de filas.

### 2026-06-01 - P1 segundo corte: estado tipado del wizard

Se avanzo sobre la deuda critica del wizard tipando sus estructuras principales sin modificar formulas fiscales.

Riesgo mitigado:

- Los `any` del estado principal permitian asignaciones opacas en ventas, compras, bancos, bienes, retenciones, patrimonio, AXI, resoluciones y parametros.
- La pantalla de carga es el punto mas sensible para un estudio chico: debe ser rapida, pero tambien previsible y auditable.
- Antes de tocar calculo, AXI o JVP conviene que el estado editable tenga nombres y tipos explicitos.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agregaron tipos reutilizables para resoluciones, parametros activos, padron, declaraciones, ventas, compras, bienes de uso, bancos, retenciones, patrimonio personal, pasivos y movimientos AXI.
- Se agrego `coerceWizardPersonalDeductionType` para evitar casts inseguros al cargar la deduccion especial.
- Se agregaron helpers `wizardMoneyToString` y `wizardMoneyToNumber` para normalizar valores editables antes de usarlos en estado, parseos o JSX.
- El wizard ya no contiene `any` explicitos en los estados y mapeos principales tocados.
- Se reemplazaron dos `Date.now()` de altas manuales por ids deterministas basados en la cantidad actual de filas.
- Se retiro el efecto derivado de `maxVisitedStep`; ahora se actualiza junto con el cambio de paso.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque `wizardStateTypes` no existia.
- TDD rojo confirmado: el test de helpers monetarios fallo inicialmente porque `wizardMoneyToString` y `wizardMoneyToNumber` no existian.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts src/domain/ganancias/tests/moneyFormat.test.ts`: 2 archivos, 6 tests, todo OK.
- `vitest run`: 21 archivos, 61 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre `wizardStateTypes.ts` y su test: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa, pero baja a 5 problemas (4 errores, 1 warning), concentrados en efectos de React/carga inicial.

Pendiente:

- Proximo subcorte P1: extraer/ordenar carga inicial, localStorage y reset de contribuyente para resolver los 5 problemas restantes de hooks.
- No tocar calculo fiscal, AXI ni JVP hasta cerrar ese subcorte o aceptar conscientemente el riesgo.

### 2026-06-01 - P1 tercer corte: wizard sin deuda focal de ESLint

Se cerro P1 corrigiendo la deuda remanente del wizard sin modificar formulas fiscales.

Riesgo mitigado:

- El wizard aun tenia efectos que sincronizaban estado de forma fragil (`persistedReturnId`, carga inicial, reset por cambio de contribuyente y parametros activos).
- Esos efectos podian generar renders en cascada o borrar datos por efectos secundarios poco visibles.
- Para una carga agil y confiable, los resets deben ocurrir por accion del usuario y los estados derivados deben calcularse, no duplicarse.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `activeReturnId` ahora se deriva del id de ruta normalizado y del id persistido luego de crear, sin efecto sincronico extra.
- `isLoadingData` ahora se deriva de la carga de ruta y del import historico, evitando setear `true` dentro del efecto inicial.
- El reset de datos de detalle se movio al evento real de cambio de nombre/CUIT del contribuyente, manteniendo la proteccion contra contaminacion de datos sin efecto reactivo opaco.
- Los parametros activos se guardan con la clave de resolucion consultada; si no hay resolucion, el valor visible deriva a `null` sin setState sincronico.
- Se agregaron helpers testeados para resolver id de ruta, decidir reset de detalle y decidir si corresponde pedir parametros activos.
- `eslint src/app/declaraciones/crear/wizard/page.tsx` pasa limpio.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque faltaban helpers de flujo (`resolveWizardRouteReturnId`, `shouldResetWizardDetailsOnIdentityChange`, `shouldRequestActiveTaxParameters`).
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 4 tests, todo OK.
- `vitest run`: 21 archivos, 62 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- P2 queda como prioridad activa: consolidar calculo backend/frontend para evitar diferencias silenciosas entre preview, guardado y papel de trabajo.

### 2026-06-01 - P2 primer corte: advertencia de cierre sin preview backend vigente

Se inicio P2 reduciendo el riesgo de diferencias silenciosas entre el resultado visible y el resultado que se recalcula al guardar/cerrar.

Riesgo mitigado:

- El wizard muestra resultado backend cuando esta vigente, pero tambien puede mostrar fallback local si el backend esta pendiente o fallo.
- Al cerrar una DDJJ, el backend vuelve a calcular y persiste el resultado; si el usuario ve fallback local, podria cerrar creyendo que ese valor esta confirmado.
- Para un estudio chico, la agilidad no debe ocultar que el numero visible aun no fue confirmado por el motor backend.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agrego `buildTaxReturnCloseConsistencyWarning`.
- Si el preview vigente es backend, el cierre no agrega advertencia extra.
- Si el preview esta pendiente, en fallback local o sin backend vigente, el wizard pide confirmacion explicita antes de cerrar.
- El guardado como borrador no se bloquea; la advertencia se concentra en el acto sensible de cierre.

Verificacion:

- TDD rojo confirmado: `taxReturnPreview.test.ts` fallo inicialmente porque `buildTaxReturnCloseConsistencyWarning` no existia.
- `vitest run src/domain/ganancias/tests/taxReturnPreview.test.ts`: 1 archivo, 8 tests, todo OK.
- `vitest run`: 21 archivos, 64 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre preview/test/wizard: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- Siguiente subcorte P2: asegurar con test o documentacion tecnica que preview backend y persistencia usan el mismo mapper y parametros efectivos.
- Revisar si conviene bloquear el cierre hasta tener backend vigente en lugar de solo pedir confirmacion.

### 2026-06-01 - P2 segundo corte: jubilado consistente entre preview y persistencia

Se corrigio una diferencia funcional entre el preview backend y el calculo persistido.

Riesgo mitigado:

- El preview/backend recibia `personalDeductions.esJubiladoOchoHaberes` y aplicaba la deduccion especifica de 8 haberes.
- La persistencia reconstruia `personalDeductions` antes de recalcular, pero omitÃ­a esa marca.
- En un caso jubilado, la DDJJ podia mostrar un resultado y guardar otro al cerrar o actualizar.

Archivos modificados:

- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `persistTaxReturnDetails` ahora conserva `esJubiladoOchoHaberes` al reconstruir deducciones personales.
- Se agrego una prueba que calcula el preview y compara el resultado persistido (`totalPersonalDeductions` y `finalBalance`) para un contribuyente jubilado.
- El caso que antes guardaba deduccion personal `0` ahora guarda la deduccion de 8 haberes que corresponde al motor.

Verificacion:

- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo con `totalPersonalDeductions` persistido en `0` contra preview `24800000`.
- `vitest run src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts`: 2 archivos, 10 tests, todo OK.
- `vitest run`: 19 archivos OK y 2 omitidos; 62 tests OK y 3 omitidos.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre persistencia/test: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- Seguir revisando P2 para confirmar parametros efectivos y resultado persistido contra preview en otros casos sensibles.

### 2026-06-01 - P2 tercer corte: resolucion efectiva en snapshot de calculo

Se reforzo la trazabilidad de parametros usados por cada corrida de calculo.

Riesgo mitigado:

- La DDJJ guardaba `taxParameterSetId`, pero el snapshot de `CalculationRun` no dejaba trazada la resolucion efectiva de esa corrida.
- Si luego se cambia una resolucion o se revisa un calculo historico, conviene saber que parametros se usaron en esa ejecucion.
- Para presentaciones de Ganancias, la trazabilidad de la escala/parametros es tan importante como el resultado final.

Archivos modificados:

- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `buildInitialTaxReturnSnapshot` conserva `taxParameterSetId` cuando la DDJJ se crea con payload minimo.
- `persistTaxReturnDetails` guarda en `variablesSnapshot.taxParameterSetId` el id efectivo de parametros usado por el calculo persistido.
- La prueba de persistencia verifica que el snapshot de calculo use `params-2025`.

Verificacion:

- TDD rojo confirmado: `taxReturnSnapshot.test.ts` y `taxReturnDetailsPersistence.test.ts` fallaron inicialmente porque `taxParameterSetId` no estaba en snapshot.
- `vitest run src/domain/ganancias/tests/taxReturnSnapshot.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 2 archivos, 4 tests, todo OK.
- `vitest run`: 21 archivos, 65 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre snapshot/persistencia/tests: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- Evaluar cierre de P2 o agregar una prueba general de equivalencia preview/persistencia con parametros reales.

### 2026-06-01 - P2 cierre operativo

Se da por resuelto P2 y se mueve la prioridad activa a P3.

Motivo:

- El wizard ya indicaba fuente de resultado y ahora ademas advierte antes de cerrar si no hay preview backend vigente.
- Se corrigio una diferencia real entre preview y persistencia para jubilados con 8 haberes.
- Se agrego trazabilidad de `taxParameterSetId` efectivo en snapshots de calculo.
- La persistencia y el preview comparten el mapper `buildTaxReturnCalculationInput`; el caso sensible detectado quedo cubierto por test.

Verificacion acumulada de P2:

- `taxReturnPreview.test.ts` cubre estado de preview, request backend, hidratacion y advertencia de cierre.
- `taxReturnDetailsPersistence.test.ts` cubre detalle importado y equivalencia preview/persistencia para jubilado.
- `taxReturnSnapshot.test.ts` cubre conservacion de `taxParameterSetId`.
- Full suite y build fueron ejecutados en los cortes de P2.

Siguiente prioridad:

- P3 - H4/H2: AXI e indices utiles. Antes de tocar formulas, mapear estado actual contra planilla e indices disponibles.

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

- Resuelto en cambio posterior: el papel de trabajo ya muestra advertencia visible cuando usa parametros default por falta de resolucion explicita.

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

### 2026-05-31 - Fase 1, decimocuarto cambio: aviso de parametros default en papel de trabajo

Se agrego una advertencia visible cuando el papel de trabajo usa parametros default del periodo por falta de `taxParameterSetId` en la DDJJ.

Archivos modificados:

- `src/domain/ganancias/presentation/taxParameterNotice.ts`.
- `src/domain/ganancias/tests/taxParameterNotice.test.ts`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- La pantalla ya no usa parametros default de manera silenciosa.
- El aviso muestra la fuente normativa/base usada y version si esta disponible.
- La advertencia tambien queda en el documento impreso para auditoria interna.

Verificacion:

- `vitest run`: 10 archivos, 22 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- A futuro, bloquear cierre o pedir confirmacion si una DDJJ usa parametros default sin resolucion explicita.

### 2026-05-31 - Fase 1, decimoquinto cambio: confirmacion al cerrar con parametros no explicitos

Se agrego una confirmacion en el wizard antes de cerrar una DDJJ cuando falta resolucion explicita o parametros activos.

Archivos modificados:

- `src/domain/ganancias/presentation/taxParameterNotice.ts`.
- `src/domain/ganancias/tests/taxParameterNotice.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El cierre ya no avanza silenciosamente si la DDJJ puede estar usando parametros default o fallback interno.
- El usuario puede cancelar, revisar/cargar resolucion y luego cerrar.
- Si decide continuar, la confirmacion deja claro que es una decision consciente.

Verificacion:

- `vitest run`: 10 archivos, 25 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Reemplazar el `window.confirm` por un modal propio de la app para mejorar trazabilidad y UX.

### 2026-05-31 - Fase 1, decimosexto cambio: persistencia completa al crear DDJJ desde wizard

Se corrigio el flujo de alta nueva para evitar que la informacion cargada quede solo en memoria/localStorage.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Al crear una DDJJ nueva, primero se obtiene el `id` de la cabecera.
- Inmediatamente se dispara un `PUT` al nuevo `id` con todo el payload cargado.
- Si el guardado completo falla, no se muestra exito y el usuario recibe error.
- Si falla ese guardado completo, el wizard intenta revertir la cabecera recien creada para no dejar una DDJJ vacia/incompleta en la base.

Verificacion:

- `vitest run`: 11 archivos, 27 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Convertir el `POST /api/declaraciones` en una operacion atomica completa para que no dependa de dos requests desde el frontend.

### 2026-05-31 - Fase 1, decimoseptimo cambio: snapshot inicial completo en POST de DDJJ

Se reforzo el endpoint `POST /api/declaraciones` para que guarde en base un snapshot inicial completo cuando recibe payload de carga.

Archivos modificados:

- `src/app/api/declaraciones/route.ts`.
- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El `CalculationRun` inicial ya no guarda solo `currentStep`.
- Si el POST recibe ventas, compras, bienes, bancos, deducciones, patrimonio o AXI, esos datos quedan registrados en `variablesSnapshot`.
- Esto suma una capa de persistencia/auditoria desde el primer request, mientras se mantiene el `PUT` completo para poblar tablas relacionales.

Verificacion:

- `vitest run`: 12 archivos, 29 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Mover toda la persistencia relacional al `POST` dentro de una transaccion atomica compartida con `PUT`.

### 2026-05-31 - Fase 1, decimoctavo cambio: ID persistido activo en wizard

Se reforzo el flujo de guardado para evitar duplicados o guardados contra el endpoint incorrecto despues de crear una DDJJ desde `/declaraciones/crear/wizard`.

Riesgo corregido:

- Despues del primer `POST`, el wizard podia seguir decidiendo `POST` vs `PUT` solo por el `id` de la ruta.
- Si la URL seguia siendo `crear` en memoria, un guardado posterior podia intentar crear otra DDJJ en lugar de actualizar la ya creada.
- El auto-alta del wizard enviaba un payload minimo, por lo que dependia demasiado de un guardado posterior para persistir el detalle.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego un resolver testeado para decidir si el guardado debe ser `POST /api/declaraciones` o `PUT /api/declaraciones/[id]`.
- Una DDJJ recien creada guarda su `id` persistido en el estado del wizard.
- Los cambios de paso y guardados manuales posteriores actualizan la DDJJ existente, aunque la ruta no se haya refrescado completamente.
- El auto-alta desde el wizard ahora crea con payload completo.

Verificacion:

- `vitest run`: 12 archivos, 32 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Mantener como mejora estructural la persistencia atomica del `POST` en backend para eliminar la doble request desde frontend.

### 2026-05-31 - Fase 1, decimonoveno cambio: POST atomico con detalle operativo

Se movio la persistencia relacional completa a una rutina compartida de backend.

Riesgo corregido:

- El alta completa dependia de que el frontend hiciera `POST` y luego `PUT`.
- Si el usuario/navegador/interfaz se interrumpia entre requests, podia quedar una DDJJ creada sin detalle relacional.
- La logica de persistencia estaba duplicada dentro del `PUT`, dificultando reutilizarla en el `POST`.

Archivos modificados:

- `src/app/api/declaraciones/route.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnPayload.ts`.
- `src/domain/ganancias/tests/taxReturnPayload.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El `POST /api/declaraciones` distingue cabecera minima de payload operativo completo.
- Si el payload trae carga del wizard, crea cabecera, detalle relacional y `CalculationRun` dentro de una misma transaccion Prisma.
- El `PUT /api/declaraciones/[id]` reutiliza la misma rutina de persistencia, reduciendo divergencia entre alta y actualizacion.
- El alta minima sigue disponible para casos donde solo se necesita crear cabecera y snapshot inicial.

Verificacion:

- `vitest run`: 13 archivos, 35 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Resuelto en cambio posterior: el `PUT` redundante del frontend fue retirado del flujo de creacion.

### 2026-05-31 - Fase 1, vigesimo cambio: frontend alineado al POST atomico

Se simplifico el guardado del wizard ahora que el backend persiste detalle completo durante el `POST`.

Riesgo corregido:

- El frontend seguia haciendo `POST` y luego `PUT` aunque el backend ya resolvia la creacion atomica.
- Eso duplicaba calculo/persistencia y podia producir mas latencia o resultados dificiles de auditar ante errores intermedios.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego un builder testeado para armar el request de guardado del wizard.
- Si la DDJJ no tiene `id`, el wizard hace un `POST /api/declaraciones` con payload completo.
- Si ya existe `id` persistido, el wizard hace `PUT /api/declaraciones/[id]`.
- El `POST` exitoso ya no dispara un `PUT` redundante; solo guarda el nuevo `id`, actualiza localStorage y reemplaza/navega la URL.

Verificacion:

- `vitest run`: 13 archivos, 37 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar manualmente contra base local desde el flujo visual completo del wizard.

### 2026-05-31 - Fase 1, vigesimo primer cambio: duplicados de DDJJ con respuesta funcional

Se agrego manejo explicito para el caso en que ya existe una DDJJ original del mismo contribuyente y periodo.

Riesgo corregido:

- La base tiene un indice unico por cliente, periodo fiscal y version.
- Si el wizard intentaba crear otra original para el mismo cliente/anio, podia devolver un error tecnico de restriccion unica.
- Ese mensaje no era util para seguir cargando con agilidad.

Archivos modificados:

- `src/app/api/declaraciones/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/persistence/taxReturnDuplicate.ts`.
- `src/domain/ganancias/tests/taxReturnDuplicate.test.ts`.
- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- `POST /api/declaraciones` busca una DDJJ original existente antes de crear.
- Si existe, responde `409` con `code: DUPLICATE_TAX_RETURN` y el `id` de la DDJJ existente.
- El wizard detecta esa respuesta y abre la declaracion existente.
- El guardado manual muestra mensaje claro; el auto-alta redirige sin dejar al usuario ante un error de base.

Verificacion:

- `vitest run`: 14 archivos, 40 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar visualmente el flujo de duplicado cuando exista una DDJJ real en base.

### 2026-05-31 - Fase 1, vigesimo segundo cambio: fechas seguras al reabrir DDJJ

Se reforzo la lectura de declaraciones persistidas desde `GET /api/declaraciones/[id]`.

Riesgo corregido:

- La API usaba `toISOString()` directo sobre fechas al mapear datos de base al estado del wizard.
- `AxiDynamicItem.date` es opcional en el modelo, por lo que una fecha nula podia provocar error al reabrir la DDJJ.

Archivos modificados:

- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Las fechas persistidas se convierten de forma segura al formato de input del wizard.
- Fechas nulas o invalidas vuelven como cadena vacia.
- Se evita que la reapertura de una DDJJ falle por un movimiento AXI incompleto o historico.

Verificacion:

- `vitest run`: 15 archivos, 43 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar visualmente una DDJJ con AXI dinamico sin fecha cargada.

### 2026-05-31 - Fase 1, vigesimo tercer cambio: endpoint backend de preview de calculo

Se agrego una primera pieza para cerrar la divergencia entre calculo de frontend y backend.

Riesgo mitigado:

- El wizard calcula en cliente mientras el backend recalcula al guardar.
- Aunque ambos usan el mapper comun, el frontend sigue siendo una segunda fuente operativa de resultado.
- Para mover el calculo sin romper la experiencia, primero se necesita un endpoint backend estable y testeado.

Archivos modificados:

- `src/app/api/declaraciones/preview/route.ts`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- `POST /api/declaraciones/preview` recibe datos de declaracion y parametros impositivos.
- El endpoint usa `buildTaxReturnCalculationInput` y `calculateTaxReturn`, igual que el guardado backend.
- La respuesta serializa los `Decimal` a numeros y arreglos simples para que sea apta para JSON/UI.
- Se agrego una funcion de rehidratacion para convertir la respuesta JSON nuevamente a `Decimal`, compatible con la UI actual del wizard.
- El wizard todavia no consume este endpoint; se deja listo para conectar en una iteracion controlada.

Verificacion:

- `vitest run`: 16 archivos, 45 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre endpoint/helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Conectar el wizard al endpoint con debounce/cancelacion y fallback local mientras se valida visualmente.

### 2026-05-31 - Fase 1, vigesimo cuarto cambio: wizard conectado al preview backend

Se conecto el wizard de carga al endpoint backend de preview sin retirar todavia el calculo local.

Riesgo mitigado:

- El usuario necesita resultados inmediatos mientras carga.
- El backend debe empezar a ser la fuente operativa del calculo para evitar divergencias al guardar.
- Cambiar todo de golpe podia degradar agilidad o dejar la pantalla sin resultado ante una falla de red.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego `buildTaxReturnPreviewRequest` para centralizar el request `POST /api/declaraciones/preview`.
- El wizard arma el mismo payload de calculo que ya usa localmente y lo envia al backend con debounce de 350 ms.
- Se usa `AbortController` para cancelar requests anteriores cuando la carga cambia rapido.
- El resultado backend se aplica solo si corresponde al payload vigente.
- Si el backend demora o falla, la UI conserva el calculo local como fallback, manteniendo agilidad y evitando "magia" oculta.

Verificacion:

- `vitest run`: 16 archivos, 46 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `eslint` sobre el wizard sigue fallando por deuda previa ya registrada (`any`, efectos antiguos, `Date.now`), sin errores nuevos del preview conectado.
- `next build --webpack`: OK.

Pendiente:

- Validar visualmente que el resumen final del wizard muestre el resultado backend cuando haya conexion normal y conserve el fallback local ante error/cancelacion.

### 2026-05-31 - Fase 1, vigesimo quinto cambio: indicador visible de origen del preview

Se hizo explicito en la UI de carga si el resultado mostrado viene del preview backend o del calculo local de respaldo.

Riesgo mitigado:

- El sistema usa backend y fallback local durante la transicion hacia un motor unico.
- Sin una senal visible, el usuario no podia saber si estaba viendo un resultado confirmado por backend o un preview local provisorio.
- Para un estudio chico, la agilidad no debe depender de "magia"; la pantalla debe explicar el estado operativo sin interrumpir la carga.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego `buildTaxReturnPreviewStatus` para describir el estado del preview como `backend`, `pending`, `fallback` o `idle`.
- El wizard registra si hay request backend pendiente y si el ultimo intento fallo.
- El paso 6 muestra un indicador con detalle: motor backend actualizado, esperando confirmacion backend o preview local de respaldo.
- La barra fiscal viva tambien muestra un badge compacto con el origen del calculo.
- El fallback local sigue operativo para no romper la agilidad de carga cuando el backend demora o no responde.

Verificacion:

- TDD rojo confirmado: `taxReturnPreview.test.ts` fallo inicialmente porque `buildTaxReturnPreviewStatus` no existia.
- `vitest run src/domain/ganancias/tests/taxReturnPreview.test.ts`: 6 tests, todo OK.
- `vitest run`: 16 archivos, 49 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `eslint` sobre el wizard sigue fallando por deuda previa ya registrada (`any`, efectos antiguos, `Date.now`), sin errores nuevos del indicador.
- `next build --webpack`: OK.
- Validacion HTTP local de `POST /api/declaraciones/preview`: OK, respondio `success: true` con impuesto determinado 50 para payload minimo.

Pendiente:

- Validar visualmente con navegador cuando el conector/browser local este disponible; el intento en esta sesion quedo bloqueado por entorno de automatizacion.

### 2026-05-31 - Fase 1, vigesimo sexto cambio: auditoria de importacion de parametros

Se agrego trazabilidad persistida para la carga de parametros e indices desde Excel.

Riesgo mitigado:

- El importador devolvia `warnings` y `usefulCoefficients` en la respuesta HTTP, pero esa informacion podia perderse al cerrar la pantalla.
- Para un estudio contable, cada carga de indices/parametros debe poder rastrearse por archivo, resolucion, periodo y resultado de parsing.
- Se evito abrir una migracion nueva en esta etapa usando `AuditLog`, que ya existe en el modelo y cumple la funcion de bitacora operativa.

Archivos modificados:

- `src/app/api/parametros/import/route.ts`.
- `src/domain/ganancias/persistence/taxParameterImportAudit.ts`.
- `src/domain/ganancias/tests/taxParameterImportAudit.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El endpoint `/api/parametros/import` crea un `AuditLog` dentro de la misma transaccion que crea el `TaxParameterSet`.
- El detalle auditable queda en JSON estable con archivo, tamanio, MIME, anio fiscal, resolucion, version, conteo de tramos, conteo de IPC, warnings y coeficientes utiles.
- La respuesta de importacion devuelve `auditLogId` para rastrear la operacion.
- No se agrega migracion de base; se aprovecha la tabla de auditoria existente.

Verificacion:

- TDD rojo confirmado: `taxParameterImportAudit.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/taxParameterImportAudit.test.ts`: 1 test, todo OK.
- `vitest run`: 17 archivos, 50 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test/endpoint de importacion: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar con una importacion real desde la pantalla de parametros y revisar el evento en `/api/auditoria?action=IMPORT&entityType=TaxParameterSet`.
- Definir mas adelante si algun dato auditable debe pasar de `AuditLog.details` a columnas propias de `TaxParameterSet`.

### 2026-05-31 - Fase 1, vigesimo septimo cambio: detalle auditable en importacion AFIP/ARCA

Se corrigio la perdida de detalle en ventas y compras importadas desde Excel AFIP/ARCA.

Riesgo mitigado:

- La carga importada llegaba al wizard con importes, pero se perdian comprobante, contraparte, IVA y total al persistir o reabrir la DDJJ.
- Para un estudio chico, la importacion debe ahorrar carga manual sin convertir la DDJJ en una caja negra.
- Ante revision, el usuario necesita volver a ver de que comprobante y contraparte salio cada renglon.

Archivos modificados:

- `src/domain/ganancias/mappers/afipImporter.ts`.
- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/domain/ganancias/tests/importer.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El parser de ventas/compras ahora extrae tipo de comprobante, punto de venta, numero, razon social, CUIT de contraparte, IVA y total.
- El wizard conserva esos campos al importar y los envia dentro del payload de guardado.
- La persistencia relacional guarda comprobante, numero, nombre de cliente/proveedor, IVA y total en `SalesInvoice` y `PurchaseInvoice`.
- El CUIT de contraparte se conserva en `variablesSnapshot` porque el esquema actual no tiene columna propia en esas tablas.
- Al reabrir una DDJJ, la API devuelve nuevamente el CUIT de contraparte desde el snapshot y el resto del detalle desde las tablas relacionales.
- Se tiparon las capturas del importador y del endpoint tocado para no agregar deuda nueva de `any`.

Verificacion:

- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo inicialmente porque `variablesSnapshot` no incluia ventas/compras.
- TDD rojo confirmado: `taxReturnReadMapper.test.ts` fallo inicialmente porque `snapshotStringAt` no existia.
- `vitest run src/domain/ganancias/tests/importer.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnReadMapper.test.ts`: 3 archivos, 10 tests, todo OK.
- `vitest run`: 18 archivos, 53 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre importador, persistencia, mapper de lectura, endpoint `[id]` y tests nuevos: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa del componente (`setState` en efectos, `Date.now`, `any` antiguos y warnings), sin bloquear TypeScript ni build.
- `next build --webpack`: OK.

Pendiente:

- Evaluar migracion para agregar `counterpartyCuit` como columna propia en `SalesInvoice` y `PurchaseInvoice` si se necesitara filtrar/reportar por CUIT.
- Mejorar la grilla del wizard para mostrar comprobante/contraparte de forma visible y editable, no solo conservarlo internamente.

### 2026-05-31 - Fase 1, vigesimo octavo cambio: trazabilidad visible en grillas del wizard

Se hizo visible en las grillas de ventas y compras el detalle importado de comprobante y contraparte.

Riesgo mitigado:

- Conservar el detalle en base no alcanza si el usuario no puede reconocer rapidamente que renglones importo.
- La carga agil necesita control visual inmediato sin abrir pantallas auxiliares.
- La grilla no debe obligar a editar datos tecnicos, pero si debe mostrar la referencia auditable basica.

Archivos modificados:

- `src/domain/ganancias/presentation/invoiceTrace.ts`.
- `src/domain/ganancias/tests/invoiceTrace.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agrego `buildInvoiceTraceSummary` para armar una referencia legible con comprobante, contraparte, CUIT, IVA y total.
- La tabla de ventas muestra una columna `Comprobante / Contraparte`.
- La tabla de compras muestra una columna `Comprobante / Proveedor`.
- Las filas manuales se identifican como `Carga manual` y `Sin contraparte importada`, evitando confundir datos no importados con datos perdidos.
- Las grillas usan scroll horizontal si el ancho no alcanza, manteniendo usabilidad en pantallas chicas.

Verificacion:

- TDD rojo confirmado: `invoiceTrace.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/invoiceTrace.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run`: 19 archivos, 55 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevo: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa del componente (`setState` en efectos, `Date.now`, `any` antiguos y warnings).
- `next build --webpack`: OK.
- Verificacion HTTP local de `/declaraciones/crear/wizard`: OK, respondio `200`.
- Verificacion visual con Browser integrado: bloqueada por sandbox de Windows; fallback Playwright CLI no disponible porque no hay `npx` en el runtime.

Pendiente:

- Hacer una pasada visual manual o con navegador disponible para revisar densidad de columnas en desktop/mobile.
- Si la pantalla queda muy cargada, evaluar un modo compacto/expandible por fila para detalle del comprobante.

### 2026-06-01 - Fase 1, P3 primer corte: AXI estatico con coeficiente util de indices

Se corrigio el criterio de coeficiente para el ajuste por inflacion impositivo estatico.

Hallazgo contra Excel:

- En `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`, hoja `AXI.Estatico`, el coeficiente estatico surge de `IPC dic-2025 / IPC dic-2024 - 1`.
- El motor venia usando `IPC dic-2025 / IPC ene-2025 - 1`.
- Con los indices del archivo, la tasa correcta es `1.3154876051264572 - 1`; el criterio anterior daba aproximadamente `0.2870307375681953`.
- Para un capital computable inicial de `$1.000.000`, el AXI estatico correcto es `-315.488`, no `-287.031`.

Decision de arquitectura:

- No se agrego una migracion nueva para guardar coeficientes derivados.
- Se calcula on demand desde indices persistidos:
- `decPreviousToDecCurrent`: IPC diciembre anio actual / IPC diciembre anio anterior.
- `currentYearAverage`: IPC diciembre anio actual / promedio IPC mensual del anio actual.
- El importador de Excel ahora detecta diciembre del anio anterior y la importacion lo guarda como `UpdateIndex` del ejercicio anterior.

Archivos modificados:

- `src/domain/ganancias/mappers/parameterImporter.ts`.
- `src/domain/ganancias/mappers/taxParameterUsefulCoefficients.ts`.
- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/app/api/parametros/import/route.ts`.
- `src/app/api/parametros/route.ts`.
- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/tests/parameterImporter.test.ts`.
- `src/domain/ganancias/tests/taxParameterUsefulCoefficients.test.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/domain/ganancias/tests/axiInflationRate.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.

Resultado funcional:

- El parser de indices conserva los 12 IPC del anio fiscal y ademas expone diciembre del anio anterior.
- La importacion persiste diciembre del anio anterior como indice del ejercicio previo.
- `/api/parametros` devuelve `usefulCoefficients` derivados desde la base.
- El mapper pasa esos coeficientes al motor de calculo.
- `calculateTaxReturn` usa el coeficiente util para AXI estatico cuando esta disponible.
- `persistTaxReturnDetails` deriva los mismos coeficientes antes de calcular y guardar, evitando diferencia entre preview y calculo persistido.
- Se elimino deuda focal de `any` en `src/app/api/parametros/route.ts` al tocar la ruta.

Verificacion:

- TDD rojo confirmado: `axiInflationRate.test.ts` fallo inicialmente porque el AXI estatico daba `-287031` en vez de `-315488`.
- TDD rojo confirmado: `calculationInputMapper.test.ts` fallo inicialmente porque no preservaba `usefulCoefficients`.
- TDD rojo confirmado: `parameterImporter.test.ts` fallo inicialmente porque no exponia diciembre del anio anterior.
- TDD rojo confirmado: `taxParameterUsefulCoefficients.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/axiInflationRate.test.ts src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/parameterImporter.test.ts src/domain/ganancias/tests/taxParameterUsefulCoefficients.test.ts`: 4 archivos, 7 tests, todo OK.
- `vitest run src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/axiInflationRate.test.ts src/domain/ganancias/tests/taxParameterUsefulCoefficients.test.ts`: 3 archivos, 5 tests, todo OK.
- `vitest run`: 23 archivos, 69 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre calculo, mappers, persistencia y rutas de parametros: OK.
- `next build --webpack`: OK.

Pendiente:

- Mapear AXI dinamico contra planilla, especialmente movimientos que usan coeficiente promedio anual.
- Evaluar aviso visible cuando no existe diciembre del anio anterior y el sistema cae al fallback `dic/ene`.

### 2026-06-01 - Fase 1, P3 segundo corte: AXI dinamico con coeficiente promedio anual

Se alineo el AXI dinamico con las filas agregadas de la planilla.

Hallazgo contra Excel:

- En `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`, hoja `AXI.Dinamico`, la fila `Retiros de los socios` usa `D86/AVERAGE(D75:D86)`.
- La fila `Aportes y aumentos de capital historico` usa el mismo coeficiente promedio anual.
- El motor venia usando `IPC diciembre / IPC del mes de la fecha` para todos los movimientos.
- Por eso un retiro cargado al 31/12 daba coeficiente `1` y ajuste `0`, mientras la planilla da coeficiente `1.1288404539857682` y ajuste aproximado `$502.654` sobre `$3.901.371,69`.

Decision de arquitectura:

- Para `RetiroSocio` y `AporteCapital`, el motor usa `usefulCoefficients.currentYearAverage` cuando esta disponible.
- Para movimientos `Otro`, se conserva el criterio mensual por fecha.
- Si falta coeficiente promedio anual, el motor emite una advertencia visible en el wizard de cierre/calculo.
- La persistencia dejo de recalcular AXI dinamico con una formula duplicada y ahora reutiliza `calculateAxiDynamic`.

Archivos modificados:

- `src/domain/ganancias/calculations/ajustePorInflacion.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/axiDynamicAverageCoefficient.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.

Resultado funcional:

- AXI dinamico de retiros/aportes agregados replica el criterio de coeficiente promedio anual de la planilla.
- AXI dinamico de movimientos no agregados conserva coeficiente mensual.
- `AxiDynamicItem` guarda el mismo `coef` y `computedAxi` que calcula el motor.
- Al reabrir una DDJJ, la API devuelve coeficiente, factor y ajuste calculado.
- El wizard muestra columnas read-only `Coef.` y `Ajuste` para controlar la carga guardada.
- La grilla AXI ahora soporta scroll horizontal para no romper pantallas chicas.

Verificacion:

- TDD rojo confirmado: `axiDynamicAverageCoefficient.test.ts` fallo inicialmente porque un retiro al 31/12 usaba coeficiente `1`.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo inicialmente porque `AxiDynamicItem` se guardaba con `coef = 1`.
- TDD rojo confirmado: `taxReturnReadMapper.test.ts` fallo inicialmente porque no existia un mapper que conservara `coef`, `factor` y `computedAxi`.
- `vitest run src/domain/ganancias/tests/axiDynamicAverageCoefficient.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnReadMapper.test.ts`: 3 archivos, 12 tests, todo OK.
- `vitest run`: 24 archivos, 73 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre calculo AXI, determinacion, persistencia, mapper de lectura, endpoint `[id]`, wizard y tests nuevos: OK.

Cierre P3:

- P3 queda resuelto: AXI estatico/dinamico esta alineado con los coeficientes utiles de la planilla y los coeficientes usados quedan auditables.
- Siguiente prioridad: P4 patrimonio y justificacion patrimonial.

### 2026-06-01 - Fase 1, P4 primer corte: JVP unificada en la liquidacion principal

Se inicio el frente de patrimonio y justificacion patrimonial.

Hallazgo:

- Existia `calculatePatrimonialJustification` como funcion pura de dominio.
- `calculateTaxReturn` no la usaba; tenia una implementacion paralela mas simple para patrimonio, columnas y consumo.
- Esa duplicacion hacia que algunas advertencias de auditoria patrimonial, como consumo nulo, no llegaran al wizard aunque la funcion JVP las contemplaba.

Decision de arquitectura:

- `calculateTaxReturn` ahora delega la JVP en `calculatePatrimonialJustification`.
- Para no cambiar la semantica de totales existentes, se arman componentes patrimoniales equivalentes:
- Activos personales cargados por el usuario.
- Cuentas bancarias convertidas a pesos con tipo de cambio inicial/final.
- Patrimonio comercial calculado desde AXI estatico, resultado comercial y retiros/aportes.
- Pasivos personales cargados por el usuario.

Archivos modificados:

- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- La liquidacion principal usa una sola funcion auditable para JVP.
- Se mantienen `patrimonioInicioTotal`, `patrimonioCierreTotal` y `consumoDiferencial` como campos publicos del resultado.
- Las advertencias de JVP se propagan a `warnings`, por lo que el wizard puede alertar consumos nulos o negativos.

Verificacion:

- TDD rojo confirmado: `jvpIntegration.test.ts` fallo inicialmente porque `calculateTaxReturn` no propagaba `Consumo Nulo`.
- `vitest run src/domain/ganancias/tests/jvpIntegration.test.ts src/domain/ganancias/tests/golden.test.ts src/domain/ganancias/tests/deduccionesGenerales.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts`: 4 archivos, 12 tests, todo OK.
- `vitest run`: 25 archivos, 74 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre determinacion, JVP y test nuevo: OK.
- `next build --webpack`: OK.

Pendiente:

- Persistir/reabrir `otherJustifications`, que hoy el mapper deja vacio.
- Agregar UI agil para otros conceptos de columna I/II y mapearlos contra `JVP`.

### 2026-06-01 - Fase 1, P4 segundo corte: persistencia y reapertura de otras justificaciones JVP

Se activo el circuito backend de `otherJustifications` para que las justificaciones patrimoniales cargadas queden guardadas en base y reaparezcan al abrir la DDJJ.

Hallazgo:

- El modelo Prisma `PatrimonialJustification` ya existia y estaba relacionado con `TaxReturn`.
- El mapper de entrada dejaba `otherJustifications` vacio, por lo que el motor JVP no recibia conceptos manuales de columna I/II.
- La persistencia no borraba ni recreaba la tabla `PatrimonialJustification`.
- La API de reapertura no incluia `justifications`, por lo que aun guardando la tabla esos datos no volvian al wizard.

Decision de arquitectura:

- Mantener `PatrimonialJustification` como tabla auditora de conceptos JVP.
- Normalizar la columna a `1` o `2` en mapper/persistencia para evitar valores ambiguos.
- Conservar el payload original en `variablesSnapshot` para preservar la carga textual del usuario.
- Reabrir desde la relacion persistida y usar el snapshot como fallback para declaraciones guardadas antes del cambio.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `buildTaxReturnCalculationInput` entrega `otherJustifications` al motor JVP.
- `persistTaxReturnDetails` borra/recrea `PatrimonialJustification` por DDJJ y guarda concepto, columna e importe.
- `CalculationRun.variablesSnapshot` conserva `otherJustifications`.
- `GET /api/declaraciones/[id]` devuelve `otherJustifications` al wizard desde la base o desde snapshot como compatibilidad.

Verificacion:

- TDD rojo confirmado: `calculationInputMapper.test.ts` fallo inicialmente porque `otherJustifications[0]` era `undefined`.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo inicialmente porque no se creaba `PatrimonialJustification`.
- TDD rojo confirmado: `taxReturnReadMapper.test.ts` fallo inicialmente porque no existia `mapPatrimonialJustificationForWizard`.
- `vitest run src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnReadMapper.test.ts`: 3 archivos, 16 tests, todo OK.
- `tsc --noEmit`: OK.
- `vitest run`: 25 archivos, 76 tests, todo OK.
- `eslint` focalizado sobre mapper, persistencia, mapper de lectura, endpoint `[id]` y tests modificados: OK.
- `next build --webpack`: OK.

Pendiente:

- Agregar UI agil para cargar otras justificaciones JVP desde el wizard.
- Validar el reflejo contra filas relevantes de hoja `JVP` y definir rubros sugeridos para columna I/II.

### 2026-06-01 - Fase 1, P4 tercer corte: UI agil para otras justificaciones JVP

Se agrego carga manual de otras justificaciones patrimoniales en el Paso 4 del wizard.

Objetivo:

- Que un estudio chico pueda cargar conceptos JVP adicionales sin depender de campos genericos ocultos.
- Mantener la carga simple: concepto, columna e importe.
- Evitar automatismos opacos; la columna se elige explicitamente como I o II.

Decision de UX:

- Ubicar la grilla en Paso 4, junto a activos, bancos y pasivos personales, porque forma parte de la justificacion patrimonial.
- Mostrar totales por columna para que el contador vea rapidamente el efecto de la carga.
- Usar una fila por defecto con columna II e importe cero, pensando en conceptos que justifican recursos o PN inicial.
- Mantener los datos dentro del mismo payload usado por autosave, guardado, localStorage y preview.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- El wizard permite agregar, editar y eliminar `otherJustifications`.
- Cada fila guarda `concept`, `column` e `amount`.
- `column` se normaliza a `1` o `2` para evitar valores ambiguos.
- La informacion participa del calculo local/backend porque se incluye en `calculationData`.
- La informacion se conserva en autosave, guardado manual y reapertura desde localStorage/API.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque no existia `coerceWizardOtherJustificationColumn`.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 5 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre wizard, tipos de estado y test nuevo: OK.
- `next build --webpack`: OK.

Limitacion de entorno:

- No se pudo completar inspeccion visual automatizada: `node_repl` fallo al lanzar Chromium por sandbox y no hay `npx` disponible para usar el wrapper local de Playwright.
- Se deja pendiente una recorrida visual manual/automatizada del Paso 4 cuando el entorno Browser/Chrome este disponible.

Pendiente:

- Validar rubros y comportamiento contra filas relevantes de hoja `JVP`.
- Mapear creditos/pasivos personales contra hojas auxiliares `Creditos`, `Pasivo` y `Banco`.

### 2026-06-01 - Fase 1, P4 cuarto corte: resultado JVP alineado con IG 25!F38

Se contrasto la hoja `JVP` contra la planilla base y se corrigio la fuente del resultado del periodo usado para justificar recursos.

Hallazgo en Excel:

- `JVP!D14` referencia `IG 25!F38`.
- `IG 25!F38` es `Resultado Neto`, calculado como resultado impositivo antes de quebrantos menos quebrantos anteriores.
- La app estaba pasando `resultadoComercialNeto` a la funcion JVP.

Decision contable:

- Usar `resultadoImpositivoNeto` en JVP porque es el equivalente funcional de `IG 25!F38`.
- Mantener el patrimonio comercial de cierre calculado desde resultado comercial, porque representa la variacion patrimonial de la explotacion.
- Documentar que, cuando las deducciones generales reducen el resultado impositivo sin reflejo patrimonial, el consumo puede volverse negativo igual que en la estructura de la planilla si no se carga el concepto compensatorio correspondiente.

Archivos modificados:

- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `calculateTaxReturn` envia `resultadoImpositivoNet` a `calculatePatrimonialJustification`.
- La JVP queda mas cerca de la hoja Excel para la fila `Resultado impositivo de periodo (beneficio)`.

Verificacion:

- TDD rojo confirmado: `jvpIntegration.test.ts` fallo inicialmente porque el consumo seguia en `0` al usar resultado comercial.
- `vitest run src/domain/ganancias/tests/jvpIntegration.test.ts`: 1 archivo, 2 tests, todo OK.

Pendiente:

- Completar mapeo fino de filas `JVP!C8`, `JVP!D13` y auxiliares para conceptos que no surgen automaticamente.
- Revisar si conviene agregar presets de conceptos frecuentes para columna I/II sin automatizar la decision contable.

Nota de continuidad:

- Se creo `docs/MAPEO_JVP_EXCEL.md` con el mapa de hojas, formulas y brechas detectadas contra la planilla base.

### 2026-06-01 - Fase 1, P4 quinto corte: presets rapidos para JVP

Se agregaron presets de carga para conceptos habituales de otras justificaciones patrimoniales.

Objetivo de carga:

- Reducir tipeo repetitivo en un estudio chico.
- No esconder criterio contable: cada preset muestra la columna sugerida antes de cargar.
- Mantener editable concepto, columna e importe despues de insertar la fila.

Presets iniciales:

- Herencia / donacion: columna II.
- Gasto no deducible: columna I.
- Ganancia exenta: columna II.
- Amortizacion 3ra: columna II.
- AXI positivo: columna I.
- AXI negativo: columna II.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque no existia `buildWizardOtherJustificationFromPreset`.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 6 tests, todo OK.
- `tsc --noEmit`: OK.

Pendiente:

- Ajustar o ampliar presets luego de validar casos reales contra `JVP`.

### 2026-06-01 - Fase 1, P4 sexto corte: totales JVP auditables

Se expusieron los totales de columna I, columna II y cuadre JVP desde el motor hacia las capas de presentacion.

Problema:

- `calculatePatrimonialJustification` ya calculaba `totalColumnaI`, `totalColumnaII` y `justificationDiff`.
- `calculateTaxReturn` solo devolvia patrimonio inicio/cierre y consumo.
- La persistencia guardaba `justificationDiff` como `0` fijo.
- La UI y el exportador no podian mostrar el cuadre real del papel de trabajo.

Decision:

- Agregar al resultado principal `jvpTotalColumnaI`, `jvpTotalColumnaII` y `jvpJustificationDiff`.
- Serializar/hidratar esos campos en preview backend/local.
- Persistir `jvpJustificationDiff` calculado.
- Mostrar totales de columnas y cuadre en el panel de auditoria del Paso 6.
- Usar esos totales en el exportador de Excel cuando esten disponibles.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/exports/excelGenerator.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `jvpIntegration.test.ts` y `taxReturnPreview.test.ts` fallaron inicialmente porque los campos no existian.
- `vitest run src/domain/ganancias/tests/jvpIntegration.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts`: 2 archivos, 10 tests, todo OK.

Pendiente:

- Validar visualmente el panel de auditoria cuando el entorno Browser/Chrome vuelva a estar disponible.

### 2026-06-02 - Fase 1, P5 primer corte: mapeo de deducciones generales

Se inicio P5 con una tabla rubro por rubro contra `IG 25` y `Ded. Gen.`.

Hallazgo:

- La app cubre los rubros agregados que alimentan `IG 25!F20:F31`.
- Existen tests sobre locador/locatario, topes encadenados de prepagas, honorarios medicos y donaciones.
- La brecha principal no es formula agregada sino trazabilidad documental: la hoja `Ded. Gen.` conserva fecha, comprobante, numero, concepto y total por rubro.

Decision de continuidad:

- Crear `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- Mantener por ahora la carga agregada por rubro como opcion mas agil para estudio chico.
- Dejar pendiente decidir si la app sera tambien repositorio documental comprobante por comprobante.

Archivo nuevo:

- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.

Archivos modificados:

- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Pendiente:

- Resolver decision de detalle documental.
- Confirmar fuente anual del tope parametrico de gastos educativos.

### 2026-06-02 - Fase 1, P5 segundo corte: excedentes no admitidos a JVP

Se corrigio la trazabilidad de los excedentes de deducciones generales que la planilla muestra en la columna JVP de `IG 25`.

Hallazgo:

- `IG 25!E32 = SUM(E20:E31)`.
- Esos importes representan excedentes no admitidos por topes, relevantes para la justificacion patrimonial.
- La app computaba solo lo admitido en `F20:F31` y no exponia ni trasladaba los excedentes a JVP.

Decision:

- Calcular `totalExcedenteDeduccionesGeneralesJvp`.
- Incluir ese total en `GeneralDeductionsOutput`.
- Sumarlo a JVP columna I sin modificar `gastosNoDeducibles` comercial.
- Mostrar un aviso visible en el wizard cuando exista excedente.
- Incluir fila especifica en el exportador Excel: `Excedente deducciones generales no admitido`.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/exports/excelGenerator.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/tests/deduccionesGenerales.test.ts`.
- `src/domain/ganancias/tests/deductionsBreakdown.test.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `deduccionesGenerales.test.ts` fallo inicialmente porque `totalExcedenteDeduccionesGeneralesJvp` no existia.
- `vitest run src/domain/ganancias/tests/deduccionesGenerales.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts src/domain/ganancias/tests/deductionsBreakdown.test.ts`: 3 archivos, 13 tests, todo OK.
- `tsc --noEmit`: OK.
- `vitest run`: 25 archivos, 80 tests, todo OK.
- `eslint` focalizado sobre motor, preview, exportador, wizard y tests tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Resolver decision de detalle documental por comprobante para deducciones generales.

### 2026-06-02 - Fase 1, P4 septimo corte: JVP no se pierde en alta inicial

Se corrigio una brecha chica pero sensible de persistencia para la carga JVP.

Hallazgo:

- `persistTaxReturnDetails` ya guardaba `otherJustifications` en relacion y snapshot cuando el flujo entraba por persistencia detallada.
- El alta inicial decide si usa persistencia detallada con `hasDetailedTaxReturnPayload`.
- `otherJustifications` no estaba incluido en ese detector ni en `buildInitialTaxReturnSnapshot`.
- Si una DDJJ se creaba solo con datos JVP y sin otras estructuras operativas, esa informacion podia no quedar en la base.

Decision:

- Tratar `otherJustifications` como carga operativa detallada.
- Incluir `otherJustifications` en el snapshot inicial para conservar compatibilidad con altas minimas y estados intermedios.
- No crear una tabla nueva en este corte, porque ya existe `PatrimonialJustification` para el caso persistido completo.

Archivos modificados:

- `src/domain/ganancias/persistence/taxReturnPayload.ts`.
- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/tests/taxReturnPayload.test.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `taxReturnPayload.test.ts` devolvia `false` para una carga con solo `otherJustifications`.
- TDD rojo confirmado: `taxReturnSnapshot.test.ts` no encontraba `snapshot.otherJustifications`.
- `vitest run src/domain/ganancias/tests/taxReturnPayload.test.ts src/domain/ganancias/tests/taxReturnSnapshot.test.ts`: 2 archivos, 6 tests, todo OK.
- `vitest run`: 25 archivos, 82 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre payload, snapshot y tests: OK.
- `next build --webpack`: OK.

Pendiente:

- Seguir con mapeo fino de creditos/pasivos y filas JVP.
- Resolver decision de detalle documental por comprobante para deducciones generales.

### 2026-06-02 - Fase 1, P4 octavo corte: auxiliares ESP preservados en backend

Se avanzo sobre la brecha de hojas auxiliares `Efectivo`, `Creditos` y `Pasivo`.

Hallazgo:

- El dominio y Prisma ya contemplaban `cashHoldings`, `receivables` y `liabilities`.
- `calculationInputMapper` los descartaba y devolvia arrays vacios.
- El alta inicial no los detectaba como carga operativa ni los copiaba al snapshot.
- `persistTaxReturnDetails` no los pasaba al motor ni los guardaba en tablas.
- La reapertura de DDJJ no los devolvia desde la API.

Decision:

- Mapear `cashHoldings`, `receivables` y `liabilities` desde payload al input del motor.
- Considerarlos carga operativa detallada para activar persistencia.
- Guardarlos en `variablesSnapshot` y en tablas relacionales si estan presentes.
- Devolverlos al reabrir la DDJJ desde `GET /api/declaraciones/[id]`.
- Dejar UI/importador como siguiente corte, para no agrandar el wizard sin una decision de carga.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/persistence/taxReturnPayload.ts`.
- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/domain/ganancias/tests/taxReturnPayload.test.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `calculationInputMapper.test.ts` fallaba porque `cashHoldings[0]` era `undefined`.
- TDD rojo confirmado: `taxReturnPayload.test.ts` no detectaba efectivo/creditos/pasivos como carga operativa.
- TDD rojo confirmado: `taxReturnSnapshot.test.ts` no conservaba esos arrays.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` no llamaba a `cashHolding.createMany`.
- `vitest run src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/taxReturnPayload.test.ts src/domain/ganancias/tests/taxReturnSnapshot.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 4 archivos, 17 tests, todo OK.
- `vitest run`: 25 archivos, 84 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre mapper, persistencia, endpoint y tests tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Definir UI/importador para cargar `Efectivo`, `Creditos` y `Pasivo` sin sobrecargar la pantalla.
- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

### 2026-06-02 - Fase 1, P4 noveno corte: UI colapsable para auxiliares ESP

Se agrego carga visible en el wizard para los auxiliares ESP preparados en backend.

Hallazgo:

- El Paso 4 ya tenia bancos, bienes personales, pasivos personales y otras justificaciones JVP.
- Los nuevos arrays `cashHoldings`, `receivables` y `liabilities` se preservaban en backend, pero no habia forma agil de cargarlos desde la pantalla.
- Integrarlos automaticamente al patrimonio comercial agregado todavia puede generar doble computo si no se define la regla exacta contra `ESP`, AXI y JVP.

Decision:

- Agregar una seccion colapsable "Auxiliares ESP" en Paso 4.
- Incluir mini-grillas para efectivo, creditos y pasivos comerciales.
- Mostrar totales auxiliares de activo y patrimonio neto inicio/cierre como control operativo.
- Incluir aviso visible: esos saldos se guardan y reabren, pero no automatizan todavia `activoTotalInicio`/`pasivoTotalInicio`.
- Conectar estado, localStorage, preview payload, guardado y reapertura.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `buildDefaultWizardCashHolding` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 7 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre wizard, tipos y test: OK.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnPayload.test.ts src/domain/ganancias/tests/taxReturnSnapshot.test.ts`: 5 archivos, 24 tests, todo OK.
- `vitest run`: 25 archivos, 85 tests, todo OK.
- `next build --webpack`: OK.
- Validacion visual automatizada: bloqueada por entorno (`node_repl kernel exited unexpectedly`, `windows sandbox failed: spawn setup refresh`).

Pendiente:

- Definir regla de integracion automatica contra `activoTotalInicio` y `pasivoTotalInicio` sin doble computo.
- Validar visualmente el Paso 4 cuando Browser/Chrome local este disponible.
- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

### 2026-06-02 - Fase 1, P5 tercer corte: tope educativo derivado desde MNI

Se resolvio la decision abierta sobre gastos educativos contra la planilla base.

Hallazgo:

- `IG 25!D26 = E41 * 0.4`.
- La app ya tenia `topeGastosEducativos` como parametro editable/importado.
- Si el archivo de parametros trae MNI pero no trae el tope educativo explicito, el importador caia al default fijo 2025.

Decision:

- Mantener `topeGastosEducativos` como campo parametrico para permitir override auditable.
- Derivar el tope como `minimoNoImponible * 0.4` cuando el workbook no trae tope educativo explicito.
- No sumar gastos educativos a excedentes JVP, porque en la planilla `IG 25!E26` esta fijo en `0`.

Archivos modificados:

- `src/domain/ganancias/mappers/parameterImporter.ts`.
- `src/domain/ganancias/tests/parameterImporter.test.ts`.
- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `parameterImporter.test.ts` fallo porque el importador devolvia `1803002.21` en lugar de `400000` cuando el workbook solo traia MNI `1000000`.
- `vitest run src/domain/ganancias/tests/parameterImporter.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run`: 25 archivos, 81 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre importador y test: OK.
- `next build --webpack`: OK.

Pendiente:

- Resolver decision de detalle documental por comprobante para deducciones generales.

### 2026-06-02 - Fase 1, P4 decimo corte: reconciliacion explicita ESP contra agregado

Se resolvio el pendiente de integracion entre auxiliares ESP y patrimonio comercial agregado sin introducir automatismos riesgosos.

Hallazgo:

- El Paso 4 ya cargaba efectivo, creditos y pasivos comerciales, pero el calculo de totales estaba inline en la pantalla.
- Automatizar esos saldos contra `activoTotalInicio` y `pasivoTotalInicio` puede duplicar rubros cuando el agregado incluye bienes de cambio, bienes de uso u otros conceptos no detallados en auxiliares.
- El criterio de trabajo del estudio prioriza agilidad y trazabilidad: sugerir y controlar, no reemplazar el juicio profesional.

Decision:

- Extraer el resumen ESP a `buildWizardEspAuxiliarySummary`, testeado en la capa de presentacion.
- Calcular activos, pasivos y patrimonio neto auxiliar de inicio/cierre.
- Detectar diferencias contra `activoTotalInicio` / `pasivoTotalInicio`.
- Mostrar advertencia operativa solo si hay diferencia.
- Permitir copiar activo inicial auxiliar y pasivo inicial auxiliar al agregado mediante botones explicitos.
- Mantener la decision de no impactar automaticamente AXI/JVP para evitar doble computo silencioso.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `buildWizardEspAuxiliarySummary` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 8 tests, todo OK.
- `eslint` focalizado sobre wizard, tipos y test: OK.
- `vitest run`: 25 archivos, 86 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- Validacion visual automatizada: bloqueada por entorno. Browser integrado fallo con `node_repl kernel exited unexpectedly` / `windows sandbox failed: spawn setup refresh`.
- Smoke HTTP local: no concluyente. Next arranco como job temporal en `127.0.0.1:3010`, pero el job no quedo disponible para conectar desde el siguiente proceso de verificacion.

Pendiente:

- Validar visualmente el Paso 4 cuando Browser/Chrome local este disponible.
- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

### 2026-06-02 - Fase 1, P5 cuarto corte: decision documental de deducciones generales

Se cerro la decision pendiente sobre detalle comprobante por comprobante en deducciones generales.

Hallazgo:

- La app ya cubre los rubros agregados que impactan `IG 25!F20:F31`.
- La hoja `Ded. Gen.` conserva detalle por fecha/comprobante/concepto, pero cargarlo completo volveria mas lenta la operatoria de un estudio chico si la app no pretende ser repositorio documental.
- El usuario pidio agilidad y automatizacion sin magia; por eso la carga agregada por rubro es adecuada como MVP de liquidacion.

Decision:

- Mantener deducciones generales como importes agregados por rubro.
- No crear tabla `GeneralDeductionItem` en este corte.
- Mostrar en Paso 5 un aviso visible: la app liquida por rubro y no reemplaza respaldo documental comprobante por comprobante.
- Dejar el detalle documental como mejora futura solo si el estudio decide que la app tambien debe ser repositorio de auditoria.

Archivos modificados:

- `src/domain/ganancias/presentation/deductionsBreakdown.ts`.
- `src/domain/ganancias/tests/deductionsBreakdown.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `deductionsBreakdown.test.ts` fallo porque `getGeneralDeductionsDocumentationNotice` no existia.
- `vitest run src/domain/ganancias/tests/deductionsBreakdown.test.ts`: 1 archivo, 3 tests, todo OK.
- `eslint` focalizado sobre wizard, helper y test: OK.
- `vitest run`: 25 archivos, 87 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- Nota de verificacion: un primer `tsc --noEmit` fallo al correr en paralelo con `next build` porque `.next/types` estaba siendo regenerado; reejecutado aislado despues del build quedo OK.

Pendiente:

- Validacion visual sigue bloqueada por el entorno del navegador integrado.

### 2026-06-02 - Fase 1, P4 undecimo corte: referencias Excel en presets JVP

Se cerro el pendiente tecnico de validar rubros frecuentes de `otherJustifications` contra filas relevantes de hoja `JVP`.

Hallazgo:

- `docs/MAPEO_JVP_EXCEL.md` ya documentaba las filas troncales `JVP!C8`, `JVP!D9`, `JVP!D11` y `JVP!D13`.
- El wizard tenia presets rapidos por concepto y columna, pero no mostraba la referencia Excel.
- Sin esa referencia, la carga era rapida pero menos auditable para revisar por que un concepto entra por columna I o II.

Decision:

- Agregar `reference` al catalogo `WIZARD_OTHER_JUSTIFICATION_PRESETS`.
- Mostrar la referencia Excel en el boton del preset y en el tooltip.
- Mantener el calculo sin cambios: la referencia guia la carga, no modifica importes ni columnas.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque el preset `herenciaDonacion` no tenia referencia `JVP!D11`.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 8 tests, todo OK.
- `eslint` focalizado sobre wizard, tipos y test: OK.
- `vitest run`: 25 archivos, 88 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.
- Validacion visual sigue bloqueada por el entorno del navegador integrado.

### 2026-06-02 - Cierre tecnico MVP

Se deja documentado el cierre tecnico del MVP funcional.

Decision:

- Considerar P0 a P6 cerrados como desarrollo tecnico del MVP.
- Separar pendientes externos de validacion real/visual de los pendientes de desarrollo.
- Crear `docs/ESTADO_FINAL_DESARROLLO.md` como resumen ejecutivo para retomar sin reconstruir todo el historial.

Estado:

- Desarrollo tecnico implementado: 100%.
- Preparacion para uso piloto: 95%, sujeto a prueba con DDJJ real o fixture realista.
- Validacion visual automatizada: bloqueada por entorno Browser/Windows.

Pendiente externo:

- Probar con una DDJJ real ya resuelta en Excel.
- Validar visualmente wizard cuando el navegador integrado o Chrome local este disponible.

### 2026-06-02 - Fase 1, P6 primer corte: retenciones importadas auditables

Se cerro la brecha remanente de auditoria importada para Mis Retenciones.

Hallazgo:

- El schema `TaxWithholding` ya tenia campos para CUIT/agente, regimen, certificado, fecha y operacion.
- El importador leia Mis Retenciones pero reducia cada fila a `taxCode` e `amount`.
- La persistencia guardaba valores genericos (`Agente Retencion`, `00000000`), perdiendo datos utiles para revision.
- Ventas/compras ya preservan `counterpartyCuit` en `variablesSnapshot` y lo devuelven desde reapertura, aunque no esta migrado a columnas propias.

Decision:

- Preservar detalle de retenciones en el importador: CUIT/agente, descripcion de impuesto, regimen, fecha, certificado y operacion.
- Guardar esos campos en `TaxWithholding` y devolverlos al reabrir.
- Mostrar columnas compactas de auditoria en Paso 5 para revisar agente/certificado y fecha/regimen.
- Mantener `counterpartyCuit` de ventas/compras en snapshot documentado por ahora; migrar a columnas solo si el estudio necesita consultas/reportes DB por CUIT.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/mappers/afipImporter.ts`.
- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/tests/importer.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `importer.test.ts` fallo porque `cuitAgent` era `undefined`.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo porque persistencia seguia usando agente/certificado genericos.
- `vitest run src/domain/ganancias/tests/importer.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 2 archivos, 11 tests, todo OK.
- `eslint` focalizado sobre importador, mapper, persistencia, wizard, endpoint y tests: OK.
- `vitest run`: 25 archivos, 88 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- Nota de verificacion: un primer `tsc --noEmit` fallo al correr en paralelo con `next build` porque `.next/types` estaba siendo regenerado; reejecutado aislado despues del build quedo OK.

Pendiente:

- Validacion visual sigue bloqueada por el entorno del navegador integrado.

### 2026-06-02 - Fase 1, P8: preparacion de prueba piloto reproducible

Se preparo el puente operativo entre el cierre tecnico del MVP y la prueba manual/real del estudio.

Hallazgo:

- El desarrollo tecnico estaba cerrado, pero el siguiente paso practico necesitaba una guia concreta.
- Sin fixture ni checklist, cada retomada obligaba a reconstruir datos de prueba y aumentaba el riesgo de dejar frentes abiertos.
- El usuario remarco que la declaracion y la informacion cargada deben quedar en base de datos; por eso el caso piloto no podia limitarse a calcular, tambien debia verificar persistencia critica.

Decision:

- Crear un fixture piloto realista con importes como strings, igual que llegan desde formularios/importadores.
- Cubrir calculo end-to-end con el mapper y el motor real.
- Cubrir persistencia critica con mocks de tablas/snapshot: ventas, compras, efectivo, creditos, pasivos, retenciones, otras justificaciones JVP y calculationRun.
- Documentar un recorrido manual para poder empezar a probar sin depender de memoria.

Archivos modificados:

- `src/domain/ganancias/fixtures/pilotTaxReturnFixture.ts`.
- `src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts`.
- `docs/GUIA_PRUEBA_PILOTO.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/ESTADO_FINAL_DESARROLLO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `pilotTaxReturnFixture.test.ts` fallo porque `buildPilotTaxReturnFixture` no existia.
- TDD rojo confirmado: el fixture tenia 3 indices y la prueba exigio 12 indices mensuales.
- `vitest run src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run`: 26 archivos, 90 tests, todo OK.
- `eslint` focalizado sobre fixture y test piloto: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK.

Pendiente externo:

- Ejecutar `docs/GUIA_PRUEBA_PILOTO.md` manualmente en navegador.
- Comparar una DDJJ real ya resuelta contra Excel y registrar diferencias si aparecen.

### 2026-06-02 - Fase 1, P9: carga multiarchivo AFIP mensual

Se ajusto la importacion para que ventas y compras puedan cargarse con los archivos mensuales tal cual se descargan de AFIP.

Hallazgo:

- El parser fiscal ya soportaba los formatos reales/truncados de AFIP, pero trabajaba archivo por archivo.
- `/api/import` recibia solo `file`.
- El wizard usaba `event.target.files?.[0]`, por lo que aunque el navegador permitiera seleccionar varios, se procesaba solo el primero.
- Esto obligaba al usuario a consolidar manualmente 12 archivos mensuales, justo lo que se quiere evitar por eficiencia y riesgo de error.

Decision:

- Crear `parseAfipExportFiles` como agregador puro sobre el parser existente.
- Mantener compatibilidad con la carga anterior de un solo archivo.
- Enviar desde el wizard todos los archivos seleccionados como `files`.
- Agregar `expectedType` para que la API rechace mezclas de ventas/compras/retenciones en una carga equivocada.
- Permitir multiples archivos tambien en retenciones porque usa el mismo mecanismo y no agrega complejidad.

Archivos modificados:

- `src/domain/ganancias/mappers/afipImporter.ts`.
- `src/domain/ganancias/tests/importer.test.ts`.
- `src/app/api/import/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/GUIA_PRUEBA_PILOTO.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/ESTADO_FINAL_DESARROLLO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `importer.test.ts` fallo porque `parseAfipExportFiles` no existia.
- `vitest run src/domain/ganancias/tests/importer.test.ts`: 1 archivo, 6 tests, todo OK.
- `vitest run`: 26 archivos, 92 tests, todo OK.
- `eslint` focalizado sobre importador, test, endpoint y wizard: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK.

Pendiente externo:

- Probar en navegador con los 12 archivos reales de ventas y los 12 archivos reales de compras descargados de AFIP.
- Confirmar que los totales compilados coinciden con el portal/Excel de control.

### 2026-06-02 - Fase 1, P10: verificaciones por pantalla y duplicados

Se agregaron controles operativos para que la carga multiarchivo sea segura en uso real.

Hallazgo:

- La carga multiarchivo resolvia el problema de consolidar manualmente 12 meses.
- Faltaba evitar un riesgo nuevo: subir dos veces el mismo mes o repetir comprobantes.
- Tambien faltaba feedback visible por lote para saber cuantos archivos/registros entraron y cuantos se omitieron.

Decision:

- Detectar duplicados importados en el wizard antes de incorporar filas al estado.
- Ventas/compras usan comprobante, CUIT contraparte, fecha e importe como clave detectable.
- Retenciones usan certificado, CUIT agente, fecha e importe.
- Si una fila no tiene comprobante/certificado suficiente, no se bloquea automaticamente para no perder informacion; queda visible para revision manual.
- Mostrar resumen en pantalla con archivos procesados, registros leidos, registros incorporados, duplicados omitidos y advertencias.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/GUIA_PRUEBA_PILOTO.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/ESTADO_FINAL_DESARROLLO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `splitWizardImportDuplicates` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 11 tests, todo OK.
- `vitest run`: 26 archivos, 95 tests, todo OK.
- `eslint` focalizado sobre wizard, helper y test: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK.

Pendiente externo:

- Validar visualmente con archivos reales que el resumen sea claro.
- Probar repetir una importacion mensual y confirmar que los duplicados se omiten sin duplicar totales.

### 2026-06-06 - Fase 1, P11: auditoria de consistencia contra guia/capturas y duplicaciones de calculo

Se realizo una auditoria puntual sobre los cambios posteriores del proyecto, tomando como referencia la guia PDF aportada por el usuario y las capturas nuevas de Excel.

Hallazgos:

- La guia PDF describe un escenario anterior con ventas por `72.117.989,49`, CMV `64.760.935,00`, amortizacion `203.500,00` y AXI `-429.715,06`.
- Las capturas nuevas del 06/06/2026 describen otro escenario, con ventas `55.188.790,74`, compras CMV `55.516.958,16`, EI `155.496,41`, EF `7.856.322,00`, CMV `47.816.132,57`, utilidad neta `5.449.883,07`, AXI `-225.273,03`, resultado impositivo `5.224.610,04`, patrimonio inicial `-4.520.316,58`, patrimonio cierre `-7.150.516,11` y consumo `10.031.052,72`.
- El test `simulacionUsuario.test.ts` estaba nombrado como si validara capturas actuales, pero contenia datos del escenario anterior.
- El motor descontaba la perdida por baja de bienes de uso, pero el patrimonio comercial de cierre todavia podia conservar ese mismo bien como activo, duplicando economicamente el efecto.
- El wizard calculaba el capital afectado real de cierre con una formula propia que omitía bienes de uso activos.
- El CMV en vivo del wizard usaba todas las compras, no solo las imputables a costo.
- `papel-de-trabajo` e `informe-cliente` mostraban gastos comerciales sumando todas las compras deducibles, incluyendo mercaderia/materia prima ya incluida en CMV.
- `informe-cliente` armaba manualmente el input del motor e ignoraba auxiliares ESP/JVP como efectivo, creditos, pasivos, pasivos personales, justificaciones, AXI dinamico y bajas.
- `papel-de-trabajo` duplicaba calculos de amortizacion/baja en UI.

Decision:

- Mantener la guia PDF como referencia del escenario anterior y crear una prueba separada para las capturas nuevas.
- Extraer helpers de dominio/presentacion para evitar formulas repetidas:
  - `calculateClosingCommercialPatrimony`.
  - `buildFixedAssetDepreciationForPresentation`.
  - `sumDeductibleCostPurchases` / `sumDeductibleNonCostPurchases`.
- Hacer que wizard, papel de trabajo e informe cliente usen los mismos criterios del motor/mapper donde corresponde.
- No tocar vinculacion de base de datos ni ejecutar migraciones, por pedido explicito del usuario.

Archivos modificados/agregados:

- `src/domain/ganancias/tests/simulacionUsuario.test.ts`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `src/domain/ganancias/tests/fixedAssetPresentation.test.ts`.
- `src/domain/ganancias/tests/patrimonioComercial.test.ts`.
- `src/domain/ganancias/tests/purchaseBreakdown.test.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/calculations/patrimonioComercial.ts`.
- `src/domain/ganancias/presentation/fixedAssetPresentation.ts`.
- `src/domain/ganancias/presentation/purchaseBreakdown.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.
- `src/app/declaraciones/[id]/informe-cliente/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `fixedAssetPresentation.test.ts` fallo porque el helper no existia.
- TDD rojo confirmado: `patrimonioComercial.test.ts` fallo porque el helper no existia.
- TDD rojo confirmado: `purchaseBreakdown.test.ts` fallo porque el helper no existia.
- TDD rojo confirmado: `jvpIntegration.test.ts` expuso que un bien dado de baja seguia integrando patrimonio de cierre.
- TDD rojo confirmado: `simulacionUsuario.test.ts` expuso diferencia de coeficiente AXI hasta ajustar el coeficiente exacto de captura.
- `vitest run src/domain/ganancias/tests/fixedAssetPresentation.test.ts src/domain/ganancias/tests/simulacionUsuario.test.ts src/domain/ganancias/tests/jvpIntegration.test.ts src/domain/ganancias/tests/amortizaciones.test.ts`: OK.
- `vitest run src/domain/ganancias/tests/patrimonioComercial.test.ts src/domain/ganancias/tests/simulacionUsuario.test.ts src/domain/ganancias/tests/jvpIntegration.test.ts`: OK.
- `vitest run src/domain/ganancias/tests/purchaseBreakdown.test.ts src/domain/ganancias/tests/simulacionUsuario.test.ts`: OK.
- `tsc --noEmit`: OK.
- `vitest run`: 30 archivos, 103 tests, todo OK.
- `next build --webpack`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `eslint` global: pendiente, falla por deuda amplia preexistente/no abordada en esta unidad (`any` en APIs/paginas, reglas de hooks en pantallas existentes, imports no usados, `require` en seed/test_db).

Pendiente externo:

- Validar visualmente en navegador el wizard, papel de trabajo e informe cliente con la carga real del caso de capturas nuevas.
- Confirmar con el usuario si la guia PDF anterior queda como caso historico de regresion o si debe actualizarse a las capturas nuevas.
- Definir si se abre una unidad separada de saneamiento lint global.
