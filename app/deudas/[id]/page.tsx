'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import AppLayout from '../../components/AppLayout'
import FormDeuda from '../../components/FormDeuda'
import FormAbono from '../../components/FormAbono'
import {
  archivarSubcategoriaDeuda,
  eliminarSubcategoriaDeuda,
  crearSubcategoriaDeuda,
} from '../../lib/deudas'
import { calcularDeuda, ESTADO_META, type EstadoDeuda } from '../../lib/deudaCalculos'
import {
  ArrowLeft, Pencil, Trash2, CreditCard, Check, RotateCcw,
  ArrowUpCircle, ArrowDownCircle, Percent, CalendarClock, Coins,
  TrendingUp, Wallet, Clock,
} from 'lucide-react'

export default function DeudaDetalle() {
  const router = useRouter()
  const params = useParams()
  const deudaId = params.id as string

  const [deuda, setDeuda] = useState<any>(null)
  const [pagos, setPagos] = useState<any[]>([])
  const [wallets, setWallets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showEditar, setShowEditar] = useState(false)
  const [showAbono, setShowAbono] = useState(false)

  useEffect(() => { cargar() }, [deudaId])

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: d } = await supabase
      .from('debts')
      .select('*')
      .eq('id', deudaId)
      .eq('user_id', user.id)
      .single()

    if (!d) { router.push('/deudas'); return }
    setDeuda(d)

    const { data: ps } = await supabase
      .from('debt_payments')
      .select('*')
      .eq('debt_id', deudaId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setPagos(ps || [])

    const { data: ws } = await supabase
      .from('wallets')
      .select('id, nombre')
      .eq('user_id', user.id)
    const mapa: Record<string, string> = {}
    ;(ws || []).forEach((w: any) => { mapa[w.id] = w.nombre })
    setWallets(mapa)

    setLoading(false)
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const formatFecha = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  const formatFechaHora = (fecha: string, createdAt?: string) => {
    const dia = new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
    if (!createdAt) return dia
    const hora = new Date(createdAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
    return `${dia} · ${hora}`
  }

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar esta deuda?')) return
    await supabase.from('debts').delete().eq('id', deudaId)
    if (deuda?.category_id) await eliminarSubcategoriaDeuda(deuda.category_id)
    router.push('/deudas')
  }

  const handleCompletar = async () => {
    const nuevaCompletada = !deuda.completada
    await supabase.from('debts').upsert({ id: deuda.id, completada: nuevaCompletada, user_id: deuda.user_id })
    if (deuda.tipo === 'debo') {
      if (deuda.category_id) await archivarSubcategoriaDeuda(deuda.category_id, nuevaCompletada)
      else if (!nuevaCompletada) await crearSubcategoriaDeuda(deuda.user_id, { id: deuda.id, nombre: deuda.nombre })
    }
    cargar()
  }

  if (loading || !deuda) {
    return (
      <AppLayout>
        <div className="max-w-3xl p-6 mx-auto space-y-6 lg:p-8">
          <div className="w-32 h-6 rounded-badge bg-fog animate-pulse" />
          <div className="p-8 rounded-2xl bg-fog animate-pulse h-44" />
          <div className="p-6 border bg-snow border-fog rounded-card animate-pulse h-60" />
        </div>
      </AppLayout>
    )
  }

  const c = calcularDeuda(deuda)
  const esDebo = deuda.tipo === 'debo'
  const meta = ESTADO_META[c.estado as EstadoDeuda]
  const acento = esDebo ? '#EF4444' : '#10B981'

  return (
    <AppLayout>
      <div className="max-w-3xl p-6 mx-auto lg:p-8">

        {/* Volver */}
        <button
          onClick={() => router.push('/deudas')}
          className="inline-flex items-center gap-1.5 mb-6 text-sm font-medium transition-colors text-steel hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={2} /> Deudas
        </button>

        {/* Hero */}
        <div
          className="relative mb-6 overflow-hidden text-white shadow-soft rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        >
          <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
          <div className="relative px-6 py-7 lg:px-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center min-w-0 gap-3">
                <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-2xl bg-white/10">
                  {esDebo ? <ArrowUpCircle size={24} strokeWidth={2} /> : <ArrowDownCircle size={24} strokeWidth={2} />}
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold truncate">{deuda.nombre}</h1>
                  <p className="text-sm text-white/60">
                    {esDebo ? 'Le debo a' : 'Me debe'} · {deuda.descripcion || 'Sin descripción'}
                  </p>
                </div>
              </div>
              <div className="flex items-center flex-shrink-0 gap-1">
                <button onClick={() => setShowEditar(true)} className="p-2 transition-colors rounded-full text-white/70 hover:text-white hover:bg-white/10" title="Editar">
                  <Pencil size={16} strokeWidth={2} />
                </button>
                <button onClick={handleEliminar} className="p-2 transition-colors rounded-full text-white/70 hover:text-white hover:bg-white/10" title="Eliminar">
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-badge bg-white/10">
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
              {c.tasaMensual > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-badge bg-white/10">
                  <Percent size={11} strokeWidth={2.5} />
                  {formatMonto(Number(deuda.tasa_interes))}% {deuda.tasa_periodo}
                </span>
              )}
              {deuda.plazo_meses ? (
                <span className="px-2.5 py-1 text-xs font-medium rounded-badge bg-white/10">{deuda.plazo_meses} meses</span>
              ) : null}
            </div>

            <p className="text-sm text-white/60">Saldo pendiente</p>
            <p className="text-3xl font-bold">L {formatMonto(c.saldoPrincipal)}</p>
            {c.interesAcumulado > 0 && (
              <p className="mt-1 text-sm text-amber-200">+ L {formatMonto(c.interesAcumulado)} interés · saldo total L {formatMonto(c.saldoTotal)}</p>
            )}

            {/* Progreso */}
            <div className="w-full h-2 mt-4 rounded-full bg-white/15">
              <div className="h-2 transition-all duration-500 rounded-full bg-emerald-400" style={{ width: `${c.porcentajePagado}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-white/60">{Math.round(c.porcentajePagado)}% pagado · L {formatMonto(c.pagado)} de L {formatMonto(c.principal)}</p>

            {/* Acciones */}
            <div className="flex flex-wrap gap-2 mt-6">
              {!deuda.completada && (
                <button
                  onClick={() => setShowAbono(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all rounded-full bg-white text-obsidian hover:bg-white/90"
                >
                  <CreditCard size={15} strokeWidth={2} /> Registrar abono
                </button>
              )}
              <button
                onClick={handleCompletar}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all border rounded-full border-white/25 text-white hover:bg-white/10"
              >
                {deuda.completada ? <><RotateCcw size={15} strokeWidth={2} /> Reabrir</> : <><Check size={15} strokeWidth={2.5} /> Completar</>}
              </button>
            </div>
          </div>
        </div>

        {/* Métricas calculadas */}
        <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
          <Metrica icon={Coins} label="Saldo restante" valor={`L ${formatMonto(c.saldoPrincipal)}`} color={esDebo ? 'text-red-500' : 'text-emerald-600'} />
          <Metrica icon={TrendingUp} label="Interés acumulado" valor={c.tasaMensual > 0 ? `L ${formatMonto(c.interesAcumulado)}` : '—'} color="text-amber-600" />
          <Metrica
            icon={CalendarClock}
            label="Próximo pago"
            valor={c.proximoPagoMonto ? `L ${formatMonto(c.proximoPagoMonto)}` : '—'}
            sub={c.proximoPagoFecha ? formatFecha(c.proximoPagoFecha) : undefined}
          />
          <Metrica
            icon={Check}
            label="Liquidación estimada"
            valor={c.fechaLiquidacion ? formatFecha(c.fechaLiquidacion) : '—'}
            small
          />
        </div>

        {/* Detalles del préstamo */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card">
          <h3 className="mb-4 text-sm font-semibold text-steel">Detalles</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Dato label="Monto principal" valor={`L ${formatMonto(c.principal)}`} />
            <Dato label="Total pagado" valor={`L ${formatMonto(c.pagado)}`} />
            <Dato label="Cuota estimada" valor={c.cuota ? `L ${formatMonto(c.cuota)}` : '—'} />
            <Dato label="Fecha de inicio" valor={formatFecha(deuda.fecha_inicio)} />
            <Dato label="Fecha límite" valor={formatFecha(deuda.fecha_limite)} />
            <Dato label="Tasa de interés" valor={c.tasaMensual > 0 ? `${formatMonto(Number(deuda.tasa_interes))}% ${deuda.tasa_periodo}` : 'Sin interés'} />
          </div>
        </div>

        {/* Historial de abonos */}
        <div className="p-6 border bg-snow border-fog rounded-card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-steel">Historial de abonos</h3>
            <span className="text-xs font-medium text-ash">{pagos.length} {pagos.length === 1 ? 'abono' : 'abonos'}</span>
          </div>

          {pagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock size={34} strokeWidth={1.5} className="mb-3 text-pebble" />
              <p className="text-sm text-steel">Aún no hay abonos registrados</p>
              {!deuda.completada && (
                <button onClick={() => setShowAbono(true)} className="mt-3 text-xs font-medium text-graphite hover:text-ink">
                  Registrar el primer abono →
                </button>
              )}
            </div>
          ) : (
            <div className="relative pl-2">
              {pagos.map((p, i) => (
                <div key={p.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
                  {/* Línea de tiempo */}
                  {i < pagos.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-fog" />}
                  <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full" style={{ backgroundColor: acento + '15', color: acento }}>
                    <CreditCard size={15} strokeWidth={2} />
                  </div>
                  <div className="flex items-start justify-between flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">L {formatMonto(Number(p.monto))}</p>
                      <p className="text-xs text-ash">{formatFechaHora(p.fecha, p.created_at)}</p>
                      {p.nota && <p className="mt-1 text-xs text-steel">{p.nota}</p>}
                    </div>
                    {p.wallet_id && wallets[p.wallet_id] && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 text-xs font-medium rounded-badge text-steel bg-mist whitespace-nowrap">
                        <Wallet size={11} strokeWidth={2} /> {wallets[p.wallet_id]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEditar && (
        <FormDeuda
          deuda={deuda}
          onClose={() => setShowEditar(false)}
          onSuccess={() => { setShowEditar(false); cargar() }}
        />
      )}

      {showAbono && (
        <FormAbono
          deuda={deuda}
          onClose={() => setShowAbono(false)}
          onSuccess={() => { setShowAbono(false); cargar() }}
        />
      )}
    </AppLayout>
  )
}

function Metrica({ icon: Icon, label, valor, sub, color = 'text-obsidian', small = false }: {
  icon: typeof Coins
  label: string
  valor: string
  sub?: string
  color?: string
  small?: boolean
}) {
  return (
    <div className="p-4 border bg-snow border-fog rounded-card">
      <div className="flex items-center gap-1.5 mb-2 text-steel">
        <Icon size={14} strokeWidth={2} />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`font-bold break-words ${small ? 'text-sm' : 'text-lg'} ${color}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-ash">{sub}</p>}
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-steel">{label}</p>
      <p className="text-sm font-medium break-words text-ink">{valor}</p>
    </div>
  )
}
