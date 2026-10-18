# Auditoria de confiabilidad y perdida de datos - 2026-07-09

Alcance: wizard de DDJJ Ganancias (frontend), API de declaraciones (GET/POST/PUT/DELETE), persistencia (persistTaxReturnDetails), autenticacion/sesion, importacion AFIP y operatoria de backup. Foco: escenarios donde se pueda perder informacion o el sistema falle en silencio durante el uso.

Nota: el modulo nuevo de IVA/IIBB mensual (fiscal-periods, importar-mensual) no fue auditado en detalle; aplicar los mismos criterios cuando se estabilice.

---

## Hallazgos de severidad ALTA

### A1. El auto-guardado en base de datos falla en silencio
`saveToServer()` (wizard, se ejecuta al cambiar de paso) solo hace `console.error` si el servidor responde error o si no hay red. Escenarios reales: sesion vencida (token de 12 hs, PC que quedo suspendida toda la noche devuelve 401), corte de internet, timeout de la base. El usuario ve que avanzo de paso y asume que se guardo.

- Mitigacion parcial ya existente: copia local + recuperacion. Pero la base queda desactualizada y si se reingresa desde OTRA maquina o navegador, no hay copia local que recuperar.
- Recomendacion: replicar el patron del aviso de copia local (`localDraftWarning`) para fallos de guardado en base: banner visible "No se pudo guardar en la base (motivo). Reintentar" + reintento automatico con backoff. Es el complemento natural de la mejora ya hecha.

### A2. Timeout de transaccion con declaraciones grandes (guardado que falla SIEMPRE)
`PUT /api/declaraciones/[id]` y el POST ejecutan `prisma.$transaction(...)` sin opciones: el timeout por defecto de Prisma es 5 segundos. Dentro de la transaccion se hace: lecturas de parametros, recalculo completo, `deleteMany` de 15 tablas y recreacion de todo, con `create` fila por fila para bienes de uso y AXI dinamico.

- Escenario: DDJJ con miles de comprobantes importados de AFIP + decenas de bienes de uso, sobre MySQL de hosting compartido (latencia alta) -> la transaccion excede 5 s -> rollback -> "Error al actualizar declaracion" reproducible en cada intento. La DDJJ queda imposible de guardar en base (solo copia local).
- Recomendacion (bajo riesgo, 1 linea por ruta): `prisma.$transaction(fn, { timeout: 30000, maxWait: 10000 })`. Mejora adicional: convertir los loops de `create` (fixedAsset, axiDynamicItem) a `createMany` precalculando.

### A3. Coercion silenciosa de datos invalidos al persistir (corrupcion sin aviso)
En `taxReturnDetailsPersistence.ts`: `numberInput()` convierte cualquier valor no numerico a **0** y `dateInput()` convierte fechas invalidas a **hoy**, sin avisar. El PUT no valida el payload con zod (el POST valida solo la cabecera).

- Escenario: un monto que llega con formato inesperado (import raro, bug futuro, edicion manual) se guarda como $0 en una DDJJ fiscal; una fecha corrupta se guarda como la fecha de hoy y cambia el ejercicio del comprobante. Nadie se entera hasta que ARCA/el cliente lo detecte.
- Recomendacion: validar y rechazar con 400 indicando fila y campo (o al menos loggear y devolver warning en la respuesta). En datos impositivos, fallar fuerte es mas seguro que adivinar.

---

## Hallazgos de severidad MEDIA

### M1. Sin control de concurrencia: el ultimo que guarda pisa todo
El PUT no compara `updatedAt`/`version`. Dos pestanas o dos maquinas con la misma DDJJ abierta se sobreescriben mutuamente sin aviso (last-write-wins). La recuperacion local nueva puede incluso reintroducir datos viejos si el reloj de la PC esta adelantado.
- Recomendacion: enviar en el PUT el `updatedAt` que el wizard cargo; si difiere del actual en base, responder 409 "La declaracion fue modificada por otra sesion" y dejar que el usuario decida. Regla operativa mientras tanto: no abrir la misma DDJJ en dos lugares.

### M2. Desfase de reloj en la deteccion de copia local mas reciente
`shouldOfferWizardDraftRecovery` compara `savedAt` (reloj de la PC del usuario) contra `updatedAt` (reloj del servidor). Si la PC atrasa unos minutos, cambios reales sin guardar pueden quedar "mas viejos" que la base y la recuperacion no se ofrece (perdida silenciosa, justo el caso que se quiso tapar).
- Recomendacion: tolerancia de skew (p. ej. ofrecer tambien si el contenido difiere y `savedAt` esta dentro de +/- 10 min del `updatedAt`), o guardar la hora DEL SERVIDOR como referencia tras cada save exitoso.

