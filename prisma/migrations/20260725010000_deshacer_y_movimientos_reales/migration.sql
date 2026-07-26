-- Dos cosas que faltaban para que el dinero cuadre siempre:
--
-- 1. Poder deshacer un movimiento compuesto entero. Una transferencia son dos
--    transacciones y un abono son tres filas; sin un enlace explícito, borrar
--    una parte dejaba las otras huérfanas (dinero que sale de una cartera y no
--    llega a la otra, o una deuda que dice haber cobrado un pago inexistente).
-- 2. Que metas y suscripciones muevan dinero real en vez de solo cambiar un
--    número o mostrar un cálculo.

-- Une las dos piernas de una transferencia.
ALTER TABLE "transactions" ADD COLUMN "transfer_id" UUID;
CREATE INDEX "transactions_transfer_id_idx" ON "transactions" ("transfer_id");

-- Une un abono con la transacción de gasto que lo refleja.
ALTER TABLE "debt_payments" ADD COLUMN "transaction_id" UUID;

-- Historial de aportes a metas de ahorro. Cada aporte es una transferencia real
-- (cartera de origen -> cartera donde se guarda el ahorro).
CREATE TABLE "meta_aportes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meta_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID,
    "wallet_destino_id" UUID,
    "transfer_id" UUID,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_aportes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_aportes_meta_id_idx" ON "meta_aportes" ("meta_id");
CREATE INDEX "meta_aportes_user_id_idx" ON "meta_aportes" ("user_id");

ALTER TABLE "meta_aportes" ADD CONSTRAINT "meta_aportes_meta_id_fkey"
    FOREIGN KEY ("meta_id") REFERENCES "metas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cobros confirmados de una suscripción.
CREATE TABLE "subscription_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID,
    "transaction_id" UUID,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'HNL',
    "fecha" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id")
);

-- Impide confirmar dos veces el cobro del mismo ciclo.
CREATE UNIQUE INDEX "subscription_charges_subscription_id_fecha_key"
    ON "subscription_charges" ("subscription_id", "fecha");
CREATE INDEX "subscription_charges_user_id_idx" ON "subscription_charges" ("user_id");

ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rellena transfer_id en las transferencias que ya existían: mismo usuario,
-- misma fecha y carteras cruzadas (el origen de una es el destino de la otra).
--
-- Solo se emparejan los casos INEQUÍVOCOS: exactamente un candidato en cada
-- dirección. Si alguien hizo dos transferencias idénticas el mismo día entre las
-- mismas carteras, emparejarlas a ciegas podría asignar el mismo transfer_id a
-- tres filas y entonces borrar una se llevaría tres. Esos casos se dejan en NULL
-- y los resuelve el emparejado en tiempo de borrado, que toma un par válido
-- cualquiera: al ser idénticas, el resultado es correcto igual.
WITH candidatos AS (
    SELECT a."id" AS id_a, b."id" AS id_b
    FROM "transactions" a
    JOIN "transactions" b
      ON b."user_id" = a."user_id"
     AND b."fecha" = a."fecha"
     AND b."wallet_id" = a."wallet_destino_id"
     AND b."wallet_destino_id" = a."wallet_id"
     AND b."tipo" = 'ingreso'
     AND b."id" <> a."id"
     AND b."transfer_id" IS NULL
    WHERE a."wallet_destino_id" IS NOT NULL
      AND a."tipo" = 'gasto'
      AND a."transfer_id" IS NULL
),
unicos AS (
    SELECT id_a, (array_agg(id_b))[1] AS id_b
    FROM candidatos
    GROUP BY id_a
    HAVING COUNT(*) = 1
),
finales AS (
    SELECT u.id_a, u.id_b, gen_random_uuid() AS tid
    FROM unicos u
    WHERE (SELECT COUNT(*) FROM unicos u2 WHERE u2.id_b = u.id_b) = 1
)
UPDATE "transactions" t
SET "transfer_id" = f.tid
FROM finales f
WHERE t."id" = f.id_a OR t."id" = f.id_b;

-- Rellena debt_payments.transaction_id emparejando cada abono con su gasto
-- ligado (mismo debt_id, misma fecha y mismo monto). Misma cautela: solo cuando
-- la correspondencia es 1 a 1, para no apuntar dos abonos a la misma
-- transacción y revertir dos veces al borrarla.
WITH candidatos AS (
    SELECT p."id" AS pago_id, t."id" AS tx_id
    FROM "debt_payments" p
    JOIN "transactions" t
      ON t."debt_id" = p."debt_id"
     AND t."user_id" = p."user_id"
     AND t."fecha" = p."fecha"
     AND t."monto" = p."monto"
    WHERE p."transaction_id" IS NULL
),
unicos AS (
    SELECT pago_id, (array_agg(tx_id))[1] AS tx_id
    FROM candidatos
    GROUP BY pago_id
    HAVING COUNT(*) = 1
),
finales AS (
    SELECT u.pago_id, u.tx_id
    FROM unicos u
    WHERE (SELECT COUNT(*) FROM unicos u2 WHERE u2.tx_id = u.tx_id) = 1
)
UPDATE "debt_payments" p
SET "transaction_id" = f.tx_id
FROM finales f
WHERE p."id" = f.pago_id;
