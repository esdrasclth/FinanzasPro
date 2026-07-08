'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/AppLayout'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Exportar() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [transacciones, setTransacciones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [loadingExcel, setLoadingExcel] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [mensaje, setMensaje] = useState('')

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')

  useEffect(() => {
    const cargarCategorias = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},es_sistema.eq.true`)
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [])

  useEffect(() => {
    const cargarTransacciones = async () => {
      setLoadingData(true)
      setMensaje('')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingData(false); return }

      const inicioMes = `${mes}-01`
      const finMes = new Date(
        parseInt(mes.slice(0, 4)),
        parseInt(mes.slice(5, 7)),
        0
      ).toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          categories(nombre),
          wallets:wallets!transactions_wallet_id_fkey(nombre)
        `)
        .eq('user_id', user.id)
        .gte('fecha', inicioMes)
        .lte('fecha', finMes)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })

      setTransacciones(error ? [] : (data || []))
      setLoadingData(false)
    }
    cargarTransacciones()
  }, [mes])

  const filtradas = useMemo(() => {
    let resultado = [...transacciones]
    if (busqueda) {
      const q = busqueda.toLowerCase()
      resultado = resultado.filter(t =>
        t.descripcion?.toLowerCase().includes(q) ||
        t.categories?.nombre?.toLowerCase().includes(q)
      )
    }
    if (filtroTipo !== 'todos') {
      resultado = resultado.filter(t => t.tipo === filtroTipo)
    }
    if (filtroCategoria !== 'todas') {
      resultado = resultado.filter(t => t.category_id === filtroCategoria)
    }
    return resultado
  }, [transacciones, busqueda, filtroTipo, filtroCategoria])

  const hayFiltros = busqueda !== '' || filtroTipo !== 'todos' || filtroCategoria !== 'todas'

  const construirFiltrosTexto = (): string | undefined => {
    const partes: string[] = []
    if (filtroTipo === 'gasto') partes.push('Solo gastos')
    if (filtroTipo === 'ingreso') partes.push('Solo ingresos')
    if (filtroCategoria !== 'todas') {
      const c = categorias.find(x => x.id === filtroCategoria)
      partes.push(`Categoría: ${c?.nombre ?? ''}`)
    }
    if (busqueda) partes.push(`Búsqueda: "${busqueda}"`)
    return partes.length ? `Filtros: ${partes.join(' · ')}` : undefined
  }

  const exportar = async (formato: 'excel' | 'pdf') => {
    const setLoading = formato === 'excel' ? setLoadingExcel : setLoadingPdf
    setLoading(true)
    setMensaje('')
    try {
      if (filtradas.length === 0) {
        setMensaje('No hay transacciones que coincidan para exportar')
        return
      }
      const lib = await import('../lib/exportar')
      const filtrosTexto = construirFiltrosTexto()
      if (formato === 'excel') {
        await lib.exportarExcel(filtradas, mes, filtrosTexto)
        setMensaje('✅ Excel descargado exitosamente')
      } else {
        lib.exportarPdf(filtradas, mes, filtrosTexto)
        setMensaje('✅ PDF descargado exitosamente')
      }
    } catch (error) {
      setMensaje(`❌ No se pudo generar el ${formato === 'excel' ? 'Excel' : 'PDF'}`)
    } finally {
      setLoading(false)
    }
  }

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroTipo('todos')
    setFiltroCategoria('todas')
  }

  const nombreMes = () => {
    const [anio, m] = mes.split('-')
    return `${MESES[parseInt(m) - 1]} ${anio}`
  }

  const sinResultados = filtradas.length === 0
  const exportDisabled = loadingData || sinResultados

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-obsidian">Exportar datos</h1>
          <p className="mt-1 text-sm text-steel">
            Descarga tus transacciones en Excel o PDF — gratis, sin límites
          </p>
        </div>

        {/* Selector de mes */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card">
          <label className="block mb-3 text-xs font-medium text-steel">
            Selecciona el mes a exportar
          </label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-full px-4 py-3 transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
          />
          <p className="mt-2 text-sm font-medium text-graphite">
            📅 {nombreMes()}
          </p>
        </div>

        {/* Filtros */}
        <div className="p-4 mb-6 space-y-3 border bg-snow border-fog rounded-card">

          {/* Búsqueda */}
          <div className="relative">
            <span className="absolute -translate-y-1/2 left-4 top-1/2 text-steel">🔍</span>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por descripción o categoría..."
              className="w-full py-2.5 pl-10 pr-4 text-sm transition-colors border bg-mist border-fog text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

            {/* Filtro tipo */}
            <div className="flex gap-1 p-1 bg-mist rounded-full">
              {[
                { valor: 'todos', label: 'Todos' },
                { valor: 'gasto', label: '💸 Gastos' },
                { valor: 'ingreso', label: '💰 Ingresos' },
              ].map(op => (
                <button
                  key={op.valor}
                  onClick={() => setFiltroTipo(op.valor)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${filtroTipo === op.valor
                    ? 'bg-obsidian text-snow'
                    : 'text-steel hover:text-ink'
                    }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            {/* Filtro categoría */}
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-3 py-2 text-sm transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
            >
              <option value="todas">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.icono} {cat.nombre}
                </option>
              ))}
            </select>

          </div>

          {/* Contador resultados */}
          <p className="text-xs text-ash">
            {loadingData
              ? 'Cargando movimientos…'
              : `${filtradas.length} ${filtradas.length === 1 ? 'movimiento' : 'movimientos'} se exportarán`}
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                className="ml-2 font-medium text-graphite hover:text-ink"
              >
                Limpiar filtros
              </button>
            )}
          </p>
        </div>

        {/* Botones de exportar */}
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">

          {/* Excel */}
          <button
            onClick={() => exportar('excel')}
            disabled={exportDisabled || loadingExcel}
            className="p-6 text-left transition-all border bg-snow border-fog hover:border-pebble rounded-card group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center w-12 h-12 mb-4 text-2xl transition-colors bg-emerald-50 rounded-2xl group-hover:bg-emerald-100">
              📊
            </div>
            <p className="mb-1 font-semibold text-ink">Exportar Excel</p>
            <p className="text-xs text-ash">
              Archivo .xlsx con los movimientos filtrados y su resumen
            </p>
            <div className="flex items-center gap-2 mt-4 text-sm font-medium text-emerald-600">
              {loadingExcel ? (
                <span className="animate-pulse">Generando...</span>
              ) : (
                <span>Descargar .xlsx →</span>
              )}
            </div>
          </button>

          {/* PDF */}
          <button
            onClick={() => exportar('pdf')}
            disabled={exportDisabled || loadingPdf}
            className="p-6 text-left transition-all border bg-snow border-fog hover:border-pebble rounded-card group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center w-12 h-12 mb-4 text-2xl transition-colors bg-red-50 rounded-2xl group-hover:bg-red-100">
              📄
            </div>
            <p className="mb-1 font-semibold text-ink">Exportar PDF</p>
            <p className="text-xs text-ash">
              Reporte profesional con resumen y detalle de transacciones
            </p>
            <div className="flex items-center gap-2 mt-4 text-sm font-medium text-red-500">
              {loadingPdf ? (
                <span className="animate-pulse">Generando...</span>
              ) : (
                <span>Descargar .pdf →</span>
              )}
            </div>
          </button>

        </div>

        {/* Mensaje de estado */}
        {mensaje && (
          <div className={`rounded-input px-4 py-3 text-sm border ${
            mensaje.includes('✅')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : 'bg-red-50 border-red-200 text-red-500'
          }`}>
            {mensaje}
          </div>
        )}

        {/* Nota */}
        <div className="p-4 mt-6 border bg-snow border-fog rounded-card">
          <p className="mb-1 text-xs font-medium text-steel">💡 Nota</p>
          <p className="text-xs text-graphite">
            Los reportes se generan directamente en tu dispositivo — no requieren conexión a ningún servidor. Respetan los filtros activos (tipo, categoría y búsqueda) e incluyen un resumen de ingresos, gastos y balance.
          </p>
        </div>

      </div>
    </AppLayout>
  )
}
