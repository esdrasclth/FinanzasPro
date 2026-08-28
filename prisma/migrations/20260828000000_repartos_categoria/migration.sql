-- Categoría del reparto.
--
-- El gasto del reparto y cada cobro se creaban sin `category_id`, así que un
-- reparto de Spotify aparecía como ocho movimientos sueltos con la categoría en
-- blanco: no entraban en ningún presupuesto ni en el desglose de los reportes.
--
-- La categoría se guarda en el reparto —no solo en su transacción— porque la
-- heredan las dos patas: el gasto que lo registra y cada cobro que llega
-- después, incluso meses más tarde. Al cobrarle a alguien hay que saber en qué
-- categoría cae ese ingreso, y la transacción del gasto puede ya no existir
-- (si pagó otra persona nunca hubo gasto propio).
--
-- Que el cobro lleve la categoría del gasto es lo que permite netear: un
-- ingreso con categoría de gasto se resta dentro de esa categoría en vez de
-- sumar aparte (ver porCategoria en lib/finanzas.ts). Sin eso, Suscripciones
-- marcaría los L309.40 de Spotify aunque los cuatro que lo comparten hayan
-- devuelto su parte.
--
-- ON DELETE SET NULL, igual que en `debts`: borrar una categoría no debe
-- llevarse por delante el reparto ni su historial de cobros.
ALTER TABLE "repartos" ADD COLUMN "category_id" UUID;

ALTER TABLE "repartos"
  ADD CONSTRAINT "repartos_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "repartos_category_id_idx" ON "repartos"("category_id");
