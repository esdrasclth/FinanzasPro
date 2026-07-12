-- Campos para el cálculo financiero de deudas: fecha de inicio, tasa de
-- interés opcional (con su periodo) y plazo de pago en meses.
ALTER TABLE "debts" ADD COLUMN "fecha_inicio" DATE;
ALTER TABLE "debts" ADD COLUMN "tasa_interes" DOUBLE PRECISION;
ALTER TABLE "debts" ADD COLUMN "tasa_periodo" TEXT;
ALTER TABLE "debts" ADD COLUMN "plazo_meses" INTEGER;
