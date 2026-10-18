# Instructivo: módulo mensual IVA + IIBB y su conexión con Ganancias

Guía operativa del estudio. Actualizada al 2026-07-20.

---

## 1. Mapa de aplicaciones: qué se hace en cada una

| Aplicación | Para qué sirve | Quiénes |
| --- | --- | --- |
| **JABA Ganancias** (`ganancias-jaba.vercel.app`) | Liquidación de impuestos: IVA + IIBB mensual por cliente, y la DDJJ anual de Ganancias con papel de trabajo e informe | **Responsables Inscriptos** |
| **ERP Imprentas** (`erp-imprentas`) | Operación comercial del día a día: facturación, ventas, clientes del negocio, emisores fiscales | Todos, y ahí vive el **control de monotributistas** (categorías) |

**Regla mnemotécnica**: *el ERP factura y controla el negocio día a día; JABA liquida los impuestos del Responsable Inscripto (IVA/IIBB mes a mes, Ganancias una vez al año).*

- El **control de que un monotributista no se pase de categoría** se lleva en el **ERP** (donde está su facturación acumulada). JABA no maneja monotributistas: su circuito completo (IVA, IIBB, Ganancias) es de Responsables Inscriptos.
- Hoy **no hay puente automático** entre las dos aplicaciones. La fuente común es ARCA: el ERP registra lo que el estudio factura; a JABA se le importan los CSV oficiales de "Mis Comprobantes" del cliente.

---

## 2. Flujo mensual IVA + IIBB en JABA (por cliente)

### Paso 0 — Configuración inicial del cliente (una sola vez)

1. Entrá a **Clientes** → en la fila del cliente, botón del **librito** ("Libro fiscal mensual IVA e IIBB").
2. Antes de crear el primer período, tocá **Config. IIBB** y completá:
   - **Perfil fiscal**: condición de IVA y régimen de IIBB (local ARBA o Convenio Multilateral).
   - **Jurisdicciones con su alícuota** de IIBB (obligatorio: sin alícuota cargada, el sistema **no permite cerrar** IIBB — es una protección, no un error).
   - Si es **Convenio Multilateral**: los coeficientes unificados del año.

### Paso 1 — Crear el período

En la pantalla **IVA + IIBB** del cliente, creá el período (año y mes). Eso habilita la liquidación de ese mes.

### Paso 2 — Subir archivos de AFIP (pantalla "Liquidación de IVA", paso 1)

- Subí los **CSV** de **"Mis Comprobantes"** de ARCA (compras y ventas; pueden ir juntos, el sistema detecta cuál es cuál).
- ⚠️ **Solo archivos .csv** tal como los baja ARCA. **No** subir Excel (.xlsx) ni el archivo de "Mis Retenciones" en este paso: el mensaje *"No se pudo compilar ningún comprobante"* casi siempre significa archivo equivocado o formato Excel.
- Reimportar el mismo archivo **no duplica** (el sistema reconoce los comprobantes ya cargados).

### Paso 3 — Revisar y seleccionar (paso 2)

Destildá las filas que **no** deban entrar en la liquidación. Solo los comprobantes tildados computan débito/crédito fiscal.

### Paso 4 — Retenciones y percepciones (paso 2b)

**Acá sí** va el archivo de **"Mis Retenciones"** de ARCA. Se aplican contra el saldo a pagar; el excedente queda como saldo de libre disponibilidad.

### Paso 5 — Cotejar con AFIP y guardar (paso 3)

- Compará los totales contra el **F2002** del portal de ARCA.
- Si coinciden **al peso** → guardá: el mes queda **CERRADO (inmutable)** y listo para alimentar la anual.
- Si **no** coinciden: revisá la selección de filas y los archivos **antes** de forzar el guardado. La diferencia siempre tiene una causa (una fila de más/de menos, un archivo incompleto).

### Paso 6 — Ingresos Brutos (misma pantalla, sección IIBB)

- El sistema calcula: base × coeficiente (si es Convenio) × alícuota por jurisdicción, aplica las percepciones de IIBB sufridas y **arrastra el saldo a favor** del mes anterior automáticamente.
- Cotejá contra la liquidación del organismo (ARBA/Convenio) y cerrá.

### Regla del módulo mensual

**Un mes cerrado no se toca** (la app lo bloquea a propósito: es la garantía de que la anual se arma sobre datos firmes). Si detectás un error en un mes ya cerrado, no intentes forzarlo: consultá primero — hoy no existe circuito de reapertura mensual y hay que resolverlo con cuidado.

---

## 3. Cómo llega todo a la DDJJ anual de Ganancias

Cuando los meses del año están cerrados:

1. Abrí (o creá) la **DDJJ del cliente** en el wizard.
2. Usá el botón **"Importar libro mensual"**.
3. El sistema trae **solo los meses con IVA cerrado** y crea automáticamente:
   - las **ventas** y **compras** clasificadas (mercadería → CMV, gasto → deducible),
   - el **IIBB determinado como gasto deducible**, una fila por mes cotejado,
   - los **candidatos a bienes de uso** (compras que parecen bienes de uso), que aparecen en el **Paso 4** del wizard para confirmarlos o descartarlos con un clic.
4. Reimportar es seguro: **reemplaza lo importado antes sin tocar lo cargado a mano**.
5. Después ajustan lo fino en el wizard: categorías de ventas (Bienes/Servicios/Muebles y Útiles), tipos de gasto en compras, tratamiento deducible/no deducible.

---

## 4. Reglas de oro (resumen anti-errores)

1. **CSV de ARCA, nunca Excel**, en el módulo mensual. ("Mis Comprobantes" → paso 1; "Mis Retenciones" → paso 2b.)
2. **Configurar alícuotas de IIBB antes** del primer cierre del cliente.
3. **Cerrar solo cuando coteja al peso** con el F2002/organismo.
4. **Importar a la anual recién con los meses cerrados** (los abiertos no viajan).
5. **Mes cerrado no se modifica**; ante un error, consultar antes de tocar.
6. Ante cualquier mensaje de error que no entiendas, **capturá la pantalla** y pasala tal cual: el texto exacto acorta el diagnóstico a la mitad.
7. El **backup automático** protege todo lo cargado (sección Configuración); para sesiones de carga muy grandes, un `npm run db:backup` manual antes de empezar no está de más.

---

## 5. Monotributistas: dónde y cómo se controlan

- El seguimiento de categorías (que no se pasen de los topes de facturación) se lleva en el **ERP Imprentas**, junto con su facturación.
- Lo que hay que vigilar: **facturación acumulada de los últimos 12 meses vs. el tope de la categoría** vigente de cada monotributista.
- JABA no participa de ese circuito: sus clientes son Responsables Inscriptos.
- 💡 *Idea anotada para el futuro*: construir una alerta automática de "acumulado 12 meses vs. tope de categoría" (en el ERP, que ya tiene los datos). Si les interesa, se diseña como hicimos con el resto.
