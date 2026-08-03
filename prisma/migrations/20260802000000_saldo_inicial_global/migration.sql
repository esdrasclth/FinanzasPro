-- "Saldo inicial" pasa a ser una categoría de sistema global.
--
-- No estaba en el seed, así que la creaba la primera cartera de cada usuario y
-- quedaba con dueño (`user_id`). Como las consultas pedían las de sistema sin
-- mirar el dueño, cada usuario veía las de todos los demás: en Categorías
-- aparecía una "Saldo inicial" por cada cuenta registrada, y ninguna se dejaba
-- borrar por ser del sistema y de otro usuario.
--
-- Aquí se crean las dos globales (gasto e ingreso), se reapunta a ellas todo lo
-- que colgaba de las copias y se borran las copias. Los movimientos de apertura
-- conservan su categoría y su saldo: solo cambian de fila.

-- 1. Las dos globales, si faltan.
INSERT INTO "categories" ("id", "user_id", "nombre", "icono", "color", "tipo", "es_sistema")
SELECT gen_random_uuid(), NULL, 'Saldo inicial', '🏦', '#64748B', t.tipo, true
FROM (VALUES ('gasto'), ('ingreso')) AS t(tipo)
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c
  WHERE c."nombre" = 'Saldo inicial' AND c."tipo" = t.tipo AND c."user_id" IS NULL
);

-- 2. Todo lo que apunta a una copia con dueño pasa a la global equivalente.
UPDATE "transactions" x SET "category_id" = g."id"
FROM "categories" dup, "categories" g
WHERE x."category_id" = dup."id"
  AND dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND g."user_id" IS NULL AND g."es_sistema"
  AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo";

UPDATE "debts" d SET "category_id" = g."id"
FROM "categories" dup, "categories" g
WHERE d."category_id" = dup."id"
  AND dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND g."user_id" IS NULL AND g."es_sistema"
  AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo";

UPDATE "subscriptions" s SET "category_id" = g."id"
FROM "categories" dup, "categories" g
WHERE s."category_id" = dup."id"
  AND dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND g."user_id" IS NULL AND g."es_sistema"
  AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo";

UPDATE "gastos_compartidos" gc SET "category_id" = g."id"
FROM "categories" dup, "categories" g
WHERE gc."category_id" = dup."id"
  AND dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND g."user_id" IS NULL AND g."es_sistema"
  AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo";

UPDATE "categories" h SET "parent_id" = g."id"
FROM "categories" dup, "categories" g
WHERE h."parent_id" = dup."id"
  AND dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND g."user_id" IS NULL AND g."es_sistema"
  AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo";

-- Los presupuestos son únicos por (usuario, categoría, mes, año): solo se
-- reapuntan los que no chocan con uno que ya exista sobre la global.
UPDATE "budgets" b SET "category_id" = g."id"
FROM "categories" dup, "categories" g
WHERE b."category_id" = dup."id"
  AND dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND g."user_id" IS NULL AND g."es_sistema"
  AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo"
  AND NOT EXISTS (
    SELECT 1 FROM "budgets" b2
    WHERE b2."user_id" = b."user_id" AND b2."category_id" = g."id"
      AND b2."mes" = b."mes" AND b2."ano" = b."ano"
  );

-- 3. Fuera las copias con dueño que ya tienen global equivalente.
DELETE FROM "categories" dup
WHERE dup."es_sistema" AND dup."user_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "categories" g
    WHERE g."user_id" IS NULL AND g."es_sistema"
      AND g."nombre" = dup."nombre" AND g."tipo" = dup."tipo"
  );
