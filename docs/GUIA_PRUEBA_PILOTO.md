# Guia de prueba piloto - Ganancias JABA

Fecha: 2026-06-02.

## Objetivo

Esta guia permite comenzar una prueba controlada de la aplicacion sin improvisar criterios de carga.

El objetivo no es reemplazar la validacion contra una DDJJ real del estudio. El objetivo es tener un recorrido base para verificar que la app:

- Normaliza importes cargados como strings hacia el motor de calculo.
- Calcula una liquidacion de tercera categoria sin errores.
- Preserva ventas, compras, retenciones, auxiliares ESP, otras justificaciones JVP y snapshot de reapertura.
- Permite guardar, salir, reabrir y revisar la misma informacion cargada.

## Fixture tecnico disponible

Se agrego el fixture:

```text
src/domain/ganancias/fixtures/pilotTaxReturnFixture.ts
```

Y la prueba automatizada:

```text
src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts
```

Ese caso cubre:

- Ventas gravadas y exentas.
- Compras de mercaderia/materia prima y gastos generales.
- Bien de uso con coeficiente de reexpresion.
- Existencia inicial/final.
- Banco, efectivo en USD, creditos y pasivos comerciales.
- Retencion de Ganancias con CUIT/agente/regimen/fecha/certificado.
- Deducciones generales agregadas.
- Deducciones personales.
- Patrimonio personal.
- Otras justificaciones JVP columna I y II.
- AXI estatico y dinamico.
- 12 indices IPC mensuales y coeficientes utiles.

## Verificacion automatizada rapida

Desde una terminal en:

```powershell
cd "C:\Dev\Ganancia\Persona Fisica\ganancias-jaba"
```

Ejecutar:

```powershell
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\vitest\vitest.mjs" run src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts
```

Resultado esperado:

```text
Test Files  1 passed
Tests       2 passed
```

## Como levantar la app para prueba manual

En una terminal normal de Windows, no dentro del sandbox de Codex si falla por permisos:

```powershell
cd "C:\Dev\Ganancia\Persona Fisica\ganancias-jaba"
& "C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\next\dist\bin\next" dev --webpack
```

Abrir:

```text
http://localhost:3000
```

Nota: la validacion visual automatizada con Browser/Chrome integrado quedo bloqueada por entorno Windows/sandbox. La prueba visual inicial debe hacerse manualmente hasta que ese entorno este disponible.

## Recorrido manual recomendado

1. Crear o seleccionar un contribuyente de prueba.
2. Crear una DDJJ periodo fiscal 2025.
3. Seleccionar una resolucion/parametros activos 2025.
4. Cargar ventas:
   - Se pueden seleccionar uno o varios archivos AFIP al mismo tiempo.
   - Para un caso real, subir los 12 archivos mensuales tal cual se descargan de AFIP; la app los compila internamente.
   - Venta gravada neta: 70.000.000.
   - Venta exenta neta: 1.200.000.
   - Verificar que comprobante, cliente y CUIT queden visibles o reabribles.
5. Cargar compras:
   - Se pueden seleccionar uno o varios archivos AFIP al mismo tiempo.
   - Para un caso real, subir los 12 archivos mensuales tal cual se descargan de AFIP; la app los compila internamente.
   - Materia prima: 15.000.000.
   - Gastos generales deducibles: 2.500.000.
   - Verificar comprobante, proveedor y CUIT.
6. Cargar bien de uso:
   - Notebook afectada a la actividad.
   - Costo: 2.500.000.
   - Vida util: 5.
   - Coeficiente: 1.3154876051264572.
7. Cargar existencias:
   - Inicial: 2.000.000.
   - Final: 3.500.000.
8. En patrimonio/ESP cargar:
   - Banco Galicia CC 001: inicial 50.000, cierre 350.000.
   - Efectivo USD: inicial 100, cierre 150, TC cierre 1446.
   - Credito comercial "Clientes al cierre": inicial 10.000, cierre 25.000.
   - Pasivo "Proveedor local": inicial 30.000, cierre 12.000.
9. En JVP cargar otras justificaciones:
   - Columna II: "Bienes recibidos por herencia, legado o donacion", 750.000.
   - Columna I: "Otros conceptos que no justifican erogaciones o aumentos patrimoniales", 25.000.
10. En deducciones cargar:
   - Autonomos: 350.000.
   - Servicio domestico: 5.000.000.
   - Seguro de vida: 100.000.
   - Gastos educativos: 500.000.
11. En retenciones cargar:
   - Importe: 12.500,65.
   - Agente: Banco Galicia SA.
   - CUIT agente: 30-70809010-9.
   - Regimen: 12.
   - Certificado: RET-2025-00012345.
   - Fecha: 2025-05-15.
12. En AXI dinamico cargar:
   - Concepto: Retiro titular marzo.
   - Tipo: RetiroSocio.
   - Importe: 3.901.371,69.
   - Fecha: 2025-03-15.
13. Ejecutar preview/calculo.
14. Guardar la DDJJ.
15. Salir de la pantalla y reabrir la misma DDJJ.

## Checklist de aceptacion

Marcar como OK solo si se verifica en pantalla o reabriendo:

- La DDJJ conserva ventas y compras cargadas.
- La importacion acepta varios archivos mensuales sin exigir consolidacion manual previa.
- La pantalla muestra resumen de importacion por archivo, registros incorporados y duplicados omitidos.
- Si se vuelve a importar el mismo mes/comprobante, la app omite duplicados detectables por comprobante/contraparte/fecha/importe.
- La DDJJ conserva retencion con agente, CUIT, regimen, fecha y certificado.
- La DDJJ conserva efectivo, creditos y pasivos auxiliares ESP.
- La DDJJ conserva otras justificaciones JVP y sus columnas.
- El preview no informa errores.
- Retenciones/percepciones computables redondean a 12.501.
- Los totales JVP columna I y columna II son positivos.
- El cuadre JVP queda en cero o explicado.
- Al reabrir, no se pierde la resolucion/parametros usados.
- El guardado no depende de localStorage para recuperar la carga.

## Comparacion contra Excel

Para cerrar la validacion externa real, usar una DDJJ ya resuelta en:

```text
C:\Dev\Ganancia\Persona Fisica\DJ Ganancias 2025 - Tercera Categoria.xlsx
```

Comparar como minimo:

- Resultado comercial neto.
- AXI estatico/dinamico.
- Deducciones generales admitidas y excedentes JVP.
- Deducciones personales.
- Impuesto determinado.
- Retenciones/percepciones.
- Saldo final.
- JVP: columna I, columna II, consumo y diferencia.

## Validacion automatica Docker del caso Excel/capturas

El caso Lobato 2024 de las capturas tiene un control automatico repetible:

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:validate:excel
```

Resultado esperado:

```text
Test Files  1 passed
Tests       1 passed
```

Esta validacion no reemplaza la prueba visual/manual del wizard, papel de trabajo, informe cliente y legajo PDF, pero confirma que la base Docker conserva los datos cargados y que los totales principales coinciden con el caso documentado.

## Criterio de cierre del piloto

El piloto queda validado cuando:

- Un caso real del estudio coincide contra Excel en los totales principales.
- La carga resulta mas agil que la planilla o al menos no mas lenta.
- La informacion guardada se puede reabrir sin perdida.
- Las diferencias detectadas quedan registradas con captura, dato esperado y dato obtenido.
