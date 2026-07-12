'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import FormSuscripcion from '../components/FormSuscripcion'
import Notificaciones from '../components/Notificaciones'
import { SkeletonCard } from '../components/Skeleton'
import {
  calcularSuscripcion, ESTADO_META, FRECUENCIA_META,
  type EstadoSuscripcion, type Frecuencia,
} from '../lib/suscripciones'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Plus, Pencil, Trash2, RefreshCw, CalendarClock, Search, Filter,
  ChevronDown, Play, Pause, PieChart as PieIcon, Lightbulb,
  TrendingUp, type LucideIcon,
} from 'lucide-react'

const COLORES = [
  '#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6',
  '#EC4899', '#10B981', '#6366F1', '#2c6e49',
]

export default function Suscripciones() {
  const router = useRouter()
  const [subs, setSubs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [subEditar, setSubEditar] = useState<any>(null)
  const [filtroEstado, setFiltroEstado] = useState<'todas' | EstadoSuscripcion>('todas')
  const [filtroFrecuencia, setFiltroFrecuencia] = useState<'todas' | Frecuencia>('todas')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarSubs()
    }
    checkUser()
  }, [router])

  const cargarSubs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setSubs((data || []).map(s => ({ ...s, calc: calcularSuscripcion(s) })))
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta suscripción?')) return
    await supabase.from('subscriptions').delete().eq('id', id)
    cargarSubs()
  }

  const handleToggleEstado = async (sub: any) => {
    const nuevo = sub.estado === 'pausada' ? 'activa' : 'pausada'
    await supabase.from('subscriptions').upsert({ id: sub.id, estado: nuevo, user_id: sub.user_id })
    cargarSubs()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const formatFecha = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  // --- Totales (solo activas) ---
  const activas = subs.filter(s => s.calc.estado === 'activa')
  const gastoMensual = activas.reduce((s, x) => s + x.calc.montoMensual, 0)
  const proyeccionAnual = activas.reduce((s, x) => s + x.calc.montoAnual, 0)

  // Próximos cobros ordenados por fecha
  const proximosCobros = activas
    .filter(s => s.calc.proximoCobro)
    .map(s => ({ id: s.id, nombre: s.nombre, color: s.color, fecha: s.calc.proximoCobro as string, monto: s.calc.monto, dias: s.calc.diasParaCobro }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const proximoCobroGlobal = proximosCobros[0] || null

  // Distribución de gasto mensual por suscripción
  const distribucion = activas
    .map(s => ({ nombre: s.nombre, valor: s.calc.montoMensual, color: s.color }))
    .filter(s => s.valor > 0)
    .sort((a, b) => b.valor - a.valor)
  const totalDistribucion = distribucion.reduce((s, d) => s + d.valor, 0)

  const consejo = (() => {
    if (activas.length === 0 && subs.length > 0) return 'No tienes suscripciones activas. Reactiva las que sigas usando o elimina las que ya no necesites.'
    if (gastoMensual > 0) return `Tus suscripciones suman L ${formatMonto(gastoMensual)} al mes (L ${formatMonto(proyeccionAnual)} al año). Revisa cuáles usas de verdad para recortar gastos hormiga.`
    return 'Registra tus suscripciones para ver cuánto gastas al mes y no olvidar ningún cobro recurrente.'
  })()

  const subsFiltradas = subs.filter(s => {
    if (filtroEstado !== 'todas' && s.calc.estado !== filtroEstado) return false
    if (filtroFrecuencia !== 'todas' && s.frecuencia !== filtroFrecuencia) return false
    if (busqueda && !s.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] p-6 mx-auto space-y-6 lg:p-8">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="p-8 rounded-2xl bg-fog animate-pulse h-44" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="mb-1 text-sm font-medium text-steel">Suscripciones</p>
            <h1 className="text-3xl font-bold text-obsidian">Tus pagos recurrentes</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSubEditar(null); setShowForm(true) }}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="items-center hidden gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow sm:inline-flex hover:scale-105 hover:brightness-110"
            >
              <Plus size={18} strokeWidth={2.5} />
              Nueva suscripción
            </button>
            <Notificaciones />
          </div>
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
              <h2 className="text-xl font-semibold">Resumen de suscripciones</h2>
              <p className="text-base text-white/60">
                {activas.length} {activas.length === 1 ? 'suscripción activa' : 'suscripciones activas'}
                {subs.length - activas.length > 0 && <span className="ml-1 text-white/40">· {subs.length - activas.length} en pausa</span>}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 sm:divide-x sm:divide-white/10">
              <div className="flex items-start gap-4 sm:pr-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <RefreshCw size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Gasto mensual</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl">L {formatMonto(gastoMensual)}</p>
                  <p className="mt-1.5 text-sm font-medium text-white/50">
                    {activas.length} {activas.length === 1 ? 'servicio' : 'servicios'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 sm:px-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <CalendarClock size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Próximo cobro</p>
                  {proximoCobroGlobal ? (
                    <>
                      <p className="text-2xl font-bold break-words sm:text-3xl">L {formatMonto(proximoCobroGlobal.monto)}</p>
                      <p className="mt-1.5 text-sm font-medium text-white/50 truncate">
                        {proximoCobroGlobal.nombre} · {formatFecha(proximoCobroGlobal.fecha)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold sm:text-3xl">—</p>
                      <p className="mt-1.5 text-sm font-medium text-white/50">Sin cobros programados</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4 sm:pl-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <TrendingUp size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Proyección anual</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl text-emerald-200">L {formatMonto(proyeccionAnual)}</p>
                  <p className="mt-1.5 text-sm font-medium text-white/50">Estimado a 12 meses</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Columna suscripciones */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-steel">Mis suscripciones</h2>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <FiltroMenu
                icon={Filter}
                value={filtroEstado}
                onChange={(v) => setFiltroEstado(v as any)}
                options={[
                  { value: 'todas', label: 'Todos los estados' },
                  { value: 'activa', label: 'Activas' },
                  { value: 'pausada', label: 'Pausadas' },
                  { value: 'cancelada', label: 'Canceladas' },
                ]}
              />
              <FiltroMenu
                icon={RefreshCw}
                value={filtroFrecuencia}
                onChange={(v) => setFiltroFrecuencia(v as any)}
                options={[
                  { value: 'todas', label: 'Toda frecuencia' },
                  { value: 'semanal', label: 'Semanal' },
                  { value: 'mensual', label: 'Mensual' },
                  { value: 'trimestral', label: 'Trimestral' },
                  { value: 'anual', label: 'Anual' },
                ]}
              />
              <div className="relative flex-1 min-w-[10rem]">
                <Search size={15} strokeWidth={2} className="absolute -translate-y-1/2 pointer-events-none left-3 top-1/2 text-ash" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar suscripción..."
                  className="w-full py-2.5 pl-9 pr-3 text-sm transition-colors border rounded-full bg-snow border-fog text-ink placeholder-ash focus:outline-none focus:border-obsidian"
                />
              </div>
            </div>

            {subs.length === 0 ? (
              <div className="p-12 text-center border bg-snow border-fog rounded-card">
                <RefreshCw size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
                <p className="mb-2 text-steel">No tienes suscripciones registradas</p>
                <p className="text-sm text-ash">Agrega tu primera suscripción con el botón +</p>
              </div>
            ) : subsFiltradas.length === 0 ? (
              <div className="p-12 text-center border bg-snow border-fog rounded-card">
                <Search size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
                <p className="mb-2 text-steel">Ninguna suscripción coincide con los filtros</p>
                <p className="text-sm text-ash">Prueba con otros criterios de búsqueda</p>
              </div>
            ) : (
              <div className="grid items-stretch grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
                {subsFiltradas.map(sub => {
                  const c = sub.calc
                  const meta = ESTADO_META[c.estado as EstadoSuscripcion]
                  const frecMeta = FRECUENCIA_META[(sub.frecuencia as Frecuencia)] || FRECUENCIA_META.mensual
                  const acento = sub.color || '#2c6e49'
                  const pausada = c.estado !== 'activa'
                  return (
                    <div
                      key={sub.id}
                      className={`flex flex-col h-full p-5 transition-colors border bg-snow rounded-card ${pausada ? 'border-fog opacity-70' : 'border-fog hover:border-pebble'}`}
                    >
                      {/* Encabezado */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center min-w-0 gap-3">
                          <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 font-bold rounded-2xl" style={{ backgroundColor: acento + '15', color: acento }}>
                            {sub.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate text-ink">{sub.nombre}</p>
                            <p className="text-xs text-ash">{sub.plan || frecMeta.label}</p>
                          </div>
                        </div>
                        <div className="flex items-center flex-shrink-0 gap-1">
                          <button
                            onClick={() => { setSubEditar(sub); setShowForm(true) }}
                            className="p-1.5 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist"
                            title="Editar"
                          ><Pencil size={15} strokeWidth={2} /></button>
                          <button
                            onClick={() => handleEliminar(sub.id)}
                            className="p-1.5 transition-colors rounded-full text-ash hover:text-red-600 hover:bg-red-50"
                            title="Eliminar"
                          ><Trash2 size={15} strokeWidth={2} /></button>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-badge ${meta.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-badge text-steel bg-mist">
                          <RefreshCw size={11} strokeWidth={2.5} />
                          {frecMeta.label}
                        </span>
                      </div>

                      {/* Monto */}
                      <div className="mb-4">
                        <p className="text-2xl font-bold text-obsidian">L {formatMonto(c.monto)}</p>
                        <p className="text-xs text-steel">
                          {frecMeta.adverbio}
                          {sub.frecuencia !== 'mensual' && ` · ≈ L ${formatMonto(c.montoMensual)}/mes`}
                        </p>
                      </div>

                      {/* Próximo cobro */}
                      <div className="flex items-center gap-2 pt-3 mt-auto border-t border-fog">
                        {!pausada && c.proximoCobro ? (
                          <>
                            <CalendarClock size={15} strokeWidth={2} className={c.diasParaCobro !== null && c.diasParaCobro <= 5 ? 'text-red-500' : 'text-ash'} />
                            <span className={`text-xs ${c.diasParaCobro !== null && c.diasParaCobro <= 5 ? 'text-red-500 font-medium' : 'text-steel'}`}>
                              Próximo cobro: {formatFecha(c.proximoCobro)}
                              {c.diasParaCobro !== null && c.diasParaCobro >= 0 && c.diasParaCobro <= 30 && ` · en ${c.diasParaCobro}d`}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-ash">Sin cobros programados</span>
                        )}
                        <button
                          onClick={() => handleToggleEstado(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 ml-auto text-xs font-medium transition-all border rounded-full border-pebble text-steel hover:text-ink hover:bg-fog"
                          title={pausada ? 'Reactivar' : 'Pausar'}
                        >
                          {pausada ? <><Play size={12} strokeWidth={2} /> Activar</> : <><Pause size={12} strokeWidth={2} /> Pausar</>}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Columna análisis */}
          <div className="space-y-6 lg:col-span-1">
            <h2 className="mb-4 text-sm font-semibold text-steel">Resumen y análisis</h2>

            {/* Distribución */}
            <div className="p-6 border bg-snow border-fog rounded-card">
              <h3 className="mb-5 text-sm font-semibold text-steel">Análisis de gasto mensual</h3>
              {distribucion.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <PieIcon size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                  <p className="text-sm text-steel">Sin suscripciones activas para mostrar</p>
                </div>
              ) : (
                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0 w-[136px] h-[136px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={distribucion} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} cornerRadius={4} dataKey="valor" stroke="none">
                          {distribucion.map((d, i) => <Cell key={i} fill={d.color || COLORES[i % COLORES.length]} />)}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`L ${formatMonto(Number(value) || 0)}`, 'Al mes']}
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                          labelStyle={{ color: '#71717a' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-medium text-steel">Al mes</span>
                      <span className="text-sm font-bold leading-tight text-ink">L {formatMonto(totalDistribucion)}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {distribucion.slice(0, 5).map((item, i) => {
                      const pct = totalDistribucion > 0 ? Math.round((item.valor / totalDistribucion) * 100) : 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || COLORES[i % COLORES.length] }} />
                          <span className="flex-1 min-w-0 text-sm truncate text-ink">{item.nombre}</span>
                          <span className="w-8 text-xs font-medium text-right text-steel">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Próximos cobros */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-steel">Próximos cobros</h3>
                {proximosCobros.length > 0 && (
                  <span className="text-xs font-medium text-ash">L {formatMonto(proximosCobros.reduce((s, p) => s + p.monto, 0))}</span>
                )}
              </div>
              {proximosCobros.length === 0 ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-mist text-pebble">
                    <CalendarClock size={18} strokeWidth={2} />
                  </div>
                  <p className="text-sm text-ash">Sin cobros programados</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {proximosCobros.slice(0, 4).map(p => {
                    const urgente = p.dias !== null && p.dias <= 5
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 text-xs font-bold rounded-xl" style={{ backgroundColor: (p.color || '#2c6e49') + '15', color: p.color || '#2c6e49' }}>
                          {p.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-ink">{p.nombre}</p>
                          <p className="text-xs text-ash">{formatFecha(p.fecha)}</p>
                        </div>
                        <p className={`text-sm font-semibold whitespace-nowrap ${urgente ? 'text-red-500' : 'text-ink'}`}>L {formatMonto(p.monto)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Consejo */}
            <div className="p-5 border rounded-card border-fog" style={{ background: 'linear-gradient(135deg, #f4f9f6 0%, #eef5f0 100%)' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100">
                  <Lightbulb size={16} strokeWidth={2} className="text-emerald-700" />
                </div>
                <h3 className="text-sm font-semibold text-steel">¿Sabías que...?</h3>
              </div>
              <p className="text-sm leading-relaxed text-graphite">{consejo}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón flotante */}
      <button
        onClick={() => { setSubEditar(null); setShowForm(true) }}
        style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110 sm:hidden"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {showForm && (
        <FormSuscripcion
          suscripcion={subEditar}
          onClose={() => { setShowForm(false); setSubEditar(null) }}
          onSuccess={cargarSubs}
        />
      )}
    </AppLayout>
  )
}

function FiltroMenu({ icon: Icon, value, onChange, options }: {
  icon?: LucideIcon
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const label = options.find(o => o.value === value)?.label || ''
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 py-2.5 pl-3.5 pr-2.5 text-sm font-medium transition-colors border rounded-full bg-snow border-fog text-graphite hover:bg-mist"
      >
        {Icon && <Icon size={15} strokeWidth={2} className="text-steel" />}
        {label}
        <ChevronDown size={14} strokeWidth={2} className={`text-steel transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[11rem]">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`block w-full px-3 py-1.5 text-sm text-left transition-colors hover:bg-mist ${value === o.value ? 'text-ink font-medium' : 'text-steel'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
