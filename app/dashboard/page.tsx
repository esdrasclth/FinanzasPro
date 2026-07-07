'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import GraficaGastos from '../components/GraficaGastos'
import GraficaMensual from '../components/GraficaMensual'
import FormTransaccion from '../components/FormTransaccion'
import { SkeletonStats, SkeletonChart, SkeletonList } from '../components/Skeleton'
import Notificaciones from '../components/Notificaciones'
import CalendarioFinanciero from '../components/CalendarioFinanciero'

export default function Dashboard() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<any>(null)
  const [transacciones, setTransacciones] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [resumen, setResumen] = useState({ ingresos: 0, gastos: 0 })
  const [loading, setLoading] = useState(true)
  const [vistaGrafica, setVistaGrafica] = useState<'gasto' | 'ingreso'>('gasto')
  const [mesOffset, setMesOffset] = useState(0) // 0 = mes actual, -1 = mes anterior

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
    const ingresos = (data || []).filter(t => t.tipo === 'ingreso').reduce((sum, t) => sum + Number(t.monto), 0)
    const gastos = (data || []).filter(t => t.tipo === 'gasto').reduce((sum, t) => sum + Number(t.monto), 0)
    setResumen({ ingresos, gastos })
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

  const getMesRango = () => {
    const fecha = getMesActual()
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
    const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)
    return {
      inicio: inicio.toISOString().split('T')[0],
      fin: fin.toISOString().split('T')[0]
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-6xl p-6 mx-auto space-y-6 lg:p-8">
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
      <div className="max-w-6xl p-6 mx-auto lg:p-8">

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

        {/* Cards resumen */}
        <div className="grid grid-cols-1 gap-4 mb-8 sm:grid-cols-3">
          <div className="p-6 transition-all border bg-snow border-fog rounded-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-steel">Ingresos</p>
              <div className="flex items-center justify-center w-8 h-8 text-sm rounded-badge bg-emerald-50">💰</div>
            </div>
            <p className="text-2xl font-bold text-emerald-600">L {formatMonto(resumen.ingresos)}</p>
            <p className="mt-1 text-xs text-ash">Este mes</p>
          </div>

          <div className="p-6 transition-all border bg-snow border-fog rounded-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-steel">Gastos</p>
              <div className="flex items-center justify-center w-8 h-8 text-sm rounded-badge bg-red-50">💸</div>
            </div>
            <p className="text-2xl font-bold text-red-500">L {formatMonto(resumen.gastos)}</p>
            <p className="mt-1 text-xs text-ash">Este mes</p>
          </div>

          <div className="p-6 transition-all border bg-snow border-fog rounded-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-steel">Saldo neto</p>
              <div className="flex items-center justify-center w-8 h-8 text-sm rounded-badge bg-fog">📊</div>
            </div>
            <p className={`text-2xl font-bold ${resumen.ingresos - resumen.gastos >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              L {formatMonto(resumen.ingresos - resumen.gastos)}
            </p>
            <p className="mt-1 text-xs text-ash">Ingresos - Gastos</p>
          </div>
        </div>

        {/* Navegador de mes */}
        <div className="flex items-center justify-between px-4 py-3 mb-6 border bg-snow border-fog rounded-full">
          <button
            onClick={() => setMesOffset(mesOffset - 1)}
            className="flex items-center justify-center transition-all border rounded-full w-9 h-9 bg-snow border-fog text-graphite hover:bg-fog"
          >
            ←
          </button>
          <div className="text-center">
            <p className="font-semibold text-ink capitalize">{mesNombre}</p>
            {mesOffset !== 0 && (
              <button
                onClick={() => setMesOffset(0)}
                className="text-xs font-medium text-graphite transition-colors hover:text-ink"
              >
                Volver al mes actual
              </button>
            )}
          </div>
          <button
            onClick={() => setMesOffset(Math.min(0, mesOffset + 1))}
            className={`w-9 h-9 flex items-center justify-center rounded-full border transition-all ${mesOffset === 0
                ? 'bg-snow border-fog text-pebble cursor-not-allowed'
                : 'bg-snow border-fog text-graphite hover:bg-fog'
              }`}
            disabled={mesOffset === 0}
          >
            →
          </button>
        </div>

        {/* Gráficas */}
        <div className="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-2">
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
            <h2 className="mb-1 font-semibold text-obsidian">Movimientos Mensuales</h2>
            <p className="mb-4 text-xs text-steel">Ingresos vs Gastos</p>
            <GraficaMensual transacciones={transacciones} />
          </div>
          <div className="flex flex-col p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">Calendario Financiero</h2>
            <p className="mb-4 text-xs text-steel">Actividad diaria del mes</p>
            <CalendarioFinanciero transacciones={transacciones} mes={getMesActual()} />
          </div>
        </div>

        

        {/* Últimas transacciones */}
        <div className="p-6 border bg-snow border-fog rounded-card-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold text-obsidian">Últimas transacciones</h2>
              <p className="text-steel text-xs mt-0.5">{transacciones.length} este mes</p>
            </div>
            <button
              onClick={() => router.push('/transacciones')}
              className="text-sm font-medium text-graphite transition-colors hover:text-ink"
            >
              Ver todas →
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
        onClick={() => setShowForm(true)}
        className="fixed z-40 flex items-center justify-center text-2xl transition-all rounded-full text-snow bg-obsidian shadow-pill bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:bg-graphite hover:scale-110"
      >
        +
      </button>

      {showForm && (
        <FormTransaccion
          onClose={() => setShowForm(false)}
          onSuccess={cargarTransacciones}
        />
      )}
    </AppLayout>
  )
}