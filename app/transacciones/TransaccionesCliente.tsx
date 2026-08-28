'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import FormTransaccion from '../components/FormTransaccion'
import AppLayout from '../components/AppLayout'
import FormEditarTransaccion from '../components/FormEditarTransaccion'
import Notificaciones from '../components/Notificaciones'
import { SkeletonGrupoFecha } from '../components/Skeleton'
import { useMoneda } from '../lib/moneda-context'
import { totales, soloMovimientosReales, montoNormalizado } from '../lib/finanzas'
import { simboloMoneda } from '../lib/dinero'
import { eliminarTransaccion, tipoCompuesto, avisoBorrado } from '../lib/transacciones'
import IconoCategoria from '../components/IconoCategoria'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Plus, Calendar, ChevronLeft, ChevronRight, ChevronDown, Search, X,
  MoreHorizontal, Pencil, Trash2, ArrowDownRight, ArrowUpRight,
  TrendingUp, TrendingDown, Scale, Receipt, Wallet, Landmark, CreditCard,
  PiggyBank, PieChart as PieIcon, Globe, Copy, type LucideIcon,
} from 'lucide-react'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const WALLET_ICONS: Record<string, LucideIcon> = {
  efectivo: Wallet,
  banco: Landmark,
  credito: CreditCard,
  ahorro: PiggyBank,
}

