# Pruebas de extremo a extremo

Cubren los caminos que mueven dinero y las reglas que, si se rompen, dejan los
datos descuadrados sin que se note: transferencias, abonos, aportes a metas,
cobros de recurrentes, repartos y liquidaciones.

No son pruebas de interfaz. Cada suite habla con la app por HTTP igual que lo
hace el navegador, crea su propio usuario y sus propios datos, y comprueba el
estado resultante. Por eso se pueden correr en cualquier orden.

## Cómo se corren

Necesitan la base **local**, nunca la de producción: crean usuarios y
movimientos de prueba.

```bash
# 1. Base local en Docker
npm run db:up
npx prisma migrate deploy

# 2. Servidor apuntando a esa base
#    (el .env debe tener activas las líneas de localhost, no las de Neon)
npm run dev

# 3. En otra terminal
npm run test:e2e
```

Para una sola suite, se filtra por parte del nombre:

```bash
npm run test:e2e -- repartos
```

Contra otro servidor:

```bash
BASE_URL=http://localhost:3001 npm run test:e2e
```

## Antes de tocar el .env

Las suites escriben datos. Si el `.env` apunta a Neon, los escribirán **ahí**.
Comprueba a dónde apunta Prisma antes de empezar:

```bash
npx prisma migrate status   # imprime el host de la base
```

Y guarda una copia del `.env` antes de cambiarlo.

## Qué cubre cada suite

| Suite | Qué protege |
|---|---|
| `01-transferencias-y-abonos` | Que una transferencia escriba sus dos piernas o ninguna, y que dos abonos simultáneos no se pisen |
| `02-tipo-cambio-y-grupos` | Que la tasa manual de un usuario no se le aplique a los demás; moneda de los gastos de grupo |
| `03-borrado-metas-y-cobros` | Que borrar un movimiento revierta su contraparte (deuda, meta, cobro) y no deje huérfanos |
| `04-proteccion-de-rutas-y-saldos` | Que las rutas privadas no se sirvan sin sesión; saldos de carteras calculados en la base |
| `05-avisos-busqueda-y-lote` | Avisos descartables por periodo, búsqueda en todo el historial, acciones en lote |
| `06-movimientos-y-presupuesto` | Traspaso automático de presupuestos (que no se duplique) y duplicado de movimientos |
| `07-deudas-perfil-y-carteras` | Que no se pueda borrar una cartera con historial; deudas, perfil y dashboard |
| `08-escritura-categorias-metas-deudas` | Validaciones de servidor: objetivo menor a lo ahorrado, total menor a lo abonado |
| `09-escritura-de-formularios` | Alta de cartera con su saldo de apertura en una sola transacción |
| `10-repartos-quien-pago` | Que si pagó otra persona no salga dinero de tus carteras, y la dirección del cobro |
| `11-repartos-liquidacion` | El reporte de liquidación: desglose, totales, reparto por persona y quién paga a quién |

## Una deuda pendiente

Varias suites siembran datos usando `POST /api/db`, el proxy genérico que
quedó de la migración desde supabase-js. Ninguna pantalla de la app lo usa ya;
solo estas pruebas.

Mientras siga ahí, `/api/db` y `app/lib/supabase.ts` no se pueden borrar. El
paso pendiente es reescribir esas siembras contra las rutas propias —que ya
existen para todo lo que necesitan— y entonces eliminar ambos archivos, junto
con sus listas de coerción por nombre de columna (`DATE_COLS`, `NUM_COLS`,
`BOOL_COLS`), que hay que recordar actualizar cada vez que se añade un campo.
