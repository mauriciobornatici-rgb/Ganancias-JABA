# Plan App 10/10 - Ganancias JABA

Fecha: 2026-06-08

## Objetivo

Llevar Ganancias JABA desde MVP tecnico avanzado a aplicacion profesional 10/10 para uso operativo del estudio, cuidando tres principios:

- no romper produccion;
- no tocar la base productiva durante pruebas;
- no perder el hilo de trabajo.

## Regla de ejecucion

Todo desarrollo nuevo debe seguir `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`.

En particular:

- desarrollo local: `npm run dev:testdb`;
- base local: Docker `ganancias_jaba_test`;
- rama de prueba: `staging` o rama feature;
- produccion: solo `main`;
- cerrar cada bloque con registro, verificacion, commit y push.

## Definicion de "10/10"

La app se considerara 10/10 cuando cumpla estos criterios:

- acceso protegido con usuario/clave;
- ninguna prueba toca Hostinger produccion;
- DDJJ real cargada, guardada, reabierta y comparada contra Excel;
- cierre formal de DDJJ con bloqueo o reapertura controlada;
- auditoria con usuario real;
- backup y restauracion probados;
- PDF/legajo/informe validados visualmente;
- importaciones AFIP robustas;
- parametros fiscales versionados y bloqueados si fueron usados;
- adjuntos/soportes guardados y consultables;
- `eslint`, tests, typecheck, Prisma y build verdes;
- procedimiento de deploy y mantenimiento documentado.

## Etapas prioritarias

### Etapa 1 - Seguridad de acceso y proteccion basica

Objetivo: que la app publicada no quede abierta.

Incluye:

- login;
- sesiones;
- proteccion de paginas;
- proteccion de APIs;
- usuario inicial administrador;
- auditoria con `userId` real.

Criterio de cierre:

- una persona no autenticada no puede ver dashboard, clientes, DDJJ ni APIs;
- el usuario autenticado queda registrado en acciones criticas;
- tests de acceso pasan.

### Etapa 2 - Validacion operativa real contra Excel

Objetivo: confirmar que la app devuelve los mismos resultados que la planilla usada por el estudio.

Incluye:

- caso real cargado en Docker;
- guardado y reapertura;
- comparacion contra Excel;
- validacion de wizard, papel de trabajo, informe cliente y legajo PDF;
- registro de diferencias si aparecen.

Criterio de cierre:

- DDJJ real reproducida o diferencias documentadas con decision;
- checklist piloto completo;
- evidencia guardada en docs.

### Etapa 3 - Workflow profesional de DDJJ

Objetivo: evitar cambios accidentales y ordenar el ciclo de trabajo.

Incluye:

- estados claros: Borrador, En revision, Cerrada, Presentada, Rectificativa;
- cierre formal;
- reapertura controlada;
- rectificativas;
- reemplazar borrado por archivo/anulacion;
- controles previos al cierre.

Criterio de cierre:

- una DDJJ cerrada no se modifica sin accion explicita;
- no hay borrados destructivos normales;
- cada cambio critico deja auditoria.

### Etapa 4 - Backups, restauracion y salud operativa

Objetivo: que la informacion pueda recuperarse ante error humano o tecnico.

Incluye:

- procedimiento de backup Hostinger;
- restauracion probada en Docker;
- health check de DB;
- verificacion de entorno Vercel;
- opcion de DB staging remota si se desea preview persistente.

Criterio de cierre:

- existe prueba real de restauracion;
- se sabe como recuperar datos;
- se documenta fecha, archivo y resultado.

### Etapa 5 - Adjuntos, soportes y paquete final

Objetivo: que la app no solo calcule, sino que deje expediente profesional completo.

Incluye:

- adjuntos por DDJJ;
- archivos AFIP importados conservados;
- legajo PDF validado;
- informe cliente;
- papel de trabajo;
- exportacion de emergencia JSON/PDF;
- paquete final descargable.

Criterio de cierre:

- una DDJJ puede descargarse con su soporte completo;
- los archivos importados/adjuntos se pueden consultar luego.

### Etapa 6 - Robustez fiscal y parametros

Objetivo: que los calculos y parametros sean confiables, versionados y auditables.

Incluye:

- parametros oficiales revisados;
- indices/coeficientes validados;
- tipos de cambio si aplica;
- casos especiales: jubilado, quebrantos, saldos a favor, anticipos, monotributo + RI;
- bloqueo de parametros usados por DDJJ cerradas.

Criterio de cierre:

- cada parametro tiene fuente/version;
- una DDJJ cerrada conserva la version usada;
- casos especiales tienen tests.

### Etapa 7 - Calidad tecnica y mantenibilidad

Objetivo: que el codigo sea facil de mantener sin miedo.

Incluye:

- `eslint` global verde;
- eliminar `any` criticos;
- dividir `src/app/page.tsx` en componentes/hooks;
- tests E2E de flujos criticos;
- fixtures reales adicionales;
- manejo profesional de errores;
- observabilidad minima.

Criterio de cierre:

- suite completa verde;
- lint global verde;
- flujo E2E critico cubierto;
- dashboard y wizard menos acoplados.

### Etapa 8 - UX profesional de carga

Objetivo: carga agil, simple, explicable y sin magia.

Incluye:

- semaforo de consistencia antes del cierre;
- feedback claro de importaciones;
- previsualizacion antes de incorporar datos;
- validaciones por pantalla;
- mensajes de error entendibles;
- mejoras mobile/tablet si se usara desde varios dispositivos.

Criterio de cierre:

- el usuario sabe que falta, que esta mal y que ya esta listo;
- no hay pantallas criticas ambiguas.

## Gestion de nuevos hallazgos

Todo nuevo problema o mejora que surja debe registrarse asi:

- ID: `Pxx`;
- titulo;
- problema;
- impacto;
- accion propuesta;
- criterio de cierre;
- estado;
- verificacion ejecutada;
- commit asociado.

El lugar principal para ordenar prioridades es `docs/BACKLOG_PRIORIZADO.md`.

La bitacora larga queda en `docs/REGISTRO_PROYECTO.md`.

La puerta de entrada sigue siendo `docs/CONTINUAR_AQUI.md`.

## Orden recomendado inmediato

1. P18 - Autenticacion y proteccion de acceso.
2. P19 - Validacion real contra Excel en Docker.
3. P20 - Workflow profesional de DDJJ.
4. P21 - Backup/restauracion y health checks.
5. P22 - Adjuntos y paquete final de soporte.
6. P23 - Parametros fiscales, tipos de cambio y casos especiales.
7. P24 - Calidad tecnica: lint global, E2E y refactor dashboard.
8. P25 - UX 10/10 de carga y controles.

## Nota de criterio profesional

La app no debe buscar "magia". Debe hacer visibles los supuestos, las fuentes, los controles y las diferencias. La eficiencia se logra automatizando tareas repetitivas y reduciendo carga manual, pero siempre con trazabilidad.
