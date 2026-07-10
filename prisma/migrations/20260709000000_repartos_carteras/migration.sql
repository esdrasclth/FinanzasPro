-- AlterTable
ALTER TABLE "repartos" ADD COLUMN "wallet_id" UUID,
ADD COLUMN "transaction_id" UUID;

-- AlterTable
ALTER TABLE "reparto_participantes" ADD COLUMN "es_yo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "wallet_id" UUID,
ADD COLUMN "transaction_id" UUID;
