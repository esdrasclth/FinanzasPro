import { supabase } from './supabase'

// Registra un abono a una deuda de forma consistente:
//  1. inserta el pago en debt_payments
//  2. actualiza monto_pagado / completada en la deuda
//  3. crea la transacción de gasto ligada a la deuda (debt_id) con la
//     categoría indicada (para que cuente en su presupuesto)
// Usado tanto por la pantalla de Deudas (FormAbono) como por el flujo de
// "Nueva transacción" (FormTransaccion).

export interface AbonoParams {
  userId: string
  deudaId: string
  nombreDeuda: string
  montoPagadoActual: number
  montoTotal: number
  walletId: string
  monto: number
  fecha: string
  nota?: string
  categoryId?: string | null
  moneda?: string
  descripcion?: string
}

export async function abonarDeuda(p: AbonoParams): Promise<{ error?: string }> {
  const { error: e1 } = await supabase.from('debt_payments').insert({
    debt_id: p.deudaId,
    user_id: p.userId,
    wallet_id: p.walletId,
    monto: p.monto,
    fecha: p.fecha,
    nota: p.nota || '',
  })
  if (e1) return { error: 'Error al registrar el abono' }

  const nuevoPagado = Number(p.montoPagadoActual) + p.monto
  const completada = nuevoPagado >= Number(p.montoTotal)
  await supabase.from('debts').update({
    monto_pagado: nuevoPagado,
    completada,
  }).eq('id', p.deudaId)

  const { error: e3 } = await supabase.from('transactions').insert({
    user_id: p.userId,
    wallet_id: p.walletId,
    category_id: p.categoryId || null,
    debt_id: p.deudaId,
    monto: p.monto,
    moneda: p.moneda,
    tipo: 'gasto',
    descripcion:
      p.descripcion || `Abono: ${p.nombreDeuda}${p.nota ? ' — ' + p.nota : ''}`,
    fecha: p.fecha,
  })
  if (e3) return { error: 'Error al registrar la transacción' }

  return {}
}

// ---- Categoría "Deudas" y subcategorías por deuda ----
// Cada deuda del tipo 'debo' se refleja como una subcategoría bajo la categoría
// raíz "Deudas" (por usuario, no eliminable), de modo que se le pueda asignar
// presupuesto mensual y que los abonos cuenten contra ese presupuesto.

export const DEUDAS_ROOT_NOMBRE = 'Deudas'

// Busca (o crea) la categoría raíz "Deudas" del usuario. Devuelve su id.
export async function asegurarRaizDeudas(userId: string): Promise<string | null> {
  const { data: existentes } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('protegida', true)
    .limit(1)

  if (existentes?.[0]?.id) return existentes[0].id

  const { data: nueva } = await supabase
    .from('categories')
    .insert({
      nombre: DEUDAS_ROOT_NOMBRE,
      tipo: 'gasto',
      icono: '🤝',
      color: '#0EA5E9',
      parent_id: null,
      es_sistema: false,
      protegida: true,
      archivada: false,
    })
    .select()
    .single()

  return nueva?.id ?? null
}

// Crea la subcategoría de una deuda y la vincula (debts.category_id).
export async function crearSubcategoriaDeuda(
  userId: string,
  deuda: { id: string; nombre: string }
): Promise<string | null> {
  const rootId = await asegurarRaizDeudas(userId)
  if (!rootId) return null

  const { data: nueva } = await supabase
    .from('categories')
    .insert({
      nombre: deuda.nombre,
      tipo: 'gasto',
      icono: '💸',
      color: '#EF4444',
      parent_id: rootId,
      es_sistema: false,
      protegida: false,
      archivada: false,
    })
    .select()
    .single()

  const catId = nueva?.id ?? null
  if (catId) {
    await supabase.from('debts').update({ category_id: catId }).eq('id', deuda.id)
  }
  return catId
}

export async function renombrarSubcategoriaDeuda(categoryId: string, nombre: string) {
  await supabase.from('categories').update({ nombre }).eq('id', categoryId)
}

// Archiva/desarchiva la subcategoría (oculta al presupuestar sin perder el historial).
export async function archivarSubcategoriaDeuda(categoryId: string, archivada = true) {
  await supabase.from('categories').update({ archivada }).eq('id', categoryId)
}

export async function eliminarSubcategoriaDeuda(categoryId: string) {
  await supabase.from('categories').delete().eq('id', categoryId)
}
