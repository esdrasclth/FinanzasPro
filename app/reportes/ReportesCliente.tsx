'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import AppLayout from '../components/AppLayout'
import { useMoneda } from '../lib/moneda-context'
import { Encabezado, Hero } from '../components/Encabezado'
import {
  TrendingUp, TrendingDown, PiggyBank, Scale, ArrowUpRight, ArrowDownRight,
  Minus, CalendarRange, Wallet, Lightbulb, Loader2, Info,
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts'
import { finMesDesplazado, inicioMesDesplazado, fechaHoyLocal } from '../lib/fecha'
import type { DatosReportes, MovimientoReporte } from '../lib/reportes-server'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Lo bastante corto para que el gráfico se lea enseguida tras cambiar de periodo.
const ANIM = 450

// Respaldo para categorías sin color propio.
const PALETA = ['#2c6e49', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#0D9488', '#6366F1']

interface Props {
  usuario: any
  datosIniciales: DatosReportes
}

type Preset = '1' | '3' | '6' | '12' | 'personalizado'

interface Agrupado {
  nombre: string
  icono: string | null
  color: string
  total: number
  cantidad: number
  pct: number
  previo: number
}

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000) + 1

// Variación relativa contra el periodo anterior. Sin base previa no hay
// porcentaje que valga: se devuelve null y la tarjeta lo dice con palabras.
function variacion(actual: number, previo: number): { pct: number | null; signo: 1 | 0 | -1 } {
  const dif = actual - previo
  const signo = Math.abs(dif) < 0.005 ? 0 : dif > 0 ? 1 : -1
  if (previo <= 0) return { pct: null, signo }
  return { pct: (dif / previo) * 100, signo }
}

export default function ReportesCliente({ usuario, datosIniciales }: Props) {
  const { simbolo } = useMoneda()
  const [datos, setDatos] = useState<DatosReportes>(datosIniciales)
  const [cargando, setCargando] = useState(false)
  const [preset, setPreset] = useState<Preset>('3')
  const [desde, setDesde] = useState(datosIniciales.desde)
  const [hasta, setHasta] = useState(datosIniciales.hasta)
  const [verCategorias, setVerCategorias] = useState<'gasto' | 'ingreso'>('gasto')
  const [todasLasCategorias, setTodasLasCategorias] = useState(false)

  // El primer periodo llega resuelto del Server Component. A partir de ahí cada
  // cambio consulta la API, con una pausa para no disparar una petición por
  // cada tecla del campo de fecha.
  const primeraCarga = useRef(true)
  useEffect(() => {
    if (primeraCarga.current) { primeraCarga.current = false; return }
    if (!desde || !hasta || desde > hasta) return

    const id = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/reportes?desde=${desde}&hasta=${hasta}`)
        if (res.ok) setDatos(await res.json())
      } finally {
        setCargando(false)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [desde, hasta])

  const aplicarPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'personalizado') return
    const hoy = fechaHoyLocal()
    setDesde(inicioMesDesplazado(hoy, -(Number(p) - 1)))
    setHasta(finMesDesplazado(hoy))
  }

  const cambiarFecha = (cual: 'desde' | 'hasta', valor: string) => {
    setPreset('personalizado')
    if (cual === 'desde') setDesde(valor)
    else setHasta(valor)
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 }).format(n)
  const fmtExacto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  // Los ejes se saturan con miles: 12.4k se lee mejor que 12,400.
  const fmtEje = (n: number) =>
    Math.abs(n) >= 1000 ? `${simbolo}${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${simbolo}${fmt(n)}`

  const analisis = useMemo(() => {
    const trans: MovimientoReporte[] = datos.transacciones
    const ingresos = trans.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)
    const gastosMovs = trans.filter(t => t.tipo === 'gasto')
    const gastos = gastosMovs.reduce((s, t) => s + t.monto, 0)
    const balance = ingresos - gastos
    const tasaAhorro = ingresos > 0 ? (balance / ingresos) * 100 : 0

    const prev = datos.anterior
    const tasaPrevia = prev.ingresos > 0 ? ((prev.ingresos - prev.gastos) / prev.ingresos) * 100 : 0

    const dias = diasEntre(datos.desde, datos.hasta)
    // Con un mes o menos, un punto por mes no dibuja nada: se agrupa por día.
    const porDia = dias <= 45

    const cubos = new Map<string, { ingresos: number; gastos: number }>()
    for (const t of trans) {
      const k = porDia ? t.fecha : t.fecha.slice(0, 7)
      const c = cubos.get(k) || { ingresos: 0, gastos: 0 }
      if (t.tipo === 'ingreso') c.ingresos += t.monto
      else c.gastos += t.monto
      cubos.set(k, c)
    }
    // Por mes, la línea es el ahorro de cada mes. Por día no serviría de nada
    // —salta de +32.000 el día del sueldo a −8.500 el del alquiler—, así que
    // ahí lleva el acumulado, que sí enseña cómo evolucionó el dinero.
    let acumulado = 0
    const evolucion = [...cubos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => {
        acumulado += v.ingresos - v.gastos
        return {
          clave: k,
          label: porDia
            ? `${Number(k.slice(8))} ${MESES_CORTOS[Number(k.slice(5, 7)) - 1]}`
            : `${MESES_CORTOS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`,
          ingresos: v.ingresos,
          gastos: v.gastos,
          linea: porDia ? acumulado : v.ingresos - v.gastos,
        }
      })

    // Agrupación por categoría del tipo que se esté mirando.
    const agrupar = (tipo: 'gasto' | 'ingreso'): Agrupado[] => {
      const total = tipo === 'gasto' ? gastos : ingresos
      const mapa = new Map<string, Agrupado>()
      let i = 0
      for (const t of trans) {
        if (t.tipo !== tipo) continue
        const nombre = t.categoria.nombre
        const linea = mapa.get(nombre) || {
          nombre,
          icono: t.categoria.icono,
          color: t.categoria.color || PALETA[i++ % PALETA.length],
          total: 0,
          cantidad: 0,
          pct: 0,
          previo: tipo === 'gasto' ? (prev.porCategoria[nombre] || 0) : 0,
        }
        linea.total += t.monto
        linea.cantidad++
        mapa.set(nombre, linea)
      }
      return [...mapa.values()]
        .map(l => ({ ...l, pct: total > 0 ? (l.total / total) * 100 : 0 }))
        .sort((a, b) => b.total - a.total)
    }

    const porCategoria = agrupar('gasto')
    const porIngreso = agrupar('ingreso')

    const carteras = new Map<string, number>()
    for (const t of gastosMovs) carteras.set(t.cartera, (carteras.get(t.cartera) || 0) + t.monto)
    const porCartera = [...carteras.entries()]
      .map(([nombre, total]) => ({ nombre, total, pct: gastos > 0 ? (total / gastos) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)

    // Categorías que más cambiaron respecto al periodo anterior: es lo que
    // explica por qué un mes salió distinto del otro.
    const cambios = porCategoria
      .filter(c => c.previo > 0 || c.total > 0)
      .map(c => ({ ...c, dif: c.total - c.previo }))
      .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))

    const mesCaro = [...evolucion].sort((a, b) => b.gastos - a.gastos)[0] || null

    return {
      ingresos, gastos, balance, tasaAhorro, tasaPrevia,
      evolucion, porDia, porCategoria, porIngreso, porCartera, cambios, mesCaro,
      dias,
      gastoDiario: dias > 0 ? gastos / dias : 0,
      gastoMedioPorCubo: evolucion.length > 0 ? gastos / evolucion.length : 0,
      movimientos: trans.length,
    }
  }, [datos])

  const varIngresos = variacion(analisis.ingresos, datos.anterior.ingresos)
  const varGastos = variacion(analisis.gastos, datos.anterior.gastos)
  const varBalance = variacion(analisis.balance, datos.anterior.ingresos - datos.anterior.gastos)

  // En gastos, subir es malo; en ingresos y ahorro, es bueno.
  const Delta = ({ v, invertido = false }: { v: ReturnType<typeof variacion>; invertido?: boolean }) => {
    if (v.signo === 0) return <span className="text-white/50">Igual que el periodo anterior</span>
    // Sin nada con qué comparar no hay mejora ni empeoramiento: ni flecha ni color.
    if (v.pct === null) return <span className="text-white/50">Sin datos en el periodo anterior</span>
    const bueno = invertido ? v.signo < 0 : v.signo > 0
    const Icono = v.signo > 0 ? ArrowUpRight : ArrowDownRight
    return (
      <span className={`inline-flex items-center gap-1 ${bueno ? 'text-emerald-300' : 'text-red-300'}`}>
        <Icono size={14} strokeWidth={2.5} />
        {Math.abs(v.pct).toFixed(1)}% vs. periodo anterior
      </span>
    )
  }

  const categoriasVista = verCategorias === 'gasto' ? analisis.porCategoria : analisis.porIngreso
  const visibles = todasLasCategorias ? categoriasVista : categoriasVista.slice(0, 6)
  const totalVista = verCategorias === 'gasto' ? analisis.gastos : analisis.ingresos

  const etiquetaLinea = analisis.porDia ? 'Acumulado' : 'Ahorro'
  const rangoInvalido = !desde || !hasta || desde > hasta
  const sinDatos = analisis.movimientos === 0

  const etiquetaPeriodo = `${fechaCorta(datos.desde)} — ${fechaCorta(datos.hasta)}`

  const tooltipComun = {
    contentStyle: {
      backgroundColor: '#ffffff', border: '1px solid #ececee',
      borderRadius: 14, color: '#18181b', fontSize: 12,
    },
    labelStyle: { color: '#71717a', marginBottom: 4 },
  }

  const PRESETS: { id: Preset; label: string }[] = [
    { id: '1', label: '1M' },
    { id: '3', label: '3M' },
    { id: '6', label: '6M' },
    { id: '12', label: '1A' },
  ]

  return (
    <AppLayout usuario={usuario}>
      <div className="max-w-[1728px] p-4 mx-auto sm:p-6 lg:p-8">

        <Encabezado
          seccion="Reportes"
          titulo="Análisis de tus finanzas"
          acciones={
            <div className="flex items-center gap-2">
              {cargando && <Loader2 size={16} className="animate-spin text-steel" />}
              <div className="flex p-1 border bg-snow border-fog rounded-full">
                {PRESETS.map(op => (
                  <button
                    key={op.id}
                    onClick={() => aplicarPreset(op.id)}
                    className={`px-3 sm:px-4 py-2.5 rounded-full text-sm font-medium sm:py-2 transition-all ${
                      preset === op.id ? 'bg-obsidian text-snow shadow-pill' : 'text-steel hover:text-ink'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
                <button
                  onClick={() => aplicarPreset('personalizado')}
                  aria-label="Periodo personalizado"
                  className={`px-3 py-2.5 rounded-full sm:py-2 transition-all ${
                    preset === 'personalizado' ? 'bg-obsidian text-snow shadow-pill' : 'text-steel hover:text-ink'
                  }`}
                >
                  <CalendarRange size={16} />
                </button>
              </div>
            </div>
          }
        />

        {preset === 'personalizado' && (
          <div className="flex flex-wrap items-end gap-3 p-4 mb-5 border bg-snow border-fog rounded-card sm:mb-8">
            <label className="flex-1 min-w-[9rem]">
              <span className="block mb-1.5 text-xs font-medium text-steel">Desde</span>
              <input
                type="date" value={desde} max={hasta || undefined}
                onChange={e => cambiarFecha('desde', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
              />
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="block mb-1.5 text-xs font-medium text-steel">Hasta</span>
              <input
                type="date" value={hasta} min={desde || undefined}
                onChange={e => cambiarFecha('hasta', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
              />
            </label>
            {rangoInvalido && (
              <p className="text-xs font-medium text-red-500">La fecha inicial debe ser anterior a la final.</p>
            )}
          </div>
        )}

        <Hero
          titulo="Resumen del periodo"
          subtitulo={`${etiquetaPeriodo} · ${analisis.movimientos} ${analisis.movimientos === 1 ? 'movimiento' : 'movimientos'}`}
          metricas={[
            {
              icon: TrendingUp,
              label: 'Ingresos',
              valor: `${simbolo}${fmt(analisis.ingresos)}`,
              nota: <Delta v={varIngresos} />,
            },
            {
              icon: TrendingDown,
              label: 'Gastos',
              valor: `${simbolo}${fmt(analisis.gastos)}`,
              nota: <Delta v={varGastos} invertido />,
            },
            {
              icon: Scale,
              label: 'Balance',
              valor: `${simbolo}${fmt(analisis.balance)}`,
              nota: <Delta v={varBalance} />,
            },
            {
              icon: PiggyBank,
              label: 'Tasa de ahorro',
              valor: `${analisis.tasaAhorro.toFixed(1)}%`,
              nota: (
                <span className={analisis.tasaAhorro >= analisis.tasaPrevia ? 'text-emerald-300' : 'text-red-300'}>
                  Antes {analisis.tasaPrevia.toFixed(1)}%
                </span>
              ),
            },
          ]}
        />

        {sinDatos ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <p className="font-medium text-graphite">No hay movimientos en este periodo</p>
            <p className="mt-1 text-sm text-ash">
              Prueba con un rango más amplio o registra algún movimiento.
            </p>
          </div>
        ) : (
          <div className={`space-y-5 transition-opacity ${cargando ? 'opacity-50' : ''}`}>

            {/* Evolución */}
            <section className="p-5 border bg-snow border-fog rounded-card sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
                <div>
                  <h2 className="font-semibold text-obsidian">
                    Evolución {analisis.porDia ? 'diaria' : 'mensual'}
                  </h2>
                  <p className="text-xs text-steel">
                    Barras de ingresos y gastos, línea de {etiquetaLinea.toLowerCase()}. La raya marca
                    el gasto medio ({simbolo}{fmt(analisis.gastoMedioPorCubo)}).
                  </p>
                </div>
                <p className="text-xs text-ash">
                  Gasto medio diario: <span className="font-medium text-graphite">{simbolo}{fmt(analisis.gastoDiario)}</span>
                </p>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={analisis.evolucion} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ececee" vertical={false} />
                  <XAxis
                    dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={{ stroke: '#ececee' }} tickLine={false}
                    interval="preserveStartEnd" minTickGap={16}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false}
                    tickLine={false} tickFormatter={fmtEje} width={58}
                  />
                  <Tooltip
                    {...tooltipComun}
                    formatter={(value: any, name: any) => [
                      `${simbolo}${fmtExacto(Number(value) || 0)}`,
                      name === 'ingresos' ? 'Ingresos' : name === 'gastos' ? 'Gastos' : etiquetaLinea,
                    ]}
                  />
                  <ReferenceLine y={analisis.gastoMedioPorCubo} stroke="#a1a1aa" strokeDasharray="4 4" />
                  {/* La animación por defecto de recharts dura 1,5 s por serie y se
                      reinicia con cada cambio de periodo: deja el gráfico ilegible
                      justo cuando se acaba de pedir el dato. */}
                  <Bar dataKey="ingresos" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={ANIM} />
                  <Bar dataKey="gastos" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={ANIM} />
                  <Line type="monotone" dataKey="linea" stroke="#09090b" strokeWidth={2} dot={{ r: 3, fill: '#09090b' }} animationDuration={ANIM} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-steel">
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm bg-emerald-600" /> Ingresos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Gastos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-4 h-0.5 bg-obsidian" /> {etiquetaLinea}
                </span>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

              {/* Distribución por categoría */}
              <section className="p-5 border lg:col-span-3 bg-snow border-fog rounded-card sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="font-semibold text-obsidian">Distribución por categoría</h2>
                    <p className="text-xs text-steel">
                      {categoriasVista.length} {categoriasVista.length === 1 ? 'categoría' : 'categorías'} en el periodo
                    </p>
                  </div>
                  <div className="flex gap-1 p-1 bg-mist rounded-full">
                    {(['gasto', 'ingreso'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setVerCategorias(t)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          verCategorias === t ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'
                        }`}
                      >
                        {t === 'gasto' ? 'Gastos' : 'Ingresos'}
                      </button>
                    ))}
                  </div>
                </div>

                {categoriasVista.length === 0 ? (
                  <p className="py-10 text-sm text-center text-steel">
                    Sin {verCategorias === 'gasto' ? 'gastos' : 'ingresos'} en el periodo
                  </p>
                ) : (
                  <div className="grid items-center grid-cols-1 gap-5 sm:grid-cols-2">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          // Al alternar gastos/ingresos cambia el número de porciones y
                          // la animación de recharts deja el anillo colapsado a medias.
                          // Con la clave se remonta limpio y sin animar no hay estado
                          // intermedio que se pueda quedar atascado.
                          key={verCategorias}
                          isAnimationActive={false}
                          data={categoriasVista} dataKey="total" nameKey="nombre"
                          cx="50%" cy="50%" innerRadius={58} outerRadius={92}
                          // Con una sola categoría el hueco se come el anillo entero.
                          paddingAngle={categoriasVista.length > 1 ? 2 : 0}
                        >
                          {categoriasVista.map(c => <Cell key={c.nombre} fill={c.color} />)}
                        </Pie>
                        <Tooltip
                          {...tooltipComun}
                          formatter={(value: any, name: any) => [`${simbolo}${fmtExacto(Number(value) || 0)}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="space-y-2.5">
                      {visibles.map(c => (
                        <div key={c.nombre} className="flex items-center gap-2.5">
                          <i className="flex-shrink-0 w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                          <span className="text-sm truncate text-graphite">
                            {c.icono} {c.nombre}
                          </span>
                          <span className="ml-auto text-xs whitespace-nowrap text-ash">{c.pct.toFixed(1)}%</span>
                          <span className="text-sm font-medium whitespace-nowrap text-ink w-[7.5rem] text-right">
                            {simbolo}{fmt(c.total)}
                          </span>
                        </div>
                      ))}
                      {categoriasVista.length > 6 && (
                        <button
                          onClick={() => setTodasLasCategorias(v => !v)}
                          className="pt-1 text-xs font-medium text-steel hover:text-ink"
                        >
                          {todasLasCategorias
                            ? 'Ver solo las 6 principales'
                            : `Ver las ${categoriasVista.length} categorías`}
                        </button>
                      )}
                      <p className="pt-2 text-xs border-t text-ash border-fog">
                        Total: <span className="font-medium text-graphite">{simbolo}{fmtExacto(totalVista)}</span>
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* Qué cambió respecto al periodo anterior */}
              <section className="p-5 border lg:col-span-2 bg-snow border-fog rounded-card sm:p-6">
                <h2 className="font-semibold text-obsidian">Qué cambió</h2>
                <p className="mb-5 text-xs text-steel">
                  Gasto por categoría contra {fechaCorta(datos.anterior.desde)} — {fechaCorta(datos.anterior.hasta)}
                </p>
                {analisis.cambios.length === 0 ? (
                  <p className="py-10 text-sm text-center text-steel">Sin gastos que comparar</p>
                ) : (
                  <div className="space-y-3">
                    {analisis.cambios.slice(0, 7).map(c => {
                      const sube = c.dif > 0
                      const nuevo = c.previo === 0
                      const desaparece = c.total === 0
                      return (
                        <div key={c.nombre} className="flex items-center gap-3">
                          <span className="text-sm truncate text-graphite">{c.icono} {c.nombre}</span>
                          <span className="flex-1" />
                          <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                            desaparece ? 'text-steel' : sube ? 'text-red-500' : 'text-emerald-600'
                          }`}>
                            {Math.abs(c.dif) < 0.005
                              ? <Minus size={13} />
                              : sube ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                            {simbolo}{fmt(Math.abs(c.dif))}
                          </span>
                          <span className="text-xs whitespace-nowrap text-ash w-14 text-right">
                            {Math.abs(c.dif) < 0.005
                              ? 'igual'
                              : nuevo ? 'nueva'
                              : desaparece ? 'sin gasto'
                              : `${c.dif > 0 ? '+' : ''}${((c.dif / c.previo) * 100).toFixed(0)}%`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

              {/* Gasto por cartera */}
              <section className="p-5 border bg-snow border-fog rounded-card sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet size={16} className="text-steel" />
                  <h2 className="font-semibold text-obsidian">De dónde sale el gasto</h2>
                </div>
                <p className="mb-5 text-xs text-steel">Reparto del gasto entre tus carteras</p>
                {analisis.porCartera.length === 0 ? (
                  <p className="py-8 text-sm text-center text-steel">Sin gastos en el periodo</p>
                ) : (
                  <div className="space-y-3.5">
                    {analisis.porCartera.map(c => (
                      <div key={c.nombre}>
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <span className="text-sm truncate text-graphite">{c.nombre}</span>
                          <span className="text-sm font-medium whitespace-nowrap text-ink">
                            {simbolo}{fmt(c.total)}
                            <span className="ml-2 text-xs font-normal text-ash">{c.pct.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-mist">
                          <div className="h-full rounded-full bg-obsidian" style={{ width: `${Math.max(c.pct, 1.5)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Lecturas del periodo */}
              <section className="p-5 border bg-snow border-fog rounded-card sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Lightbulb size={16} className="text-steel" />
                  <h2 className="font-semibold text-obsidian">Lecturas del periodo</h2>
                </div>
                <p className="mb-5 text-xs text-steel">Lo que dicen los números, en una línea cada uno</p>
                <ul className="space-y-3">
                  {lecturas({ analisis, datos, simbolo, fmt }).map((l, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-graphite">
                      <Info size={15} className="flex-shrink-0 mt-0.5 text-ash" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

// Frases derivadas de los propios datos. Solo se emiten las que aplican, para
// que no aparezcan consejos genéricos cuando no hay nada que decir.
function lecturas({ analisis, datos, simbolo, fmt }: {
  analisis: any
  datos: DatosReportes
  simbolo: string
  fmt: (n: number) => string
}) {
  const out: React.ReactNode[] = []
  const dinero = (n: number) => <span className="font-medium text-ink">{simbolo}{fmt(n)}</span>
  const fuerte = (t: string) => <span className="font-medium text-ink">{t}</span>

  if (analisis.tasaAhorro >= 20) {
    out.push(<>Estás ahorrando el {fuerte(`${analisis.tasaAhorro.toFixed(1)}%`)} de lo que entra, por encima del 20% que se suele recomendar.</>)
  } else if (analisis.tasaAhorro >= 0) {
    out.push(<>Ahorras el {fuerte(`${analisis.tasaAhorro.toFixed(1)}%`)} de tus ingresos. Llegar al 20% supondría apartar {dinero(analisis.ingresos * 0.2 - analisis.balance)} más.</>)
  } else {
    out.push(<>Gastaste {dinero(-analisis.balance)} más de lo que ingresaste en este periodo.</>)
  }

  const top = analisis.porCategoria[0]
  if (top) {
    out.push(<>Tu mayor gasto es {fuerte(`${top.icono ?? ''} ${top.nombre}`)} con {dinero(top.total)}, el {fuerte(`${top.pct.toFixed(1)}%`)} del total.</>)
  }
  const tresPrimeras = analisis.porCategoria.slice(0, 3).reduce((s: number, c: any) => s + c.pct, 0)
  if (analisis.porCategoria.length >= 4 && tresPrimeras >= 60) {
    out.push(<>Tres categorías concentran el {fuerte(`${tresPrimeras.toFixed(0)}%`)} de tu gasto: ahí es donde un recorte se nota.</>)
  }

  const mayorSubida = analisis.cambios.find((c: any) => c.dif > 0 && c.previo > 0)
  if (mayorSubida) {
    out.push(<>Lo que más subió es {fuerte(mayorSubida.nombre)}: {dinero(mayorSubida.dif)} más que el periodo anterior ({fuerte(`+${((mayorSubida.dif / mayorSubida.previo) * 100).toFixed(0)}%`)}).</>)
  }
  const mayorBajada = analisis.cambios.find((c: any) => c.dif < 0 && c.previo > 0)
  if (mayorBajada) {
    out.push(<>Donde más recortaste fue {fuerte(mayorBajada.nombre)}: {dinero(-mayorBajada.dif)} menos que antes.</>)
  }

  if (!analisis.porDia && analisis.mesCaro && analisis.evolucion.length > 1) {
    out.push(<>El periodo más caro fue {fuerte(analisis.mesCaro.label)} con {dinero(analisis.mesCaro.gastos)} de gasto.</>)
  }
  if (analisis.gastoDiario > 0) {
    out.push(<>A este ritmo gastas {dinero(analisis.gastoDiario)} al día, unos {dinero(analisis.gastoDiario * 30)} cada 30 días.</>)
  }
  if (datos.anterior.ingresos === 0 && datos.anterior.gastos === 0) {
    out.push(<>No hay movimientos en el periodo anterior, así que las comparaciones quedan sin base.</>)
  }
  return out
}
