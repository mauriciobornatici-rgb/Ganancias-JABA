-- Punto 5 del PDF de correcciones (2026-07-24): impuesto sobre debitos y creditos bancarios
-- (impuesto al cheque) como pago a cuenta de Ganancias.
-- El porcentaje computable es por contribuyente: 33 = regimen general (art. 13 dec. 380/2001),
-- 100 = micro y pequeña empresa. Aditiva: el default deja al codigo viejo funcionando igual.
ALTER TABLE `ClientTaxProfileVersion`
  ADD COLUMN `idcbComputablePercent` INTEGER NOT NULL DEFAULT 33;
