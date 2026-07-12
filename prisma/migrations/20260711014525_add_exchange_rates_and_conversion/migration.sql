-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "monto_original" DOUBLE PRECISION,
ADD COLUMN     "tasa_cambio" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "moneda_origen" TEXT NOT NULL,
    "moneda_destino" TEXT NOT NULL,
    "tasa" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'BCH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_moneda_origen_moneda_destino_fecha_idx" ON "exchange_rates"("moneda_origen", "moneda_destino", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_moneda_origen_moneda_destino_fecha_fuente_key" ON "exchange_rates"("moneda_origen", "moneda_destino", "fecha", "fuente");
