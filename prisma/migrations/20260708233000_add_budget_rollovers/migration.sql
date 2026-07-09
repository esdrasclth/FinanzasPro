-- CreateTable
CREATE TABLE "budget_rollovers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_rollovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_rollovers_user_id_idx" ON "budget_rollovers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_rollovers_user_id_mes_ano_key" ON "budget_rollovers"("user_id", "mes", "ano");
