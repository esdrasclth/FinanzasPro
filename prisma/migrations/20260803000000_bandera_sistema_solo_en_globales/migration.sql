-- La bandera `es_sistema` solo tiene sentido en las categorías globales.
--
-- Desde que "Saldo inicial" pasó a ser global (20260802000000), de sistema son
-- únicamente las que no tienen dueño. Quedaron sueltas categorías propias de
-- algún usuario con la bandera encendida —"Alquiler", por ejemplo— que no están
-- en el seed y por tanto no son del sistema. El único efecto de esa bandera era
-- que su dueño no podía editarlas ni borrarlas.
--
-- Sus movimientos, presupuestos y subcategorías no se tocan: solo se apaga la
-- bandera y vuelven a ser categorías normales de quien las creó.

UPDATE "categories"
SET "es_sistema" = false
WHERE "user_id" IS NOT NULL AND "es_sistema";
