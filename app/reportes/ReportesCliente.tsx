'use client'

import { useEffect, useState, useRef } from 'react'
import AppLayout from '../components/AppLayout'
import { SkeletonChart, SkeletonList } from '../components/Skeleton'
import { useMoneda } from '../lib/moneda-context'
import { Encabezado, Hero } from '../components/Encabezado'
import { TrendingUp, TrendingDown, PiggyBank, Scale } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'

interface Props {
  usuario: any
  transaccionesIniciales: any[]
}

export default function ReportesCliente({ usuario, transaccionesIniciales }: Props) {
  const [transacciones, setTransacciones] = useState<any[]>(transaccionesIniciales)
  const [loading, setLoading] = useState(false)
  const [periodo, setPeriodo] = useState('3') // meses hacia atrás
  const { simbolo } = useMoneda()

  // El periodo inicial ya viene del servidor; solo se recarga al cambiarlo.
  const primeraCarga = useRef(true)
  useEffect(() => {
    if (primeraCarga.current) { primeraCarga.current = false; return }
    cargarDatos(periodo)
  }, [periodo])

  // El filtrado y la normalización de moneda los hace el servidor.
  const cargarDatos = async (meses: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reportes?meses=${meses}`)
      if (res.ok) {
        const json = await res.json()
        setTransacciones(json.transacciones || [])
      }
    } finally {
      setLoading(false)
    }
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 0 }).format(n)

  const formatMontoCompleto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  // ── Datos para gráfica de línea (evolución mensual) ──
  const evolucionMensual = (() => {
    const meses: any = {}
    transacciones.forEach(t => {
      const mes = t.fecha.slice(0, 7)
      if (!meses[mes]) meses[mes] = { mes, ingresos: 0, gastos: 0, ahorro: 0 }
      if (t.tipo === 'ingreso') meses[mes].ingresos += Number(t.monto)
      if (t.tipo === 'gasto') meses[mes].gastos += Number(t.monto)
    })
    return Object.values(meses).map((m: any) => ({
      ...m,
      ahorro: m.ingresos - m.gastos,
      label: new Date(m.mes + '-01').toLocaleDateString('es-HN', {
        month: 'short', year: '2-digit'
      })
    }))
  })()

  // ── Top categorías de gastos ──
  const topCategorias = (() => {
    const cats: any = {}
    transacciones
      .filter(t => t.tipo === 'gasto')
      .forEach(t => {
        const nombre = t.categories?.nombre || 'Sin categoría'
        const icono = t.categories?.icono || '📦'
        if (!cats[nombre]) cats[nombre] = { nombre, icono, total: 0, count: 0 }
        cats[nombre].total += Number(t.monto)
        cats[nombre].count += 1
      })
    return Object.values(cats)
      .sort((a: any, b: any) => b.total - a.total)
      .slice(0, 6)
  })()

  // ── Datos para dona de categorías ──
  const COLORES = ['#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899']

  // ── Totales generales ──
  const totalIngresos = transacciones
    .filter(t => t.tipo === 'ingreso')
    .reduce((acc, t) => acc + Number(t.monto), 0)

  const totalGastos = transacciones
    .filter(t => t.tipo === 'gasto')
    .reduce((acc, t) => acc + Number(t.monto), 0)

  const ahorro = totalIngresos - totalGastos
  const tasaAhorro = totalIngresos > 0
    ? ((ahorro / totalIngresos) * 100).toFixed(1)
    : '0'

  const promedioGastoMensual = evolucionMensual.length > 0
    ? totalGastos / evolucionMensual.length
    : 0

  // ── Día de la semana con más gastos ──
  const gastosPorDia = (() => {
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const totales = Array(7).fill(0)
    transacciones
      .filter(t => t.tipo === 'gasto')
      .forEach(t => {
        const dia = new Date(t.fecha + 'T12:00:00').getDay()
        totales[dia] += Number(t.monto)
      })
    return dias.map((nombre, i) => ({ nombre, total: totales[i] }))
  })()

  const diaMasGasto = gastosPorDia.reduce(
    (max, d) => d.total > max.total ? d : max,
    { nombre: '-', total: 0 }
  )

  if (loading) {
    return (
      <AppLayout usuario={usuario}>
        <div className="max-w-[1728px] px-6 py-8 mx-auto space-y-6">
          <div className="w-48 h-8 rounded bg-fog animate-pulse" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="p-5 border bg-snow border-fog rounded-card animate-pulse">
                <div className="w-2/3 h-3 mb-4 rounded bg-fog" />
                <div className="w-1/2 rounded h-7 bg-fog" />
              </div>
            ))}
          </div>
          <SkeletonChart />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SkeletonList items={4} />
            <SkeletonChart />
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout usuario={usuario}>
      <div className="max-w-[1728px] p-4 mx-auto sm:p-6 lg:p-8">

        <Encabezado
          seccion="Reportes"
          titulo="Análisis de tus finanzas"
          acciones={
            <div className="flex p-1 border bg-snow border-fog rounded-full">
              {[
                { valor: '1', label: '1M' },
                { valor: '3', label: '3M' },
                { valor: '6', label: '6M' },
                { valor: '12', label: '1A' },
              ].map(op => (
                <button
                  key={op.valor}
                  onClick={() => setPeriodo(op.valor)}
                  className={`px-3 sm:px-4 py-2.5 rounded-full text-sm font-medium sm:py-2 transition-all ${periodo === op.valor
                    ? 'bg-obsidian text-snow shadow-pill'
                    : 'text-steel hover:text-ink'
                    }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          }
        />

        <Hero
          titulo="Resumen del periodo"
          subtitulo={`Últimos ${periodo === '12' ? '12' : periodo} ${periodo === '1' ? 'mes' : 'meses'}`}
          metricas={[
            {
              icon: TrendingUp,
              label: 'Total ingresos',
              valor: `${simbolo} ${formatMonto(totalIngresos)}`,
              nota: <span className="text-emerald-300">Recibido en el periodo</span>,
            },
            {
              icon: TrendingDown,
              label: 'Total gastos',
              valor: `${simbolo} ${formatMonto(totalGastos)}`,
              nota: <span className="text-red-300">Gastado en el periodo</span>,
            },
            {
              icon: PiggyBank,
              label: 'Tasa de ahorro',
              valor: `${tasaAhorro}%`,
              nota: (
                <span className={parseFloat(tasaAhorro) >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {parseFloat(tasaAhorro) >= 0 ? 'Estás ahorrando' : 'Gastas más de lo que entra'}
                </span>
              ),
            },
            {
              icon: Scale,
              label: 'Gasto promedio',
              valor: `${simbolo} ${formatMonto(promedioGastoMensual)}`,
              nota: <span className="text-white/50">por mes</span>,
            },
          ]}
        />

        {/* Evolución mensual */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card-lg">
          <h2 className="mb-1 font-semibold text-obsidian">Evolución mensual</h2>
          <p className="mb-6 text-xs text-steel">Ingresos, gastos y ahorro por mes</p>
          {evolucionMensual.length === 0 ? (
            <p className="py-8 text-sm text-center text-steel">Sin datos para mostrar</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={evolucionMensual}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ececee" />
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={{ stroke: '#ececee' }} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={{ stroke: '#ececee' }} tickLine={false} tickFormatter={(v) => `${simbolo}${formatMonto(v)}`} width={75} />
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined) => [
                    `${simbolo} ${formatMontoCompleto(Number(value) || 0)}`,
                    name === 'ingresos' ? '💰 Ingresos' : name === 'gastos' ? '💸 Gastos' : '💧 Ahorro'
                  ]}
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                  labelStyle={{ color: '#71717a' }}
                />
                <Legend formatter={(v) => v === 'ingresos' ? '💰 Ingresos' : v === 'gastos' ? '💸 Gastos' : '💧 Ahorro'} wrapperStyle={{ color: '#71717a', fontSize: '12px' }} />
                <Line type="monotone" dataKey="ingresos" stroke="#059669" strokeWidth={2} dot={{ fill: '#059669', r: 4 }} />
                <Line type="monotone" dataKey="gastos" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 4 }} />
                <Line type="monotone" dataKey="ahorro" stroke="#09090b" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#09090b', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">

          {/* Top categorías */}
          <div className="p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">Top categorías de gasto</h2>
            <p className="mb-4 text-xs text-steel">Las que más consumen tu dinero</p>
            {topCategorias.length === 0 ? (
              <p className="py-8 text-sm text-center text-steel">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {(topCategorias as any[]).map((cat: any, i: number) => {
                  const porcentaje = totalGastos > 0
                    ? (cat.total / totalGastos) * 100
                    : 0
                  return (
                    <div key={cat.nombre}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{cat.icono}</span>
                          <span className="text-sm text-graphite">{cat.nombre}</span>
                          <span className="text-xs text-ash">({cat.count})</span>
                        </div>
                        <span className="text-sm font-medium text-ink">
                          {simbolo} {formatMonto(cat.total)}
                        </span>
                      </div>
                      <div className="w-full bg-fog rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${porcentaje}%`,
                            backgroundColor: COLORES[i % COLORES.length]
                          }}
                        />
                      </div>
                      <p className="text-ash text-xs mt-0.5">
                        {porcentaje.toFixed(1)}% del total
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Gastos por día de la semana */}
          <div className="p-6 border bg-snow border-fog rounded-card">
            <h2 className="mb-1 font-semibold text-obsidian">Gastos por día</h2>
            <p className="mb-4 text-xs text-steel">
              Día con más gastos: <span className="font-medium text-ink">{diaMasGasto.nombre}</span>
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gastosPorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ececee" />
                <XAxis dataKey="nombre" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={{ stroke: '#ececee' }} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={{ stroke: '#ececee' }} tickLine={false} tickFormatter={(v) => `${simbolo}${formatMonto(v)}`} width={65} />
                <Tooltip
                  formatter={(value: number | undefined) => [`${simbolo} ${formatMontoCompleto(Number(value) || 0)}`, 'Gastos']}
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                  labelStyle={{ color: '#71717a' }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {gastosPorDia.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.nombre === diaMasGasto.nombre ? '#09090b' : '#d4d4d8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>

        {/* Insight automático */}
        <div className="p-6 border bg-snow border-fog rounded-card">
          <p className="mb-3 font-semibold text-obsidian">💡 Análisis automático</p>
          <div className="space-y-2">
            {parseFloat(tasaAhorro) >= 20 && (
              <p className="text-sm text-graphite">
                ✅ Excelente — estás ahorrando el <span className="font-medium text-emerald-600">{tasaAhorro}%</span> de tus ingresos. Sigue así.
              </p>
            )}
            {parseFloat(tasaAhorro) >= 0 && parseFloat(tasaAhorro) < 20 && (
              <p className="text-sm text-graphite">
                ⚠️ Tu tasa de ahorro es <span className="font-medium text-amber-600">{tasaAhorro}%</span>. Lo ideal es ahorrar al menos el 20% de tus ingresos.
              </p>
            )}
            {parseFloat(tasaAhorro) < 0 && (
              <p className="text-sm text-graphite">
                🚨 Estás gastando más de lo que ganas. Considera revisar tus gastos en <span className="font-medium text-red-500">{(topCategorias[0] as any)?.nombre || 'tus categorías principales'}</span>.
              </p>
            )}
            {topCategorias.length > 0 && (
              <p className="text-sm text-graphite">
                📊 Tu mayor gasto es en <span className="font-medium text-ink">{(topCategorias[0] as any).icono} {(topCategorias[0] as any).nombre}</span> con <span className="font-medium text-red-500">{simbolo} {formatMontoCompleto((topCategorias[0] as any).total)}</span> en el período.
              </p>
            )}
            {diaMasGasto.total > 0 && (
              <p className="text-sm text-graphite">
                📅 Gastas más los <span className="font-medium text-ink">{diaMasGasto.nombre}</span>.
              </p>
            )}
            {transacciones.length === 0 && (
              <p className="text-sm text-steel">
                No hay suficientes datos para el período seleccionado.
              </p>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  )
}