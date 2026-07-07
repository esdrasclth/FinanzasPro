'use client'

interface Props {
    transacciones: any[]
    mes: Date
}

export default function CalendarioFinanciero({ transacciones, mes }: Props) {
    const año = mes.getFullYear()
    const mesNum = mes.getMonth()

    const primerDia = new Date(año, mesNum, 1).getDay()
    const diasEnMes = new Date(año, mesNum + 1, 0).getDate()
    const hoy = new Date()

    // Ajustar para que empiece en lunes
    const offset = primerDia === 0 ? 6 : primerDia - 1

    const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

    const formatK = (n: number) => {
        if (n === 0) return '0'
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
        return Math.round(n).toString()
    }

    // Calcular gastos e ingresos por día
    const datosPorDia: Record<number, { gastos: number; ingresos: number }> = {}
    for (const t of transacciones) {
        const fecha = new Date(t.fecha + 'T12:00:00')
        if (fecha.getMonth() !== mesNum || fecha.getFullYear() !== año) continue
        const dia = fecha.getDate()
        if (!datosPorDia[dia]) datosPorDia[dia] = { gastos: 0, ingresos: 0 }
        if (t.tipo === 'gasto') datosPorDia[dia].gastos += Number(t.monto)
        if (t.tipo === 'ingreso') datosPorDia[dia].ingresos += Number(t.monto)
    }

    const maxGasto = Math.max(...Object.values(datosPorDia).map(d => d.gastos), 1)

    const celdas = []
    for (let i = 0; i < offset; i++) celdas.push(null)
    for (let d = 1; d <= diasEnMes; d++) celdas.push(d)

    const esHoy = (dia: number) =>
        dia === hoy.getDate() && mesNum === hoy.getMonth() && año === hoy.getFullYear()

    const esFuturo = (dia: number) => {
        const fecha = new Date(año, mesNum, dia)
        return fecha > hoy
    }

    const intensidad = (gastos: number) => {
        if (gastos === 0) return 0
        return Math.min(gastos / maxGasto, 1)
    }

    const getBg = (dia: number | null) => {
        if (!dia) return ''
        if (esHoy(dia)) return 'bg-obsidian'
        if (esFuturo(dia)) return 'bg-mist/50'
        const datos = datosPorDia[dia]
        if (!datos || datos.gastos === 0) return 'bg-mist hover:bg-fog'
        const int = intensidad(datos.gastos)
        if (int > 0.75) return 'bg-red-200 hover:bg-red-300'
        if (int > 0.5) return 'bg-red-100 hover:bg-red-200'
        if (int > 0.25) return 'bg-red-100/70 hover:bg-red-100'
        return 'bg-red-50 hover:bg-red-100'
    }

    return (
        <div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 gap-1 mb-1">
                {DIAS.map(d => (
                    <div key={d} className="py-1 text-xs font-medium text-center text-steel">
                        {d}
                    </div>
                ))}
            </div>

            {/* Celdas del calendario */}
            <div className="grid grid-cols-7 gap-1">
                {celdas.map((dia, i) => {
                    if (!dia) return <div key={`empty-${i}`} />

                    const datos = datosPorDia[dia]
                    const futuro = esFuturo(dia)

                    return (
                        <div
                            key={dia}
                            className={`rounded-xl p-1.5 min-h-[60px] flex flex-col items-center justify-start pt-2 transition-all ${getBg(dia)}`}
                        >
                            <span className={`text-xs font-semibold mb-1 ${esHoy(dia) ? 'text-snow' : futuro ? 'text-pebble' : 'text-graphite'}`}>
                                {dia}
                            </span>
                            {!futuro && datos && (
                                <div className="text-center">
                                    {datos.ingresos > 0 && (
                                        <p className={`${esHoy(dia) ? 'text-emerald-300' : 'text-emerald-600'} text-[10px] font-medium leading-tight`}>
                                            +{formatK(datos.ingresos)}
                                        </p>
                                    )}
                                    {datos.gastos > 0 && (
                                        <p className={`${esHoy(dia) ? 'text-snow' : 'text-red-500'} text-[10px] font-medium leading-tight`}>
                                            {formatK(datos.gastos)}
                                        </p>
                                    )}
                                </div>
                            )}
                            {!futuro && !datos && (
                                <p className={`${esHoy(dia) ? 'text-snow/60' : 'text-ash'} text-[10px]`}>0</p>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-4 mt-4 text-xs font-medium text-steel">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span>Ingresos</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-200" />
                    <span>Gastos</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border rounded bg-mist border-fog" />
                    <span>Sin actividad</span>
                </div>
            </div>
        </div>
    )
}