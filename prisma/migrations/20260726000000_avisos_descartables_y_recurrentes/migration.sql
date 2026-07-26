-- 1. Avisos descartables.
--
-- Los avisos de la campana se calculan al vuelo a partir de presupuestos,
-- deudas y tarjetas: no existen como filas, así que no había dónde marcar
-- "ya lo vi" y la misma alerta perseguía al usuario todo el mes.
--
-- `periodo` acota el descarte a un ciclo (el mes para presupuestos, la fecha de
-- vencimiento para deudas...), de modo que el aviso reaparezca el siguiente.
CREATE TABLE "notificaciones_descartadas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notificaciones_descartadas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notificaciones_descartadas_user_id_clave_periodo_key"
    ON "notificaciones_descartadas" ("user_id", "clave", "periodo");
CREATE INDEX "notificaciones_descartadas_user_id_idx"
    ON "notificaciones_descartadas" ("user_id");

-- 2. Movimientos recurrentes de ingreso.
--
-- La recurrencia ya estaba resuelta en subscriptions (frecuencia, próximo cobro,
-- confirmación del cobro). Lo único que faltaba para cubrir un sueldo o una
-- renta era el signo, así que se añade el tipo en vez de montar un sistema
-- paralelo que duplicaría la misma lógica.
ALTER TABLE "subscriptions" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'gasto';
