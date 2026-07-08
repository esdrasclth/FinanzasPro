'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import GraficaGastos from '../components/GraficaGastos'
import GraficaMensual from '../components/GraficaMensual'
import FormTransaccion from '../components/FormTransaccion'
import { SkeletonStats, SkeletonChart, SkeletonList } from '../components/Skeleton'
import CalendarioFinanciero from '../components/CalendarioFinanciero'
import Notificaciones from '../components/Notificaciones'
import { TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Calendar, ArrowLeftRight, PieChart, BarChart3, Download, Plus } from 'lucide-react'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function Dashboard() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<any>(null)
  const [transacciones, setTransacciones] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formTipo, setFormTipo] = useState<'gasto' | 'ingreso' | 'transferencia'>('gasto')
  const [resumen, setResumen] = useState({ ingresos: 0, gastos: 0 })
  const [resumenPrev, setResumenPrev] = useState({ ingresos: 0, gastos: 0 })
  const [loading, setLoading] = useState(true)
  const [vistaGrafica, setVistaGrafica] = useState<'gasto' | 'ingreso'>('gasto')
  const [mesOffset, setMesOffset] = useState(0) // 0 = mes actual, -1 = mes anterior
  const [showMesPicker, setShowMesPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setUsuario(profile)
      await cargarTransacciones()
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    cargarTransacciones()
  }, [mesOffset])

  const cargarTransacciones = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { inicio, fin } = getMesRango()

    const { data } = await supabase
      .from('transactions')
      .select('*, categories(nombre, icono, color)')
      .eq('user_id', user.id)
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('fecha', { ascending: false })

    setTransacciones(data || [])
    // El "Saldo inicial" (apertura de cartera) no cuenta como ingreso/gasto del mes.
    const movimientos = (data || []).filter(t => t.categories?.nombre !== 'Saldo inicial')
    const ingresos = movimientos.filter(t => t.tipo === 'ingreso').reduce((sum, t) => sum + Number(t.monto), 0)
    const gastos = movimientos.filter(t => t.tipo === 'gasto').reduce((sum, t) => sum + Number(t.monto), 0)
    setResumen({ ingresos, gastos })

    const prev = getMesRango(-1)
    const { data: dataPrev } = await supabase
      .from('transactions')
      .select('monto, tipo, categories(nombre)')
      .eq('user_id', user.id)
      .gte('fecha', prev.inicio)
      .lte('fecha', prev.fin)
    const movPrev = (dataPrev || []).filter(t => t.categories?.nombre !== 'Saldo inicial')
    const ingresosPrev = movPrev.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0)
    const gastosPrev = movPrev.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto), 0)
    setResumenPrev({ ingresos: ingresosPrev, gastos: gastosPrev })
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const saludo = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const getMesActual = () => {
    const fecha = new Date()
    fecha.setMonth(fecha.getMonth() + mesOffset)
    return fecha
  }

  const mesNombre = getMesActual().toLocaleDateString('es-HN', {
    month: 'long', year: 'numeric'
  })

  const getMesRango = (extra = 0) => {
    const base = getMesActual()
    const inicio = new Date(base.getFullYear(), base.getMonth() + extra, 1)
    const fin = new Date(base.getFullYear(), base.getMonth() + extra + 1, 0)
    return {
      inicio: inicio.toISOString().split('T')[0],
      fin: fin.toISOString().split('T')[0]
    }
  }

  const mesAnteriorNombre = (() => {
    const base = getMesActual()
    return new Date(base.getFullYear(), base.getMonth() - 1, 1)
      .toLocaleDateString('es-HN', { month: 'long' })
  })()

  const abrirPicker = () => {
    setPickerYear(getMesActual().getFullYear())
    setShowMesPicker(true)
  }

  const seleccionarMes = (year: number, mes: number) => {
    const base = new Date()
    const offset = (year - base.getFullYear()) * 12 + (mes - base.getMonth())
    setMesOffset(Math.min(0, offset))
    setShowMesPicker(false)
  }

  const abrirForm = (tipo: 'gasto' | 'ingreso' | 'transferencia') => {
    setFormTipo(tipo)
    setShowForm(true)
  }

  const trend = (cur: number, prev: number) => {
    if (prev === 0) {
      return (
        <p className="mt-1.5 text-sm font-medium flex items-center gap-1 text-white/50">
          <span>Sin datos</span>
          <span className="text-white/40">de {mesAnteriorNombre}</span>
        </p>
      )
    }
    const pct = ((cur - prev) / Math.abs(prev)) * 100
    const up = pct >= 0
    return (
      <p className={`mt-1.5 text-sm font-medium flex items-center gap-1 ${up ? 'text-emerald-300' : 'text-red-300'}`}>
        <span>{up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%</span>
        <span className="text-white/40">vs {mesAnteriorNombre}</span>
      </p>
    )
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] p-6 mx-auto space-y-6 lg:p-8">
          <div className="space-y-2">
            <div className="w-32 h-3 rounded bg-fog animate-pulse" />
            <div className="w-56 h-8 rounded bg-fog animate-pulse" />
          </div>
          <SkeletonStats cols={3} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SkeletonChart />
            <SkeletonChart />
          </div>
          <SkeletonList items={6} />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="mb-1 text-sm font-medium capitalize text-steel">{mesNombre}</p>
            <h1 className="text-3xl font-bold text-obsidian">
              {saludo()}, {usuario?.nombre?.split(' ')[0]} 👋
            </h1>
          </div>
          <Notificaciones />
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
              <h2 className="text-xl font-semibold">Resumen de este mes</h2>
              <p className="text-base capitalize text-white/60">{mesNombre}</p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 sm:divide-x sm:divide-white/10">
              <div className="flex items-start gap-4 sm:pr-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <TrendingUp size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Ingresos</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl">L {formatMonto(resumen.ingresos)}</p>
                  {trend(resumen.ingresos, resumenPrev.ingresos)}
                </div>
              </div>

              <div className="flex items-start gap-4 sm:px-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <TrendingDown size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Gastos</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl">L {formatMonto(resumen.gastos)}</p>
                  {trend(resumen.gastos, resumenPrev.gastos)}
                </div>
              </div>

              <div className="flex items-start gap-4 sm:pl-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <Wallet size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Saldo neto</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl">L {formatMonto(resumen.ingresos - resumen.gastos)}</p>
                  {trend(resumen.ingresos - resumen.gastos, resumenPrev.ingresos - resumenPrev.gastos)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navegador de mes */}
        <div className="relative mb-6">
          <div className="flex items-center justify-between h-16 px-3 border bg-snow border-fog rounded-2xl">
            <button
              onClick={() => setMesOffset(mesOffset - 1)}
              className="flex items-center justify-center transition-all border rounded-full w-9 h-9 bg-snow border-fog text-graphite hover:bg-mist hover:text-ink"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={18} strokeWidth={2} />
            </button>

            <button
              onClick={abrirPicker}
              className="flex items-center gap-2 px-4 py-2 transition-colors rounded-full hover:bg-mist"
            >
              <Calendar size={16} strokeWidth={2} className="text-steel" />
              <span className="font-semibold capitalize text-ink">{mesNombre}</span>
            </button>

            <button
              onClick={() => setMesOffset(Math.min(0, mesOffset + 1))}
              className={`w-9 h-9 flex items-center justify-center rounded-full border transition-all ${mesOffset === 0
                  ? 'bg-snow border-fog text-pebble cursor-not-allowed'
                  : 'bg-snow border-fog text-graphite hover:bg-mist hover:text-ink'
                }`}
              disabled={mesOffset === 0}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          </div>

          {showMesPicker && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowMesPicker(false)} />
              <div className="absolute z-30 p-4 mt-2 -translate-x-1/2 border shadow-soft left-1/2 top-full w-72 bg-snow border-fog rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setPickerYear(y => y - 1)}
                    className="flex items-center justify-center w-8 h-8 rounded-full text-graphite hover:bg-mist"
                    aria-label="Año anterior"
                  >
                    <ChevronLeft size={16} strokeWidth={2} />
                  </button>
                  <p className="font-semibold text-ink">{pickerYear}</p>
                  <button
                    onClick={() => setPickerYear(y => Math.min(new Date().getFullYear(), y + 1))}
                    disabled={pickerYear >= new Date().getFullYear()}
                    className={`w-8 h-8 flex items-center justify-center rounded-full ${pickerYear >= new Date().getFullYear() ? 'text-pebble cursor-not-allowed' : 'text-graphite hover:bg-mist'}`}
                    aria-label="Año siguiente"
                  >
                    <ChevronRight size={16} strokeWidth={2} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MESES_CORTOS.map((m, i) => {
                    const activo = i === getMesActual().getMonth() && pickerYear === getMesActual().getFullYear()
                    const hoy = new Date()
                    const futuro = pickerYear > hoy.getFullYear() || (pickerYear === hoy.getFullYear() && i > hoy.getMonth())
                    return (
                      <button
                        key={m}
                        onClick={() => seleccionarMes(pickerYear, i)}
                        disabled={futuro}
                        className={`py-2 text-sm font-medium rounded-xl transition-colors ${activo
                            ? 'bg-obsidian text-snow'
                            : futuro
                              ? 'text-pebble cursor-not-allowed'
                              : 'text-graphite hover:bg-mist'
                          }`}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
                {mesOffset !== 0 && (
                  <button
                    onClick={() => { setMesOffset(0); setShowMesPicker(false) }}
                    className="w-full py-2 mt-3 text-sm font-medium transition-colors rounded-xl text-graphite hover:bg-mist"
                  >
                    Ir al mes actual
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Gráficas */}
        <div className="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-2">
          <div className="relative flex flex-col p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">Movimientos Mensuales</h2>
            <p className="mb-4 text-xs text-steel">Ingresos vs Gastos</p>
            <GraficaMensual transacciones={transacciones} />
          </div>
          <div className="p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">
              {vistaGrafica === 'gasto' ? 'Gastos por Categoría' : 'Ingresos por Categoría'}
            </h2>
            <p className="mb-4 text-xs text-steel">Distribución del mes</p>
            <GraficaGastos
              transacciones={transacciones}
              vista={vistaGrafica}
              onVistaChange={setVistaGrafica}
            />
          </div>
          <div className="flex flex-col p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">Calendario Financiero</h2>
            <p className="mb-4 text-xs text-steel">Actividad diaria del mes</p>
            <CalendarioFinanciero transacciones={transacciones} mes={getMesActual()} />
          </div>
          <div className="flex flex-col p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">Acciones rápidas</h2>
            <p className="mb-4 text-xs text-steel">Atajos a lo que más usas</p>
            <div className="grid flex-1 grid-cols-2 gap-3 auto-rows-fr">
              {[
                { label: 'Nuevo ingreso', icon: TrendingUp, tint: 'bg-emerald-50 text-emerald-600', onClick: () => abrirForm('ingreso') },
                { label: 'Nuevo gasto', icon: TrendingDown, tint: 'bg-red-50 text-red-500', onClick: () => abrirForm('gasto') },
                { label: 'Transferencia', icon: ArrowLeftRight, tint: 'bg-violet-50 text-violet-600', onClick: () => abrirForm('transferencia') },
                { label: 'Ver presupuestos', icon: PieChart, tint: 'bg-blue-50 text-blue-600', onClick: () => router.push('/presupuesto') },
                { label: 'Ver reportes', icon: BarChart3, tint: 'bg-amber-50 text-amber-600', onClick: () => router.push('/reportes') },
                { label: 'Exportar datos', icon: Download, tint: 'bg-teal-50 text-teal-600', onClick: () => router.push('/exportar') },
              ].map(({ label, icon: Icon, tint, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className="flex items-center gap-3 p-3.5 text-left transition-colors border border-fog rounded-xl bg-snow hover:bg-mist hover:border-pebble"
                >
                  <span className={`flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl ${tint}`}>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="text-sm font-medium leading-tight text-ink">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        

        {/* Últimas transacciones */}
        <div className="p-6 border bg-snow border-fog rounded-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold text-obsidian">Últimas transacciones</h2>
              <p className="text-steel text-xs mt-0.5">{transacciones.length} este mes</p>
            </div>
            <button
              onClick={() => router.push('/transacciones')}
              className="inline-flex items-center gap-0.5 text-sm font-medium text-graphite transition-colors hover:text-ink"
            >
              Ver todas
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>

          {transacciones.length === 0 ? (
            <div className="py-10 text-center">
              <span className="block mb-3 text-4xl">📋</span>
              <p className="text-sm text-steel">Toca + para agregar tu primera transacción</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transacciones.slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center justify-between p-3.5 hover:bg-mist rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center text-lg w-9 h-9 bg-mist rounded-badge">
                      {t.categories?.icono || '💸'}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none text-ink">
                        {t.descripcion || t.categories?.nombre}
                      </p>
                      <p className="mt-1 text-xs text-steel">
                        {t.categories?.nombre} · {new Date(t.fecha + 'T12:00:00')
                          .toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${t.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {t.tipo === 'ingreso' ? '+' : '-'}L {formatMonto(Number(t.monto))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Botón flotante */}
      <button
        onClick={() => abrirForm('gasto')}
        style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {showForm && (
        <FormTransaccion
          tipoInicial={formTipo}
          onClose={() => setShowForm(false)}
          onSuccess={cargarTransacciones}
        />
      )}
    </AppLayout>
  )
}