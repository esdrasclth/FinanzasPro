-- Establecimiento del gasto, separado del concepto.
--
-- El concepto responde a "qué se compró" (pizza) y el lugar a "dónde"
-- (Pizza Hut). Hasta ahora ambos competían por el mismo campo de descripción,
-- y en el reporte de liquidación hacen falta los dos por separado.
ALTER TABLE "repartos" ADD COLUMN "lugar" TEXT;
