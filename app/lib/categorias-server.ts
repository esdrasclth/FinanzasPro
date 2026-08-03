import { prisma } from './prisma'

// Las categorías de sistema son globales: viven con `user_id = null` y las
// comparten todos los usuarios (las siembra prisma/seed.mjs).
//
// "Saldo inicial" no estaba en el seed, así que la creaba la primera cartera de
// cada usuario y quedaba con dueño. Como las consultas pedían
// `OR: [{ user_id }, { es_sistema: true }]`, esas copias con dueño se le
// mostraban a todo el mundo: la lista de Categorías enseñaba una "Saldo
// inicial" por cada usuario registrado, y ninguna se dejaba borrar porque son
// del sistema y, además, de otra cuenta.
//
// Regla: de sistema solo cuentan las globales. Lo demás, del propio usuario.
//
// Una global desaparece para quien ya tiene su copia personal (ver el editar de
// /api/categorias): si no, vería dos "Supermercado", la suya con sus datos y la
// original vacía.
export const categoriasVisibles = (userId: string) => ({
  OR: [
    { user_id: userId },
    { user_id: null, es_sistema: true, copias: { none: { user_id: userId } } },
  ],
})

// Las internas y su aspecto. La lista de nombres vive en finanzas.ts porque
// también la necesitan las pantallas.
const SISTEMA: Record<string, { icono: string; color: string }> = {
  'Saldo inicial': { icono: 'Landmark', color: '#64748B' },
  'Ajuste de saldo': { icono: 'Scale', color: '#64748B' },
  Transferencia: { icono: 'ArrowLeftRight', color: '#6366F1' },
}

// Id de una categoría de sistema por nombre y tipo. El seed y la migración las
// dejan creadas; el alta que hay aquí es solo la red para una base que venga
// sin ellas. Nunca crea copias por usuario.
export async function categoriaSistema(nombre: string, tipo: string): Promise<string | null> {
  const cfg = SISTEMA[nombre]
  if (!cfg) return null

  const existente = await prisma.categories.findFirst({
    where: { nombre, tipo, es_sistema: true, user_id: null },
    select: { id: true },
  })
  if (existente) return existente.id

  const creada = await prisma.categories.create({
    data: { user_id: null, nombre, tipo, es_sistema: true, ...cfg },
    select: { id: true },
  })
  return creada.id
}
