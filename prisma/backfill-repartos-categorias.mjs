import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Asigna categoría a los repartos que se crearon sin ella, y se la propaga a
 * sus movimientos: el gasto que los registra y cada cobro que ya se recibió.
 *
 * Los repartos guardaban sus transacciones sin `category_id`, así que un
 * reparto de Spotify quedaba como ocho movimientos con la categoría en blanco.
 * Desde que la categoría se elige al crear el reparto eso ya no pasa, pero los
 * anteriores siguen sueltos y solo tú sabes a qué categoría pertenece cada uno.
 *
 * Que el cobro (un ingreso) herede una categoría de GASTO es intencional: así
 * cuenta como reembolso y resta dentro de esa categoría en vez de sumar aparte
 * (ver porCategoria en app/lib/finanzas.ts). El resultado es que la categoría
 * muestra lo que el reparto te costó de verdad y no el recibo entero que
 * adelantaste por todos.
 *
 * Uso:
 *
 *   # 1. Ver qué repartos están sin categoría y qué categorías tienes
 *   node --env-file=.env prisma/backfill-repartos-categorias.mjs
 *
 *   # 2. Simular la asignación (no escribe nada)
 *   node --env-file=.env prisma/backfill-repartos-categorias.mjs \
 *     "Spotify=Suscripciones" "Cena en Dennys=Comida"
 *
 *   # 3. Aplicarla
 *   node --env-file=.env prisma/backfill-repartos-categorias.mjs --aplicar \
 *     "Spotify=Suscripciones" "Cena en Dennys=Comida"
 *
 * Simula por defecto a propósito: escribe en movimientos que ya existen y que
 * salen en tus reportes, así que conviene leer antes lo que va a tocar.
 * Idempotente: correrlo dos veces no cambia nada la segunda.
 */

const APLICAR = process.argv.includes('--aplicar')
const PARES = process.argv.slice(2).filter(a => a !== '--aplicar')

const norm = (s) => (s || '').trim().toLowerCase()

async function main() {
  const repartos = await prisma.repartos.findMany({
    where: { category_id: null },
    include: { participantes: true },
    orderBy: { fecha: 'desc' },
  })

  if (repartos.length === 0) {
    console.log('No hay repartos sin categoría. Nada que hacer.')
    return
  }

  // Las categorías se resuelven por nombre dentro del usuario dueño del
  // reparto: dos usuarios pueden tener cada uno su "Comida".
  const userIds = [...new Set(repartos.map(r => r.user_id))]
  const categorias = await prisma.categories.findMany({
    where: {
      tipo: 'gasto',
      archivada: false,
      OR: [{ user_id: { in: userIds } }, { user_id: null, es_sistema: true }],
    },
    select: { id: true, nombre: true, user_id: true },
    orderBy: { nombre: 'asc' },
  })

  const buscarCat = (userId, nombre) =>
    categorias.find(c => norm(c.nombre) === norm(nombre) && (c.user_id === userId || c.user_id === null))

  if (PARES.length === 0) {
    console.log(`\nRepartos sin categoría (${repartos.length}):\n`)
    for (const r of repartos) {
      const cobros = r.participantes.filter(p => p.transaction_id).length
      // El gasto propio solo existe si pagaste tú.
      const movs = (r.transaction_id ? 1 : 0) + cobros
      console.log(
        `  ${r.fecha.toISOString().slice(0, 10)}  ${r.descripcion}` +
        `  (${r.moneda} ${r.monto_total.toFixed(2)}, ${movs} movimiento${movs === 1 ? '' : 's'})`
      )
    }
    console.log(`\nCategorías de gasto disponibles:\n`)
    console.log('  ' + [...new Set(categorias.map(c => c.nombre))].join('\n  '))
    console.log(`\nAhora simula la asignación:\n`)
    console.log(`  node --env-file=.env prisma/backfill-repartos-categorias.mjs "${repartos[0].descripcion}=NombreDeCategoria"\n`)
    return
  }

  // "Descripción=Categoría". La descripción puede llevar '=' dentro, así que se
  // parte por el ÚLTIMO separador y no por el primero.
  const asignaciones = []
  for (const par of PARES) {
    const corte = par.lastIndexOf('=')
    if (corte < 1) {
      console.error(`Par inválido: "${par}". Formato: "Descripción=Categoría"`)
      process.exit(1)
    }
    asignaciones.push({ desc: par.slice(0, corte).trim(), cat: par.slice(corte + 1).trim() })
  }

  let tocados = 0
  let movimientos = 0

  for (const { desc, cat } of asignaciones) {
    const coincidencias = repartos.filter(r => norm(r.descripcion) === norm(desc))
    if (coincidencias.length === 0) {
      console.error(`  ⚠ Sin reparto que coincida con "${desc}" (¿ya tiene categoría?)`)
      continue
    }

    for (const r of coincidencias) {
      const categoria = buscarCat(r.user_id, cat)
      if (!categoria) {
        console.error(`  ⚠ "${cat}" no existe como categoría de gasto para el dueño de "${r.descripcion}"`)
        continue
      }

      // El gasto (si lo pagaste tú) y todos los cobros ya recibidos.
      const txIds = [r.transaction_id, ...r.participantes.map(p => p.transaction_id)].filter(Boolean)

      console.log(
        `  ${r.descripcion} → ${categoria.nombre}` +
        `  (reparto + ${txIds.length} movimiento${txIds.length === 1 ? '' : 's'})`
      )

      if (APLICAR) {
        // En una transacción: que no quede el reparto categorizado con sus
        // movimientos sin tocar, que es peor que el estado actual porque la
        // pantalla diría una cosa y los reportes otra.
        await prisma.$transaction(async (tx) => {
          await tx.repartos.update({ where: { id: r.id }, data: { category_id: categoria.id } })
          if (txIds.length > 0) {
            await tx.transactions.updateMany({
              where: { id: { in: txIds } },
              data: { category_id: categoria.id },
            })
          }
        })
      }

      tocados++
      movimientos += txIds.length
    }
  }

  console.log(
    `\n${APLICAR ? 'Aplicado' : 'SIMULACIÓN'}: ${tocados} reparto(s) y ${movimientos} movimiento(s).`
  )
  if (!APLICAR && tocados > 0) {
    console.log('Vuelve a correrlo con --aplicar para escribirlo.\n')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
