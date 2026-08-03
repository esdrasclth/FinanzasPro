import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// `icono` guarda la clave de un ícono de lucide (ver app/components/IconoCategoria.tsx).
const categoriasSistema = [
  // Gastos
  { nombre: 'Comida', icono: 'Utensils', color: '#EF4444', tipo: 'gasto' },
  { nombre: 'Supermercado', icono: 'ShoppingCart', color: '#84CC16', tipo: 'gasto' },
  { nombre: 'Transporte', icono: 'Car', color: '#F59E0B', tipo: 'gasto' },
  { nombre: 'Hogar', icono: 'House', color: '#8B5CF6', tipo: 'gasto' },
  { nombre: 'Salud', icono: 'HeartPulse', color: '#10B981', tipo: 'gasto' },
  { nombre: 'Entretenimiento', icono: 'Gamepad2', color: '#EC4899', tipo: 'gasto' },
  { nombre: 'Educación', icono: 'GraduationCap', color: '#3B82F6', tipo: 'gasto' },
  { nombre: 'Ropa', icono: 'Shirt', color: '#14B8A6', tipo: 'gasto' },
  { nombre: 'Servicios', icono: 'Lightbulb', color: '#F97316', tipo: 'gasto' },
  { nombre: 'Otros gastos', icono: 'Package', color: '#64748B', tipo: 'gasto' },
  // Ingresos
  { nombre: 'Salario', icono: 'Briefcase', color: '#22C55E', tipo: 'ingreso' },
  { nombre: 'Negocio', icono: 'Store', color: '#10B981', tipo: 'ingreso' },
  { nombre: 'Regalo', icono: 'Gift', color: '#F472B6', tipo: 'ingreso' },
  { nombre: 'Inversiones', icono: 'TrendingUp', color: '#06B6D4', tipo: 'ingreso' },
  { nombre: 'Otros ingresos', icono: 'Banknote', color: '#64748B', tipo: 'ingreso' },
  // Categorías internas de la app
  { nombre: 'Transferencia', icono: 'ArrowLeftRight', color: '#6366F1', tipo: 'gasto' },
  { nombre: 'Pago de deuda', icono: 'Handshake', color: '#0EA5E9', tipo: 'gasto' },
  { nombre: 'Ajuste de saldo', icono: 'Scale', color: '#64748B', tipo: 'gasto' },
  { nombre: 'Ajuste de saldo', icono: 'Scale', color: '#64748B', tipo: 'ingreso' },
  // La apertura de una cartera: ingreso si empieza con saldo, gasto si empieza
  // con deuda (una tarjeta, por ejemplo).
  { nombre: 'Saldo inicial', icono: 'Landmark', color: '#64748B', tipo: 'gasto' },
  { nombre: 'Saldo inicial', icono: 'Landmark', color: '#64748B', tipo: 'ingreso' },
]

async function main() {
  for (const cat of categoriasSistema) {
    // Solo cuentan las globales: una copia con dueño no sustituye a la de
    // sistema (ver app/lib/categorias-server.ts).
    const existing = await prisma.categories.findFirst({
      where: { nombre: cat.nombre, tipo: cat.tipo, es_sistema: true, user_id: null },
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
