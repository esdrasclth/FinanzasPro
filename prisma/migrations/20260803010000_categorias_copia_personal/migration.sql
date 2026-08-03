-- Copia personal de una categoría predeterminada.
--
-- Las predeterminadas ("Supermercado", "Salario"...) son una sola fila global
-- compartida por todas las cuentas, así que nadie podía renombrarlas: el cambio
-- se lo habría hecho a todos. Ahora, al editar una, el usuario se lleva una
-- copia propia con lo suyo dentro, y `origen_id` recuerda a cuál sustituye para
-- que la global deje de aparecerle solo a él.

ALTER TABLE "categories" ADD COLUMN "origen_id" UUID;

CREATE INDEX "categories_origen_id_idx" ON "categories"("origen_id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_origen_id_fkey"
  FOREIGN KEY ("origen_id") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
