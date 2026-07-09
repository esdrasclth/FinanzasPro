-- CreateTable
CREATE TABLE "metas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "icono" TEXT,
    "color" TEXT,
    "monto_objetivo" DOUBLE PRECISION NOT NULL,
    "monto_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha_limite" DATE,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metas_user_id_idx" ON "metas"("user_id");
