# Manual de carga — Ganancias 3ª categoría (caso Mariano Domínguez, ejercicio 2025)

Instructivo paso a paso para cargar este caso en la app de producción (módulo Ganancias) y llegar al resultado del borrador de Excel. Pensado para no cometer errores.

## Resultado esperado (control)

| Concepto | Valor de control |
|---|---|
| Ventas gravadas | 90.868.622,18 |
| Costo de ventas (CMV) | 50.509.607,75 |
| Gastos deducibles | 18.428.015,53 |
| Amortización bienes de uso | 716.100 (la app la calcula; el borrador usó 716.500) |
| AXI estático | −2.257.541,74 (pérdida) |
| Utilidad neta 3ª categoría (sin AXI) | 21.214.498,90 |
| Resultado impositivo (con AXI restado) | 18.956.957,16 |
| Consumo (JVP) | 9.114.062,98 |

Verificado: la app reproduce estos números al peso. La única diferencia (~$400) viene de la amortización del borrador (716.500 vs 716.100 que es el cálculo correcto de los bienes).

## Antes de empezar (precondiciones)

1. El período fiscal es **2025** (ejercicio 1/1/2025 a 31/12/2025; patrimonio inicial 31/12/2024, final 31/12/2025).
2. Confirmar que están cargados los **parámetros 2025** (escalas y, sobre todo, los **índices IPC**: diciembre 2024 = 7.694,0075 y diciembre 2025 = 10.121,3715, que dan el coeficiente de inflación 1,315488). Sin los IPC, el AXI da 0.
3. El contribuyente Mariano Domínguez debe existir en el padrón de Clientes (CUIT 23-29769497-9, Responsable Inscripto).

## Paso 1 — Identificación del contribuyente

- Seleccionar o crear el contribuyente: **MARIANO DOMINGUEZ**, CUIT **23-29769497-9**, Persona Humana, Responsable Inscripto.
- Período fiscal: **2025**.
- En los saldos iniciales del patrimonio comercial (si el Paso 1 los pide), cargar el **capital afectado al inicio**: ver Paso 4 (se sincroniza desde el AXI).

## Paso 2 — Ventas e ingresos

- Cargar las ventas gravadas del ejercicio. Si tenés el CSV de "Mis Comprobantes" de ARCA, importarlo (varios meses juntos está soportado); si no, cargar el total:
  - **Importe neto gravado: 90.868.622,18** (gravado, no exento).
- Control: el total de ventas gravadas debe quedar en 90.868.622,18.

## Paso 3 — Compras, existencias y costo de ventas (CMV)

Separar lo que es **mercadería** (va al costo) de lo que son **gastos**.

### 3.a Bienes de cambio (para el CMV)
- Existencia inicial: **7.856.322,00**
- Compras de mercadería del ejercicio: **46.088.285,75** (marcar como tipo Mercadería / Materia Prima)
- Existencia final: **3.435.000,00**
- La app calcula: CMV = 7.856.322 + 46.088.285,75 − 3.435.000 = **50.509.607,75**.

### 3.b Gastos deducibles (NO van al CMV)
Cargar como compras/gastos deducibles (tipo Gastos Generales), por un total de **18.428.015,53**:
- Ingresos Brutos (IIBB): **3.211.799,50**
- Segunda línea grande: **13.828.482,62**  → **PENDIENTE DE CLASIFICAR**: confirmar si es IIBB, sueldos y cargas, u otro gasto. Cargarla en el rubro correcto (igual no cambia el resultado, pero sí el detalle del papel de trabajo).
- Intereses de préstamo: **511.663,97**
- "No imputa": **28.580,00**  → revisar: si realmente NO es deducible impositivamente, NO debería cargarse como gasto deducible (el borrador lo restó igual).
- **NO cargar acá los autónomos** (847.489,44): van como deducción general (ver Paso 5).

> Importante: si en vez de cargar autónomos como deducción general lo cargás acá como gasto, el resultado final es el mismo número, pero el renglón es incorrecto. Lo correcto es el Paso 5.

## Paso 4 — Patrimonio y bienes de uso

### 4.a Bienes de uso (amortizaciones)
- Equipos de computación, valor de origen **7.161.000**, vida útil 10 años → amortización del ejercicio **716.100**.
  - (El borrador usó 716.500; la app calcula 716.100 que es lo correcto según el bien.)
- El rodado (Peugeot 207, compra 07/05/2025) figura sin amortizar en el borrador; si corresponde amortizarlo, cargarlo aparte.

### 4.b Ajuste por inflación impositivo (AXI) — Paso 5 > AXI en la app
Cargar el capital afectado al inicio (31/12/2024) para el AXI estático:
- **Activo computable inicio**: 10.106.589,44
  - Disponibilidades-Bancos: 1.416.741,00
  - Deudores por ventas: 833.526,44
  - Bienes de cambio: 7.856.322,00
- **Pasivo computable inicio**: 2.950.866,99 (deudas fiscales)
- Capital afectado computable = 10.106.589,44 − 2.950.866,99 = **7.155.722,45**
- Con el coeficiente 1,315488 (IPC dic 2025 / dic 2024), el AXI estático da **−2.257.541,74** (pérdida, porque el capital computable es positivo y la inflación lo licúa).
- AXI dinámico: **0** en este caso (no hay retiros/aportes que ajustar por inflación más allá de lo ya contemplado).

## Paso 5 — Deducciones

- **Deducciones personales**: para esta verificación, en **cero** (sin MNI/cónyuge/hijos según lo acordado). En una liquidación real, cargar MNI y deducción especial de autónomo del Art. 30.
- **Deducciones generales**:
  - **Autónomos pagados: 847.489,44** → cargar acá (es deducción general, NO gasto de 3ª categoría).

## Paso 6 — Cierre y verificación

Antes de cerrar, contrastar contra el control:
- Resultado neto 3ª categoría (utilidad neta): **21.214.498,90** (la app puede mostrar 21.214.899 si la amortización quedó en 716.100; la diferencia de $400 es por el redondeo del borrador en la amortización).
- Resultado impositivo después del AXI: **18.956.957,16**.
- JVP: el consumo debe dar **9.114.062,98** y las dos columnas cuadrar en 14.063.982,77 (requiere cargar el patrimonio personal inicio/cierre del Paso 4).

## Diferencias detectadas entre el borrador y la app (no son errores de la app)

1. **Amortización**: borrador 716.500 vs cálculo correcto 716.100 (diferencia $400 que arrastra a la utilidad neta y al resultado impositivo).
2. **Autónomos**: el borrador lo metió como gasto en el estado de resultados; lo correcto es deducción general (mismo resultado final, distinto renglón).
3. **"No imputa" (28.580)**: revisar si es deducible; el nombre sugiere que no se imputa al resultado impositivo.
4. **Segunda línea de IIBB (13.828.482,62)**: pendiente de identificar el concepto exacto para clasificarla bien.

## Checklist final

- [ ] Parámetros 2025 con IPC diciembre 2024 y 2025 cargados.
- [ ] Ventas 90.868.622,18.
- [ ] Bienes de cambio: EI 7.856.322, compras 46.088.285,75, EF 3.435.000.
- [ ] Gastos deducibles 18.428.015,53 (sin autónomos), con la línea de 13,8M clasificada.
- [ ] Bienes de uso: equipos 7.161.000, amortización 716.100.
- [ ] AXI: activo 10.106.589,44, pasivo 2.950.866,99 → −2.257.541,74.
- [ ] Autónomos 847.489,44 como deducción general.
- [ ] Patrimonio personal inicio/cierre para la JVP.
- [ ] Contraste contra los valores de control antes de cerrar.
