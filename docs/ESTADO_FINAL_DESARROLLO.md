# Estado final de desarrollo - Ganancias JABA

Fecha: 2026-06-02.

## Resumen

El desarrollo tecnico del MVP funcional queda cerrado al 100% sobre los frentes trabajables desde codigo y documentacion local.

No se declara validacion operativa real al 100% porque quedan dos dependencias externas:

- Validar una DDJJ real o fixture realista del estudio contra `ESP`, `Patrimonio personal` y `JVP`.
- Validar visualmente el wizard en navegador cuando el entorno Browser/Chrome deje de estar bloqueado.

## Porcentajes

- Desarrollo tecnico implementado: 100%.
- Verificacion automatizada local: 100% en tests, TypeScript, ESLint focal y build.
- Validacion externa/manual: pendiente.
- Preparacion para uso piloto: 98%, sujeto a prueba con caso real.

## Frentes cerrados

- P0: continuidad y control operativo.
- P1: reduccion de riesgo operativo del wizard.
- P2: consistencia backend/frontend/persistencia.
- P3: AXI e indices utiles.
- P4: patrimonio, JVP, auxiliares ESP y referencias Excel.
- P5: deducciones generales agregadas y decision documental.
- P6: auditoria importada para retenciones y snapshot documentado para CUIT de contraparte.
- P9: importacion multiarchivo AFIP para ventas/compras mensuales sin consolidacion manual previa.
- P10: resumen visual de importacion y omision de duplicados detectables.

## Verificacion tecnica acumulada

Ultimo corte verificado con:

- `vitest run`: 26 archivos, 95 tests, todo OK.
- `eslint` focalizado sobre los archivos tocados: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK cuando se ejecuta aislado despues del build.

Nota: no ejecutar `tsc --noEmit` en paralelo con `next build`, porque Next regenera `.next/types` y puede producir falsos errores `TS6053`.

## Pendientes externos

1. Ejecutar una DDJJ real o fixture realista del estudio:
   - Cargar/importar ventas.
   - Cargar/importar compras.
   - Cargar Mis Retenciones.
   - Completar patrimonio/ESP/JVP.
   - Guardar, reabrir y comparar contra Excel.
2. Validar UI visual:
   - Paso 4: auxiliares ESP, JVP y reconciliacion.
   - Paso 5: deducciones generales, retenciones importadas y AXI dinamico.
   - Guardado/reapertura.
3. Si el estudio requiere reportes por CUIT de contraparte desde DB:
   - Migrar `counterpartyCuit` desde snapshot a columnas propias en `SalesInvoice` y `PurchaseInvoice`.

## Preparacion piloto agregada

- Fixture tecnico disponible: `src/domain/ganancias/fixtures/pilotTaxReturnFixture.ts`.
- Prueba automatizada focal: `src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts`.
- Guia manual de uso: `docs/GUIA_PRUEBA_PILOTO.md`.
- El fixture valida calculo, retenciones auditables, auxiliares ESP, otras justificaciones JVP y persistencia critica de snapshot/tablas.
- La prueba piloto contempla que ventas y compras puedan cargarse con varios archivos mensuales de AFIP.
- El wizard informa archivos procesados, registros incorporados y duplicados omitidos al importar.

## Recomendacion de uso

Usar la app en modo piloto controlado con un caso real ya resuelto en Excel. Si los totales coinciden y la carga resulta comoda, el MVP queda listo para uso operativo del estudio.
