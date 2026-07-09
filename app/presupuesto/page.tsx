'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import FormPresupuesto from '../components/FormPresupuesto'
import FormMeta from '../components/FormMeta'
import FormAporteMeta from '../components/FormAporteMeta'
import AppLayout from '../components/AppLayout'
import Notificaciones from '../components/Notificaciones'
import { SkeletonList } from '../components/Skeleton'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Plus, ChevronLeft, ChevronRight, ChevronDown, Calendar, SlidersHorizontal,
  MoreHorizontal, Pencil, Trash2, AlertTriangle, Info, CheckCircle2, Lightbulb,
  Target, Wallet, TrendingDown, TrendingUp, PiggyBank, PieChart as PieIcon,
  Search, X, type LucideIcon,
} from 'lucide-react'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const COLORES = [
  '#2c6e49', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EF4444', '#EC4899', '#10B981', '#6366F1',
]

export default function Presupuesto() {
  const router = useRouter()
  const [presupuestos, setPresupuestos] = useState<any[]>([])
  const [catMap, setCatMap] = useState<Record<string, any>>({})
  const [gastoPrev, setGastoPrev] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [presupuestoEditar, setPresupuestoEditar] = useState<any>(null)
  const [metas, setMetas] = useState<any[]>([])
  const [showMetaForm, setShowMetaForm] = useState(false)
  const [metaEditar, setMetaEditar] = useState<any>(null)
  const [metaAporte, setMetaAporte] = useState<any>(null)
  const [tab, setTab] = useState<'presupuestos' | 'metas'>('presupuestos')
  const [tipoVista, setTipoVista] = useState<'gasto' | 'ingreso'>('gasto')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [mesOffset, setMesOffset] = useState(0)
  const [showMesPicker, setShowMesPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())

  const esIngreso = tipoVista === 'ingreso'

  const getMesActual = () => {
    const f = new Date()
    f.setMonth(f.getMonth() + mesOffset)
    return f
  }

  const mesNombre = getMesActual().toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarPresupuestos()
      cargarMetas()
    }
    checkUser()
  }, [router])

  useEffect(() => {
    cargarPresupuestos()
  }, [mesOffset])

  const cargarPresupuestos = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const base = getMesActual()
    const mes = base.getMonth() + 1
    const anio = base.getFullYear()
    const inicio = new Date(anio, mes - 1, 1).toISOString().split('T')[0]
    const fin = new Date(anio, mes, 0).toISOString().split('T')[0]
    const inicioPrev = new Date(anio, mes - 2, 1).toISOString().split('T')[0]
    const finPrev = new Date(anio, mes - 1, 0).toISOString().split('T')[0]

    const selectBudgets = () => supabase
      .from('budgets')
      .select('*, categories(nombre, icono, color, tipo, parent_id)')
      .eq('user_id', user.id)
      .eq('mes', mes)
      .eq('año', anio)

    let { data: budgets } = await selectBudgets()

    // Traspaso automático: si es el mes actual y aún no hay presupuestos,
    // se heredan los del mes anterior para no arrancar el mes en blanco.
    // La marca en budget_rollovers registra que ya se hizo el traspaso, para
    // no volver a copiar si el usuario borra los presupuestos intencionalmente.
    if (mesOffset === 0 && (budgets || []).length === 0) {
      const { data: marca } = await supabase
        .from('budget_rollovers')
        .select('id')
        .eq('user_id', user.id)
        .eq('mes', mes)
        .eq('año', anio)

      if (!marca || marca.length === 0) {
        const copiados = await traspasarMesAnterior(user.id, mes, anio)
        await supabase.from('budget_rollovers').insert({ mes, año: anio })
        if (copiados) ({ data: budgets } = await selectBudgets())
      }
    }

    // Todas las categorías (para resolver nombres de padres no presupuestados).
    const { data: cats } = await supabase
      .from('categories')
      .select('id, nombre, icono, color, tipo, parent_id')
      .or(`user_id.eq.${user.id},es_sistema.eq.true`)

    const map: Record<string, any> = {}
    ;(cats || []).forEach(c => { map[c.id] = c })
    setCatMap(map)

    // Movimientos del mes agrupados por tipo y categoría (una sola consulta).
    const { data: transMes } = await supabase
      .from('transactions')
      .select('monto, category_id, tipo')
      .eq('user_id', user.id)
      .gte('fecha', inicio)
      .lte('fecha', fin)

    const movPorCat: Record<string, Record<string, number>> = { gasto: {}, ingreso: {} }
    ;(transMes || []).forEach((t: any) => {
      if (!t.category_id || !movPorCat[t.tipo]) return
      movPorCat[t.tipo][t.category_id] = (movPorCat[t.tipo][t.category_id] || 0) + Number(t.monto)
    })

    // Gastos del mes anterior (para detectar aumentos).
    const { data: transPrev } = await supabase
      .from('transactions')
      .select('monto, category_id')
      .eq('user_id', user.id)
      .eq('tipo', 'gasto')
      .gte('fecha', inicioPrev)
      .lte('fecha', finPrev)

    const prevPorCat: Record<string, number> = {}
    ;(transPrev || []).forEach(t => {
      if (!t.category_id) return
      prevPorCat[t.category_id] = (prevPorCat[t.category_id] || 0) + Number(t.monto)
    })

    const conGasto = (budgets || []).map(b => {
      const tipo = b.categories?.tipo || 'gasto'
      const gastado = (movPorCat[tipo] || {})[b.category_id] || 0
      const porcentaje = b.monto_limite > 0 ? Math.min((gastado / b.monto_limite) * 100, 100) : 0
      return { ...b, gastado, porcentaje }
    })

    setPresupuestos(conGasto)
    setGastoPrev(prevPorCat)
    setLoading(false)
  }

  const traspasarMesAnterior = async (userId: string, mes: number, anio: number) => {
    const prevMes = mes === 1 ? 12 : mes - 1
    const prevAnio = mes === 1 ? anio - 1 : anio

    const { data: prev } = await supabase
      .from('budgets')
      .select('category_id, monto_limite')
      .eq('user_id', userId)
      .eq('mes', prevMes)
      .eq('año', prevAnio)

    if (!prev || prev.length === 0) return false

    const nuevos = prev.map(b => ({
      user_id: userId,
      category_id: b.category_id,
      monto_limite: b.monto_limite,
      mes,
      año: anio,
    }))

    const { error } = await supabase.from('budgets').insert(nuevos)
    return !error
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar este presupuesto?')) return
    await supabase.from('budgets').delete().eq('id', id)
    cargarPresupuestos()
  }

  const cargarMetas = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('metas')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setMetas(data || [])
  }

  const handleEliminarMeta = async (id: string) => {
    if (!confirm('¿Eliminar esta meta de ahorro?')) return
    await supabase.from('metas').delete().eq('id', id)
    cargarMetas()
  }

  const abrirNuevo = () => {
    if (tab === 'metas') { setMetaEditar(null); setShowMetaForm(true) }
    else { setPresupuestoEditar(null); setShowForm(true) }
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const abrirPicker = () => {
    setPickerYear(getMesActual().getFullYear())
    setShowMesPicker(true)
  }

  const seleccionarMes = (year: number, mesIdx: number) => {
    const b = new Date()
    const offset = (year - b.getFullYear()) * 12 + (mesIdx - b.getMonth())
    setMesOffset(Math.min(0, offset))
    setShowMesPicker(false)
  }

  // Presupuestos del tipo activo (gasto o ingreso).
  const presupuestosTipo = presupuestos
    .filter(p => (p.categories?.tipo || 'gasto') === tipoVista)
    .sort((a, b) => b.porcentaje - a.porcentaje)

  // ----- Métricas del resumen -----
  const totalPresupuestado = presupuestosTipo.reduce((s, p) => s + Number(p.monto_limite), 0)
  const totalGastado = presupuestosTipo.reduce((s, p) => s + p.gastado, 0)
  const disponible = totalPresupuestado - totalGastado
  const gastadoPct = totalPresupuestado > 0 ? (totalGastado / totalPresupuestado) * 100 : 0
  const restantePct = Math.max(0, 100 - gastadoPct)

  const esMesActual = mesOffset === 0
  const base = getMesActual()
  const diasMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  const diaActual = esMesActual ? new Date().getDate() : diasMes
  const proyeccion = diaActual > 0 ? (totalGastado / diaActual) * diasMes : totalGastado
  const proyeccionDentro = proyeccion <= totalPresupuestado

  // ----- Estado por categoría -----
  const estadoInfo = (p: any) => {
    if (esIngreso) {
      if (p.gastado >= p.monto_limite) return { label: 'Meta cumplida', badge: 'text-emerald-600 bg-emerald-50', barra: 'bg-emerald-500' }
      if (p.porcentaje >= 60) return { label: 'En progreso', badge: 'text-blue-600 bg-blue-50', barra: 'bg-blue-500' }
      return { label: 'Por debajo', badge: 'text-amber-600 bg-amber-50', barra: 'bg-amber-500' }
    }
    if (p.gastado > p.monto_limite) return { label: 'Sobrepasado', badge: 'text-red-600 bg-red-50', barra: 'bg-red-500' }
    if (p.porcentaje >= 90) return { label: 'Casi límite', badge: 'text-amber-600 bg-amber-50', barra: 'bg-amber-500' }
    return { label: 'En buen camino', badge: 'text-emerald-600 bg-emerald-50', barra: 'bg-emerald-500' }
  }

  const presupuestosFiltrados = presupuestosTipo.filter(p => {
    if (filtroEstado === 'todos') return true
    if (esIngreso) {
      if (filtroEstado === 'cumplida') return p.gastado >= p.monto_limite
      if (filtroEstado === 'progreso') return p.porcentaje >= 60 && p.gastado < p.monto_limite
      if (filtroEstado === 'debajo') return p.porcentaje < 60
      return true
    }
    if (filtroEstado === 'sobre') return p.gastado > p.monto_limite
    if (filtroEstado === 'casi') return p.porcentaje >= 90 && p.gastado <= p.monto_limite
    if (filtroEstado === 'buen') return p.porcentaje < 90 && p.gastado <= p.monto_limite
    return true
  })

  // ----- Agrupación por categoría padre -----
  const parentIds: string[] = []
  presupuestosFiltrados.forEach(p => {
    const pid = p.categories?.parent_id || p.category_id
    if (!parentIds.includes(pid)) parentIds.push(pid)
  })
  const grupos = parentIds.map(pid => {
    const principal = presupuestosFiltrados.find(p => p.category_id === pid && !p.categories?.parent_id)
    const subs = presupuestosFiltrados.filter(p => p.categories?.parent_id === pid)
    const info = principal?.categories || catMap[pid] || { nombre: 'Categoría', icono: '📦', color: '#71717a' }
    const subTotal = subs.reduce((s, x) => s + Number(x.monto_limite), 0)
    const subGastado = subs.reduce((s, x) => s + x.gastado, 0)
    const subPct = subTotal > 0 ? Math.min((subGastado / subTotal) * 100, 100) : 0
    const orden = principal?.porcentaje ?? subPct
    return { pid, principal, subs, info, orden, subTotal, subGastado, subPct }
  }).sort((a, b) => b.orden - a.orden)

  // ----- Búsqueda por categoría -----
  const q = busqueda.trim().toLowerCase()
  const coincide = (nombre?: string) => (nombre || '').toLowerCase().includes(q)
  type Grupo = typeof grupos[number]
  const gruposVisibles: Grupo[] = !q ? grupos : grupos
    .map(g => {
      // Si el nombre del padre coincide, se muestra el grupo completo.
      if (coincide(g.info.nombre)) return g
      const subs = g.subs.filter(s => coincide(s.categories?.nombre))
      const principalMatch = !!g.principal && coincide(g.principal.categories?.nombre)
      if (!principalMatch && subs.length === 0) return null
      const subTotal = subs.reduce((s, x) => s + Number(x.monto_limite), 0)
      const subGastado = subs.reduce((s, x) => s + x.gastado, 0)
      const subPct = subTotal > 0 ? Math.min((subGastado / subTotal) * 100, 100) : 0
      return { ...g, subs, subTotal, subGastado, subPct }
    })
    .filter((g): g is Grupo => g !== null)

  // ----- Distribución del presupuesto -----
  const distribucion = presupuestosTipo
    .map((p, i) => ({
      nombre: p.categories?.nombre || 'Sin nombre',
      valor: Number(p.monto_limite),
      color: p.categories?.color || COLORES[i % COLORES.length],
    }))
    .filter(d => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  // ----- Alertas y recomendaciones -----
  type Alerta = { id: string; icon: LucideIcon; titulo: string; detalle: string; tono: 'alerta' | 'info' | 'ok' }
  const alertas: Alerta[] = []
  if (esIngreso) {
    presupuestosTipo.forEach(p => {
      const nombre = p.categories?.nombre || 'Categoría'
      if (p.gastado >= p.monto_limite) {
        alertas.push({ id: `${p.id}-ok`, icon: CheckCircle2, tono: 'ok',
          titulo: `${nombre} alcanzó su meta`, detalle: `Recibiste L ${formatMonto(p.gastado)} de L ${formatMonto(p.monto_limite)}` })
      } else if (p.porcentaje < 40) {
        alertas.push({ id: `${p.id}-low`, icon: AlertTriangle, tono: 'alerta',
          titulo: `${nombre} va por debajo de la meta`, detalle: `Llevas el ${Math.round(p.porcentaje)}% de lo esperado` })
      }
    })
  } else {
    presupuestosTipo.forEach(p => {
      const nombre = p.categories?.nombre || 'Categoría'
      if (p.gastado > p.monto_limite) {
        alertas.push({ id: `${p.id}-over`, icon: AlertTriangle, tono: 'alerta',
          titulo: `${nombre} sobrepasó el presupuesto`, detalle: `L ${formatMonto(p.gastado - p.monto_limite)} por encima del límite` })
      } else if (p.porcentaje >= 90) {
        alertas.push({ id: `${p.id}-near`, icon: AlertTriangle, tono: 'alerta',
          titulo: `${nombre} está por exceder el presupuesto`, detalle: `Llevas el ${Math.round(p.porcentaje)}% del presupuesto` })
      }
    })
    presupuestosTipo.forEach(p => {
      const prev = gastoPrev[p.category_id] || 0
      if (prev > 0 && p.gastado > prev) {
        const inc = ((p.gastado - prev) / prev) * 100
        if (inc >= 15) {
          alertas.push({ id: `${p.id}-inc`, icon: Info, tono: 'info',
            titulo: `${p.categories?.nombre || 'Categoría'} tiene un gasto alto`, detalle: `Aumentó ${Math.round(inc)}% vs. el mes pasado` })
        }
      }
    })
    const enBuenCamino = presupuestosTipo.filter(p => p.porcentaje < 90 && p.gastado <= p.monto_limite).length
    if (enBuenCamino > 0) {
      alertas.push({ id: 'ok', icon: CheckCircle2, tono: 'ok',
        titulo: '¡Vas por buen camino!', detalle: `${enBuenCamino} ${enBuenCamino === 1 ? 'categoría' : 'categorías'} dentro del presupuesto` })
    }
  }

  // ----- Consejo del mes -----
  let consejo: { titulo: string; texto: string }
  if (esIngreso) {
    const rezagado = presupuestosTipo.find(p => p.gastado < p.monto_limite && p.porcentaje < 60)
    consejo = rezagado
      ? {
        titulo: `Impulsa tus ingresos de ${rezagado.categories?.nombre}`,
        texto: `Llevas el ${Math.round(rezagado.porcentaje)}% de la meta. Un empujón aquí te acercará al objetivo del mes.`,
      }
      : {
        titulo: 'Define tus metas de ingreso',
        texto: 'Registra cuánto esperas recibir por categoría para dar seguimiento a tus ingresos del mes.',
      }
  } else {
    const peor = presupuestosTipo.find(p => p.gastado <= p.monto_limite && p.porcentaje >= 60)
      || presupuestosTipo.find(p => p.gastado > p.monto_limite)
    consejo = peor
      ? {
        titulo: `Revisa tus gastos de ${peor.categories?.nombre}`,
        texto: `Llevas el ${Math.round(peor.porcentaje)}% del presupuesto. Ajustar algunos gastos aquí te ayudaría a cerrar el mes con holgura.`,
      }
      : {
        titulo: 'Define tus límites del mes',
        texto: 'Crea presupuestos por categoría para controlar tus gastos y anticipar tus finanzas.',
      }
  }

  const TONOS = {
    alerta: 'bg-amber-50 text-amber-600',
    info: 'bg-blue-50 text-blue-600',
    ok: 'bg-emerald-50 text-emerald-600',
  }

  // ----- Métricas de metas de ahorro -----
  const metasTotalObjetivo = metas.reduce((s, m) => s + Number(m.monto_objetivo), 0)
  const metasTotalAhorrado = metas.reduce((s, m) => s + Number(m.monto_actual), 0)
  const metasCompletadas = metas.filter(m => m.completada || Number(m.monto_actual) >= Number(m.monto_objetivo)).length

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] p-6 mx-auto space-y-6 lg:p-8">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="h-40 rounded-2xl bg-fog animate-pulse" />
          <SkeletonList items={5} />
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
            <p className="mb-1 text-sm font-medium text-steel">Presupuestos</p>
            <h1 className="text-3xl font-bold text-obsidian">Planifica y controla tus metas</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={abrirNuevo}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="items-center hidden gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow sm:inline-flex hover:scale-105 hover:brightness-110"
            >
              <Plus size={18} strokeWidth={2.5} />
              {tab === 'metas' ? 'Nueva meta' : esIngreso ? 'Nueva meta de ingreso' : 'Nuevo presupuesto'}
            </button>
            <Notificaciones />
          </div>
        </div>

        {/* Hero resumen */}
        {tab === 'presupuestos' ? (
        <div
          className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        >
          <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
          <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
          <div className="relative px-6 py-9 lg:px-8 lg:py-12">
            <div className="mb-8">
              <h2 className="text-xl font-semibold">Resumen de este mes</h2>
              <p className="text-base capitalize text-white/60">{mesNombre}</p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 lg:divide-x lg:divide-white/10">
              <HeroMetrica icon={esIngreso ? Target : Wallet}
                label={esIngreso ? 'Meta de ingresos' : 'Presupuesto total'}
                valor={`L ${formatMonto(totalPresupuestado)}`} />
              <HeroMetrica icon={esIngreso ? TrendingUp : TrendingDown}
                label={esIngreso ? 'Recibido' : 'Gastado'}
                valor={`L ${formatMonto(totalGastado)}`}
                nota={<span className="text-white/50">{Math.round(gastadoPct)}% de la meta</span>} className="lg:px-6" />
              <HeroMetrica icon={PiggyBank}
                label={esIngreso ? 'Falta por recibir' : 'Disponible'}
                valor={`L ${formatMonto(Math.max(0, disponible))}`}
                nota={<span className="text-emerald-300">
                  {esIngreso ? `${Math.round(gastadoPct)}% completado` : `${Math.round(restantePct)}% restante`}
                </span>} className="lg:px-6" />
              <HeroMetrica icon={TrendingUp} label="Proyección de fin de mes"
                valor={`L ${formatMonto(proyeccion)}`}
                nota={esIngreso ? (
                  <span className={proyeccion >= totalPresupuestado ? 'text-emerald-300' : 'text-amber-300'}>
                    {proyeccion >= totalPresupuestado ? 'Alcanzarás la meta' : `Faltarían L ${formatMonto(totalPresupuestado - proyeccion)}`}
                  </span>
                ) : (
                  <span className={proyeccionDentro ? 'text-emerald-300' : 'text-red-300'}>
                    {proyeccionDentro ? 'Dentro del presupuesto' : `Excede por L ${formatMonto(proyeccion - totalPresupuestado)}`}
                  </span>
                )} className="lg:pl-6" />
            </div>
          </div>
        </div>
        ) : (
          <MetasHero
            totalObjetivo={metasTotalObjetivo}
            totalAhorrado={metasTotalAhorrado}
            completadas={metasCompletadas}
            activas={metas.length}
            formatMonto={formatMonto}
          />
        )}

        {/* Pestañas + selector de mes + filtros */}
        <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 border w-fit bg-snow border-fog rounded-full">
              {[
                { id: 'presupuestos' as const, label: 'Presupuestos' },
                { id: 'metas' as const, label: 'Metas' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${tab === t.id ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'presupuestos' && (
              <div className="flex items-center gap-1 p-1 border w-fit bg-snow border-fog rounded-full">
                {[
                  { id: 'gasto' as const, label: '💸 Gastos' },
                  { id: 'ingreso' as const, label: '💰 Ingresos' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTipoVista(t.id); setFiltroEstado('todos') }}
                    className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${tipoVista === t.id ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tab === 'presupuestos' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={abrirPicker}
                className="inline-flex items-center gap-2 py-2.5 pl-3.5 pr-3 text-sm font-medium transition-colors border rounded-full bg-snow border-fog text-graphite hover:bg-mist"
              >
                <Calendar size={15} strokeWidth={2} className="text-steel" />
                <span className="capitalize">{mesNombre}</span>
                <ChevronDown size={14} strokeWidth={2} className="text-steel" />
              </button>
              {showMesPicker && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowMesPicker(false)} />
                  <div className="absolute right-0 z-30 p-4 mt-2 border shadow-soft top-full w-72 bg-snow border-fog rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <button onClick={() => setPickerYear(y => y - 1)} className="flex items-center justify-center w-8 h-8 rounded-full text-graphite hover:bg-mist" aria-label="Año anterior">
                        <ChevronLeft size={16} strokeWidth={2} />
                      </button>
                      <p className="font-semibold text-ink">{pickerYear}</p>
                      <button onClick={() => setPickerYear(y => Math.min(new Date().getFullYear(), y + 1))} disabled={pickerYear >= new Date().getFullYear()} className={`w-8 h-8 flex items-center justify-center rounded-full ${pickerYear >= new Date().getFullYear() ? 'text-pebble cursor-not-allowed' : 'text-graphite hover:bg-mist'}`} aria-label="Año siguiente">
                        <ChevronRight size={16} strokeWidth={2} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MESES_CORTOS.map((m, i) => {
                        const activo = i === getMesActual().getMonth() && pickerYear === getMesActual().getFullYear()
                        const hoy = new Date()
                        const futuro = pickerYear > hoy.getFullYear() || (pickerYear === hoy.getFullYear() && i > hoy.getMonth())
                        return (
                          <button key={m} onClick={() => seleccionarMes(pickerYear, i)} disabled={futuro}
                            className={`py-2 text-sm font-medium rounded-xl transition-colors ${activo ? 'bg-obsidian text-snow' : futuro ? 'text-pebble cursor-not-allowed' : 'text-graphite hover:bg-mist'}`}>
                            {m}
                          </button>
                        )
                      })}
                    </div>
                    {mesOffset !== 0 && (
                      <button onClick={() => { setMesOffset(0); setShowMesPicker(false) }} className="w-full py-2 mt-3 text-sm font-medium transition-colors rounded-xl text-graphite hover:bg-mist">
                        Ir al mes actual
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <FiltroMenu
              icon={SlidersHorizontal}
              value={filtroEstado}
              onChange={setFiltroEstado}
              options={esIngreso ? [
                { value: 'todos', label: 'Todos los estados' },
                { value: 'cumplida', label: 'Meta cumplida' },
                { value: 'progreso', label: 'En progreso' },
                { value: 'debajo', label: 'Por debajo' },
              ] : [
                { value: 'todos', label: 'Todos los estados' },
                { value: 'buen', label: 'En buen camino' },
                { value: 'casi', label: 'Casi al límite' },
                { value: 'sobre', label: 'Sobrepasados' },
              ]}
            />
          </div>
          )}
        </div>

        {tab === 'metas' ? (
          <MetasPanel
            metas={metas}
            formatMonto={formatMonto}
            onNueva={() => { setMetaEditar(null); setShowMetaForm(true) }}
            onAportar={(m) => setMetaAporte(m)}
            onEditar={(m) => { setMetaEditar(m); setShowMetaForm(true) }}
            onEliminar={handleEliminarMeta}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

            {/* Columna: presupuestos por categoría */}
            <div className="lg:col-span-2">
              <div className="border bg-snow border-fog rounded-card">
                <div className="flex items-center justify-between px-6 pt-6 mb-2">
                  <h2 className="font-semibold text-obsidian">
                    {esIngreso ? 'Metas de ingreso por categoría' : 'Presupuestos por categoría'}
                  </h2>
                  <span className="text-xs text-ash">{presupuestosTipo.length} {presupuestosTipo.length === 1 ? 'categoría' : 'categorías'}</span>
                </div>

                {presupuestosTipo.length > 0 && (
                  <div className="px-6 pb-3">
                    <div className="relative">
                      <Search size={16} strokeWidth={2} className="absolute -translate-y-1/2 left-3.5 top-1/2 text-ash" />
                      <input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar categoría..."
                        className="w-full py-2.5 pl-10 pr-10 text-sm text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                      />
                      {busqueda && (
                        <button
                          onClick={() => setBusqueda('')}
                          className="absolute flex items-center justify-center w-6 h-6 -translate-y-1/2 rounded-full right-2.5 top-1/2 text-ash hover:text-ink hover:bg-fog"
                          aria-label="Limpiar búsqueda"
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {presupuestosTipo.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <PieIcon size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
                    <p className="mb-2 text-steel">
                      {esIngreso ? 'No hay metas de ingreso este mes' : 'No hay presupuestos este mes'}
                    </p>
                    <p className="mb-6 text-sm text-ash">
                      {esIngreso ? 'Crea tu primera meta de ingreso por categoría' : 'Crea tu primer presupuesto por categoría'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Cabecera de columnas (solo desktop) */}
                    <div className="hidden px-6 sm:grid sm:grid-cols-12 sm:gap-3 sm:items-center pb-2.5 border-b border-fog">
                      <span className="col-span-3 text-xs font-semibold tracking-wide uppercase text-ash">Categoría</span>
                      <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">{esIngreso ? 'Meta' : 'Presupuesto'}</span>
                      <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">{esIngreso ? 'Recibido' : 'Gastado'}</span>
                      <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">Progreso</span>
                      <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">Estado</span>
                      <span className="col-span-1" />
                    </div>

                    {gruposVisibles.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <Search size={32} strokeWidth={1.5} className="mx-auto mb-3 text-pebble" />
                        <p className="text-sm text-steel">Sin resultados para “{busqueda}”</p>
                      </div>
                    ) : (
                      <div>
                        {gruposVisibles.map(g => (
                          <div key={g.pid}>
                            {g.principal ? (
                              <FilaPresupuesto
                                p={g.principal} est={estadoInfo(g.principal)} esSub={false} esPadre={g.subs.length > 0} esIngreso={esIngreso}
                                formatMonto={formatMonto}
                                onEdit={() => { setPresupuestoEditar(g.principal); setShowForm(true) }}
                                onDelete={() => handleEliminar(g.principal.id)}
                              />
                            ) : g.subs.length > 0 && (
                              <FilaGrupoPadre g={g} esIngreso={esIngreso} formatMonto={formatMonto} />
                            )}
                            {g.subs.map(sub => (
                              <FilaPresupuesto
                                key={sub.id} p={sub} est={estadoInfo(sub)} esSub={true} esIngreso={esIngreso}
                                formatMonto={formatMonto}
                                onEdit={() => { setPresupuestoEditar(sub); setShowForm(true) }}
                                onDelete={() => handleEliminar(sub.id)}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Agregar categoría */}
                <div className="p-4 border-t border-fog">
                  <button
                    onClick={() => { setPresupuestoEditar(null); setShowForm(true) }}
                    className="inline-flex items-center justify-center w-full gap-2 py-2.5 text-sm font-medium transition-colors border border-dashed rounded-xl border-pebble text-graphite hover:bg-mist hover:text-ink"
                  >
                    <Plus size={16} strokeWidth={2} />
                    {esIngreso ? 'Agregar meta de ingreso' : 'Agregar categoría'}
                  </button>
                </div>
              </div>
            </div>

            {/* Columna: alertas / distribución / consejo */}
            <div className="space-y-6 lg:col-span-1">

              {/* Alertas y recomendaciones */}
              <div className="p-5 border bg-snow border-fog rounded-card">
                <h3 className="mb-4 text-sm font-semibold text-steel">Alertas y recomendaciones</h3>
                {alertas.length === 0 ? (
                  <p className="text-sm text-ash">Sin alertas por ahora</p>
                ) : (
                  <div className="space-y-3">
                    {alertas.slice(0, 4).map(a => {
                      const Icono = a.icon
                      return (
                        <div key={a.id} className="flex items-start gap-3">
                          <div className={`flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-xl ${TONOS[a.tono]}`}>
                            <Icono size={16} strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">{a.titulo}</p>
                            <p className="text-xs text-ash">{a.detalle}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Distribución del presupuesto */}
              <div className="p-6 border bg-snow border-fog rounded-card">
                <h3 className="mb-5 text-sm font-semibold text-steel">Distribución del presupuesto</h3>
                {distribucion.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <PieIcon size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                    <p className="text-sm text-steel">Sin presupuestos para mostrar</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-5">
                    <div className="relative flex-shrink-0 w-[136px] h-[136px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={distribucion} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} cornerRadius={4} dataKey="valor" stroke="none">
                            {distribucion.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip
                            formatter={(value) => [`L ${formatMonto(Number(value) || 0)}`, 'Presupuesto']}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                            labelStyle={{ color: '#71717a' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] font-medium text-steel">Total</span>
                        <span className="text-sm font-bold leading-tight text-ink">L {formatMonto(totalPresupuestado)}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      {distribucion.slice(0, 6).map((d, i) => {
                        const pct = totalPresupuestado > 0 ? Math.round((d.valor / totalPresupuestado) * 100) : 0
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="flex-1 min-w-0 text-sm truncate text-ink">{d.nombre}</span>
                            <span className="text-xs font-medium text-right text-steel w-8">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Consejo del mes */}
              <div className="p-5 border rounded-card border-fog" style={{ background: 'linear-gradient(135deg, #f4f9f6 0%, #eef5f0 100%)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100">
                    <Lightbulb size={16} strokeWidth={2} className="text-emerald-700" />
                  </div>
                  <h3 className="text-sm font-semibold text-steel">Consejo del mes</h3>
                </div>
                <p className="mb-1 text-sm font-medium text-ink">{consejo.titulo}</p>
                <p className="text-sm leading-relaxed text-graphite">{consejo.texto}</p>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Botón flotante */}
      <button
        onClick={abrirNuevo}
        style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110 sm:hidden"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {showForm && (
        <FormPresupuesto
          presupuesto={presupuestoEditar}
          tipo={tipoVista}
          mes={base.getMonth() + 1}
          anio={base.getFullYear()}
          onClose={() => { setShowForm(false); setPresupuestoEditar(null) }}
          onSuccess={cargarPresupuestos}
        />
      )}

      {showMetaForm && (
        <FormMeta
          meta={metaEditar}
          onClose={() => { setShowMetaForm(false); setMetaEditar(null) }}
          onSuccess={cargarMetas}
        />
      )}

      {metaAporte && (
        <FormAporteMeta
          meta={metaAporte}
          onClose={() => setMetaAporte(null)}
          onSuccess={cargarMetas}
        />
      )}
    </AppLayout>
  )
}

function MetasHero({ totalObjetivo, totalAhorrado, completadas, activas, formatMonto }: {
  totalObjetivo: number
  totalAhorrado: number
  completadas: number
  activas: number
  formatMonto: (n: number) => string
}) {
  const pct = totalObjetivo > 0 ? (totalAhorrado / totalObjetivo) * 100 : 0
  const falta = Math.max(0, totalObjetivo - totalAhorrado)
  return (
    <div
      className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl"
      style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
    >
      <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
      <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
      <div className="relative px-6 py-9 lg:px-8 lg:py-12">
        <div className="mb-8">
          <h2 className="text-xl font-semibold">Resumen de tus metas</h2>
          <p className="text-base text-white/60">Tu progreso de ahorro</p>
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 lg:divide-x lg:divide-white/10">
          <HeroMetrica icon={Target} label="Objetivo total" valor={`L ${formatMonto(totalObjetivo)}`} />
          <HeroMetrica icon={PiggyBank} label="Ahorrado" valor={`L ${formatMonto(totalAhorrado)}`}
            nota={<span className="text-emerald-300">{Math.round(pct)}% del objetivo</span>} className="lg:px-6" />
          <HeroMetrica icon={TrendingUp} label="Falta por ahorrar" valor={`L ${formatMonto(falta)}`} className="lg:px-6" />
          <HeroMetrica icon={CheckCircle2} label="Metas completadas" valor={`${completadas} / ${activas}`} className="lg:pl-6" />
        </div>
      </div>
    </div>
  )
}

function MetasPanel({ metas, formatMonto, onNueva, onAportar, onEditar, onEliminar }: {
  metas: any[]
  formatMonto: (n: number) => string
  onNueva: () => void
  onAportar: (m: any) => void
  onEditar: (m: any) => void
  onEliminar: (id: string) => void
}) {
  if (metas.length === 0) {
    return (
      <div className="p-12 text-center border bg-snow border-fog rounded-card">
        <Target size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
        <p className="mb-2 text-steel">Aún no tienes metas de ahorro</p>
        <p className="mb-6 text-sm text-ash">Define un objetivo y sigue tu progreso hasta alcanzarlo.</p>
        <button
          onClick={onNueva}
          style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow hover:scale-105 hover:brightness-110"
        >
          <Plus size={18} strokeWidth={2.5} /> Crear primera meta
        </button>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {metas.map(m => (
        <MetaCard key={m.id} m={m} formatMonto={formatMonto}
          onAportar={() => onAportar(m)} onEditar={() => onEditar(m)} onEliminar={() => onEliminar(m.id)} />
      ))}
      <button
        onClick={onNueva}
        className="flex flex-col items-center justify-center gap-2 py-10 text-sm font-medium transition-colors border border-dashed rounded-card border-pebble text-graphite hover:bg-mist hover:text-ink min-h-[220px]"
      >
        <Plus size={22} strokeWidth={2} /> Nueva meta
      </button>
    </div>
  )
}

function MetaCard({ m, formatMonto, onAportar, onEditar, onEliminar }: {
  m: any
  formatMonto: (n: number) => string
  onAportar: () => void
  onEditar: () => void
  onEliminar: () => void
}) {
  const objetivo = Number(m.monto_objetivo)
  const actual = Number(m.monto_actual)
  const restante = Math.max(0, objetivo - actual)
  const pct = objetivo > 0 ? Math.min((actual / objetivo) * 100, 100) : 0
  const completada = m.completada || actual >= objetivo
  const color = m.color || '#2c6e49'

  let meta_info: string | null = null
  if (!completada && m.fecha_limite) {
    const hoy = new Date()
    const limite = new Date(`${String(m.fecha_limite).slice(0, 10)}T00:00:00`)
    const meses = (limite.getFullYear() - hoy.getFullYear()) * 12 + (limite.getMonth() - hoy.getMonth())
    const fechaTxt = limite.toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' })
    if (meses > 0) meta_info = `Ahorra L ${formatMonto(restante / meses)}/mes · límite ${fechaTxt}`
    else meta_info = `Fecha límite: ${fechaTxt}`
  }

  return (
    <div className="flex flex-col p-5 border bg-snow border-fog rounded-card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center justify-center flex-shrink-0 text-xl w-11 h-11 rounded-xl" style={{ backgroundColor: color + '18' }}>
            {m.icono || '🎯'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-ink">{m.nombre}</p>
            {completada
              ? <span className="inline-flex items-center gap-1 mt-0.5 text-xs font-medium text-emerald-600"><CheckCircle2 size={13} strokeWidth={2.5} /> ¡Completada!</span>
              : <p className="text-xs text-ash mt-0.5">{Math.round(pct)}% alcanzado</p>}
          </div>
        </div>
        <RowMenu onEdit={onEditar} onDelete={onEliminar} />
      </div>

      <div className="mb-2">
        <div className="flex items-end justify-between mb-2">
          <span className="text-lg font-bold text-ink">L {formatMonto(actual)}</span>
          <span className="text-xs text-steel">de L {formatMonto(objetivo)}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-fog">
          <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>

      <div className="flex-1 mt-2">
        {completada
          ? <p className="text-xs font-medium text-emerald-600">Objetivo alcanzado 🎉</p>
          : <p className="text-xs text-steel">{meta_info || `Faltan L ${formatMonto(restante)}`}</p>}
      </div>

      {!completada && (
        <button
          onClick={onAportar}
          className="inline-flex items-center justify-center w-full gap-2 py-2.5 mt-4 text-sm font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist hover:text-ink"
        >
          <PiggyBank size={16} strokeWidth={2} /> Aportar
        </button>
      )}
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

function FilaPresupuesto({ p, est, esSub, esPadre = false, esIngreso, formatMonto, onEdit, onDelete }: {
  p: any
  est: { label: string; badge: string; barra: string }
  esSub: boolean
  esPadre?: boolean
  esIngreso: boolean
  formatMonto: (n: number) => string
  onEdit: () => void
  onDelete: () => void
}) {
  const color = p.categories?.color || '#71717a'
  return (
    <div className={`grid items-center grid-cols-1 gap-3 px-6 py-4 transition-colors border-b sm:grid-cols-12 border-fog last:border-b-0 ${esPadre ? 'bg-indigo-50/60 hover:bg-indigo-100/50' : 'hover:bg-mist/50'}`}>
      {/* Categoría */}
      <div className={`flex items-center gap-3 sm:col-span-3 ${esSub ? 'sm:pl-6' : ''}`}>
        {esSub && <span className="flex-shrink-0 w-1 h-1 rounded-full bg-pebble" />}
        <span
          className={`flex items-center justify-center flex-shrink-0 rounded-xl ${esSub ? 'w-8 h-8 text-base' : 'w-11 h-11 text-lg'}`}
          style={{ backgroundColor: color + '15' }}
        >
          {p.categories?.icono || '📦'}
        </span>
        <p className={`truncate ${esSub ? 'text-sm text-graphite' : 'text-sm font-medium text-ink'}`}>{p.categories?.nombre}</p>
      </div>
      {/* Presupuesto / Meta */}
      <div className="sm:col-span-2">
        <p className="text-xs text-ash sm:hidden">{esIngreso ? 'Meta' : 'Presupuesto'}</p>
        <p className="text-sm font-medium text-ink">L {formatMonto(p.monto_limite)}</p>
      </div>
      {/* Gastado / Recibido */}
      <div className="sm:col-span-2">
        <p className="text-xs text-ash sm:hidden">{esIngreso ? 'Recibido' : 'Gastado'}</p>
        <p className="text-sm font-medium text-ink">L {formatMonto(p.gastado)}</p>
      </div>
      {/* Progreso */}
      <div className="flex items-center gap-2 sm:col-span-2">
        <div className="flex-1 h-2 rounded-full bg-fog">
          <div className={`h-2 rounded-full transition-all duration-500 ${est.barra}`} style={{ width: `${p.porcentaje}%` }} />
        </div>
        <span className="text-xs font-medium text-right text-steel w-9">{Math.round(p.porcentaje)}%</span>
      </div>
      {/* Estado */}
      <div className="sm:col-span-2">
        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-badge ${est.badge}`}>{est.label}</span>
      </div>
      {/* Menú */}
      <div className="flex justify-end sm:col-span-1">
        <RowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

function FilaGrupoPadre({ g, esIngreso, formatMonto }: {
  g: { info: any; subs: any[]; subTotal: number; subGastado: number; subPct: number }
  esIngreso: boolean
  formatMonto: (n: number) => string
}) {
  const color = g.info.color || '#71717a'
  const barra = esIngreso
    ? (g.subGastado >= g.subTotal ? 'bg-emerald-500' : g.subPct >= 60 ? 'bg-blue-500' : 'bg-amber-500')
    : (g.subGastado > g.subTotal ? 'bg-red-500' : g.subPct >= 90 ? 'bg-amber-500' : 'bg-emerald-500')
  return (
    <div className="grid items-center grid-cols-1 gap-3 px-6 py-4 border-b sm:grid-cols-12 border-fog bg-indigo-50/60">
      {/* Categoría */}
      <div className="flex items-center gap-3 sm:col-span-3">
        <span className="flex items-center justify-center flex-shrink-0 rounded-xl w-11 h-11 text-lg" style={{ backgroundColor: color + '15' }}>
          {g.info.icono || '📦'}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate text-ink">{g.info.nombre}</p>
          <p className="text-xs text-ash">{g.subs.length} {g.subs.length === 1 ? 'subcategoría' : 'subcategorías'}</p>
        </div>
      </div>
      {/* Presupuesto / Meta total */}
      <div className="sm:col-span-2">
        <p className="text-xs text-ash sm:hidden">{esIngreso ? 'Meta' : 'Presupuesto'}</p>
        <p className="text-sm font-medium text-ink">L {formatMonto(g.subTotal)}</p>
      </div>
      {/* Gastado / Recibido total */}
      <div className="sm:col-span-2">
        <p className="text-xs text-ash sm:hidden">{esIngreso ? 'Recibido' : 'Gastado'}</p>
        <p className="text-sm font-medium text-ink">L {formatMonto(g.subGastado)}</p>
      </div>
      {/* Progreso */}
      <div className="flex items-center gap-2 sm:col-span-2">
        <div className="flex-1 h-2 rounded-full bg-fog">
          <div className={`h-2 rounded-full transition-all duration-500 ${barra}`} style={{ width: `${g.subPct}%` }} />
        </div>
        <span className="text-xs font-medium text-right text-steel w-9">{Math.round(g.subPct)}%</span>
      </div>
      {/* Estado */}
      <div className="sm:col-span-2">
        <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-badge text-steel bg-fog">Total</span>
      </div>
      <div className="hidden sm:block sm:col-span-1" />
    </div>
  )
}

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist"
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
          <div className="absolute right-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[11rem]">
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
