-- Los íconos de categoría pasan de emoji a los trazos del menú (lucide).
--
-- `categories.icono` guarda ahora una clave como "ShoppingCart". El catálogo
-- está en app/components/IconoCategoria.tsx. Lo que no se pueda traducir se
-- queda como está y se sigue pintando tal cual, así que nada se rompe.
--
-- Solo se tocan las filas que aún tienen icono viejo: una clave ya válida es
-- CamelCase ASCII, y eso deja fuera a los emojis, a "C" y a los vacíos. Así la
-- migración no le pisa el ícono a quien ya haya elegido uno nuevo.

-- 1. Por nombre, que acierta más que el emoji: quien puso 🚿 en "Parqueos"
--    quería un parqueo, no una ducha.
UPDATE "categories" c SET "icono" = m.clave
FROM (VALUES
  ('agua', 'Droplet'), ('ahorros', 'PiggyBank'), ('ahorro', 'PiggyBank'),
  ('alimentos', 'Utensils'), ('alquiler', 'House'), ('bienestar', 'Sparkles'),
  ('cafe', 'Coffee'), ('café', 'Coffee'), ('combustible', 'Fuel'),
  ('comida', 'Utensils'), ('comida y bebida', 'Utensils'), ('compras', 'ShoppingBag'),
  ('compra de vehiculo', 'Car'), ('compra de vehículo', 'Car'),
  ('despensa', 'ShoppingBasket'), ('deudas', 'Handshake'), ('pago de deuda', 'Handshake'),
  ('educación', 'GraduationCap'), ('educacion', 'GraduationCap'),
  ('electricidad', 'Zap'), ('entretenimiento', 'Gamepad2'),
  ('gym', 'Dumbbell'), ('gimnasio', 'Dumbbell'), ('hogar', 'House'),
  ('internet', 'Wifi'), ('inversiones', 'TrendingUp'), ('mantenimiento', 'Wrench'),
  ('mascotas', 'PawPrint'), ('negocio', 'Store'), ('netflix', 'Clapperboard'),
  ('otros gastos', 'Package'), ('otros ingresos', 'Banknote'),
  ('parqueos', 'SquareParking'), ('parqueo', 'SquareParking'),
  ('pulperia', 'Store'), ('pulpería', 'Store'), ('regalo', 'Gift'), ('regalos', 'Gift'),
  ('restaurantes', 'UtensilsCrossed'), ('restaurante', 'UtensilsCrossed'),
  ('ropa', 'Shirt'), ('salario', 'Briefcase'), ('salud', 'HeartPulse'),
  ('seguros', 'ShieldCheck'), ('seguro', 'ShieldCheck'), ('servicios', 'Lightbulb'),
  ('supermercado', 'ShoppingCart'), ('suscripciones', 'Repeat'), ('claude', 'Laptop'),
  ('telefono', 'Smartphone'), ('teléfono', 'Smartphone'), ('transporte', 'Car'),
  ('viajes', 'Plane'), ('ocio', 'TreePalm'),
  ('saldo inicial', 'Landmark'), ('ajuste de saldo', 'Scale'), ('transferencia', 'ArrowLeftRight')
) AS m(nombre, clave)
WHERE lower(btrim(c."nombre")) = m.nombre
  AND (c."icono" IS NULL OR c."icono" !~ '^[A-Z][A-Za-z0-9]+$');

-- 2. Lo que quede, por su emoji.
UPDATE "categories" c SET "icono" = m.clave
FROM (VALUES
  ('🍔', 'Utensils'), ('🍕', 'UtensilsCrossed'), ('🍜', 'Utensils'), ('☕', 'Coffee'),
  ('🥤', 'Coffee'), ('🍺', 'Beer'), ('🍷', 'Wine'), ('🎂', 'Cake'),
  ('🛒', 'ShoppingCart'), ('🛍️', 'ShoppingBag'), ('🏪', 'Store'),
  ('🚗', 'Car'), ('🚌', 'Bus'), ('✈️', 'Plane'), ('🚿', 'Droplet'),
  ('🏠', 'House'), ('💡', 'Lightbulb'), ('⚡', 'Zap'), ('💧', 'Droplet'),
  ('🔧', 'Wrench'), ('🧹', 'Hammer'), ('📱', 'Smartphone'), ('💻', 'Laptop'),
  ('🌐', 'Wifi'), ('🎮', 'Gamepad2'), ('🎬', 'Clapperboard'), ('🎵', 'Music'),
  ('📚', 'BookOpen'), ('🎓', 'GraduationCap'), ('🏥', 'Stethoscope'), ('💊', 'Pill'),
  ('👕', 'Shirt'), ('👟', 'Shirt'), ('💄', 'Scissors'), ('🐾', 'PawPrint'),
  ('🏋️', 'Dumbbell'), ('⚽', 'Dumbbell'), ('🌴', 'TreePalm'), ('🎁', 'Gift'),
  ('💰', 'PiggyBank'), ('💳', 'CreditCard'), ('📈', 'TrendingUp'), ('🏦', 'Landmark'),
  ('💸', 'Banknote'), ('💼', 'Briefcase'), ('🤝', 'Handshake'), ('⚖️', 'Scale'),
  ('↔️', 'ArrowLeftRight'), ('📦', 'Package'), ('🏷️', 'Tag'), ('🔑', 'Tag'), ('🎯', 'Tag')
) AS m(emoji, clave)
WHERE c."icono" = m.emoji;

-- 3. Las que se quedaron sin nada (ni nombre conocido ni emoji) toman la
--    etiqueta neutra, que es lo que ya se les pintaba por defecto.
UPDATE "categories" SET "icono" = 'Tag'
WHERE "icono" IS NULL OR btrim("icono") = '';
