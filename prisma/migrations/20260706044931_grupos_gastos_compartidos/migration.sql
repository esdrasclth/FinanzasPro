-- CreateTable
CREATE TABLE "grupos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "codigo_invitacion" TEXT NOT NULL,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupo_miembros" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'miembro',
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupo_miembros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_compartidos" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto_total" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "category_id" UUID,
    "recibo_url" TEXT,
    "metodo_division" TEXT NOT NULL,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_compartidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto_pagos" (
    "id" UUID NOT NULL,
    "gasto_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID,
    "transaction_id" UUID,
    "monto" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "gasto_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto_divisiones" (
    "id" UUID NOT NULL,
    "gasto_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "monto_asignado" DOUBLE PRECISION NOT NULL,
    "valor" DOUBLE PRECISION,

    CONSTRAINT "gasto_divisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "de_user_id" UUID NOT NULL,
    "a_user_id" UUID NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" TEXT,
    "de_wallet_id" UUID,
    "de_transaction_id" UUID,
    "a_wallet_id" UUID,
    "a_transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grupos_codigo_invitacion_key" ON "grupos"("codigo_invitacion");

-- CreateIndex
CREATE INDEX "grupo_miembros_user_id_idx" ON "grupo_miembros"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupo_miembros_grupo_id_user_id_key" ON "grupo_miembros"("grupo_id", "user_id");

-- CreateIndex
CREATE INDEX "gastos_compartidos_grupo_id_anio_mes_idx" ON "gastos_compartidos"("grupo_id", "anio", "mes");

-- CreateIndex
CREATE INDEX "gasto_pagos_gasto_id_idx" ON "gasto_pagos"("gasto_id");

-- CreateIndex
CREATE INDEX "gasto_pagos_user_id_idx" ON "gasto_pagos"("user_id");

-- CreateIndex
CREATE INDEX "gasto_divisiones_gasto_id_idx" ON "gasto_divisiones"("gasto_id");

-- CreateIndex
CREATE INDEX "gasto_divisiones_user_id_idx" ON "gasto_divisiones"("user_id");

-- CreateIndex
CREATE INDEX "liquidaciones_grupo_id_idx" ON "liquidaciones"("grupo_id");

-- AddForeignKey
ALTER TABLE "grupo_miembros" ADD CONSTRAINT "grupo_miembros_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_compartidos" ADD CONSTRAINT "gastos_compartidos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto_pagos" ADD CONSTRAINT "gasto_pagos_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos_compartidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto_divisiones" ADD CONSTRAINT "gasto_divisiones_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos_compartidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
