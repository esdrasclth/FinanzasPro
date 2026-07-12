-- Suscripciones recurrentes: nombre, plan, monto, frecuencia de cobro,
-- fecha de inicio (ancla del ciclo), próximo cobro opcional y estado.
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "plan" TEXT,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'HNL',
    "frecuencia" TEXT NOT NULL DEFAULT 'mensual',
    "category_id" UUID,
    "wallet_id" UUID,
    "fecha_inicio" DATE NOT NULL,
    "proximo_cobro" DATE,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "color" TEXT,
    "icono" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");
