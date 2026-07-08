import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import { requireReparto } from '../../../../../lib/repartos-server'

// PATCH /api/repartos/[id]/participantes/[pid]  { pagado: boolean }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params
  const auth = await requireReparto(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const participante = await prisma.reparto_participantes.findUnique({ where: { id: pid } })
  if (!participante || participante.reparto_id !== id) {
    return NextResponse.json({ error: 'Participante no encontrado' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const pagado = !!body?.pagado

  await prisma.reparto_participantes.update({
    where: { id: pid },
    data: { pagado, fecha_pago: pagado ? new Date() : null },
  })

  return NextResponse.json({ ok: true })
}
