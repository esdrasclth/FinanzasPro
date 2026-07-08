-- CreateTable
CREATE TABLE "repartos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto_total" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'HNL',
    "metodo" TEXT NOT NULL DEFAULT 'igual',
    "fecha" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repartos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reparto_participantes" (
    "id" UUID NOT NULL,
    "reparto_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto_asignado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_pago" DATE,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reparto_participantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repartos_user_id_idx" ON "repartos"("user_id");

-- CreateIndex
CREATE INDEX "reparto_participantes_reparto_id_idx" ON "reparto_participantes"("reparto_id");

-- AddForeignKey
ALTER TABLE "reparto_participantes" ADD CONSTRAINT "reparto_participantes_reparto_id_fkey" FOREIGN KEY ("reparto_id") REFERENCES "repartos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
