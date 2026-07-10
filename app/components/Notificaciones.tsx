'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fechaHoyLocal } from '../lib/fecha'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react'

interface Notificacion {
  id: string
  tipo: 'advertencia' | 'peligro'
  titulo: string
  mensaje: string
  href: string
}

export default function Notificaciones() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [mostrar, setMostrar] = useState(false)
  const router = useRouter()

  useEffect(() => {
    cargarNotificaciones()
  }, [])

  const cargarNotificaciones = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const mesActual = new Date().getMonth() + 1
    const añoActual = new Date().getFullYear()
    const inicioMes = `${añoActual}-${String(mesActual).padStart(2, '0')}-01`

    // Cargar presupuestos del mes
    const { data: budgets } = await supabase
      .from('budgets')
      .select('*, categories(nombre, icono)')
      .eq('user_id', user.id)
      .eq('mes', mesActual)
      .eq('año', añoActual)

    if (!budgets || budgets.length === 0) return

    const nuevasNotificaciones: Notificacion[] = []

    for (const budget of budgets) {
      const { data: trans } = await supabase
        .from('transactions')
        .select('monto')
        .eq('user_id', user.id)
        .eq('category_id', budget.category_id)
        .eq('tipo', 'gasto')
        .gte('fecha', inicioMes)

      const gastado = (trans || []).reduce((acc, t) => acc + Number(t.monto), 0)
      const porcentaje = (gastado / budget.monto_limite) * 100
      const icono = budget.categories?.icono || '📦'
      const nombre = budget.categories?.nombre || 'Categoría'

      if (porcentaje >= 100) {
        nuevasNotificaciones.push({
          id: budget.id,
          tipo: 'peligro',
          titulo: `${icono} Presupuesto sobrepasado`,
          mensaje: `${nombre}: gastaste L ${gastado.toFixed(2)} de L ${Number(budget.monto_limite).toFixed(2)}`,
          href: '/presupuesto'
        })
      } else if (porcentaje >= 80) {
        nuevasNotificaciones.push({
          id: budget.id,
          tipo: 'advertencia',
          titulo: `${icono} Presupuesto al ${Math.round(porcentaje)}%`,
          mensaje: `${nombre}: te quedan L ${(Number(budget.monto_limite) - gastado).toFixed(2)}`,
          href: '/presupuesto'
        })
      }
    }

    // Verificar deudas vencidas
    const { data: deudas } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .eq('completada', false)
      .lt('fecha_limite', fechaHoyLocal())

    for (const deuda of deudas || []) {
      nuevasNotificaciones.push({
        id: 'deuda-' + deuda.id,
        tipo: 'peligro',
        titulo: '🤝 Deuda vencida',
        mensaje: `${deuda.nombre}: venció el ${new Date(deuda.fecha_limite + 'T12:00:00').toLocaleDateString('es-HN')}`,
        href: '/deudas'
      })
    }

    // Verificar tarjetas con pago próximo
    const { data: tarjetas } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('tipo', 'credito')
      .eq('activo', true)

    const hoy = new Date()
    const diaHoy = hoy.getDate()

    for (const tarjeta of tarjetas || []) {
      if (!tarjeta.fecha_pago) continue

      const diaPago = tarjeta.fecha_pago
      let diasParaPago = diaPago - diaHoy
      if (diasParaPago < 0) {
        const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
        diasParaPago = diasEnMes - diaHoy + diaPago
      }

      if (diasParaPago <= 5) {
        nuevasNotificaciones.push({
          id: 'tarjeta-' + tarjeta.id,
          tipo: diasParaPago <= 2 ? 'peligro' : 'advertencia',
          titulo: `💳 Pago próximo — ${tarjeta.nombre}`,
          mensaje: diasParaPago === 0
            ? '¡Hoy es tu fecha de pago!'
            : `Faltan ${diasParaPago} días para tu fecha de pago (día ${diaPago})`,
          href: '/carteras'
        })
      }
    }

    setNotificaciones(nuevasNotificaciones)
  }

  const cantidad = notificaciones.length

  return (
    <div className="relative">

      {/* Botón campana */}
      <button
        onClick={() => setMostrar(!mostrar)}
        className="relative flex items-center justify-center transition-colors border rounded-full w-11 h-11 bg-snow border-fog shadow-soft text-graphite hover:text-ink hover:bg-mist"
      >
        <Bell size={19} strokeWidth={2} />
        {cantidad > 0 && (
          <span className="absolute flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full -top-1 -right-1">
            {cantidad > 9 ? '9+' : cantidad}
          </span>
        )}
      </button>

      {/* Panel de notificaciones */}
      {mostrar && (
        <>
          {/* Overlay para cerrar */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMostrar(false)}
          />

          <div className="absolute right-0 z-50 overflow-hidden border shadow-soft top-12 w-80 max-w-[calc(100vw-2rem)] bg-snow border-fog rounded-card">

            <div className="flex items-center justify-between p-4 border-b border-fog">
              <h3 className="text-sm font-semibold text-ink">Notificaciones</h3>
              <span className="text-xs text-steel">{cantidad} alertas</span>
            </div>

            {cantidad === 0 ? (
              <div className="p-6 text-center">
                <CheckCircle2 size={32} strokeWidth={1.75} className="mx-auto mb-2 text-emerald-500" />
                <p className="text-sm text-graphite">Todo en orden</p>
                <p className="mt-1 text-xs text-steel">
                  No tienes alertas pendientes
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-80">
                {notificaciones.map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setMostrar(false)
                      router.push(n.href)
                    }}
                    className={`w-full text-left p-4 border-b border-fog transition-colors ${n.tipo === 'peligro' ? 'bg-red-50 hover:bg-red-100/60 border-l-2 border-l-red-500' : 'bg-amber-50 hover:bg-amber-100/60 border-l-2 border-l-amber-500'
                      }`}
                  >
                    <p className="text-sm font-medium text-ink">{n.titulo}</p>
                    <p className="text-graphite text-xs mt-0.5">{n.mensaje}</p>
                    <p className={`flex items-center gap-1 text-xs mt-1 font-medium ${n.tipo === 'peligro' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                      <AlertTriangle size={13} strokeWidth={2} />
                      {n.tipo === 'peligro' ? 'Atención requerida' : 'Revisar'}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="p-3 border-t border-fog">
              <button
                onClick={() => { setMostrar(false); router.push('/presupuesto') }}
                className="inline-flex items-center justify-center w-full gap-0.5 text-xs font-medium transition-colors text-steel hover:text-ink"
              >
                Ver todos los presupuestos
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>

          </div>
        </>
      )}
    </div>
  )
}