### M3. El borrador de una DDJJ nueva (paso 1, sin ID) nunca se restaura
El autoguardado escribe la clave `jaba_wizard_state_new_<cuit>` pero ningun flujo la relee: al reingresar a /declaraciones/crear/wizard se arranca vacio. Salir en el paso 1 = perder lo cargado del paso 1 (la exposicion es corta porque al pasar al paso 2 se crea el ID, pero el paso 1 incluye cargas laboriosas: patrimonio inicial, deducciones personales).
- Recomendacion: al montar sin routeReturnId y detectar una clave `new_<cuit>` con savedAt reciente, ofrecer restaurarla (mismo mecanismo ya construido).

### M4. Ventana de perdida durante la creacion automatica + redirect
Cuando el wizard crea la DDJJ en background (POST) y redirige con `window.location.href`, lo tipeado entre el inicio del POST y la recarga queda solo en la clave `new_<cuit>`, que queda huerfana (ver M3). Perdida chica (segundos) pero real.
- Recomendacion: al redirigir, fusionar la copia `new_<cuit>` en la clave del nuevo ID, o usar `router.push` conservando estado.

### M5. Backup solo manual
La operatoria documentada recomienda backup manual semanal en Hostinger. Un incidente de base (corrupcion, borrado accidental, fallo del hosting) puede costar hasta una semana de cargas.
- Recomendacion: automatizar un export diario (cron de Hostinger o script programado) con retencion de 7-30 dias, y una prueba de restauracion periodica en Docker (ya documentada).

---

## Hallazgos de severidad BAJA

- **B1. localStorage nunca se limpia.** Las copias locales de DDJJ cerradas/anuladas se acumulan; con imports grandes se acerca a la quota de ~5 MB (el aviso de fallo de escritura ya agregado mitiga el sintoma). Limpiar la clave al cerrar/anular la DDJJ.
- **B2. Datos mock en produccion.** `loadFromLocalStorage` tiene fallback a `mockTaxReturns` y datos hardcodeados ("return-2" Maria Luz Gomez). Si la base falla y no hay copia local, la app puede mostrar datos FICTICIOS en una pantalla fiscal. Quitar o restringir a desarrollo.
- **B3. Fallo del padron bloquea el paso 1 con mensaje engañoso.** Si `GET /api/clientes` falla al montar, `dbClients` queda vacio y el wizard dice "el contribuyente no esta registrado en el padron" aunque exista. Distinguir "padron no disponible" y reintentar.
- **B4. Autoguardado local serializa todo el estado en cada cambio.** Con miles de comprobantes, `JSON.stringify` en cada tecla puede poner lenta la UI. Debounce de 1-2 s (manteniendo el write inmediato en beforeunload).
- **B5. Historial de calculos se pisa en cada guardado.** `calculationRun.deleteMany` + create deja solo la ultima corrida. Si se deseaba trazabilidad de la evolucion del calculo, se esta perdiendo (la auditoria general via AuditLog si se conserva).

---

## Fortalezas verificadas (para no tocar)

- Guardados en base transaccionales (POST y PUT): no hay riesgo de DDJJ "a medias" por un corte a mitad de guardado.
- Deteccion de duplicados con redireccion a la DDJJ existente.
- Validacion zod + topes de tamano en alta e importacion; importacion AFIP es todo-o-nada y no escribe en base (los datos viajan al wizard).
- Listado tolerante a snapshots corruptos (una fila mala no tira el dashboard).
- Sesion con renovacion deslizante (12 hs) y API que responde 401 JSON limpio (no redirige fetches).
- Auditoria tolerante a fallos (no bloquea la operacion principal).
- Copia local con timestamp + recuperacion al reabrir + aviso de fallo de escritura (mejoras 2026-07).

## Orden sugerido de implementacion

1. A1 (aviso visible de fallo de auto-guardado) - complementa lo ya hecho, riesgo minimo.
2. A2 (timeout de transaccion) - 1 linea por ruta, previene un fallo reproducible.
3. M3 + M4 (borradores `new_<cuit>`) - reutiliza el mecanismo de recuperacion existente.
4. A3 (validacion en persistencia) - requiere mas cuidado y tests.
5. M1/M2 (concurrencia y skew) - disenar junto: un solo cambio de contrato PUT.
6. M5/B1/B2/B3/B4 - mantenimiento programable.
