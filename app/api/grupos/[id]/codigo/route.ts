import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { requireMiembro, generarCodigoUnico } from '../../../../lib/grupos-server'

// POST /api/grupos/[id]/codigo  -> el creador regenera el código de invitación.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireMiembro(id)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const grupo = await prisma.grupos.findUnique({ where: { id } })
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  if (grupo.creado_por !== auth.ctx.user.id) {
    return NextResponse.json({ error: 'Solo el creador puede regenerar el código' }, { status: 403 })
  }

  const codigo = await generarCodigoUnico()
  await prisma.grupos.update({ where: { id }, data: { codigo_invitacion: codigo } })

  return NextResponse.json({ codigo_invitacion: codigo })
}
