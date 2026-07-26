import { NextResponse } from 'next/server'
import { getSessionUser } from '../../../lib/auth-server'
import { eliminarMovimiento } from '../../../lib/transacciones-server'

// DELETE /api/transacciones/[id]
//
// Único punto de borrado individual. La lógica de qué arrastra cada tipo de
// movimiento vive en lib/transacciones-server.ts, compartida con el borrado
// en lote.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: { message: 'No autenticado' } }, { status: 401 })
  }

  const r = await eliminarMovimiento(session.id, id)
  if (!r.ok) {
    return NextResponse.json({ error: { message: r.message } }, { status: r.status })
  }
  return NextResponse.json(r)
}
