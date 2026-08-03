'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import AppLayout from '../components/AppLayout'
import { Encabezado, Hero } from '../components/Encabezado'
import {
  FileSpreadsheet, FileText, Search, X, CalendarRange, SlidersHorizontal,
  TrendingUp, TrendingDown, Scale, Layers, AlertTriangle, CheckCircle2,
  ArrowRightLeft, Loader2, Receipt,
} from 'lucide-react'
import { useMoneda } from '../lib/moneda-context'
import { esMovimientoReal, esTransferencia, esSaldoInicial, montoNormalizado } from '../lib/finanzas'
import { fechaHoyLocal, finMesDesplazado, inicioMesDesplazado } from '../lib/fecha'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// El buscador del servidor devuelve como máximo esta cantidad de filas.
const TOPE_FILAS = 500

interface Props {
  usuario: any
  desdeInicial: string
  hastaInicial: string
  tasa: number | null
  transaccionesIniciales: any[]
  categoriasIniciales: any[]
  carterasIniciales: { id: string; nombre: string; activo: boolean }[]
  totalInicial: number
}

type Preset = 'mes' | 'mesPasado' | 'trimestre' | 'anio' | 'personalizado'

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`
}

// Un periodo que cubre justo un mes o un año se nombra por él; el resto, por
// sus extremos. Se usa en la portada del reporte y en el nombre del archivo.
function etiquetaPeriodo(desde: string, hasta: string): string {
  const [aD, mD, dD] = desde.split('-').map(Number)
  const [aH, mH] = hasta.split('-').map(Number)
  const esInicioMes = dD === 1
  const esFinMes = hasta === finMesDesplazado(hasta)
  if (esInicioMes && esFinMes && aD === aH) {
    if (mD === mH) return `${MESES[mD - 1]} ${aD}`
    if (mD === 1 && mH === 12) return `Año ${aD}`
    return `${MESES[mD - 1]} – ${MESES[mH - 1]} ${aD}`
  }
  return `${fechaCorta(desde)} — ${fechaCorta(hasta)}`
}

export default function ExportarCliente({
  usuario, desdeInicial, hastaInicial, tasa,
  transaccionesIniciales, categoriasIniciales, carterasIniciales, totalInicial,
}: Props) {
  const { moneda, simbolo } = useMoneda()

  const [desde, setDesde] = useState(desdeInicial)
  const [hasta, setHasta] = useState(hastaInicial)
  const [preset, setPreset] = useState<Preset>('mes')
  const [transacciones, setTransacciones] = useState<any[]>(transaccionesIniciales)
  const [totalPeriodo, setTotalPeriodo] = useState(totalInicial)
  const [loadingData, setLoadingData] = useState(false)
  const [generando, setGenerando] = useState<'excel' | 'pdf' | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroCartera, setFiltroCartera] = useState('todas')
  const [incluirTraspasos, setIncluirTraspasos] = useState(true)

  const categorias = categoriasIniciales
  const carteras = carterasIniciales

  // El primer rango llega resuelto del Server Component: no hay que volver a
  // pedirlo. A partir de ahí cada cambio de periodo consulta el buscador, con
  // una pausa para no lanzar una petición por cada tecla del campo de fecha.
  const primeraCarga = useRef(true)
  useEffect(() => {
    if (primeraCarga.current) { primeraCarga.current = false; return }
    if (!desde || !hasta || desde > hasta) return

    const id = setTimeout(async () => {
      setLoadingData(true)
      setAviso(null)
      try {
        const res = await fetch(`/api/transacciones/buscar?desde=${desde}&hasta=${hasta}&limit=${TOPE_FILAS}`)
        const json = res.ok ? await res.json() : null
        setTransacciones(json?.data || [])
        setTotalPeriodo(json?.total ?? 0)
      } catch {
        setAviso({ tipo: 'error', texto: 'No se pudieron cargar los movimientos del periodo.' })
      } finally {
        setLoadingData(false)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [desde, hasta])

  const aplicarPreset = (p: Preset) => {
    setPreset(p)
    const hoy = fechaHoyLocal()
    if (p === 'mes') { setDesde(inicioMesDesplazado(hoy)); setHasta(finMesDesplazado(hoy)) }
    if (p === 'mesPasado') { setDesde(inicioMesDesplazado(hoy, -1)); setHasta(finMesDesplazado(hoy, -1)) }
    if (p === 'trimestre') { setDesde(inicioMesDesplazado(hoy, -2)); setHasta(finMesDesplazado(hoy)) }
    if (p === 'anio') { setDesde(`${hoy.slice(0, 4)}-01-01`); setHasta(`${hoy.slice(0, 4)}-12-31`) }
  }

  const cambiarFecha = (cual: 'desde' | 'hasta', valor: string) => {
    setPreset('personalizado')
    if (cual === 'desde') setDesde(valor)
    else setHasta(valor)
  }

  const filtradas = useMemo(() => {
    let r = transacciones
    if (!incluirTraspasos) r = r.filter(esMovimientoReal)
    if (busqueda) {
      const q = busqueda.toLowerCase()
      r = r.filter(t =>
        t.descripcion?.toLowerCase().includes(q) ||
        t.categories?.nombre?.toLowerCase().includes(q) ||
        t.wallets?.nombre?.toLowerCase().includes(q)
      )
    }
    if (filtroTipo !== 'todos') r = r.filter(t => t.tipo === filtroTipo && esMovimientoReal(t))
    if (filtroCategoria !== 'todas') r = r.filter(t => t.category_id === filtroCategoria)
    if (filtroCartera !== 'todas') r = r.filter(t => t.wallet_id === filtroCartera)
    return r
  }, [transacciones, busqueda, filtroTipo, filtroCategoria, filtroCartera, incluirTraspasos])

  // Mismo cálculo que hace el reporte, para que la pantalla prometa lo que el
  // archivo entrega: sin traspasos ni aperturas y en la moneda principal.
  const resumen = useMemo(() => {
    const reales = filtradas.filter(esMovimientoReal)
    const monto = (t: any) => montoNormalizado(t, moneda, tasa)
    const ingresos = reales.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + monto(t), 0)
    const gastos = reales.filter(t => t.tipo === 'gasto').reduce((s, t) => s + monto(t), 0)

    const porCat = new Map<string, number>()
    for (const t of reales) {
      if (t.tipo !== 'gasto') continue
      const k = t.categories?.nombre || 'Sin categoría'
      porCat.set(k, (porCat.get(k) || 0) + monto(t))
    }
    const top = [...porCat.entries()]
      .map(([nombre, total]) => ({ nombre, total, pct: gastos > 0 ? (total / gastos) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    return { ingresos, gastos, balance: ingresos - gastos, reales: reales.length, top }
  }, [filtradas, moneda, tasa])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  const etiqueta = useMemo(() => etiquetaPeriodo(desde, hasta), [desde, hasta])
  const rangoInvalido = !desde || !hasta || desde > hasta
  const truncado = totalPeriodo > transacciones.length

  const filtrosActivos = useMemo(() => {
    const p: string[] = []
    if (filtroTipo === 'gasto') p.push('Solo gastos')
    if (filtroTipo === 'ingreso') p.push('Solo ingresos')
    if (filtroCategoria !== 'todas') {
      p.push(`Categoría: ${categorias.find(c => c.id === filtroCategoria)?.nombre ?? ''}`)
    }
    if (filtroCartera !== 'todas') {
      p.push(`Cartera: ${carteras.find(c => c.id === filtroCartera)?.nombre ?? ''}`)
    }
    if (!incluirTraspasos) p.push('Sin traspasos ni aperturas')
    if (busqueda) p.push(`Búsqueda: "${busqueda}"`)
    return p
  }, [filtroTipo, filtroCategoria, filtroCartera, incluirTraspasos, busqueda, categorias, carteras])

  const hayFiltros = filtrosActivos.length > 0

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroTipo('todos')
    setFiltroCategoria('todas')
    setFiltroCartera('todas')
    setIncluirTraspasos(true)
  }

  const exportar = async (formato: 'excel' | 'pdf') => {
    setGenerando(formato)
    setAviso(null)
    try {
      if (filtradas.length === 0) {
        setAviso({ tipo: 'error', texto: 'No hay movimientos que coincidan con lo seleccionado.' })
        return
      }
      const lib = await import('../lib/exportar')
      const opts = {
        desde, hasta, etiqueta, moneda, simbolo, tasa,
        filtros: filtrosActivos,
        autor: usuario?.nombre || undefined,
        truncado: truncado ? { mostrados: transacciones.length, total: totalPeriodo } : null,
      }
      if (formato === 'excel') await lib.exportarExcel(filtradas, opts)
      else lib.exportarPdf(filtradas, opts)
      setAviso({
        tipo: 'ok',
        texto: `${formato === 'excel' ? 'Excel' : 'PDF'} descargado · ${filtradas.length} ${filtradas.length === 1 ? 'movimiento' : 'movimientos'} de ${etiqueta}.`,
      })
    } catch {
      setAviso({ tipo: 'error', texto: `No se pudo generar el ${formato === 'excel' ? 'Excel' : 'PDF'}. Intenta de nuevo.` })
    } finally {
      setGenerando(null)
    }
  }

  const noHayNada = filtradas.length === 0
  const bloqueado = loadingData || rangoInvalido || noHayNada || generando !== null

  const PRESETS: { id: Preset; label: string }[] = [
    { id: 'mes', label: 'Este mes' },
    { id: 'mesPasado', label: 'Mes pasado' },
    { id: 'trimestre', label: 'Últimos 3 meses' },
    { id: 'anio', label: 'Este año' },
  ]

  return (
    <AppLayout usuario={usuario}>
      <div className="max-w-[1728px] p-4 mx-auto sm:p-6 lg:p-8">

        <Encabezado seccion="Exportar" titulo="Descarga tus datos" />

        <Hero
          titulo="Lo que se va a exportar"
          subtitulo={etiqueta}
          metricas={[
            {
              icon: Receipt,
              label: 'Movimientos',
              valor: String(filtradas.length),
              nota: <span className="text-white/50">
                {resumen.reales} {resumen.reales === 1 ? 'cuenta' : 'cuentan'} como ingreso o gasto
              </span>,
            },
            {
              icon: TrendingUp,
              label: 'Ingresos',
              valor: `${simbolo}${fmt(resumen.ingresos)}`,
              nota: <span className="text-emerald-300">en la selección</span>,
            },
            {
              icon: TrendingDown,
              label: 'Gastos',
              valor: `${simbolo}${fmt(resumen.gastos)}`,
              nota: <span className="text-red-300">en la selección</span>,
            },
            {
              icon: Scale,
              label: 'Balance',
              valor: `${simbolo}${fmt(resumen.balance)}`,
              nota: <span className={resumen.balance >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                {resumen.balance >= 0 ? 'Ahorro del periodo' : 'Déficit del periodo'}
              </span>,
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* ── Columna de controles ── */}
          <div className="space-y-5 lg:col-span-2">

            {/* Periodo */}
            <section className="p-5 border bg-snow border-fog rounded-card">
              <div className="flex items-center gap-2 mb-4">
                <CalendarRange size={16} className="text-steel" />
                <h2 className="text-sm font-semibold text-ink">Periodo</h2>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => aplicarPreset(p.id)}
                    className={`px-3.5 py-1.5 text-xs font-medium transition-colors rounded-full border ${
                      preset === p.id
                        ? 'bg-obsidian text-snow border-obsidian'
                        : 'bg-mist text-steel border-transparent hover:text-ink'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {preset === 'personalizado' && (
                  <span className="px-3.5 py-1.5 text-xs font-medium border rounded-full bg-obsidian text-snow border-obsidian">
                    Personalizado
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block mb-1.5 text-xs font-medium text-steel">Desde</span>
                  <input
                    type="date"
                    value={desde}
                    max={hasta || undefined}
                    onChange={e => cambiarFecha('desde', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
                  />
                </label>
                <label className="block">
                  <span className="block mb-1.5 text-xs font-medium text-steel">Hasta</span>
                  <input
                    type="date"
                    value={hasta}
                    min={desde || undefined}
                    onChange={e => cambiarFecha('hasta', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
                  />
                </label>
              </div>

              {rangoInvalido && (
                <p className="mt-3 text-xs font-medium text-red-500">
                  La fecha inicial debe ser anterior a la final.
                </p>
              )}
            </section>

            {/* Filtros */}
            <section className="p-5 border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-steel" />
                  <h2 className="text-sm font-semibold text-ink">Filtros</h2>
                </div>
                {hayFiltros && (
                  <button
                    onClick={limpiarFiltros}
                    className="inline-flex items-center gap-1 text-xs font-medium transition-colors text-steel hover:text-ink"
                  >
                    <X size={13} /> Limpiar
                  </button>
                )}
              </div>

              <div className="relative mb-3">
                <Search size={15} className="absolute -translate-y-1/2 pointer-events-none left-3.5 top-1/2 text-ash" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por descripción, categoría o cartera…"
                  className="w-full py-2.5 pl-10 pr-4 text-sm transition-colors border bg-mist border-fog text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                />
              </div>

              <div className="flex gap-1 p-1 mb-3 bg-mist rounded-full sm:max-w-sm">
                {[
                  { valor: 'todos', label: 'Todos' },
                  { valor: 'gasto', label: 'Gastos' },
                  { valor: 'ingreso', label: 'Ingresos' },
                ].map(op => (
                  <button
                    key={op.valor}
                    onClick={() => setFiltroTipo(op.valor)}
                    className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      filtroTipo === op.valor ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={filtroCategoria}
                  onChange={e => setFiltroCategoria(e.target.value)}
                  className="px-3 py-2.5 text-sm transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
                >
                  <option value="todas">Todas las categorías</option>
                  {categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>

                <select
                  value={filtroCartera}
                  onChange={e => setFiltroCartera(e.target.value)}
                  className="px-3 py-2.5 text-sm transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
                >
                  <option value="todas">Todas las carteras</option>
                  {carteras.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.nombre}{w.activo ? '' : ' (archivada)'}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 p-3 mt-3 transition-colors cursor-pointer bg-mist rounded-input hover:bg-fog">
                <input
                  type="checkbox"
                  checked={incluirTraspasos}
                  onChange={e => setIncluirTraspasos(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-obsidian"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                    <ArrowRightLeft size={13} className="text-steel" />
                    Incluir traspasos y saldos de apertura
                  </span>
                  <span className="block mt-0.5 text-xs text-ash">
                    Aparecen en el detalle, pero nunca suman como ingreso ni como gasto.
                  </span>
                </span>
              </label>
            </section>

            {/* Vista previa */}
            <section className="border bg-snow border-fog rounded-card">
              <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-fog">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-steel" />
                  <h2 className="text-sm font-semibold text-ink">Vista previa</h2>
                </div>
                <span className="text-xs text-ash">
                  {loadingData
                    ? 'Cargando…'
                    : `${filtradas.length} ${filtradas.length === 1 ? 'movimiento' : 'movimientos'}`}
                </span>
              </div>

              {loadingData ? (
                <div className="p-5 space-y-2">
                  {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded bg-mist animate-pulse" />)}
                </div>
              ) : noHayNada ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-graphite">No hay movimientos que coincidan</p>
                  <p className="mt-1 text-xs text-ash">
                    Prueba con otro periodo o quita algún filtro.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-left text-steel">
                          <th className="px-5 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Concepto</th>
                          <th className="hidden px-3 py-2 font-medium sm:table-cell">Cartera</th>
                          <th className="px-5 py-2 font-medium text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtradas.slice(0, 6).map(t => {
                          const traspaso = esTransferencia(t) || esSaldoInicial(t)
                          return (
                            <tr key={t.id} className="border-t border-fog">
                              <td className="px-5 py-2.5 text-xs whitespace-nowrap text-steel">
                                {fechaCorta(t.fecha)}
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium truncate text-ink max-w-[22ch] sm:max-w-none">
                                  {t.descripcion || '—'}
                                </p>
                                <p className="text-xs truncate text-ash">
                                  {t.categories?.nombre || 'Sin categoría'}
                                </p>
                              </td>
                              <td className="hidden px-3 py-2.5 text-xs sm:table-cell text-steel">
                                {t.wallets?.nombre || '—'}
                              </td>
                              {/* El traspaso lleva signo, porque sí mueve el saldo de
                                  esa cartera, pero en gris: no es ingreso ni gasto. */}
                              <td className={`px-5 py-2.5 text-right whitespace-nowrap font-semibold ${
                                traspaso ? 'text-steel' : t.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-500'
                              }`}>
                                {t.tipo === 'ingreso' ? '+' : '−'}
                                {simbolo}{fmt(montoNormalizado(t, moneda, tasa))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filtradas.length > 6 && (
                    <p className="px-5 py-3 text-xs border-t text-ash border-fog">
                      y {filtradas.length - 6} {filtradas.length - 6 === 1 ? 'movimiento más' : 'movimientos más'} en el archivo
                    </p>
                  )}
                </>
              )}
            </section>
          </div>

          {/* ── Columna de descarga ── */}
          <div className="space-y-5">

            {truncado && (
              <div className="flex items-start gap-3 p-4 border border-amber-200 bg-amber-50 rounded-card">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
                <p className="text-xs text-amber-800">
                  El periodo tiene <strong>{totalPeriodo}</strong> movimientos y solo se pueden
                  exportar los <strong>{transacciones.length}</strong> más recientes. Acorta el rango
                  de fechas para llevártelos todos.
                </p>
              </div>
            )}

            {/* Desglose por categoría */}
            {resumen.top.length > 0 && (
              <section className="p-5 border bg-snow border-fog rounded-card">
                <h2 className="mb-4 text-sm font-semibold text-ink">En qué se fue el dinero</h2>
                <div className="space-y-3">
                  {resumen.top.map(c => (
                    <div key={c.nombre}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-xs font-medium truncate text-graphite">{c.nombre}</span>
                        <span className="text-xs font-semibold whitespace-nowrap text-ink">
                          {simbolo}{fmt(c.total)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-mist">
                        <div
                          className="h-full rounded-full bg-obsidian"
                          style={{ width: `${Math.max(c.pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-ash">
                  Las cinco categorías con más gasto del periodo. El reporte incluye todas.
                </p>
              </section>
            )}

            {/* Descargas */}
            <section className="p-5 border bg-snow border-fog rounded-card">
              <h2 className="mb-1 text-sm font-semibold text-ink">Descargar reporte</h2>
              <p className="mb-4 text-xs text-ash">
                Se generan en tu dispositivo con lo que hay en la vista previa.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => exportar('excel')}
                  disabled={bloqueado}
                  className="w-full p-4 text-left transition-colors border bg-mist border-fog rounded-input hover:border-pebble disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 text-emerald-600 bg-emerald-50 rounded-xl">
                      {generando === 'excel'
                        ? <Loader2 size={18} className="animate-spin" />
                        : <FileSpreadsheet size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {generando === 'excel' ? 'Generando…' : 'Excel (.xlsx)'}
                      </p>
                      <p className="text-xs text-ash">
                        Resumen, movimientos, por categoría y por cartera
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => exportar('pdf')}
                  disabled={bloqueado}
                  className="w-full p-4 text-left transition-colors border bg-mist border-fog rounded-input hover:border-pebble disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 text-red-500 rounded-xl bg-red-50">
                      {generando === 'pdf'
                        ? <Loader2 size={18} className="animate-spin" />
                        : <FileText size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {generando === 'pdf' ? 'Generando…' : 'PDF'}
                      </p>
                      <p className="text-xs text-ash">
                        Portada, indicadores, resúmenes y detalle
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {aviso && (
                <div className={`flex items-start gap-2 px-3 py-2.5 mt-4 text-xs border rounded-input ${
                  aviso.tipo === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border-red-200 text-red-600'
                }`}>
                  {aviso.tipo === 'ok'
                    ? <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
                    : <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />}
                  <span>{aviso.texto}</span>
                </div>
              )}

              {hayFiltros && (
                <div className="pt-4 mt-4 border-t border-fog">
                  <p className="mb-2 text-xs font-medium text-steel">Filtros que quedarán anotados</p>
                  <ul className="space-y-1">
                    {filtrosActivos.map(f => (
                      <li key={f} className="text-xs text-graphite">• {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <p className="px-1 text-xs leading-relaxed text-ash">
              Los archivos se arman en tu navegador: tus movimientos no pasan por
              ningún servidor. Los importes van convertidos a {moneda} con la tasa
              que estaba vigente en cada movimiento.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
