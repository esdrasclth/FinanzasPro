'use client'

import { Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronRight } from 'lucide-react'

interface Props {
  transacciones: any[]
  vista: 'gasto' | 'ingreso'
  onVistaChange: (v: 'gasto' | 'ingreso') => void
}

export default function GraficaGastos({ transacciones, vista, onVistaChange }: Props) {
  const router = useRouter()

  const COLORES = [
    '#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B',
    '#EF4444', '#EC4899', '#10B981', '#6366F1',
    '#F97316', '#14B8A6', '#A855F7', '#EAB308'
  ]

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const datos = transacciones
    .filter(t => t.tipo === vista && !t.wallet_destino_id && t.categories?.nombre !== 'Saldo inicial')
    .reduce((acc: any[], t) => {
      const nombre = t.categories?.nombre || 'Sin categoría'
      const icono = t.categories?.icono || '💸'
      const existing = acc.find(a => a.key === nombre)
      if (existing) {
        existing.valor += Number(t.monto)
      } else {
        acc.push({ key: nombre, nombre: `${icono} ${nombre}`, valor: Number(t.monto) })
      }
      return acc
    }, [])
    .sort((a, b) => b.valor - a.valor)

  const total = datos.reduce((s, d) => s + d.valor, 0)

  return (
    <div>
      {/* Toggle */}
      <div className="relative flex p-1 mb-6 bg-mist rounded-xl">
        {/* Indicador deslizante */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-snow shadow-soft transition-transform duration-300 ease-out"
          style={{ transform: vista === 'ingreso' ? 'translateX(100%)' : 'translateX(0)' }}
        />
        <button
          onClick={() => onVistaChange('gasto')}
          className={`relative z-10 flex-1 py-2 text-sm font-medium transition-colors ${
            vista === 'gasto' ? 'text-red-500' : 'text-steel hover:text-ink'
          }`}
        >
          Gastos
        </button>
        <button
          onClick={() => onVistaChange('ingreso')}
          className={`relative z-10 flex-1 py-2 text-sm font-medium transition-colors ${
            vista === 'ingreso' ? 'text-emerald-600' : 'text-steel hover:text-ink'
          }`}
        >
          Ingresos
        </button>
      </div>

      {datos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="mb-3 text-4xl">📊</span>
          <p className="text-sm text-steel">
            Sin {vista === 'gasto' ? 'gastos' : 'ingresos'} para mostrar
          </p>
        </div>
      ) : (
        <div>
          <div className="grid items-center gap-6 sm:grid-cols-2">
            {/* Donut */}
            <div className="relative w-[180px] h-[180px] justify-self-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datos}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={3}
                    cornerRadius={4}
                    dataKey="valor"
                    stroke="none"
                  >
                    {datos.map((_, index) => (
                      <Cell key={index} fill={COLORES[index % COLORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`L ${formatMonto(Number(value) || 0)}`, 'Monto']}
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                    labelStyle={{ color: '#71717a' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[11px] font-medium text-steel">Total</span>
                <span className="text-lg font-bold leading-tight text-ink">L {formatMonto(total)}</span>
              </div>
            </div>

            {/* Leyenda */}
            <div className="grid w-full grid-cols-[1fr_auto_2.25rem] items-center gap-x-3 gap-y-3.5">
              {datos.map((item, index) => {
                const pct = total > 0 ? Math.round((item.valor / total) * 100) : 0
                return (
                  <Fragment key={index}>
                    <div className="flex items-center min-w-0 gap-2.5">
                      <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORES[index % COLORES.length] }} />
                      <span className="text-sm truncate text-ink">{item.key}</span>
                    </div>
                    <span className="text-sm font-medium text-right text-ink whitespace-nowrap">L {formatMonto(item.valor)}</span>
                    <span className="text-xs font-medium text-right text-steel">{pct}%</span>
                  </Fragment>
                )
              })}
            </div>
          </div>

          {/* Ver todas */}
          <div className="flex justify-center mt-6">
            <button
              onClick={() => router.push('/categorias')}
              className="inline-flex items-center gap-1 py-2 pl-4 pr-3 text-sm font-medium transition-colors rounded-full text-graphite bg-mist hover:bg-fog hover:text-ink"
            >
              Ver todas las categorías
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}