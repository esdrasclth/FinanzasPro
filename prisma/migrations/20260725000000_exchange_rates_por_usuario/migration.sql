-- Las tasas manuales dejan de ser globales.
--
-- Antes exchange_rates no tenía dueño: cuando un usuario fijaba una tasa manual
-- desde /api/tipo-cambio, esa tasa se le aplicaba a TODOS los usuarios de la
-- instancia. La tasa del BCH sí es global por naturaleza (es la cifra publicada
-- por el banco central), así que se distingue por user_id:
--   user_id IS NULL     -> tasa global (BCH), compartida
--   user_id IS NOT NULL -> override manual de ese usuario
ALTER TABLE "exchange_rates" ADD COLUMN "user_id" UUID;

-- La unicidad anterior no contemplaba al dueño: dos usuarios no podían tener
-- su propia tasa manual del mismo día.
DROP INDEX IF EXISTS "exchange_rates_moneda_origen_moneda_destino_fecha_fuente_key";

CREATE UNIQUE INDEX "exchange_rates_par_fecha_fuente_usuario_key"
    ON "exchange_rates" ("moneda_origen", "moneda_destino", "fecha", "fuente", "user_id");

CREATE INDEX "exchange_rates_user_id_idx" ON "exchange_rates" ("user_id");

-- Nota sobre los datos existentes: las filas con fuente='manual' anteriores a
-- esta migración quedan con user_id NULL. No se borran (son caché de tasas, no
-- registros del usuario) pero el código nuevo ya no las selecciona: las tasas
-- globales se leen solo con fuente='BCH' y las manuales solo con user_id. En la
-- práctica quedan inertes y dejan de filtrarse entre usuarios.
--
-- Sobre la fila global: en Postgres los NULL no chocan entre sí en un índice
-- único, así que la unicidad de las filas del BCH (user_id NULL) no queda
-- garantizada por la base. El código las escribe con findFirst + create/update
-- y, si dos peticiones compiten, lo peor que pasa es una fila de caché repetida
-- con el mismo valor. Se prefirió esto a un índice parcial porque Prisma no
-- sabe expresarlo y un `migrate dev` futuro lo borraría sin avisar.
