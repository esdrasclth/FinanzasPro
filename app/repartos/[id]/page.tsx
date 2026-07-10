'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import AppLayout from '../../components/AppLayout'
import FormReparto from '../../components/FormReparto'
import { formatoMoneda } from '../../lib/dinero'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import {
  ArrowLeft, Share2, Copy, Check, Pencil, Trash2, MoreHorizontal,
  Coins, CheckCircle2, HandCoins, Users, Send, CheckCheck, RotateCcw, X,
  type LucideIcon,
} from 'lucide-react'

interface Participante {
  id: string
  nombre: string
  monto_asignado: number
  pagado: boolean
  fecha_pago: string | null
  es_yo: boolean
}
interface Reparto {
  id: string
  descripcion: string
  monto_total: number
  moneda: string
  metodo: string
  fecha: string
  wallet_id: string | null
  monto_pagado: number
  monto_recuperable: number
  mi_parte: number
  participantes: Participante[]
}
interface WalletMini { id: string; nombre: string; moneda: string }

export default function RepartoDetalle() {
  const router = useRouter()
  const params = useParams()
  const repartoId = params.id as string

  const [reparto, setReparto] = useState<Reparto | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditar, setShowEditar] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [wallets, setWallets] = useState<WalletMini[]>([])
  // Modal para elegir en qué cartera entra el cobro (individual o de todos).
  const [cobroModal, setCobroModal] = useState<{ tipo: 'uno'; p: Participante } | { tipo: 'todos' } | null>(null)

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/repartos/${repartoId}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.status === 403 || res.status === 404) { router.push('/repartos'); return }
    const json = await res.json()
    setReparto(json.reparto)
    setLoading(false)
  }, [repartoId, router])

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('wallets').select('id, nombre, moneda').eq('user_id', user.id).eq('activo', true).order('posicion', { ascending: true })
      setWallets(data || [])
      cargar()
    }
    check()
  }, [router, cargar])

  // Al marcar como pagado hay que elegir cartera; al reabrir se revierte directo.
  const togglePago = (p: Participante) => {
    if (p.es_yo) return
    if (p.pagado) { reabrirPago(p); return }
    setCobroModal({ tipo: 'uno', p })
  }

  const reabrirPago = async (p: Participante) => {
    setReparto(prev => prev && {
      ...prev,
      participantes: prev.participantes.map(x => x.id === p.id ? { ...x, pagado: false } : x),
      monto_pagado: Math.round((prev.monto_pagado - p.monto_asignado + Number.EPSILON) * 100) / 100,
    })
    await fetch(`/api/repartos/${repartoId}/participantes/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: false }),
    })
    cargar()
  }

  // Confirma el cobro (uno o todos) hacia la cartera elegida.
  const confirmarCobro = async (walletId: string) => {
    if (!reparto || !cobroModal) return
    const objetivo = cobroModal.tipo === 'uno'
      ? [cobroModal.p]
      : reparto.participantes.filter(p => !p.es_yo && !p.pagado)
    setCobroModal(null)
    if (objetivo.length === 0) return
    setProcesando(true)
    await Promise.all(objetivo.map(p =>
      fetch(`/api/repartos/${repartoId}/participantes/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagado: true, wallet_id: walletId }),
      })
    ))
    await cargar()
    setProcesando(false)
  }

  // Reabre el pago de todos los cobrables (revierte sus ingresos).
  const reabrirTodos = async () => {
    if (!reparto || procesando) return
    const objetivo = reparto.participantes.filter(p => !p.es_yo && p.pagado)
    if (objetivo.length === 0) return
    setProcesando(true)
    await Promise.all(objetivo.map(p =>
      fetch(`/api/repartos/${repartoId}/participantes/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagado: false }),
      })
    ))
    await cargar()
    setProcesando(false)
  }

  const eliminar = async () => {
    if (!confirm(`¿Eliminar el reparto "${reparto?.descripcion}"?`)) return
    const res = await fetch(`/api/repartos/${repartoId}`, { method: 'DELETE' })
    if (res.ok) router.push('/repartos')
  }

  const textoCompartir = () => {
    if (!reparto) return ''
    const lineas = reparto.participantes.map(p =>
      `- ${p.nombre}: ${formatoMoneda(p.monto_asignado, reparto.moneda)} ${p.pagado ? '✅' : '⬜'}`
    )
    return `Reparto — ${reparto.descripcion} (${formatoMoneda(reparto.monto_total, reparto.moneda)})\n${lineas.join('\n')}`
  }

  const compartir = async () => {
    const texto = textoCompartir()
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return } catch { /* cancelado */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoCompartir())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* sin permiso */ }
  }

  // Recordatorio individual de cobro por WhatsApp.
  const recordar = (p: Participante) => {
    if (!reparto) return
    const texto = `Hola ${p.nombre}, te recuerdo tu parte de "${reparto.descripcion}": ${formatoMoneda(p.monto_asignado, reparto.moneda)}. ¡Gracias!`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  if (loading || !reparto) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] p-6 mx-auto space-y-4 lg:p-8">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="h-40 rounded-2xl bg-fog animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  // Solo cuentan los que deben pagarme (excluye mi propia parte).
  const cobrables = reparto.participantes.filter(p => !p.es_yo)
  const recuperable = reparto.monto_recuperable
  const pct = recuperable > 0 ? Math.round((reparto.monto_pagado / recuperable) * 100) : 100
  const pagados = cobrables.filter(p => p.pagado).length
  const total = cobrables.length
  const pendiente = Math.max(0, recuperable - reparto.monto_pagado)
  const liquidado = total > 0 && pagados === total
  const fmt = (n: number) => formatoMoneda(n, reparto.moneda)

  const donut = [
    { nombre: 'Pagado', valor: reparto.monto_pagado, color: '#10b981' },
    { nombre: 'Pendiente', valor: pendiente, color: '#e4e4e7' },
  ].filter(d => d.valor > 0)

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 mb-8">
          <div className="min-w-0">
            <button onClick={() => router.push('/repartos')} className="inline-flex items-center gap-1.5 mb-2 text-sm text-steel hover:text-ink">
              <ArrowLeft size={15} strokeWidth={2} /> Repartos
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold truncate text-obsidian">{reparto.descripcion}</h1>
              <span className={`inline-flex items-center gap-1 flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-badge ${liquidado ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                {liquidado ? <CheckCircle2 size={12} strokeWidth={2.5} /> : null}
                {liquidado ? 'Liquidado' : 'Pendiente'}
              </span>
            </div>
            <p className="mt-1 text-sm text-steel">
              {new Date(reparto.fecha + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' })} · {reparto.metodo === 'igual' ? 'Partes iguales' : 'Montos a mano'}
            </p>
          </div>
          <RowMenu onEdit={() => setShowEditar(true)} onDelete={eliminar} />
        </div>

        {/* Hero resumen */}
        <div
          className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        >
          <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
          <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
          <div className="relative px-6 py-9 lg:px-8 lg:py-12">
            <div className="mb-8">
              <h2 className="text-xl font-semibold">Estado del reparto</h2>
              <p className="text-base text-white/60">{pct}% pagado · {pagados}/{total} personas</p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 lg:divide-x lg:divide-white/10">
              <HeroMetrica icon={Coins} label="Total del gasto" valor={fmt(reparto.monto_total)}
                nota={reparto.mi_parte > 0 ? <span className="text-white/60">Tu parte: {fmt(reparto.mi_parte)}</span> : undefined} />
              <HeroMetrica icon={CheckCircle2} label="Cobrado" valor={fmt(reparto.monto_pagado)}
                nota={<span className="text-emerald-300">{pct}% de lo recuperable</span>} className="lg:px-6" />
              <HeroMetrica icon={HandCoins} label="Por cobrar" valor={fmt(pendiente)} className="lg:px-6" />
              <HeroMetrica icon={Users} label="Personas" valor={`${pagados} / ${total}`} className="lg:pl-6" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Columna: participantes */}
          <div className="lg:col-span-2">
            <div className="border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between px-6 py-4 border-b border-fog">
                <h2 className="font-semibold text-obsidian">Personas</h2>
                <div className="flex items-center gap-2">
                  {liquidado ? (
                    <button onClick={reabrirTodos} disabled={procesando}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist disabled:opacity-40">
                      <RotateCcw size={13} strokeWidth={2} /> Reabrir todos
                    </button>
                  ) : (
                    <button onClick={() => setCobroModal({ tipo: 'todos' })} disabled={procesando || total === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border rounded-full border-fog text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                      <CheckCheck size={13} strokeWidth={2} /> Marcar todos pagados
                    </button>
                  )}
                </div>
              </div>
              <div>
                {reparto.participantes.map((p, i) => (
                  <div key={p.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6 transition-colors hover:bg-mist/50 ${i > 0 ? 'border-t border-fog' : ''}`}>
                    {p.es_yo ? (
                      <div className="flex items-center flex-1 min-w-0 gap-3">
                        <div className="flex items-center justify-center flex-shrink-0 w-6 h-6 rounded-full bg-obsidian text-snow">
                          <Check size={13} strokeWidth={3} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate text-ink">{p.nombre} <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-badge bg-obsidian/10 text-graphite">Tú</span></p>
                          <p className="text-xs text-ash">Tu parte · no se cobra</p>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => togglePago(p)} disabled={procesando} className="flex items-center flex-1 min-w-0 gap-3 text-left disabled:opacity-60">
                        <div className={`flex items-center justify-center flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all ${p.pagado ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-pebble text-transparent'}`}>
                          <Check size={13} strokeWidth={3} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${p.pagado ? 'text-ash line-through' : 'text-ink'}`}>{p.nombre}</p>
                          <p className="text-xs text-ash">
                            {p.pagado
                              ? (p.fecha_pago ? `Pagó el ${new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}` : 'Pagado')
                              : 'Pendiente'}
                          </p>
                        </div>
                      </button>
                    )}
                    <div className="flex items-center flex-shrink-0 gap-2">
                      <span className={`text-sm font-semibold ${p.es_yo ? 'text-graphite' : p.pagado ? 'text-emerald-600' : 'text-obsidian'}`}>{fmt(p.monto_asignado)}</span>
                      {!p.es_yo && !p.pagado && (
                        <button onClick={() => recordar(p)} title={`Recordar a ${p.nombre}`}
                          className="flex items-center justify-center w-8 h-8 transition-colors rounded-full text-ash hover:text-emerald-600 hover:bg-emerald-50">
                          <Send size={15} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-fog">
                <button onClick={() => setShowEditar(true)}
                  className="inline-flex items-center justify-center w-full gap-2 py-2.5 text-sm font-medium transition-colors border border-dashed rounded-xl border-pebble text-graphite hover:bg-mist hover:text-ink">
                  <Pencil size={15} strokeWidth={2} /> Editar participantes y montos
                </button>
              </div>
            </div>
          </div>

          {/* Columna: progreso y acciones */}
          <div className="space-y-6 lg:col-span-1">

            {/* Progreso */}
            <div className="p-6 border bg-snow border-fog rounded-card">
              <h3 className="mb-5 text-sm font-semibold text-steel">Progreso de cobro</h3>
              <div className="flex items-center gap-5">
                <div className="relative flex-shrink-0 w-[136px] h-[136px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={donut.length > 1 ? 3 : 0} cornerRadius={4} dataKey="valor" stroke="none">
                        {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold leading-tight text-ink">{pct}%</span>
                    <span className="text-[10px] font-medium text-steel">pagado</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-steel">Cobrado</span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-ink">{fmt(reparto.monto_pagado)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-fog" />
                      <span className="text-xs text-steel">Por cobrar</span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-ink">{fmt(pendiente)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <h3 className="mb-4 text-sm font-semibold text-steel">Compartir</h3>
              <div className="space-y-2.5">
                <button onClick={compartir}
                  style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
                  className="inline-flex items-center justify-center w-full gap-2 py-3 text-sm font-medium transition-all rounded-full text-snow hover:brightness-110">
                  <Share2 size={16} strokeWidth={2} /> Compartir resumen
                </button>
                <button onClick={copiar}
                  className="inline-flex items-center justify-center w-full gap-2 py-3 text-sm font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">
                  {copiado ? <><Check size={16} strokeWidth={2} className="text-emerald-600" /> ¡Copiado!</> : <><Copy size={16} strokeWidth={2} /> Copiar resumen</>}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {showEditar && (
        <FormReparto reparto={reparto} monedaDefault={reparto.moneda}
          onClose={() => setShowEditar(false)} onSuccess={() => { setShowEditar(false); cargar() }} />
      )}

      {cobroModal && (
        <CobroModal
          wallets={wallets}
          walletDefault={reparto.wallet_id}
          titulo={cobroModal.tipo === 'uno' ? `¿En qué cartera recibiste el pago de ${cobroModal.p.nombre}?` : '¿En qué cartera recibiste los pagos?'}
          onClose={() => setCobroModal(null)}
          onConfirm={confirmarCobro}
        />
      )}
    </AppLayout>
  )
}

function CobroModal({ wallets, walletDefault, titulo, onClose, onConfirm }: {
  wallets: WalletMini[]
  walletDefault: string | null
  titulo: string
  onClose: () => void
  onConfirm: (walletId: string) => void
}) {
  const [walletId, setWalletId] = useState<string>(walletDefault || wallets[0]?.id || '')
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/40 backdrop-blur-sm animate-fade sm:items-center sm:p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-snow w-full max-w-sm rounded-t-3xl sm:rounded-card sm:border sm:border-fog animate-sheet pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-fog">
          <h2 className="text-base font-semibold text-ink">Registrar cobro</h2>
          <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-graphite">{titulo}</p>
          {wallets.length === 0 ? (
            <p className="text-sm text-ash">No tienes carteras activas.</p>
          ) : (
            <select value={walletId} onChange={e => setWalletId(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
              {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre} ({w.moneda})</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={onClose}
              className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">Cancelar</button>
            <button onClick={() => walletId && onConfirm(walletId)} disabled={!walletId}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40">Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroMetrica({ icon: Icon, label, valor, nota, className = '' }: {
  icon: LucideIcon
  label: string
  valor: string
  nota?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start gap-4 ${className}`}>
      <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
        <Icon size={20} strokeWidth={2} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-base text-white/60">{label}</p>
        <p className="text-2xl font-bold break-words sm:text-3xl">{valor}</p>
        {nota && <p className="mt-1.5 text-sm font-medium">{nota}</p>}
      </div>
    </div>
  )
}

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center w-10 h-10 transition-colors border rounded-full bg-snow border-fog text-graphite hover:bg-mist"
        title="Opciones"
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[9rem]">
            <button
              onClick={() => { setOpen(false); onEdit() }}
              className="flex items-center w-full gap-2 px-3 py-1.5 text-sm text-left transition-colors text-graphite hover:bg-mist"
            >
              <Pencil size={14} strokeWidth={2} /> Editar
            </button>
            <button
              onClick={() => { setOpen(false); onDelete() }}
              className="flex items-center w-full gap-2 px-3 py-1.5 text-sm text-left text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 size={14} strokeWidth={2} /> Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
