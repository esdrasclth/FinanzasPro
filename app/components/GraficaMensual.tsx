'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface Props {
  transacciones: any[]
}

type Agrupacion = 'dia' | 'semana' | 'mes'

const OPCIONES: { value: Agrupacion; label: string }[] = [
  { value: 'dia', label: 'Por día' },
  { value: 'semana', label: 'Por semana' },
  { value: 'mes', label: 'Por mes' },
]

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function GraficaMensual({ transacciones }: Props) {
  const router = useRouter()
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('dia')
  const [showMenu, setShowMenu] = useState(false)
  const [datosAnuales, setDatosAnuales] = useState<any[] | null>(null)

  // Año a mostrar, derivado del mes cargado (o año actual)
  const yearRef = transacciones[0]?.fecha
    ? Number(String(transacciones[0].fecha).slice(0, 4))
    : new Date().getFullYear()

  // Cargar transacciones de todo el año la primera vez que se elige "Por mes"
  useEffect(() => {
    if (agrupacion !== 'mes' || datosAnuales) return
    let cancelado = false
    const cargarAnual = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('transactions')
        .select('monto, tipo, fecha, categories(nombre)')
        .eq('user_id', user.id)
        .gte('fecha', `${yearRef}-01-01`)
        .lte('fecha', `${yearRef}-12-31`)
      if (!cancelado) setDatosAnuales(data || [])
    }
    cargarAnual()
    return () => { cancelado = true }
  }, [agrupacion, datosAnuales, yearRef])

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 0 }).format(n)

  // El "Saldo inicial" es una apertura de cartera, no un movimiento del mes: se excluye.
  const esMovimiento = (t: any) => t.categories?.nombre !== 'Saldo inicial'
  const movimientos = transacciones.filter(esMovimiento)

  const ingresosTotal = movimientos
    .filter(t => t.tipo === 'ingreso')
    .reduce((s, t) => s + Number(t.monto), 0)
  const gastosTotal = movimientos
    .filter(t => t.tipo === 'gasto')
    .reduce((s, t) => s + Number(t.monto), 0)

  // Determinar mes/año a partir de las transacciones (o mes actual)
  const ref = transacciones[0]?.fecha
    ? new Date(transacciones[0].fecha + 'T12:00:00')
    : new Date()
  const year = ref.getFullYear()
  const month = ref.getMonth()
  const diasEnMes = new Date(year, month + 1, 0).getDate()

  // Acumular por día
  const porDia = new Map<number, { ingreso: number; gasto: number }>()
  for (let d = 1; d <= diasEnMes; d++) porDia.set(d, { ingreso: 0, gasto: 0 })
  movimientos.forEach(t => {
    const dia = Number(String(t.fecha).slice(8, 10))
    const entry = porDia.get(dia)
    if (!entry) return
    if (t.tipo === 'ingreso') entry.ingreso += Number(t.monto)
    else if (t.tipo === 'gasto') entry.gasto += Number(t.monto)
  })

  let datos: { label: string | number; ingreso: number; gasto: number }[]
  let ticks: (string | number)[]

  if (agrupacion === 'mes') {
    const fuente = (datosAnuales ?? transacciones).filter(esMovimiento)
    const meses = Array.from({ length: 12 }, () => ({ ingreso: 0, gasto: 0 }))
    fuente.forEach(t => {
      const m = Number(String(t.fecha).slice(5, 7)) - 1
      if (m < 0 || m > 11) return
      if (t.tipo === 'ingreso') meses[m].ingreso += Number(t.monto)
      else if (t.tipo === 'gasto') meses[m].gasto += Number(t.monto)
    })
    datos = meses.map((v, m) => ({ label: MESES_CORTOS[m], ingreso: v.ingreso, gasto: v.gasto }))
    ticks = datos.map(d => d.label)
  } else if (agrupacion === 'semana') {
    const semanas = new Map<number, { ingreso: number; gasto: number }>()
    porDia.forEach((v, dia) => {
      const semana = Math.ceil(dia / 7)
      const entry = semanas.get(semana) || { ingreso: 0, gasto: 0 }
      entry.ingreso += v.ingreso
      entry.gasto += v.gasto
      semanas.set(semana, entry)
    })
    datos = Array.from(semanas.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([s, v]) => ({ label: `Sem ${s}`, ingreso: v.ingreso, gasto: v.gasto }))
    ticks = datos.map(d => d.label)
  } else {
    datos = Array.from(porDia.entries()).map(([dia, v]) => ({
      label: dia,
      ingreso: v.ingreso,
      gasto: v.gasto,
    }))
    ticks = Array.from(new Set([1, 5, 10, 15, 20, 25, diasEnMes])).filter(d => d <= diasEnMes)
  }

  const labelActual = OPCIONES.find(o => o.value === agrupacion)?.label

  if (ingresosTotal === 0 && gastosTotal === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="mb-3 text-4xl">📈</span>
        <p className="text-sm text-steel">Sin datos para mostrar</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Filtro superior derecho */}
      <div className="absolute z-10 top-6 right-6">
        <button
          onClick={() => setShowMenu(v => !v)}
          className="inline-flex items-center gap-1.5 py-1.5 pl-3 pr-2 text-xs font-medium transition-colors border rounded-full text-graphite border-fog bg-snow hover:bg-mist"
        >
          {labelActual}
          <ChevronDown size={14} strokeWidth={2} className={showMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[9rem]">
              {OPCIONES.map(o => (
                <button
                  key={o.value}
                  onClick={() => { setAgrupacion(o.value); setShowMenu(false) }}
                  className={`block w-full px-3 py-1.5 text-xs font-medium text-left transition-colors hover:bg-mist ${
                    agrupacion === o.value ? 'text-ink' : 'text-steel'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex items-center justify-end gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
          <span className="text-xs font-medium text-steel">Ingresos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-xs font-medium text-steel">Gastos</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={datos} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid vertical={false} stroke="#ececee" />
          <XAxis
            dataKey="label"
            ticks={ticks}
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `L ${formatMonto(v)}`}
            width={60}
          />
          <Tooltip
            formatter={(value: any, name: any) => [
              `L ${formatMonto(Number(value) || 0)}`,
              name === 'ingreso' ? 'Ingresos' : 'Gastos',
            ]}
            labelFormatter={(l) => (agrupacion === 'dia' ? `Día ${l}` : `${l}`)}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #ececee',
              borderRadius: 16,
              color: '#18181b',
            }}
            labelStyle={{ color: '#71717a' }}
          />
          <Line
            type="monotone"
            dataKey="ingreso"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="gasto"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Ver reporte completo */}
      <div className="flex justify-center mt-4">
        <button
          onClick={() => router.push('/reportes')}
          className="inline-flex items-center gap-1 py-2 pl-4 pr-3 text-sm font-medium transition-colors rounded-full text-graphite bg-mist hover:bg-fog hover:text-ink"
        >
          Ver reporte completo
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
