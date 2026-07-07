'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  transacciones: any[]
}

export default function GraficaMensual({ transacciones }: Props) {
  const ingresos = transacciones
    .filter(t => t.tipo === 'ingreso')
    .reduce((sum, t) => sum + Number(t.monto), 0)

  const gastos = transacciones
    .filter(t => t.tipo === 'gasto')
    .reduce((sum, t) => sum + Number(t.monto), 0)

  const saldo = ingresos - gastos

  const datos = [
    { nombre: 'Ingresos', valor: ingresos, fill: '#059669' },
    { nombre: 'Gastos', valor: gastos, fill: '#ef4444' },
    { nombre: 'Saldo', valor: Math.abs(saldo), fill: saldo >= 0 ? '#09090b' : '#ef4444' },
  ]

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 0 }).format(n)

  const LabelMonto = (props: any) => {
    const { x, y, width, height, value } = props
    const esSaldo = props?.nombre === 'Saldo' || datos[props?.index]?.nombre === 'Saldo'
    const texto = esSaldo && saldo < 0
      ? `-L ${formatMonto(Number(value))}`
      : `L ${formatMonto(Number(value))}`

    return (
      <text
        x={x + width / 2}
        y={y + height + 35}
        fill={esSaldo && saldo < 0 ? '#ef4444' : '#71717a'}
        textAnchor="middle"
        fontSize={11}
      >
        {texto}
      </text>
    )
  }

  if (ingresos === 0 && gastos === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="mb-3 text-4xl">📈</span>
        <p className="text-sm text-steel">Sin datos para mostrar</p>
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={datos} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ececee" />
          <XAxis
            dataKey="nombre"
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={{ stroke: '#ececee' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={{ stroke: '#ececee' }}
            tickLine={false}
            tickFormatter={(v) => `L${formatMonto(v)}`}
            width={75}
          />
          <Tooltip
            formatter={(value: number | undefined, _name: any, props: any) => {
              const esSaldo = props?.payload?.nombre === 'Saldo'
              const val = Number(value) || 0
              const texto = esSaldo && saldo < 0 ? `-L ${formatMonto(val)}` : `L ${formatMonto(val)}`
              return [texto]
            }}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #ececee',
              borderRadius: 16,
              color: '#18181b'
            }}
            labelStyle={{ color: '#71717a' }}
          />
          <Bar dataKey="valor" radius={[6, 6, 0, 0]} label={<LabelMonto />}>
            {datos.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}