import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const categoriasSistema = [
  // Gastos
  { nombre: 'Comida', icono: '🍔', color: '#EF4444', tipo: 'gasto' },
  { nombre: 'Supermercado', icono: '🛒', color: '#84CC16', tipo: 'gasto' },
  { nombre: 'Transporte', icono: '🚗', color: '#F59E0B', tipo: 'gasto' },
  { nombre: 'Hogar', icono: '🏠', color: '#8B5CF6', tipo: 'gasto' },
  { nombre: 'Salud', icono: '💊', color: '#10B981', tipo: 'gasto' },
  { nombre: 'Entretenimiento', icono: '🎮', color: '#EC4899', tipo: 'gasto' },
  { nombre: 'Educación', icono: '📚', color: '#3B82F6', tipo: 'gasto' },
  { nombre: 'Ropa', icono: '👕', color: '#14B8A6', tipo: 'gasto' },
  { nombre: 'Servicios', icono: '💡', color: '#F97316', tipo: 'gasto' },
  { nombre: 'Otros gastos', icono: '📦', color: '#64748B', tipo: 'gasto' },
  // Ingresos
  { nombre: 'Salario', icono: '💼', color: '#22C55E', tipo: 'ingreso' },
  { nombre: 'Negocio', icono: '🏪', color: '#10B981', tipo: 'ingreso' },
  { nombre: 'Regalo', icono: '🎁', color: '#F472B6', tipo: 'ingreso' },
  { nombre: 'Inversiones', icono: '📈', color: '#06B6D4', tipo: 'ingreso' },
  { nombre: 'Otros ingresos', icono: '💰', color: '#64748B', tipo: 'ingreso' },
  // Categorías internas de la app
  { nombre: 'Transferencia', icono: '↔️', color: '#6366F1', tipo: 'gasto' },
  { nombre: 'Pago de deuda', icono: '🤝', color: '#0EA5E9', tipo: 'gasto' },
  { nombre: 'Ajuste de saldo', icono: '⚖️', color: '#64748B', tipo: 'gasto' },
  { nombre: 'Ajuste de saldo', icono: '⚖️', color: '#64748B', tipo: 'ingreso' },
]

async function main() {
  for (const cat of categoriasSistema) {
    const existing = await prisma.categories.findFirst({
      where: { nombre: cat.nombre, tipo: cat.tipo, es_sistema: true },
    })
    if (!existing) {
      await prisma.categories.create({
        data: { ...cat, es_sistema: true, user_id: null },
      })
    }
  }
  console.log(`Seed completado: ${categoriasSistema.length} categorías de sistema verificadas.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
