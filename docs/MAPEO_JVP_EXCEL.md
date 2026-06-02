# Mapeo JVP contra Excel base

Fecha de relevamiento: 2026-06-01.

Archivo fuente:

- `C:\Dev\Ganancia\Persona Fisica\DJ Ganancias 2025 - Tercera Categoría.xlsx`.

## Hojas principales

- `JVP`: arma la justificacion de variaciones patrimoniales.
- `IG 25`: determina el resultado impositivo neto.
- `Patrimonio personal`: consolida patrimonio inicial/cierre.
- `Pasivo Personal`: alimenta pasivos personales.
- `Cuenta Bancaria`: alimenta cuentas bancarias en patrimonio personal.
- `ESP`: estado de situacion patrimonial de la explotacion unipersonal.
- `Inmueble` y `Rodado`: alimentan bienes personales.

## Formula troncal de JVP

En hoja `JVP`:

- `C8 = C40`: otros conceptos que no justifican erogaciones y/o aumentos patrimoniales.
- `D9 = C65`: ganancias exentas o no gravadas.
- `C10 = C75`: gastos y deducciones vinculados a ingresos exentos.
- `D11 = C83`: bienes recibidos por herencia, legado o donacion.
- `D13 = C95`: otros conceptos que justifican erogaciones y/o aumentos patrimoniales.
- `D14 = 'IG 25'!F38`: resultado impositivo neto del periodo.
- `D15 = 'Patrimonio personal'!C22`: patrimonio al inicio.
- `C16 = 'Patrimonio personal'!D22`: patrimonio al cierre.
- `C17 = SUM(C8:C16)`: subtotal columna I.
- `D17 = SUM(D8:D15)`: subtotal columna II.
- `C19 = ROUND(D17-C17,2)`: consumo por diferencia.
- `C21 = SUM(C17:C19)` y `D21 = SUM(D17:D19)`: cuadre final por columnas.

## IG 25 relevante para JVP

En hoja `IG 25`:

- `F17 = SUM(C15:F15)`: total ganancia bruta.
- `F32 = SUM(F20:F31)`: deducciones generales admitidas.
- `F34 = F17-F32`: resultado impositivo antes de quebrantos.
- `F36`: quebrantos anteriores.
- `F38 = F34-F36`: resultado neto usado por `JVP!D14`.

Decision aplicada en app:

- `calculateTaxReturn` debe enviar `resultadoImpositivoNeto` a JVP, no `resultadoComercialNeto`.

## Patrimonio personal

En hoja `Patrimonio personal`:

- `C22 = C15-C20`: patrimonio inicial.
- `D22 = D15-D20`: patrimonio cierre.
- Activos principales:
- `Inmueble`: `C11 = Inmueble!I37`, `D11 = Inmueble!I38`.
- `Rodado`: `C12 = Rodado!K51`, `D12 = Rodado!K51`.
- `Empresa unipersonal`: `C13 = ESP!C21`, `D13 = ESP!D21`.
- `Cuenta bancaria`: `C14 = 'Cuenta Bancaria'!C19`, `D14 = 'Cuenta Bancaria'!C20`.
- Pasivo personal:
- `Tarjeta de credito`: `C18 = 'Pasivo Personal'!F13`, `D18 = 'Pasivo Personal'!G13`.

## ESP de explotacion unipersonal

En hoja `ESP`:

- Activo:
- `C11 = SUM(C6:C10)` y `D11 = SUM(D6:D10)`.
- Rubros: efectivo, creditos por ventas, bienes de cambio, bienes de uso y otros creditos.
- Pasivo:
- `C19 = SUM(C14:C18)` y `D19 = SUM(D14:D18)`.
- Rubros: proveedores y otros pasivos.
- Patrimonio neto:
- `C21 = C11-C19`, `D21 = D11-D19`.

Brecha actual:

- La app aproxima el patrimonio comercial con `activoTotalInicio - pasivoTotalInicio` y resultado comercial del periodo.
- Falta una carga mas explicita del ESP si se quiere replicar rubro por rubro: efectivo, creditos, bienes de cambio, bienes de uso, proveedores y otros pasivos.

## Hojas auxiliares detectadas

`Banco`, `Creditos` y `Pasivo` existen como hojas auxiliares, pero el camino principal de `Patrimonio personal` usa `Cuenta Bancaria`, `ESP` y `Pasivo Personal`.

Uso sugerido:

- `Cuenta Bancaria`: mantener como referencia primaria para bancos personales.
- `ESP`: referencia primaria para patrimonio de explotacion unipersonal.
- `Creditos` y `Pasivo`: evaluar como detalle para alimentar ESP, no como fuente directa de JVP.

## Auxiliares ESP preparados en backend

Corte aplicado el 2026-06-02:

- `Efectivo`: se representa como `cashHoldings`.
- `Creditos`: se representa como `receivables`.
- `Pasivo`: se representa como `liabilities`.
- El backend ya preserva esos arrays desde payload hasta motor, snapshot, tablas relacionales y reapertura por API.
- Queda pendiente agregar una UI agil/importador visible para cargar esos auxiliares sin hacer mas lenta la pantalla principal.

## Pendientes de implementacion

- Definir si la app debe abrir una seccion `ESP` explicita o seguir con el atajo de patrimonio comercial inicial/cierre.
- Agregar presets de conceptos JVP para filas `C8`, `D11` y `D13` si mejora la velocidad de carga sin ocultar criterio profesional.
- Validar una DDJJ real contra `JVP!C17`, `JVP!D17` y `JVP!C19`.
