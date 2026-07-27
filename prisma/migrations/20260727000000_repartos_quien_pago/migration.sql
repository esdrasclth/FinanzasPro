-- Quién pagó un reparto y cómo.
--
-- Hasta ahora un reparto asumía que el dinero salía siempre de tus carteras.
-- En la práctica el gasto lo pone cualquiera del grupo y luego se cuadra, así
-- que hacía falta poder registrar que pagó otra persona y con qué medio, que
-- es el dato que pide el reporte de liquidación.
--
--   pagado_por NULL -> pagaste tú (comportamiento anterior, sin cambios)
--   pagado_por con nombre -> pagó otra persona: no se toca ninguna cartera tuya
ALTER TABLE "repartos" ADD COLUMN "pagado_por" TEXT;
ALTER TABLE "repartos" ADD COLUMN "metodo_pago" TEXT;
ALTER TABLE "repartos" ADD COLUMN "metodo_detalle" TEXT;
