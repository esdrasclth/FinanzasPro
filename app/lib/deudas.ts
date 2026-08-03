import { supabase } from './supabase'

// Registra un abono a una deuda: el pago en debt_payments, el avance de la
// deuda y la transacción de gasto ligada (debt_id) con la categoría indicada,
// para que cuente en su presupuesto.
//
// La escritura vive en POST /api/deudas/[id]/abonos, envuelta en una
// transacción de base de datos. Aquí solo se hace la llamada: orquestar los
// tres pasos desde el navegador dejaba la deuda descuadrada si uno fallaba.
//
// Usado por la pantalla de Deudas (FormAbono) y por "Nueva transacción"
// (FormTransaccion).

export interface AbonoParams {
  deudaId: string
  walletId: string
  monto: number
  fecha: string
  nota?: string
  categoryId?: string | null
  moneda?: string
  descripcion?: string
}

export async function abonarDeuda(p: AbonoParams): Promise<{ error?: string }> {
  try {
    const res = await fetch(`/api/deudas/${p.deudaId}/abonos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto: p.monto,
        wallet_id: p.walletId,
        fecha: p.fecha,
        nota: p.nota,
        category_id: p.categoryId || null,
        moneda: p.moneda,
        descripcion: p.descripcion,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return { error: json?.error?.message || 'Error al registrar el abono' }
    }
    return {}
  } catch {
    return { error: 'Error de red al registrar el abono' }
  }
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
      icono: 'Handshake',
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
      icono: 'Banknote',
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
