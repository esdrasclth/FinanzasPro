'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  transacciones: any[]
  vista: 'gasto' | 'ingreso'
  onVistaChange: (v: 'gasto' | 'ingreso') => void
}

export default function GraficaGastos({ transacciones, vista, onVistaChange }: Props) {

  const COLORES = [
    '#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B',
    '#EF4444', '#EC4899', '#10B981', '#6366F1',
    '#F97316', '#14B8A6', '#A855F7', '#EAB308'
  ]

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const datos = transacciones
    .filter(t => t.tipo === vista && t.categories?.nombre !== 'Transferencia')
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

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-1 p-1 mb-4 bg-mist rounded-full">
        <button
          onClick={() => onVistaChange('gasto')}
          className={`flex-1 py-2 rounded-full text-xs font-medium transition-all ${
            vista === 'gasto' ? 'bg-red-50 text-red-600' : 'text-steel hover:text-ink'
          }`}
        >
          💸 Gastos
        </button>
        <button
          onClick={() => onVistaChange('ingreso')}
          className={`flex-1 py-2 rounded-full text-xs font-medium transition-all ${
            vista === 'ingreso' ? 'bg-emerald-50 text-emerald-600' : 'text-steel hover:text-ink'
          }`}
        >
          💰 Ingresos
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
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={datos} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="valor">
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

          <div className="mt-2 space-y-2">
            {datos.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-3 h-3 rounded-full" style={{ backgroundColor: COLORES[index % COLORES.length] }} />
                  <span className="text-sm text-graphite">{item.nombre}</span>
                </div>
                <span className="text-sm font-medium text-ink">L {formatMonto(item.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}