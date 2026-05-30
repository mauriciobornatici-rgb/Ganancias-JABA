# Walkthrough: Asistente de Liquidación Optimizado (6 Pasos) y Papel de Trabajo

Se ha completado con éxito la reestructuración completa del flujo de liquidación comercial del Impuesto a las Ganancias de 3ra Categoría. El asistente se redujo de **10 pasos genéricos a 6 pasos profesionales de alta densidad**, adaptados al flujo de trabajo contable real de Argentina. 

Además, se incorporó un detallado **Papel de Trabajo Determinativo Consolidado** en el paso final (Paso 6) para una auditoría visual inmediata por parte del profesional.

---

## 1. Cambios Realizados

### Consolidación de Pasos
El flujo de pasos quedó organizado de la siguiente manera:
1. **Paso 1: Contribuyente y Perfil Fiscal** (Fusión de identificación, deducciones de cargas de familia Art. 30 y patrimonio al inicio del balance).
2. **Paso 2: Ingresos y Ventas** (Ingresos brutos ordinarios devengados o exentos).
3. **Paso 3: Gastos y Existencias (CMV)** (Existencia Inicial, Compras y Existencia Final con tarjeta interactiva en vivo del Costo de Ventas recalculándose inmediatamente).
4. **Paso 4: Patrimonio y Activos Fijos** (Amortizaciones de Bienes de Uso, Cuentas Bancarias, Activos Personales, Pasivos Personales y tarjeta de Pre-Conciliación Patrimonial al pie).
5. **Paso 5: Deducciones y Ajustes** (Deducciones Generales con acordeón inteligente, Retenciones Sufridas, Quebrantos y AXI Dinámico).
6. **Paso 6: Liquidación y Cierre** (Determinación final, alertas de AFIP, Proyección de Anticipos y el **nuevo Papel de Trabajo**).

---

## 2. Nuevo Papel de Trabajo Determinativo Consolidado
Se diseñó un panel exclusivo imitando las planillas profesionales F. 711 para un análisis rápido de la consistencia fiscal:

```
+-----------------------------------------------------------------------------+
|                     DDJJ GANANCIAS F. 711 - JABA                            |
+-----------------------------------------------------------------------------+
| Rubro / Concepto              | Referencia Legal        | Importe           |
+-------------------------------+-------------------------+-------------------+
| 1. Resultado 3ra Categoría    |                         |                   |
|    Ventas Gravadas            | Facturación 3ra Cat     | $ X.XXX.XXX       |
|    (-) CMV                    | EI + Compras - EF       | ($ X.XXX.XXX)     |
|    (-) Gastos Explotación     | Gastos Deducibles       | ($ X.XXX.XXX)     |
|    (-) Amortizaciones Bienes  | Depreciación Impositiva | ($ X.XXX.XXX)     |
|    (+/-) Ajuste por Inflación | AXI Neto (Est. + Din.)  | $ X.XXX.XXX       |
|    Resultado Comercial Neto   | Subtotal Balance        | $ X.XXX.XXX       |
+-------------------------------+-------------------------+-------------------+
| 2. Deducciones y Quebrantos   |                         |                   |
|    (-) Deducciones Generales  | Art. 85 / 86            | ($ X.XXX.XXX)     |
|    (-) Quebrantos Anteriores  | Compensación            | ($ X.XXX.XXX)     |
|    Ganancia Impositiva Neta   | Resultado antes Art. 30 | $ X.XXX.XXX       |
+-------------------------------+-------------------------+-------------------+
| 3. Deducciones Personales     |                         |                   |
|    (-) Mínimo No Imponible    | Art. 30, Inc. a         | ($ X.XXX.XXX)     |
|    (-) Cargas de Familia      | Art. 30, Inc. b         | ($ X.XXX.XXX)     |
|    (-) Deducción Especial     | Art. 30, Inc. c         | ($ X.XXX.XXX)     |
|    Ganancia Neta Sujeta a Imp.| Base Imponible Escala   | $ X.XXX.XXX       |
+-------------------------------+-------------------------+-------------------+
| 4. Determinación y Saldos     |                         |                   |
|    Impuesto Determinado       | Escala Progresiva Art.94| $ X.XXX.XXX       |
|    (-) Retenciones Sufridas   | Pagos a Cuenta          | ($ X.XXX.XXX)     |
|    (-) Saldo Período Anterior | Libre Disponibilidad    | ($ X.XXX.XXX)     |
|    Saldo Final Declarado      | ARCA / AFIP             | $ X.XXX.XXX       |
+-----------------------------------------------------------------------------+
```

* **Estética**: Acabados en tonalidades de alto contraste con tipografía monoespaciada, resaltados de color para saldos impositivos negativos (saldo a favor del contribuyente en verde esmeralda `emerald-400` e impuesto a pagar en cian `teal-400`).

---

## 3. Control de Errores y Capping
1. **Límite de Navegación**: Se reescribieron los límites superiores del wizard en la barra inferior y en la consola impositiva flotante para asegurar que la navegación termine estrictamente en el paso 6.
2. **Restauración de Estados**: Se limitó el parámetro `currentStep` recuperado desde base de datos y cache local mediante `Math.min(6, currentStep)`. Esto previene desbordamientos de página y crashes de renderizado si el borrador original fue guardado en un paso superior (como 7, 8 o 10) del esquema antiguo de 10 pasos.
3. **Consistencia en Compilación**: Se validaron todas las etiquetas del balance determinativo mediante un tipado TypeScript limpio.

---

## 4. Resultados de Verificación
1. **Compilación TS (`npx tsc --noEmit`)**:
   * **Resultado**: Exitoso, 0 errores.
2. **Bundling de Producción (`npm run build`)**:
   * **Resultado**: Compilación Next.js/Turbopack exitosa en segundos. Se generaron las páginas estáticas y dinámicas correctamente.

---

## 5. Resolución de Error de Base de Datos (Pool Timeout)
* **Diagnóstico**: Durante el desarrollo en modo `next dev` con HMR (Hot Module Replacement), la importación dinámica y la recarga de módulos provocaba que se instanciaran múltiples pools de conexiones a la base de datos MySQL en Docker (`Too many connections`). Esto agotaba los puertos del contenedor y causaba errores de `pool timeout` en la interfaz al guardar.
* **Solución**:
  1. Se implementó el **patrón Singleton global** en `src/domain/ganancias/prisma.ts` utilizando `globalThis.prismaGlobal`. Esto evita que la base de datos vuelva a crear pools de conexión tras recargas en caliente.
  2. Se reinició el contenedor Docker de base de datos (`ganancias-jaba-db`) para limpiar y liberar los hilos de conexión colgados.
  3. Se validó la conectividad con una consulta interna exitosa. El guardado en la interfaz ahora opera con fluidez instantánea.
