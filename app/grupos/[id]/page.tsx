'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import AppLayout from '../../components/AppLayout'
import FormGastoCompartido from '../../components/FormGastoCompartido'
import FormLiquidar from '../../components/FormLiquidar'
import { formatoMoneda, simboloMoneda } from '../../lib/dinero'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Coins, Plus, Handshake, Copy, Check,
  RotateCcw, Users, Scale, Receipt, Pencil, Trash2, UserMinus, UserPlus,
  type LucideIcon,
} from 'lucide-react'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const gradiente = 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)'

interface Miembro { user_id: string; nombre: string; email?: string }
interface Saldo { user_id: string; nombre: string; pagado: number; tocaba: number; neto: number }
interface Sugerencia { de_user_id: string; de_nombre: string; a_user_id: string; a_nombre: string; monto: number }

export default function GrupoDetalle() {
  const router = useRouter()
  const params = useParams()
  const grupoId = params.id as string

  const [grupo, setGrupo] = useState<any>(null)
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [removidos, setRemovidos] = useState<Miembro[]>([])
  const [yo, setYo] = useState('')
  const [gastos, setGastos] = useState<any[]>([])
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [totalGrupo, setTotalGrupo] = useState(0)
  const [loading, setLoading] = useState(true)

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())

  const [showGasto, setShowGasto] = useState(false)
  const [editGasto, setEditGasto] = useState<any>(null)
  const [showLiquidar, setShowLiquidar] = useState(false)
  const [prefillLiq, setPrefillLiq] = useState<any>(null)
  const [copiado, setCopiado] = useState(false)

  const cargarBase = useCallback(async () => {
    const res = await fetch(`/api/grupos/${grupoId}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.status === 403 || res.status === 404) { router.push('/grupos'); return }
    const json = await res.json()
    setGrupo(json.grupo)
    setMiembros(json.miembros)
    setRemovidos(json.removidos || [])
    setYo(json.yo)
  }, [grupoId, router])

  const cargarMes = useCallback(async () => {
    const q = `mes=${mes}&anio=${anio}`
    const [rg, rs] = await Promise.all([
      fetch(`/api/grupos/${grupoId}/gastos?${q}`),
      fetch(`/api/grupos/${grupoId}/saldos?${q}`),
    ])
    const jg = await rg.json()
    const js = await rs.json()
    setGastos(jg.gastos || [])
    setSaldos(js.saldos || [])
    setSugerencias(js.sugerencias || [])
    setTotalGrupo(js.totalGrupo || 0)
    setLoading(false)
  }, [grupoId, mes, anio])

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await cargarBase()
    }
    check()
  }, [router, cargarBase])

  useEffect(() => { if (grupo) cargarMes() }, [grupo, cargarMes])

  const recargar = () => cargarBase()

  useEffect(() => {
    const tick = () => { if (!document.hidden) cargarBase() }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    const iv = setInterval(tick, 10000)
    return () => {
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
      clearInterval(iv)
    }
  }, [cargarBase])

  const cambiarMes = (delta: number) => {
    let m = mes + delta
    let a = anio
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAnio(a)
  }

  const copiarCodigo = () => {
    navigator.clipboard?.writeText(grupo.codigo_invitacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  const moneda = grupo?.moneda || 'USD'
  const simbolo = simboloMoneda(moneda)
  const miSaldo = saldos.find(s => s.user_id === yo)
  const esCreador = !!grupo && grupo.creado_por === yo
  const neto = miSaldo?.neto || 0

  const regenerarCodigo = async () => {
    if (!confirm('¿Generar un código nuevo? El código anterior dejará de funcionar y tendrás que compartir el nuevo.')) return
    const res = await fetch(`/api/grupos/${grupoId}/codigo`, { method: 'POST' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo regenerar'); return }
    recargar()
  }

  const eliminarMiembro = async (userId: string, nombre: string) => {
    if (!confirm(`¿Quitar a ${nombre} del grupo?`)) return
    const res = await fetch(`/api/grupos/${grupoId}/miembros/${userId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo quitar'); return }
    recargar()
  }

  const readmitirMiembro = async (userId: string, nombre: string) => {
    if (!confirm(`¿Readmitir a ${nombre} en el grupo?`)) return
    const res = await fetch(`/api/grupos/${grupoId}/miembros/${userId}`, { method: 'POST' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo readmitir'); return }
    recargar()
  }

  const eliminarGasto = async (g: any) => {
    if (!confirm(`¿Eliminar el gasto "${g.descripcion}"? Se revertirán las transacciones reflejadas en las carteras.`)) return
    const res = await fetch(`/api/grupos/${grupoId}/gastos/${g.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo eliminar'); return }
    recargar()
  }

  if (loading && !grupo) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] p-6 mx-auto space-y-6 lg:p-8">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="h-40 rounded-2xl bg-fog animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Encabezado */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <button onClick={() => router.push('/grupos')}
              className="inline-flex items-center gap-1.5 mb-2 text-sm font-medium text-steel hover:text-ink">
              <ArrowLeft size={15} strokeWidth={2} /> Compartidos
            </button>
            <h1 className="text-3xl font-bold text-obsidian">{grupo?.nombre}</h1>
            <p className="mt-1 text-sm text-steel">{miembros.length} {miembros.length === 1 ? 'miembro' : 'miembros'} · {moneda}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button onClick={copiarCodigo}
              className="inline-flex items-center gap-2 px-3.5 py-2 transition-colors border rounded-full border-fog bg-snow hover:bg-mist">
              {copiado ? <Check size={14} strokeWidth={2.5} className="text-emerald-600" /> : <Copy size={14} strokeWidth={2} className="text-steel" />}
              <span className="font-mono text-sm font-bold tracking-widest text-obsidian">{grupo?.codigo_invitacion}</span>
            </button>
            {esCreador && (
              <button onClick={regenerarCodigo} className="inline-flex items-center gap-1 text-[11px] font-medium text-steel hover:text-ink">
                <RotateCcw size={11} strokeWidth={2} /> Regenerar código
              </button>
            )}
          </div>
        </div>

        {/* Hero */}
        <div className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl" style={{ background: gradiente }}>
          <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
          <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
          <div className="relative px-6 py-9 lg:px-8 lg:py-12">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-xl font-semibold">Resumen de {MESES[mes - 1]}</h2>
                <p className="text-base text-white/60">{gastos.length} {gastos.length === 1 ? 'gasto registrado' : 'gastos registrados'}</p>
              </div>
              <div className="flex items-center gap-1 p-1 border rounded-full border-white/15 bg-white/10">
                <button onClick={() => cambiarMes(-1)} className="flex items-center justify-center rounded-full w-7 h-7 text-white/70 hover:bg-white/10 hover:text-white">
                  <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <span className="px-2 text-sm font-medium min-w-[7.5rem] text-center">{MESES[mes - 1]} {anio}</span>
                <button onClick={() => cambiarMes(1)} className="flex items-center justify-center rounded-full w-7 h-7 text-white/70 hover:bg-white/10 hover:text-white">
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6 lg:divide-x lg:divide-white/10">
              <HeroMetrica icon={Coins} label="Total del grupo" valor={formatoMoneda(totalGrupo, moneda)} />
              <HeroMetrica icon={Scale} label="Tu balance" valor={formatoMoneda(Math.abs(neto), moneda)}
                nota={<span className={neto > 0.005 ? 'text-emerald-300' : neto < -0.005 ? 'text-red-300' : 'text-white/50'}>
                  {neto > 0.005 ? 'Te deben' : neto < -0.005 ? 'Debes' : 'Al día'}
                </span>} className="lg:px-6" />
              <HeroMetrica icon={Users} label="Miembros" valor={String(miembros.length)} className="lg:pl-6" />
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 mb-8">
          <button onClick={() => setShowGasto(true)} style={{ background: gradiente }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-full text-snow hover:scale-105 hover:brightness-110">
            <Plus size={16} strokeWidth={2.5} /> Nuevo gasto
          </button>
          <button onClick={() => { setPrefillLiq(null); setShowLiquidar(true) }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">
            <Handshake size={16} strokeWidth={2} /> Saldar cuenta
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Columna izquierda: gastos */}
          <div className="lg:col-span-2">
            <div className="border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between px-5 py-4 border-b border-fog">
                <h3 className="text-sm font-semibold text-steel">Gastos de {MESES[mes - 1]}</h3>
                <span className="text-sm font-bold text-obsidian">{formatoMoneda(totalGrupo, moneda)}</span>
              </div>
              {gastos.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <Receipt size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                  <p className="text-sm text-steel">Sin gastos en {MESES[mes - 1]}</p>
                  <button onClick={() => setShowGasto(true)} className="mt-4 text-sm font-medium text-emerald-700 hover:underline">
                    + Registrar el primero
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-fog">
                  {gastos.map(g => {
                    const miDiv = g.divisiones.find((d: any) => d.user_id === yo)
                    const quienPago = g.pagos.map((p: any) => p.nombre).join(', ')
                    const puedeEditar = esCreador || g.creado_por === yo
                    return (
                      <div key={g.id} className="px-5 py-4 group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex items-center justify-center flex-shrink-0 mt-0.5 w-9 h-9 rounded-xl bg-mist">
                              <Receipt size={16} strokeWidth={2} className="text-steel" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate text-ink">{g.descripcion}</p>
                              <p className="text-xs text-ash">Pagó {quienPago} · {new Date(g.fecha).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}</p>
                              {miDiv && (
                                <p className="mt-1 text-xs text-steel">A ti te toca <span className="font-semibold text-ink">{formatoMoneda(miDiv.monto_asignado, moneda)}</span></p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-sm font-bold text-obsidian">{formatoMoneda(g.monto_total, moneda)}</span>
                            {puedeEditar && (
                              <div className="flex gap-1 transition-opacity opacity-0 group-hover:opacity-100">
                                <button onClick={() => setEditGasto(g)} title="Editar"
                                  className="flex items-center justify-center transition-colors rounded-full w-7 h-7 text-steel hover:bg-mist hover:text-ink">
                                  <Pencil size={14} strokeWidth={2} />
                                </button>
                                <button onClick={() => eliminarGasto(g)} title="Eliminar"
                                  className="flex items-center justify-center text-red-500 transition-colors rounded-full w-7 h-7 hover:bg-red-50">
                                  <Trash2 size={14} strokeWidth={2} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Columna derecha: insights */}
          <div className="space-y-6 lg:col-span-1">
            {/* Sugerencias para saldar */}
            {sugerencias.length > 0 && (
              <div className="p-5 border bg-snow border-fog rounded-card">
                <h3 className="mb-4 text-sm font-semibold text-steel">Para quedar a mano</h3>
                <div className="space-y-3">
                  {sugerencias.map((sg, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink">
                        <span className="font-medium">{sg.de_nombre}</span> <span className="text-ash">→</span> <span className="font-medium">{sg.a_nombre}</span>
                      </p>
                      <div className="flex items-center flex-shrink-0 gap-2">
                        <span className="text-sm font-semibold text-obsidian">{formatoMoneda(sg.monto, moneda)}</span>
                        {(sg.de_user_id === yo || sg.a_user_id === yo) && (
                          <button onClick={() => { setPrefillLiq(sg); setShowLiquidar(true) }}
                            className="px-2.5 py-1 text-xs font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite">
                            Saldar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Saldos por persona */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <h3 className="mb-4 text-sm font-semibold text-steel">Saldos del mes</h3>
              {saldos.length === 0 ? (
                <p className="py-2 text-sm text-ash">Sin movimientos este mes.</p>
              ) : (
                <div className="space-y-3">
                  {saldos.map(s => (
                    <div key={s.user_id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-ink">{s.nombre}{s.user_id === yo ? ' (yo)' : ''}</p>
                        <p className="text-xs text-ash">Pagó {simbolo}{s.pagado.toFixed(2)} · le tocaba {simbolo}{s.tocaba.toFixed(2)}</p>
                      </div>
                      <span className={`flex-shrink-0 text-sm font-semibold ${s.neto > 0.005 ? 'text-emerald-600' : s.neto < -0.005 ? 'text-red-500' : 'text-steel'}`}>
                        {s.neto > 0.005 ? `+${formatoMoneda(s.neto, moneda)}` : s.neto < -0.005 ? formatoMoneda(s.neto, moneda) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Miembros */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <h3 className="mb-4 text-sm font-semibold text-steel">Miembros</h3>
              <div className="space-y-3">
                {miembros.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 text-sm font-bold rounded-lg text-snow" style={{ background: gradiente }}>
                        {m.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-ink">{m.nombre}{m.user_id === yo ? ' (yo)' : ''}</p>
                        <p className="text-xs text-ash">{m.user_id === grupo?.creado_por ? 'Creador' : 'Miembro'}</p>
                      </div>
                    </div>
                    {esCreador && m.user_id !== grupo?.creado_por && (
                      <button onClick={() => eliminarMiembro(m.user_id, m.nombre)} title="Quitar"
                        className="flex items-center justify-center flex-shrink-0 text-red-500 transition-colors rounded-full w-7 h-7 hover:bg-red-50">
                        <UserMinus size={15} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {esCreador && removidos.length > 0 && (
                <div className="pt-4 mt-4 border-t border-fog">
                  <p className="mb-3 text-xs font-medium text-ash">Removidos</p>
                  <div className="space-y-3">
                    {removidos.map(m => (
                      <div key={m.user_id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 text-sm font-bold rounded-lg text-steel bg-mist">
                            {m.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate text-steel">{m.nombre}</p>
                            <p className="text-xs text-ash">No puede reingresar con el código</p>
                          </div>
                        </div>
                        <button onClick={() => readmitirMiembro(m.user_id, m.nombre)} title="Readmitir"
                          className="flex items-center justify-center flex-shrink-0 transition-colors rounded-full w-7 h-7 text-emerald-600 hover:bg-emerald-50">
                          <UserPlus size={15} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showGasto && (
        <FormGastoCompartido grupoId={grupoId} moneda={moneda} miembros={miembros} yo={yo}
          onClose={() => setShowGasto(false)} onSuccess={recargar} />
      )}
      {editGasto && (
        <FormGastoCompartido grupoId={grupoId} moneda={moneda} miembros={miembros} yo={yo} gasto={editGasto}
          onClose={() => setEditGasto(null)} onSuccess={recargar} />
      )}
      {showLiquidar && (
        <FormLiquidar grupoId={grupoId} moneda={moneda} miembros={miembros} yo={yo} prefill={prefillLiq}
          onClose={() => setShowLiquidar(false)} onSuccess={recargar} />
      )}
    </AppLayout>
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
