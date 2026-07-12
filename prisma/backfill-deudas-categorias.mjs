import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Crea la categoría raíz "Deudas" (por usuario) y una subcategoría por cada
// deuda activa del tipo 'debo' que aún no tenga category_id. Idempotente.
async function main() {
  const deudas = await prisma.debts.findMany({
    where: { tipo: 'debo', completada: false, category_id: null },
  })

  const rootPorUsuario = new Map()

  const asegurarRaiz = async (userId) => {
    if (rootPorUsuario.has(userId)) return rootPorUsuario.get(userId)
    let root = await prisma.categories.findFirst({
      where: { user_id: userId, protegida: true },
    })
    if (!root) {
      root = await prisma.categories.create({
        data: {
          user_id: userId,
          nombre: 'Deudas',
          tipo: 'gasto',
          icono: '🤝',
          color: '#0EA5E9',
          es_sistema: false,
          protegida: true,
          archivada: false,
        },
      })
    }
    rootPorUsuario.set(userId, root.id)
    return root.id
  }

  let creadas = 0
  for (const deuda of deudas) {
    const rootId = await asegurarRaiz(deuda.user_id)
    const sub = await prisma.categories.create({
      data: {
        user_id: deuda.user_id,
        nombre: deuda.nombre,
        tipo: 'gasto',
        icono: '💸',
        color: '#EF4444',
        parent_id: rootId,
        es_sistema: false,
        protegida: false,
        archivada: false,
      },
    })
    await prisma.debts.update({
      where: { id: deuda.id },
      data: { category_id: sub.id },
    })
    creadas++
  }

  console.log(`Backfill completado: ${creadas} subcategorías de deuda creadas para ${rootPorUsuario.size} usuario(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
