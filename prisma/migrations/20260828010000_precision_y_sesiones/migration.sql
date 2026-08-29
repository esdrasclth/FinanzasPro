-- Los importes financieros dejan de almacenarse como DOUBLE PRECISION. La
-- conversión redondea a la escala declarada para que cualquier residuo binario
-- previo quede normalizado una sola vez durante la migración.
ALTER TABLE "users"
  ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "wallets"
  ALTER COLUMN "saldo_inicial" TYPE DECIMAL(19,4) USING ROUND("saldo_inicial"::numeric, 4),
  ALTER COLUMN "credito_limite" TYPE DECIMAL(19,4) USING ROUND("credito_limite"::numeric, 4);

ALTER TABLE "exchange_rates"
  ALTER COLUMN "tasa" TYPE DECIMAL(19,8) USING ROUND("tasa"::numeric, 8);

ALTER TABLE "transactions"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4),
  ALTER COLUMN "monto_original" TYPE DECIMAL(19,4) USING ROUND("monto_original"::numeric, 4),
  ALTER COLUMN "tasa_cambio" TYPE DECIMAL(19,8) USING ROUND("tasa_cambio"::numeric, 8);

ALTER TABLE "budgets"
  ALTER COLUMN "monto_limite" TYPE DECIMAL(19,4) USING ROUND("monto_limite"::numeric, 4);

ALTER TABLE "metas"
  ALTER COLUMN "monto_objetivo" TYPE DECIMAL(19,4) USING ROUND("monto_objetivo"::numeric, 4),
  ALTER COLUMN "monto_actual" TYPE DECIMAL(19,4) USING ROUND("monto_actual"::numeric, 4);

ALTER TABLE "meta_aportes"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4);

ALTER TABLE "debts"
  ALTER COLUMN "monto_total" TYPE DECIMAL(19,4) USING ROUND("monto_total"::numeric, 4),
  ALTER COLUMN "monto_pagado" TYPE DECIMAL(19,4) USING ROUND("monto_pagado"::numeric, 4),
  ALTER COLUMN "tasa_interes" TYPE DECIMAL(9,4) USING ROUND("tasa_interes"::numeric, 4);

ALTER TABLE "debt_payments"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4);

ALTER TABLE "subscriptions"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4);

ALTER TABLE "subscription_charges"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4);

ALTER TABLE "gastos_compartidos"
  ALTER COLUMN "monto_total" TYPE DECIMAL(19,4) USING ROUND("monto_total"::numeric, 4);

ALTER TABLE "gasto_pagos"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4);

ALTER TABLE "gasto_divisiones"
  ALTER COLUMN "monto_asignado" TYPE DECIMAL(19,4) USING ROUND("monto_asignado"::numeric, 4),
  ALTER COLUMN "valor" TYPE DECIMAL(19,4) USING ROUND("valor"::numeric, 4);

ALTER TABLE "liquidaciones"
  ALTER COLUMN "monto" TYPE DECIMAL(19,4) USING ROUND("monto"::numeric, 4);

ALTER TABLE "repartos"
  ALTER COLUMN "monto_total" TYPE DECIMAL(19,4) USING ROUND("monto_total"::numeric, 4);

ALTER TABLE "reparto_participantes"
  ALTER COLUMN "monto_asignado" TYPE DECIMAL(19,4) USING ROUND("monto_asignado"::numeric, 4);