const COLORES = ['#2c6e49', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#10B981', '#6366F1']

interface Props {
  usuario: any
  mesInicial: string
  transaccionesIniciales: any[]
  categoriasIniciales: any[]
  carterasIniciales: any[]
  tasaInicial: number | null
}

export default function TransaccionesCliente({
  usuario, mesInicial, transaccionesIniciales, categoriasIniciales, carterasIniciales, tasaInicial,
}: Props) {
  const router = useRouter()
  const [transacciones, setTransacciones] = useState<any[]>(transaccionesIniciales)
  const [filtradas, setFiltradas] = useState<any[]>(transaccionesIniciales)
  const [categorias, setCategorias] = useState<any[]>(categoriasIniciales)
  const [carteras, setCarteras] = useState<any[]>(carterasIniciales)
  const [tasa, setTasa] = useState<number | null>(tasaInicial)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [transaccionSeleccionada, setTransaccionSeleccionada] = useState<any>(null)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroCartera, setFiltroCartera] = useState('')
  const [filtroMes, setFiltroMes] = useState(mesInicial)

  // Búsqueda en todo el historial (no solo el mes cargado).
  const [busquedaGlobal, setBusquedaGlobal] = useState(false)
  const [resultadosGlobales, setResultadosGlobales] = useState<any[] | null>(null)
  const [totalGlobal, setTotalGlobal] = useState(0)
  const [buscando, setBuscando] = useState(false)

  // Selección múltiple para acciones en lote.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [enLote, setEnLote] = useState(false)
  // Pestaña visible en móvil: la lista o el panel de análisis.
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'analisis'>('lista')

  // El mes inicial ya viene del servidor; solo se recarga al cambiar de mes.
  const primeraCarga = useRef(true)
  useEffect(() => {
    if (primeraCarga.current) { primeraCarga.current = false; return }
    cargarDatos()
  }, [filtroMes])

  useEffect(() => {
    const cartera = new URLSearchParams(window.location.search).get('cartera')
    if (cartera) setFiltroCartera(cartera)
  }, [])

  useEffect(() => {
    aplicarFiltros()
  }, [busqueda, filtroTipo, filtroCategoria, filtroCartera, transacciones, resultadosGlobales])

  // La búsqueda global la resuelve el servidor sobre todo el historial. El
  // filtrado en memoria solo veía el mes ya cargado.
  useEffect(() => {
    if (!busquedaGlobal || !busqueda.trim()) {
      setResultadosGlobales(null)
      setTotalGlobal(0)
      return
    }
    let cancelado = false
    const t = setTimeout(async () => {
      setBuscando(true)
      const params = new URLSearchParams({ q: busqueda.trim(), limit: '300' })
      if (filtroTipo !== 'todos') params.set('tipo', filtroTipo)
      if (filtroCategoria !== 'todas') params.set('categoria', filtroCategoria)
      if (filtroCartera) params.set('cartera', filtroCartera)
      try {
        const res = await fetch(`/api/transacciones/buscar?${params}`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelado) return
        setResultadosGlobales(json.data || [])
        setTotalGlobal(json.total || 0)
      } finally {
        if (!cancelado) setBuscando(false)
      }
    }, 300)
    return () => { cancelado = true; clearTimeout(t) }
  }, [busquedaGlobal, busqueda, filtroTipo, filtroCategoria, filtroCartera])

  // Movimientos del mes, categorías, carteras y tasa en una sola llamada.
  const cargarDatos = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/transacciones/mes?mes=${filtroMes}`)
      if (!res.ok) return
      const json = await res.json()
      setTransacciones(json.transacciones || [])
      setFiltradas(json.transacciones || [])
      setCategorias(json.categorias || [])
      setCarteras(json.carteras || [])
      setTasa(json.tasa ?? null)
    } finally {
      setLoading(false)
    }
  }

  const aplicarFiltros = () => {
    // En búsqueda global los filtros ya los aplicó el servidor.
    if (resultadosGlobales) { setFiltradas(resultadosGlobales); return }

    let resultado = [...transacciones]

    if (busqueda) {
      resultado = resultado.filter(t =>
        t.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) ||
        t.categories?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
      )
    }
    if (filtroTipo !== 'todos') resultado = resultado.filter(t => t.tipo === filtroTipo)
    if (filtroCategoria !== 'todas') {
      resultado = resultado.filter(t => (t.categories?.nombre || '').trim().toLowerCase() === filtroCategoria)
    }
    if (filtroCartera) resultado = resultado.filter(t => t.wallet_id === filtroCartera)

    setFiltradas(resultado)
  }

  // El borrado pasa por la API: si el movimiento tiene contraparte (la otra
  // pierna de una transferencia, el avance de una deuda) se revierte junto.
  const handleEliminar = async (t: any) => {
    const tipo = tipoCompuesto(t)
    if (!confirm(avisoBorrado(tipo))) return
    const { error } = await eliminarTransaccion(t.id)
    if (error) { alert(error); return }
    recargar()
  }

  // Duplicar copia el movimiento con la fecha de hoy, que es para lo que sirve:
  // repetir un gasto habitual sin volver a teclearlo.
  const handleDuplicar = async (t: any) => {
    const res = await fetch(`/api/transacciones/${t.id}/duplicar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      alert(json?.error?.message || 'No se pudo duplicar')
      return
    }
    recargar()
  }

  // Tras cualquier cambio hay que refrescar la fuente que se esté mostrando.
  const recargar = async () => {
    setSeleccion(new Set())
    if (resultadosGlobales) {
      const params = new URLSearchParams({ q: busqueda.trim(), limit: '300' })
      if (filtroTipo !== 'todos') params.set('tipo', filtroTipo)
      if (filtroCategoria !== 'todas') params.set('categoria', filtroCategoria)
      if (filtroCartera) params.set('cartera', filtroCartera)
      try {
        const res = await fetch(`/api/transacciones/buscar?${params}`)
        if (res.ok) {
          const json = await res.json()
          setResultadosGlobales(json.data || [])
          setTotalGlobal(json.total || 0)
        }
      } catch { /* se conserva lo que hay en pantalla */ }
    }
    cargarDatos()
  }

  const alternarSeleccion = (id: string) => {
    setSeleccion(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const seleccionarTodo = () => {
    setSeleccion(prev =>
      prev.size === filtradas.length ? new Set() : new Set(filtradas.map(t => t.id))
    )
  }

  const handleEliminarLote = async () => {
    const n = seleccion.size
    if (n === 0) return
    if (!confirm(
      `¿Eliminar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}?\n\n` +
      'Las transferencias se eliminan con sus dos piernas y los abonos devuelven el monto a su deuda. ' +
      'Lo que pertenezca a un grupo o reparto se omitirá.'
    )) return

    setEnLote(true)
    try {
      const res = await fetch('/api/transacciones/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'eliminar', ids: [...seleccion] }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { alert(json?.error?.message || 'No se pudo completar el borrado'); return }
      if (json?.omitidos?.length) {
        alert(`Se eliminaron ${json.eliminadas}. Se omitieron ${json.omitidos.length}:\n\n` +
          json.omitidos.slice(0, 3).map((o: any) => '· ' + o.motivo).join('\n'))
      }
    } finally {
      setEnLote(false)
    }
    recargar()
  }

  const handleCategorizarLote = async (categoryId: string) => {
    if (seleccion.size === 0) return
    setEnLote(true)
    try {
      const res = await fetch('/api/transacciones/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'categorizar', ids: [...seleccion], category_id: categoryId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { alert(json?.error?.message || 'No se pudo recategorizar'); return }
      if (json?.omitidos > 0) {
        alert(`Se recategorizaron ${json.actualizadas}. Se omitieron ${json.omitidos} (transferencias y abonos conservan su categoría).`)
      }
    } finally {
      setEnLote(false)
    }
    recargar()
  }

  const { simbolo, moneda } = useMoneda()
  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  // Los totales y las gráficas usan solo movimientos reales (sin transferencias
  // entre carteras propias ni aperturas de saldo) y con los montos llevados a la
  // moneda principal. La lista de abajo sí muestra todo lo filtrado.
  const reales = soloMovimientosReales(filtradas)
  const norm = (t: any) => montoNormalizado(t, moneda, tasa)

  // El mismo nombre puede existir en gasto e ingreso (categorías de sistema como
  // "Ajuste de saldo" o "Saldo inicial"). Se deduplica por nombre para el filtro.
  const categoriasUnicas = Array.from(
    categorias
      .reduce((m: Map<string, any>, c) => {
        const k = (c.nombre || '').trim().toLowerCase()
        if (k && !m.has(k)) m.set(k, c)
        return m
      }, new Map<string, any>())
      .values()
  ).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

  const { ingresos: totalIngresos, gastos: totalGastos, neto: saldoNeto } =
    totales(filtradas, moneda, tasa)
  const maxBarra = Math.max(totalIngresos, totalGastos, 1)

  // Distribución de gastos por categoría (para el donut).
  const gastosPorCategoria = Object.values(
    reales
      .filter(t => t.tipo === 'gasto')
      .reduce((acc: Record<string, any>, t) => {
        const nombre = t.categories?.nombre || 'Sin categoría'
        if (!acc[nombre]) acc[nombre] = { nombre, valor: 0, color: t.categories?.color || '#71717a' }
        acc[nombre].valor += norm(t)
        return acc
      }, {})
  ).sort((a: any, b: any) => b.valor - a.valor) as { nombre: string; valor: number; color: string }[]

  const gastosPorCategoriaColor = gastosPorCategoria.map((d, i) => ({
    ...d,
    color: d.color === '#71717a' ? COLORES[i % COLORES.length] : d.color,
  }))

  // Movimientos agrupados por cartera.
  const movimientosPorCartera = Object.values(
    reales.reduce((acc: Record<string, any>, t) => {
      const id = t.wallet_id || 'sin'
      if (!acc[id]) acc[id] = {
        id, nombre: t.wallets?.nombre || 'Sin cartera', color: t.wallets?.color || '#71717a',
        tipo: t.wallets?.tipo || 'efectivo', count: 0, gasto: 0,
      }
      acc[id].count += 1
      if (t.tipo === 'gasto') acc[id].gasto += norm(t)
      return acc
    }, {})
  ).sort((a: any, b: any) => b.count - a.count) as { id: string; nombre: string; color: string; tipo: string; count: number; gasto: number }[]

  const [mesFiltroAnio, mesFiltroMes] = [parseInt(filtroMes.slice(0, 4)), parseInt(filtroMes.slice(5, 7)) - 1]
  const mesLabel = `${MESES[mesFiltroMes]} ${mesFiltroAnio}`

  const hayFiltros = busqueda !== '' || filtroTipo !== 'todos' || filtroCategoria !== 'todas' || filtroCartera !== ''
  const limpiarFiltros = () => {
    setBusqueda(''); setFiltroTipo('todos'); setFiltroCategoria('todas'); setFiltroCartera('')
  }

  if (loading) {
    return (
      <AppLayout usuario={usuario}>
        <div className="max-w-[1728px] p-4 mx-auto space-y-6 sm:p-6 lg:p-8">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="h-40 rounded-2xl bg-fog animate-pulse" />
          <div className="h-14 rounded-card bg-fog animate-pulse" />
          <SkeletonGrupoFecha />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout usuario={usuario}>
      <div className="max-w-[1728px] p-4 mx-auto sm:p-6 lg:p-8">

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-5 sm:mb-8">
          <div>
            <p className="mb-1 text-sm font-medium text-steel">Movimientos</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-obsidian">Administra tus ingresos y gastos</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="items-center hidden gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow sm:inline-flex hover:scale-105 hover:brightness-110"
            >
              <Plus size={18} strokeWidth={2.5} />
              Nuevo movimiento
            </button>
            <Notificaciones />
          </div>
        </div>

        {/* Hero resumen del mes */}
        <div
          className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        >
          <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
          <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
          <div className="relative px-5 py-6 sm:px-6 sm:py-9 lg:px-8 lg:py-12">
            <div className="mb-8">
              <h2 className="text-xl font-semibold">Resumen de movimientos</h2>
              <p className="text-base capitalize text-white/60">{mesLabel}</p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 lg:divide-x lg:divide-white/10">
              <HeroMetrica icon={TrendingUp} label="Ingresos totales" valor={`${simbolo} ${formatMonto(totalIngresos)}`}
                nota={<span className="text-emerald-300">Recibido este mes</span>} />
              <HeroMetrica icon={TrendingDown} label="Gastos totales" valor={`${simbolo} ${formatMonto(totalGastos)}`}
                nota={<span className="text-red-300">Gastado este mes</span>} className="lg:px-6" />
              <HeroMetrica icon={Scale} label="Saldo neto" valor={`${simbolo} ${formatMonto(saldoNeto)}`}
                nota={<span className={saldoNeto >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {saldoNeto >= 0 ? 'Balance positivo' : 'Balance negativo'}
                </span>} className="lg:px-6" />
              <HeroMetrica icon={Receipt} label="Transacciones" valor={`${filtradas.length}`}
                nota={<span className="text-white/50">{filtradas.length === 1 ? 'movimiento' : 'movimientos'}</span>} className="lg:pl-6" />
            </div>
          </div>
        </div>

        {/* Barra de filtros */}
        <div className="flex flex-col gap-3 p-3 mb-6 border bg-snow border-fog rounded-card lg:flex-row lg:items-center">
          <MonthPicker value={filtroMes} onChange={setFiltroMes} />

          <FiltroMenu
            value={filtroTipo}
            onChange={setFiltroTipo}
            options={[
              { value: 'todos', label: 'Todos los tipos' },
              { value: 'gasto', label: 'Gastos' },
              { value: 'ingreso', label: 'Ingresos' },
            ]}
          />

          <FiltroMenu
            value={filtroCategoria}
            onChange={setFiltroCategoria}
            options={[
              { value: 'todas', label: 'Todas las categorías' },
              ...categoriasUnicas.map(c => ({
                value: (c.nombre || '').trim().toLowerCase(),
                label: c.nombre,
              })),
            ]}
          />

          <FiltroMenu
            icon={Wallet}
            value={filtroCartera || 'todas'}
            onChange={v => setFiltroCartera(v === 'todas' ? '' : v)}
            options={[
              { value: 'todas', label: 'Todas las carteras' },
              ...carteras.map(c => ({ value: c.id, label: c.nombre })),
            ]}
          />

          <div className="flex flex-col gap-2 flex-1 lg:flex-row lg:items-center lg:justify-end lg:ml-auto">
            <div className="relative flex-1 lg:max-w-xs">
              <Search size={16} strokeWidth={2} className="absolute -translate-y-1/2 left-3.5 top-1/2 text-ash" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder={busquedaGlobal ? 'Buscar en todo el historial...' : 'Buscar en este mes...'}
                className="w-full py-2.5 pl-10 pr-10 text-sm text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-full focus:outline-none focus:border-obsidian focus:bg-snow"
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

            {/* Sin esto la búsqueda solo alcanzaba el mes ya cargado. */}
            <button
              type="button"
              onClick={() => setBusquedaGlobal(v => !v)}
              title="Buscar en todos los meses, no solo en el seleccionado"
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors border rounded-full whitespace-nowrap sm:py-2.5 ${
                busquedaGlobal
                  ? 'bg-obsidian text-snow border-obsidian'
                  : 'bg-snow border-fog text-graphite hover:bg-mist'
              }`}
            >
              <Globe size={14} strokeWidth={2} />
              Todo el historial
            </button>
          </div>
        </div>

        {/* Estado de la búsqueda global */}
        {busquedaGlobal && busqueda.trim() && (
          <div className="flex items-center gap-2 px-1 mb-4 text-xs text-steel">
            {buscando ? (
              <span>Buscando en todo el historial…</span>
            ) : (
              <>
                <span>
                  {totalGlobal} {totalGlobal === 1 ? 'resultado' : 'resultados'} en todo el historial
                </span>
                {totalGlobal > filtradas.length && (
                  <span className="text-amber-600">· mostrando los {filtradas.length} más recientes</span>
                )}
              </>
            )}
          </div>
        )}

        {/* En móvil la columna de análisis caía debajo de toda la lista, así que
            la pantalla medía más de tres pantallazos. Se separan en pestañas;
            desde lg vuelven a convivir en dos columnas. */}
        <div className="grid grid-cols-2 gap-1 p-1 mb-4 bg-mist rounded-full lg:hidden">
          {([
            { id: 'lista', label: `Movimientos (${filtradas.length})` },
            { id: 'analisis', label: 'Análisis' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setVistaMovil(t.id)}
              className={`py-2.5 rounded-full text-xs font-medium transition-all ${
                vistaMovil === t.id ? 'bg-snow text-ink shadow-soft' : 'text-steel'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Columna izquierda: tabla de movimientos */}
          <div className={`lg:col-span-2 ${vistaMovil === "lista" ? "" : "hidden lg:block"}`}>

            {/* Contador + limpiar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
                <p className="text-xs text-ash">
                  {filtradas.length} {filtradas.length === 1 ? 'transacción' : 'transacciones'}
                </p>
                {filtradas.length > 0 && (
                  <button
                    onClick={seleccionarTodo}
                    className="py-2 text-xs font-medium text-graphite hover:text-ink"
                  >
                    {seleccion.size === filtradas.length ? 'Quitar selección' : 'Seleccionar todo'}
                  </button>
                )}
              </div>
              {hayFiltros && (
                <button onClick={limpiarFiltros} className="py-2 text-xs font-medium text-graphite hover:text-ink">
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Barra de acciones en lote */}
            {seleccion.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 mb-4 border bg-obsidian text-snow border-obsidian rounded-card">
                <span className="text-sm font-medium">
                  {seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <select
                    defaultValue=""
                    disabled={enLote}
                    onChange={e => { if (e.target.value) { handleCategorizarLote(e.target.value); e.target.value = '' } }}
                    className="px-3 py-1.5 text-xs font-medium border rounded-full bg-white/10 border-white/20 text-snow focus:outline-none disabled:opacity-50"
                  >
                    <option value="" className="text-ink">Cambiar categoría…</option>
                    {categoriasUnicas.map(c => (
                      <option key={c.id} value={c.id} className="text-ink">
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleEliminarLote}
                    disabled={enLote}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-100 transition-colors border rounded-full bg-red-500/20 border-red-400/40 hover:bg-red-500/30 disabled:opacity-50"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                    {enLote ? 'Procesando…' : 'Eliminar'}
                  </button>
                  <button
                    onClick={() => setSeleccion(new Set())}
                    className="flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto sm:p-1.5 transition-colors rounded-full text-white/70 hover:text-snow hover:bg-white/10"
                    aria-label="Cancelar selección"
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}

            {filtradas.length === 0 ? (
              <div className="p-12 text-center border bg-snow border-fog rounded-card">
                <Receipt size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
                <p className="text-steel">No hay transacciones</p>
                <p className="mt-1 text-sm text-ash">
                  {hayFiltros ? 'Prueba con otros filtros' : 'Agrega tu primera transacción con el botón +'}
                </p>
              </div>
            ) : (
              <div className="border bg-snow border-fog rounded-card">

                {/* Cabecera de columnas (solo desktop) */}
                <div className="hidden px-4 sm:grid sm:grid-cols-12 sm:gap-3 sm:items-center py-3 border-b border-fog">
                  <span className="col-span-1" />
                  <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">Fecha</span>
                  <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">Descripción</span>
                  <span className="col-span-1 text-xs font-semibold tracking-wide uppercase text-ash">Tipo</span>
                  <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">Categoría</span>
                  <span className="col-span-2 text-xs font-semibold tracking-wide uppercase text-ash">Cartera</span>
                  <span className="col-span-1 text-xs font-semibold tracking-wide text-right uppercase text-ash">Monto</span>
                  <span className="col-span-1" />
                </div>

                {filtradas.map((t: any) => (
                  <FilaTransaccion
                    key={t.id}
                    t={t}
                    formatMonto={formatMonto}
                    seleccionada={seleccion.has(t.id)}
                    onSeleccionar={() => alternarSeleccion(t.id)}
                    onEdit={() => setTransaccionSeleccionada(t)}
                    onDelete={() => handleEliminar(t)}
                    onDuplicate={() => handleDuplicar(t)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Columna derecha: gráficos e información */}
          <div className={`space-y-6 lg:col-span-1 ${vistaMovil === "analisis" ? "" : "hidden lg:block"}`}>

            {/* Balance del mes */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <h3 className="mb-4 text-sm font-semibold text-steel">Balance del mes</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm text-graphite">
                      <ArrowUpRight size={14} strokeWidth={2.5} className="text-emerald-600" /> Ingresos
                    </span>
                    <span className="text-sm font-semibold text-emerald-600">{simbolo} {formatMonto(totalIngresos)}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-fog">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${(totalIngresos / maxBarra) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm text-graphite">
                      <ArrowDownRight size={14} strokeWidth={2.5} className="text-red-500" /> Gastos
                    </span>
                    <span className="text-sm font-semibold text-red-500">{simbolo} {formatMonto(totalGastos)}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-fog">
                    <div className="h-2 rounded-full bg-red-500 transition-all duration-500" style={{ width: `${(totalGastos / maxBarra) * 100}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-fog">
                  <span className="text-sm font-medium text-ink">Saldo neto</span>
                  <span className={`text-base font-bold ${saldoNeto >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {saldoNeto >= 0 ? '+' : '-'}{simbolo} {formatMonto(Math.abs(saldoNeto))}
                  </span>
                </div>
              </div>
            </div>

            {/* Distribución de gastos */}
            <div className="p-6 border bg-snow border-fog rounded-card">
              <h3 className="mb-5 text-sm font-semibold text-steel">Distribución de gastos</h3>
              {gastosPorCategoriaColor.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <PieIcon size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                  <p className="text-sm text-steel">Sin gastos para mostrar</p>
                </div>
              ) : (
                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0 w-[136px] h-[136px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={gastosPorCategoriaColor} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} cornerRadius={4} dataKey="valor" stroke="none">
                          {gastosPorCategoriaColor.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${simbolo} ${formatMonto(Number(value) || 0)}`, 'Gasto']}
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                          labelStyle={{ color: '#71717a' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-medium text-steel">Total</span>
                      <span className="text-sm font-bold leading-tight text-ink">{simbolo} {formatMonto(totalGastos)}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {gastosPorCategoriaColor.slice(0, 6).map((d, i) => {
                      const pct = totalGastos > 0 ? Math.round((d.valor / totalGastos) * 100) : 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="flex-1 min-w-0 text-sm truncate text-ink">{d.nombre}</span>
                          <span className="w-8 text-xs font-medium text-right text-steel">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Movimientos por cartera */}
            <div className="p-5 border bg-snow border-fog rounded-card">
              <h3 className="mb-4 text-sm font-semibold text-steel">Movimientos por cartera</h3>
              {movimientosPorCartera.length === 0 ? (
                <p className="text-sm text-ash">Sin movimientos</p>
              ) : (
                <div className="space-y-3">
                  {movimientosPorCartera.slice(0, 5).map(c => {
                    const WIcon = WALLET_ICONS[c.tipo] || Wallet
                    return (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-xl" style={{ backgroundColor: c.color + '18' }}>
                          <WIcon size={16} strokeWidth={2} style={{ color: c.color }} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-ink">{c.nombre}</p>
                          <p className="text-xs text-ash">{c.count} {c.count === 1 ? 'movimiento' : 'movimientos'}</p>
                        </div>
                        {c.gasto > 0 && (
                          <span className="text-sm font-medium text-red-500 whitespace-nowrap">-{simbolo} {formatMonto(c.gasto)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {transaccionSeleccionada && (
        <FormEditarTransaccion
          transaccion={transaccionSeleccionada}
          onClose={() => setTransaccionSeleccionada(null)}
          onSuccess={() => { setTransaccionSeleccionada(null); recargar() }}
        />
      )}

      {/* Botón flotante (móvil) */}
      <button
        onClick={() => setShowForm(true)}
        style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110 sm:hidden"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {showForm && (
        <FormTransaccion onClose={() => setShowForm(false)} onSuccess={recargar} />
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

function FilaTransaccion({ t, formatMonto, seleccionada, onSeleccionar, onEdit, onDelete, onDuplicate }: {
  t: any
  formatMonto: (n: number) => string
  seleccionada: boolean
  onSeleccionar: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const esIngreso = t.tipo === 'ingreso'
  const catColor = t.categories?.color || '#71717a'
  const walletColor = t.wallets?.color || '#71717a'
  const WIcon = WALLET_ICONS[t.wallets?.tipo] || Wallet

  const fechaObj = new Date(`${String(t.fecha).slice(0, 10)}T00:00:00`)
  const fechaTxt = `${String(fechaObj.getDate()).padStart(2, '0')} ${MESES_CORTOS[fechaObj.getMonth()]} ${fechaObj.getFullYear()}`
  const horaTxt = t.created_at
    ? new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div
      onClick={onEdit}
      className={`flex items-center gap-2 px-3 py-3 transition-colors border-b cursor-pointer sm:grid sm:grid-cols-12 sm:gap-3 sm:px-4 sm:py-3.5 border-fog last:border-b-0 ${
        seleccionada ? 'bg-obsidian/5' : 'hover:bg-mist/50'
      }`}
    >
      {/* Selección para acciones en lote */}
      <label
        className="flex items-center justify-center flex-shrink-0 -my-2 cursor-pointer w-11 h-11 sm:col-span-1 sm:w-auto"
        onClick={e => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={seleccionada}
          onChange={onSeleccionar}
          aria-label="Seleccionar movimiento"
          className="w-5 h-5 cursor-pointer accent-obsidian"
        />
      </label>

      {/* Fecha y hora */}
      <div className="hidden sm:block sm:col-span-2">
        <p className="text-sm font-medium text-ink">{fechaTxt}</p>
        {horaTxt && <p className="text-xs text-ash">{horaTxt}</p>}
      </div>

      {/* Descripción */}
      <div className="flex items-center flex-1 min-w-0 gap-3 sm:flex-none sm:col-span-2">
        <span
          className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl"
          style={{ backgroundColor: catColor + '18', color: catColor }}
        >
          <IconoCategoria nombre={t.categories?.icono} size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate text-ink">{t.descripcion || t.categories?.nombre || 'Movimiento'}</p>
          <p className="flex items-center gap-1.5 text-xs text-ash sm:hidden">
            <span className={`inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${esIngreso ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="truncate">{fechaTxt}{t.wallets?.nombre ? ` · ${t.wallets.nombre}` : ''}</span>
          </p>
        </div>
      </div>

      {/* Tipo */}
      <div className="hidden sm:block sm:col-span-1">
        <span
          title={esIngreso ? 'Ingreso' : 'Gasto'}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${esIngreso ? 'bg-emerald-500/12 text-emerald-600' : 'bg-red-500/12 text-red-500'}`}
        >
          {esIngreso ? <ArrowUpRight size={15} strokeWidth={2.5} /> : <ArrowDownRight size={15} strokeWidth={2.5} />}
        </span>
      </div>

      {/* Categoría */}
      <div className="hidden sm:block sm:col-span-2">
        {t.categories?.nombre && (
          <span className="inline-flex px-2.5 py-1 text-xs font-medium truncate rounded-badge"
            style={{ backgroundColor: catColor + '18', color: catColor }}>
            {t.categories.nombre}
          </span>
        )}
      </div>

      {/* Cartera */}
      <div className="hidden sm:flex sm:items-center sm:gap-2 sm:col-span-2 min-w-0">
        <span className="flex items-center justify-center flex-shrink-0 w-6 h-6 rounded-md" style={{ backgroundColor: walletColor + '20' }}>
          <WIcon size={13} strokeWidth={2} style={{ color: walletColor }} />
        </span>
        <span className="text-sm truncate text-graphite">{t.wallets?.nombre || '—'}</span>
      </div>

      {/* Monto */}
      <div className="flex items-center flex-shrink-0 justify-end sm:col-span-1">
        {/* Cada fila se muestra en su propia moneda; los totales de arriba van
            normalizados a la moneda principal. */}
        <span className={`text-sm font-semibold whitespace-nowrap ${esIngreso ? 'text-emerald-600' : 'text-red-500'}`}>
          {esIngreso ? '+' : '-'}{simboloMoneda(t.moneda || 'HNL')} {formatMonto(Number(t.monto))}
        </span>
      </div>

      {/* Acciones */}
      <div className="flex justify-end flex-shrink-0 sm:col-span-1" onClick={e => e.stopPropagation()}>
        <RowMenu onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
      </div>
    </div>
  )
}

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const anio = parseInt(value.slice(0, 4))
  const mesIdx = parseInt(value.slice(5, 7)) - 1
  const [pickerYear, setPickerYear] = useState(anio)
  const hoy = new Date()
  const anioActual = hoy.getFullYear()

  const label = `${MESES[mesIdx]} ${anio}`

  const abrir = () => { setPickerYear(anio); setOpen(true) }
  const seleccionar = (y: number, m: number) => {
    onChange(`${y}-${String(m + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={abrir}
        className="inline-flex items-center w-full gap-2 py-3 pl-3.5 pr-3 text-sm font-medium sm:py-2.5 transition-colors border rounded-full lg:w-auto bg-snow border-fog text-graphite hover:bg-mist"
      >
        <Calendar size={15} strokeWidth={2} className="text-steel" />
        <span className="capitalize">{label}</span>
        <ChevronDown size={14} strokeWidth={2} className="ml-auto text-steel lg:ml-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 p-4 mt-2 border shadow-soft top-full w-72 bg-snow border-fog rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear(y => y - 1)} className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-full text-graphite hover:bg-mist" aria-label="Año anterior">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <p className="font-semibold text-ink">{pickerYear}</p>
              <button onClick={() => setPickerYear(y => y + 1)} className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-full text-graphite hover:bg-mist" aria-label="Año siguiente">
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Los meses futuros SI se pueden abrir. El formulario permite
                  registrar un movimiento con fecha futura —el input no tiene
                  `max`—, asi que bloquear la vista dejaba ese movimiento
                  guardado pero invisible en las tres pantallas. Aterrizar en un
                  mes vacio no rompe nada; no poder ver lo que registraste, si. */}
              {MESES_CORTOS.map((m, i) => {
                const activo = i === mesIdx && pickerYear === anio
                return (
                  <button key={m} onClick={() => seleccionar(pickerYear, i)}
                    className={`py-2 text-sm font-medium rounded-xl transition-colors ${activo ? 'bg-obsidian text-snow' : 'text-graphite hover:bg-mist'}`}>
                    {m}
                  </button>
                )
              })}
            </div>
            {(anio !== anioActual || mesIdx !== hoy.getMonth()) && (
              <button onClick={() => { seleccionar(anioActual, hoy.getMonth()) }} className="w-full py-2 mt-3 text-sm font-medium transition-colors rounded-xl text-graphite hover:bg-mist">
                Ir al mes actual
              </button>
            )}
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
        className="inline-flex items-center justify-between w-full gap-2 py-3 pl-3.5 pr-2.5 text-sm font-medium sm:py-2.5 transition-colors border rounded-full lg:w-auto lg:justify-start bg-snow border-fog text-graphite hover:bg-mist"
      >
        {Icon && <Icon size={15} strokeWidth={2} className="flex-shrink-0 text-steel" />}
        <span className="truncate max-w-[12rem]">{label}</span>
        <ChevronDown size={14} strokeWidth={2} className={`flex-shrink-0 text-steel transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 py-1 mt-1 overflow-y-auto border shadow-soft bg-snow border-fog rounded-xl min-w-[13rem] max-h-72">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`block w-full px-3 py-2.5 text-sm text-left truncate transition-colors hover:bg-mist ${value === o.value ? 'text-ink font-medium' : 'text-steel'}`}
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

function RowMenu({ onEdit, onDelete, onDuplicate }: {
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center w-11 h-11 -my-2 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist"
        title="Opciones"
        aria-label="Opciones del movimiento"
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[10rem]">
            <button
              onClick={() => { setOpen(false); onEdit() }}
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-left transition-colors text-graphite hover:bg-mist"
            >
              <Pencil size={14} strokeWidth={2} /> Editar
            </button>
            <button
              onClick={() => { setOpen(false); onDuplicate() }}
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-left transition-colors text-graphite hover:bg-mist"
            >
              <Copy size={14} strokeWidth={2} /> Duplicar hoy
            </button>
            <button
              onClick={() => { setOpen(false); onDelete() }}
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-left text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 size={14} strokeWidth={2} /> Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
