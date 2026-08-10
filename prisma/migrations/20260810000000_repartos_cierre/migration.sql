-- Cerrar un reparto dando por perdido lo que falte.
--
-- Un reparto donde alguien nunca pagó se quedaba pendiente para siempre: seguía
-- sumando en "Por cobrar" y la única salida era borrarlo o marcar como pagado a
-- quien nunca pagó, que además habría inventado un ingreso en la cartera.
-- `cerrado_en` guarda el día en que se dio por cerrado: lo que faltaba pasa a
-- contar como perdido, no como cobrable.
ALTER TABLE "repartos" ADD COLUMN "cerrado_en" TIMESTAMP(3);
