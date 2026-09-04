-- Una predeterminada es global y la comparten todas las cuentas, así que
-- no se puede borrar. En su lugar el usuario se queda una copia marcada
-- con `oculta`, que hace que la original deje de aparecerle solo a él.
ALTER TABLE "categories" ADD COLUMN     "oculta" BOOLEAN NOT NULL DEFAULT false;
