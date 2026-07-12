'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import FormDeuda from '../components/FormDeuda'
import FormAbono from '../components/FormAbono'
import Notificaciones from '../components/Notificaciones'
import { SkeletonCard } from '../components/Skeleton'
import {
  archivarSubcategoriaDeuda,
  eliminarSubcategoriaDeuda,
  crearSubcategoriaDeuda,
} from '../lib/deudas'
import { calcularDeuda, ESTADO_META, type EstadoDeuda } from '../lib/deudaCalculos'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Plus, Pencil, Trash2, CreditCard, HandCoins, ArrowDownCircle, ArrowUpCircle,
  ChevronRight, ChevronDown, Filter, Search, CalendarClock, Check,
  AlertTriangle, PieChart as PieIcon, Lightbulb, Percent, type LucideIcon,
} from 'lucide-react'

const COLORES = [
  '#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6',
  '#EC4899', '#10B981', '#6366F1', '#2c6e49',
]

export default function Deudas() {
  const router = useRouter()
  const [deudas, setDeudas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deudaEditar, setDeudaEditar] = useState<any>(null)
  const [deudaAbonar, setDeudaAbonar] = useState<any>(null)
  const [showAbono, setShowAbono] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'debo' | 'me_deben'>('todas')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoDeuda>('todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarDeudas()
    }
    checkUser()
  }, [router])

  const cargarDeudas = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .order('completada', { ascending: true })
      .order('created_at', { ascending: false })

    setDeudas((data || []).map(d => ({ ...d, calc: calcularDeuda(d) })))
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta deuda?')) return
    const deuda = deudas.find(d => d.id === id)
    await supabase.from('debts').delete().eq('id', id)
    if (deuda?.category_id) await eliminarSubcategoriaDeuda(deuda.category_id)
    cargarDeudas()
  }

  const handleCompletar = async (deuda: any) => {
    const nuevaCompletada = !deuda.completada
    const { error } = await supabase
      .from('debts')
      .upsert({ id: deuda.id, completada: nuevaCompletada, user_id: deuda.user_id })
    if (error) { console.error('Error actualizando deuda:', error); return }

    if (deuda.tipo === 'debo') {
      if (deuda.category_id) {
        await archivarSubcategoriaDeuda(deuda.category_id, nuevaCompletada)
      } else if (!nuevaCompletada) {
        await crearSubcategoriaDeuda(deuda.user_id, { id: deuda.id, nombre: deuda.nombre })
      }
    }
    cargarDeudas()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const formatFecha = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  // --- Totales ---
  const debosActivos = deudas.filter(d => d.tipo === 'debo' && !d.completada)
  const meDebenActivos = deudas.filter(d => d.tipo === 'me_deben' && !d.completada)

  const totalDebo = debosActivos.reduce((s, d) => s + d.calc.saldoPrincipal, 0)
  const interesTotal = debosActivos.reduce((s, d) => s + d.calc.interesAcumulado, 0)
  const totalMeDeben = meDebenActivos.reduce((s, d) => s + d.calc.saldoPrincipal, 0)
  const enMora = deudas.filter(d => d.calc.estado === 'en_mora').length

  // Próximos pagos ordenados por fecha
  const proximosPagos = debosActivos
    .filter(d => d.calc.proximoPagoFecha && d.calc.proximoPagoMonto)
    .map(d => ({ id: d.id, nombre: d.nombre, fecha: d.calc.proximoPagoFecha as string, monto: d.calc.proximoPagoMonto as number, dias: d.calc.diasParaVencer }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const proximoPagoGlobal = proximosPagos[0] || null

  // Distribución de lo que debo (por saldo con interés)
  const distribucion = debosActivos
    .map(d => ({ nombre: d.nombre, valor: d.calc.saldoTotal }))
    .filter(d => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)
  const totalDistribucion = distribucion.reduce((s, d) => s + d.valor, 0)

  // Alertas
  type Alerta = { id: string; icon: LucideIcon; texto: string; grave: boolean }
  const alertas: Alerta[] = []
  deudas.forEach(d => {
    if (d.calc.estado === 'en_mora')
      alertas.push({ id: `${d.id}-mora`, icon: AlertTriangle, texto: `${d.nombre} está en mora`, grave: true })
    else if (d.calc.diasParaVencer !== null && d.calc.diasParaVencer >= 0 && d.calc.diasParaVencer <= 7 && !d.completada)
      alertas.push({ id: `${d.id}-venc`, icon: CalendarClock, texto: `${d.nombre} vence en ${d.calc.diasParaVencer}d`, grave: false })
  })
  const alertasGraves = alertas.filter(a => a.grave).length

  const consejo = (() => {
    if (enMora > 0) return `Tienes ${enMora} ${enMora === 1 ? 'deuda' : 'deudas'} en mora. Priorízalas para evitar más intereses y recargos.`
    if (interesTotal > 0) return `Tus deudas han acumulado L ${formatMonto(interesTotal)} en intereses. Abonar al capital reduce lo que pagas a futuro.`
    if (totalDebo > 0 && totalDebo > totalMeDeben) return 'Debes más de lo que te deben. Considera un plan de pagos para equilibrar tus finanzas.'
    if (totalDebo === 0 && deudas.length > 0) return '¡Excelente! No tienes deudas pendientes. Mantén el hábito de registrar tus compromisos.'
    return 'Registra tus deudas con su tasa y plazo para proyectar pagos e intereses automáticamente.'
  })()

  const deudasFiltradas = deudas.filter(d => {
    if (filtroTipo !== 'todas' && d.tipo !== filtroTipo) return false
    if (filtroEstado !== 'todos' && d.calc.estado !== filtroEstado) return false
    if (busqueda && !d.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
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
            <p className="mb-1 text-sm font-medium text-steel">Deudas</p>
            <h1 className="text-3xl font-bold text-obsidian">Controla tus compromisos</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setDeudaEditar(null); setShowForm(true) }}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="items-center hidden gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow sm:inline-flex hover:scale-105 hover:brightness-110"
            >
              <Plus size={18} strokeWidth={2.5} />
              Nueva deuda
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
              <h2 className="text-xl font-semibold">Resumen de deudas</h2>
              <p className="text-base text-white/60">
                {debosActivos.length + meDebenActivos.length} {debosActivos.length + meDebenActivos.length === 1 ? 'deuda activa' : 'deudas activas'}
                {enMora > 0 && <span className="ml-1 text-red-300">· {enMora} en mora</span>}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 sm:divide-x sm:divide-white/10">
              <div className="flex items-start gap-4 sm:pr-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <ArrowUpCircle size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Lo que debo</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl text-red-200">
                    L {formatMonto(totalDebo)}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-white/50">
                    {debosActivos.length} {debosActivos.length === 1 ? 'deuda' : 'deudas'}
                    {interesTotal > 0 && ` · +L ${formatMonto(interesTotal)} interés`}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 sm:px-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <ArrowDownCircle size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Lo que me deben</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl text-emerald-200">
                    L {formatMonto(totalMeDeben)}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-white/50">
                    {meDebenActivos.length} {meDebenActivos.length === 1 ? 'préstamo' : 'préstamos'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 sm:pl-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <CalendarClock size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Próximo pago</p>
                  {proximoPagoGlobal ? (
                    <>
                      <p className="text-2xl font-bold break-words sm:text-3xl">
                        L {formatMonto(proximoPagoGlobal.monto)}
                      </p>
                      <p className="mt-1.5 text-sm font-medium text-white/50 truncate">
                        {proximoPagoGlobal.nombre} · {formatFecha(proximoPagoGlobal.fecha)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold sm:text-3xl">—</p>
                      <p className="mt-1.5 text-sm font-medium text-white/50">Sin pagos programados</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Columna deudas */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-steel">Mis deudas</h2>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <FiltroMenu
                icon={Filter}
                value={filtroTipo}
                onChange={(v) => setFiltroTipo(v as any)}
                options={[
                  { value: 'todas', label: 'Todos los tipos' },
                  { value: 'debo', label: 'Lo que debo' },
                  { value: 'me_deben', label: 'Lo que me deben' },
                ]}
              />
              <FiltroMenu
                icon={Percent}
                value={filtroEstado}
                onChange={(v) => setFiltroEstado(v as any)}
                options={[
                  { value: 'todos', label: 'Todos los estados' },
                  { value: 'activa', label: 'Activas' },
                  { value: 'en_mora', label: 'En mora' },
                  { value: 'pagada', label: 'Pagadas' },
                ]}
              />
              <div className="relative flex-1 min-w-[10rem]">
                <Search size={15} strokeWidth={2} className="absolute -translate-y-1/2 pointer-events-none left-3 top-1/2 text-ash" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar deuda..."
                  className="w-full py-2.5 pl-9 pr-3 text-sm transition-colors border rounded-full bg-snow border-fog text-ink placeholder-ash focus:outline-none focus:border-obsidian"
                />
              </div>
            </div>

            {deudas.length === 0 ? (
              <div className="p-12 text-center border bg-snow border-fog rounded-card">
                <HandCoins size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
                <p className="mb-2 text-steel">No tienes deudas registradas</p>
                <p className="text-sm text-ash">Agrega tu primera deuda con el botón +</p>
              </div>
            ) : deudasFiltradas.length === 0 ? (
              <div className="p-12 text-center border bg-snow border-fog rounded-card">
                <Search size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
                <p className="mb-2 text-steel">Ninguna deuda coincide con los filtros</p>
                <p className="text-sm text-ash">Prueba con otros criterios de búsqueda</p>
              </div>
            ) : (
              <div className="grid items-stretch grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
                {deudasFiltradas.map(deuda => {
                  const c = deuda.calc
                  const esDebo = deuda.tipo === 'debo'
                  const meta = ESTADO_META[c.estado as EstadoDeuda]
                  const acento = esDebo ? '#EF4444' : '#10B981'
                  return (
                    <div
                      key={deuda.id}
                      className={`flex flex-col h-full p-5 transition-colors border bg-snow rounded-card ${c.estado === 'en_mora' ? 'border-red-300' : deuda.completada ? 'border-fog opacity-70' : 'border-fog hover:border-pebble'}`}
                    >
                      {/* Encabezado */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center min-w-0 gap-3">
                          <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-2xl" style={{ backgroundColor: acento + '15', color: acento }}>
                            {esDebo ? <ArrowUpCircle size={22} strokeWidth={2} /> : <ArrowDownCircle size={22} strokeWidth={2} />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate text-ink">{deuda.nombre}</p>
                            <p className="text-xs text-ash">
                              {esDebo ? 'Le debo a' : 'Me debe'} · {deuda.descripcion || 'Sin descripción'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center flex-shrink-0 gap-1">
                          <button
                            onClick={() => { setDeudaEditar(deuda); setShowForm(true) }}
                            className="p-1.5 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist"
                            title="Editar"
                          ><Pencil size={15} strokeWidth={2} /></button>
                          <button
                            onClick={() => handleEliminar(deuda.id)}
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
                        {c.tasaMensual > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-badge text-amber-600 bg-amber-50">
                            <Percent size={11} strokeWidth={2.5} />
                            {formatMonto(Number(deuda.tasa_interes))}% {deuda.tasa_periodo}
                          </span>
                        )}
                        {deuda.plazo_meses ? (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-badge text-steel bg-mist">
                            {deuda.plazo_meses} meses
                          </span>
                        ) : null}
                      </div>

                      {/* Montos */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div>
                          <p className="mb-0.5 text-xs font-medium text-steel">Total</p>
                          <p className="text-sm font-semibold break-words text-obsidian">L {formatMonto(c.principal)}</p>
                        </div>
                        <div>
                          <p className="mb-0.5 text-xs font-medium text-steel">Pagado</p>
                          <p className="text-sm font-semibold break-words text-emerald-600">L {formatMonto(c.pagado)}</p>
                        </div>
                        <div>
                          <p className="mb-0.5 text-xs font-medium text-steel">Pendiente</p>
                          <p className={`text-sm font-semibold break-words ${esDebo ? 'text-red-500' : 'text-emerald-600'}`}>L {formatMonto(c.saldoPrincipal)}</p>
                        </div>
                      </div>

                      {c.interesAcumulado > 0 && (
                        <p className="mb-3 text-xs text-amber-600">
                          + L {formatMonto(c.interesAcumulado)} de interés acumulado
                          <span className="text-ash"> · saldo L {formatMonto(c.saldoTotal)}</span>
                        </p>
                      )}

                      {/* Progreso */}
                      <div className="w-full h-2 mb-1.5 rounded-full bg-fog">
                        <div
                          className="h-2 transition-all duration-500 rounded-full bg-emerald-500"
                          style={{ width: `${c.porcentajePagado}%` }}
                        />
                      </div>
                      <div className="flex justify-between mb-4">
                        <span className="text-xs text-ash">{Math.round(c.porcentajePagado)}% pagado</span>
                        {c.fechaLiquidacion && (
                          <span className={`text-xs ${c.estado === 'en_mora' ? 'text-red-500 font-medium' : 'text-ash'}`}>
                            Liquida: {formatFecha(c.fechaLiquidacion)}
                          </span>
                        )}
                      </div>

                      {/* Acciones inferiores */}
                      <div className="flex items-center justify-between pt-3 mt-auto border-t border-fog">
                        {!deuda.completada ? (
                          <button
                            onClick={() => { setDeudaAbonar(deuda); setShowAbono(true) }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite"
                          >
                            <CreditCard size={13} strokeWidth={2} /> Abonar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCompletar(deuda)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-all border rounded-full border-pebble text-steel hover:text-ink hover:bg-fog"
                          >
                            Reabrir
                          </button>
                        )}
                        <div className="flex items-center gap-2">
                          {!deuda.completada && (
                            <button
                              onClick={() => handleCompletar(deuda)}
                              className="inline-flex items-center gap-1 text-xs font-medium transition-colors text-graphite hover:text-ink"
                              title="Marcar como pagada"
                            >
                              <Check size={14} strokeWidth={2.5} /> Completar
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/deudas/${deuda.id}`)}
                            className="inline-flex items-center gap-1 text-xs font-medium transition-colors text-graphite hover:text-ink"
                          >
                            Detalle <ChevronRight size={14} strokeWidth={2} />
                          </button>
                        </div>
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
              <h3 className="mb-5 text-sm font-semibold text-steel">Distribución de lo que debo</h3>
              {distribucion.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <PieIcon size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                  <p className="text-sm text-steel">Sin deudas activas para mostrar</p>
                </div>
              ) : (
                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0 w-[136px] h-[136px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={distribucion} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} cornerRadius={4} dataKey="valor" stroke="none">
                          {distribucion.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`L ${formatMonto(Number(value) || 0)}`, 'Saldo']}
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                          labelStyle={{ color: '#71717a' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-medium text-steel">Total</span>
                      <span className="text-sm font-bold leading-tight text-ink">L {formatMonto(totalDistribucion)}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {distribucion.slice(0, 5).map((item, i) => {
                      const pct = totalDistribucion > 0 ? Math.round((item.valor / totalDistribucion) * 100) : 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORES[i % COLORES.length] }} />
                          <span className="flex-1 min-w-0 text-sm truncate text-ink">{item.nombre}</span>
                          <span className="w-8 text-xs font-medium text-right text-steel">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Estado de tus deudas */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-steel">Estado de tus deudas</h3>
                {alertas.length > 0 && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-badge ${alertasGraves > 0 ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'}`}>
                    {alertas.length} {alertas.length === 1 ? 'aviso' : 'avisos'}
                  </span>
                )}
              </div>
              {alertas.length === 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-full bg-emerald-50">
                    <Check size={18} strokeWidth={2.5} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">Todo al día</p>
                    <p className="text-xs text-ash">Sin deudas en mora ni próximas a vencer</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {alertas.slice(0, 4).map(a => {
                    const Icono = a.icon
                    return (
                      <div key={a.id} className="flex items-center gap-3">
                        <div className={`flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-xl ${a.grave ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
                          <Icono size={16} strokeWidth={2} />
                        </div>
                        <p className="flex-1 min-w-0 text-sm text-ink">{a.texto}</p>
                      </div>
                    )
                  })}
                  {alertas.length > 4 && <p className="text-xs text-ash">y {alertas.length - 4} más</p>}
                </div>
              )}
            </div>

            {/* Próximos pagos */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-steel">Próximos pagos</h3>
                {proximosPagos.length > 0 && (
                  <span className="text-xs font-medium text-ash">L {formatMonto(proximosPagos.reduce((s, p) => s + p.monto, 0))}</span>
                )}
              </div>
              {proximosPagos.length === 0 ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-mist text-pebble">
                    <CalendarClock size={18} strokeWidth={2} />
                  </div>
                  <p className="text-sm text-ash">Sin pagos programados</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {proximosPagos.slice(0, 3).map(p => {
                    const urgente = p.dias !== null && p.dias <= 5
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className={`flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl ${urgente ? 'bg-red-50 text-red-500' : 'bg-mist text-steel'}`}>
                          <CreditCard size={18} strokeWidth={2} />
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
                <h3 className="text-sm font-semibold text-steel">Consejo financiero</h3>
              </div>
              <p className="text-sm leading-relaxed text-graphite">{consejo}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón flotante */}
      <button
        onClick={() => { setDeudaEditar(null); setShowForm(true) }}
        style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110 sm:hidden"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {showForm && (
        <FormDeuda
          deuda={deudaEditar}
          onClose={() => { setShowForm(false); setDeudaEditar(null) }}
          onSuccess={cargarDeudas}
        />
      )}

      {showAbono && deudaAbonar && (
        <FormAbono
          deuda={deudaAbonar}
          onClose={() => { setShowAbono(false); setDeudaAbonar(null) }}
          onSuccess={cargarDeudas}
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
