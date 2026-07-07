'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import FormPresupuesto from '../components/FormPresupuesto'
import AppLayout from '../components/AppLayout'
import { SkeletonList } from '../components/Skeleton'
import { Pencil, Trash2 } from 'lucide-react'

export default function Presupuesto() {
  const router = useRouter()
  const [presupuestos, setPresupuestos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [presupuestoEditar, setPresupuestoEditar] = useState<any>(null)

  const mesActual = new Date().getMonth() + 1
  const añoActual = new Date().getFullYear()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarPresupuestos()
    }
    checkUser()
  }, [router])

  const cargarPresupuestos = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Cargar presupuestos del mes actual
    const { data: budgets } = await supabase
      .from('budgets')
      .select('*, categories(nombre, icono, color)')
      .eq('user_id', user.id)
      .eq('mes', mesActual)
      .eq('año', añoActual)

    // Para cada presupuesto calcular cuánto se ha gastado
    const presupuestosConGasto = await Promise.all(
      (budgets || []).map(async (budget) => {
        const inicioMes = `${añoActual}-${String(mesActual).padStart(2, '0')}-01`
        const { data: trans } = await supabase
          .from('transactions')
          .select('monto')
          .eq('user_id', user.id)
          .eq('category_id', budget.category_id)
          .eq('tipo', 'gasto')
          .gte('fecha', inicioMes)

        const gastado = (trans || []).reduce((acc, t) => acc + Number(t.monto), 0)
        const porcentaje = Math.min((gastado / budget.monto_limite) * 100, 100)

        return { ...budget, gastado, porcentaje }
      })
    )

    setPresupuestos(presupuestosConGasto)
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar este presupuesto?')) return
    await supabase.from('budgets').delete().eq('id', id)
    cargarPresupuestos()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const totalPresupuestado = presupuestos.reduce((acc, p) => acc + Number(p.monto_limite), 0)
  const totalGastado = presupuestos.reduce((acc, p) => acc + p.gastado, 0)

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-4xl px-6 py-8 mx-auto space-y-6">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-6 border bg-snow border-fog rounded-card animate-pulse">
                <div className="w-2/3 h-3 mb-4 rounded-badge bg-fog" />
                <div className="w-1/2 h-8 rounded-badge bg-fog" />
              </div>
            ))}
          </div>
          <SkeletonList items={4} />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>

      <div className="max-w-4xl px-6 py-8 mx-auto">

        {/* Resumen general */}
        <div className="p-6 mb-8 border bg-snow border-fog rounded-card">
          <div className="grid grid-cols-3 gap-2 mb-4 sm:gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-steel">Presupuestado</p>
              <p className="text-base font-bold break-words text-obsidian sm:text-xl">
                L {formatMonto(totalPresupuestado)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-steel">Gastado</p>
              <p className="text-base font-bold text-red-500 break-words sm:text-xl">
                L {formatMonto(totalGastado)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-steel">Disponible</p>
              <p className={`text-base sm:text-xl font-bold break-words ${totalPresupuestado - totalGastado >= 0
                ? 'text-emerald-600' : 'text-red-500'
                }`}>
                L {formatMonto(totalPresupuestado - totalGastado)}
              </p>
            </div>
          </div>

          {/* Barra de progreso general */}
          <div className="w-full h-3 rounded-full bg-fog">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${totalGastado / totalPresupuestado > 1 ? 'bg-red-500' :
                totalGastado / totalPresupuestado > 0.8 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
              style={{
                width: `${Math.min((totalGastado / totalPresupuestado) * 100 || 0, 100)}%`
              }}
            />
          </div>
          <p className="mt-2 text-xs text-ash">
            {totalPresupuestado > 0
              ? `${Math.round((totalGastado / totalPresupuestado) * 100)}% del presupuesto total usado`
              : 'Sin presupuesto configurado'}
          </p>
        </div>

        {/* Lista de presupuestos */}
        {presupuestos.length === 0 ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <span className="block mb-4 text-5xl">🎯</span>
            <p className="mb-2 text-steel">No hay presupuestos este mes</p>
            <p className="mb-6 text-sm text-ash">
              Crea tu primer presupuesto con el botón +
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {presupuestos.map(p => {
              const sobrePasado = p.gastado > p.monto_limite
              const advertencia = p.porcentaje >= 80 && !sobrePasado

              return (
                <div
                  key={p.id}
                  className={`bg-snow border rounded-card p-6 transition-all ${sobrePasado ? 'border-red-300' :
                    advertencia ? 'border-amber-300' :
                      'border-fog hover:border-pebble'
                    }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {p.categories?.icono || '📦'}
                      </span>
                      <div>
                        <p className="font-medium text-ink">
                          {p.categories?.nombre}
                        </p>
                        <p className="text-xs text-ash">
                          L {formatMonto(p.gastado)} de L {formatMonto(p.monto_limite)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {sobrePasado && (
                        <span className="px-2 py-1 text-xs font-medium text-red-500 rounded-badge bg-red-50">
                          Sobrepasado
                        </span>
                      )}
                      {advertencia && (
                        <span className="px-2 py-1 text-xs font-medium text-amber-600 rounded-badge bg-amber-50">
                          ⚠️ {Math.round(p.porcentaje)}%
                        </span>
                      )}
                      <button
                        onClick={() => { setPresupuestoEditar(p); setShowForm(true) }}
                        className="p-1 transition-colors text-ash hover:text-ink"
                        title="Editar"
                      >
                        <Pencil size={16} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleEliminar(p.id)}
                        className="p-1 transition-colors rounded-full text-ash hover:text-red-600 hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full bg-fog rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${sobrePasado ? 'bg-red-500' :
                        advertencia ? 'bg-amber-500' :
                          'bg-emerald-500'
                        }`}
                      style={{ width: `${p.porcentaje}%` }}
                    />
                  </div>

                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-ash">
                      {Math.round(p.porcentaje)}% usado
                    </span>
                    <span className={`text-xs font-medium ${sobrePasado ? 'text-red-500' : 'text-emerald-600'
                      }`}>
                      {sobrePasado
                        ? `L ${formatMonto(p.gastado - p.monto_limite)} sobrepasado`
                        : `L ${formatMonto(p.monto_limite - p.gastado)} restante`
                      }
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Botón flotante */}
      <button
        onClick={() => { setPresupuestoEditar(null); setShowForm(true) }}
        className="fixed z-40 flex items-center justify-center text-2xl transition-all rounded-full text-snow bg-obsidian hover:bg-graphite shadow-pill bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-110"
      >
        +
      </button>

      {showForm && (
        <FormPresupuesto
          presupuesto={presupuestoEditar}
          onClose={() => { setShowForm(false); setPresupuestoEditar(null) }}
          onSuccess={cargarPresupuestos}
        />
      )}

    </AppLayout>
  )
}
