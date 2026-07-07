'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import FormCartera from '../components/FormCartera'
import AppLayout from '../components/AppLayout'
import AjusteSaldo from '../components/AjusteSaldo'
import { SkeletonCard } from '../components/Skeleton'
import { Pencil, Trash2, Scale } from 'lucide-react'

export default function Carteras() {
  const router = useRouter()
  const [carteras, setCarteras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [carteraEditar, setCarteraEditar] = useState<any>(null)
  const [carteraAjustar, setCarteraAjustar] = useState<any>(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarCarteras()
    }
    checkUser()
  }, [router])

  const cargarCarteras = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('activo', true)
      .order('created_at', { ascending: true })

    // Calcular saldo real de cada cartera
    const carterasConSaldo = await Promise.all(
      (data || []).map(async (cartera) => {
        const { data: trans } = await supabase
          .from('transactions')
          .select('monto, tipo')
          .eq('wallet_id', cartera.id)

        const saldo = (trans || []).reduce((acc, t) => {
          return t.tipo === 'ingreso'
            ? acc + Number(t.monto)
            : acc - Number(t.monto)
        }, Number(cartera.saldo_inicial))

        return { ...cartera, saldo_actual: saldo }
      })
    )

    setCarteras(carterasConSaldo)
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta cartera?')) return

    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Error: ' + error.message)
      return
    }
    cargarCarteras()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const valorNeto = carteras.reduce((acc, c) => acc + c.saldo_actual, 0)

  const ICONOS_TIPO: any = {
    efectivo: '💵',
    banco: '🏦',
    credito: '💳',
    ahorro: '🏆'
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-4xl px-6 py-8 mx-auto space-y-6">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 border bg-snow border-fog rounded-card animate-pulse">
              <div className="w-2/3 h-3 mb-4 rounded-badge bg-fog" />
              <div className="w-1/2 h-8 rounded-badge bg-fog" />
            </div>
            <div className="p-6 border bg-snow border-fog rounded-card animate-pulse">
              <div className="w-2/3 h-3 mb-4 rounded-badge bg-fog" />
              <div className="w-1/2 h-8 rounded-badge bg-fog" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>

      <div className="max-w-4xl px-6 py-8 mx-auto">

        {/* Valor neto total */}
        <div className={`rounded-card-lg p-8 mb-8 text-center bg-obsidian ${valorNeto >= 0
            ? ''
            : 'border border-red-500/40'
          }`}>
          <p className="mb-1 text-xs font-medium text-ash">Valor neto total</p>
          <p className={`text-5xl font-bold ${valorNeto >= 0 ? 'text-snow' : 'text-red-400'}`}>
            {valorNeto < 0 ? '-' : ''}L {formatMonto(Math.abs(valorNeto))}
          </p>
          <p className="mt-2 text-sm text-ash">
            {carteras.length} {carteras.length === 1 ? 'cartera' : 'carteras'} activas
          </p>
        </div>

        {/* Lista de carteras */}
        {carteras.length === 0 ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <span className="block mb-4 text-5xl">👛</span>
            <p className="mb-2 text-steel">No tienes carteras aún</p>
            <p className="text-sm text-ash">
              Crea tu primera cartera con el botón +
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
            {carteras.map(cartera => {
              const esTarjeta = cartera.tipo === 'credito'

              // Calcular días para próximo pago
              const hoy = new Date()
              const diaHoy = hoy.getDate()
              const diasParaPago = esTarjeta ? (() => {
                const diaPago = cartera.fecha_pago || 15
                let diff = diaPago - diaHoy
                if (diff < 0) {
                  // El pago es el mes siguiente
                  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
                  diff = diasEnMes - diaHoy + diaPago
                }
                return diff
              })() : null

              const proximoPago = diasParaPago !== null && diasParaPago <= 5
              const creditoUsado = esTarjeta && cartera.credito_limite > 0
                ? Math.abs(cartera.saldo_actual)
                : 0
              const creditoDisponible = esTarjeta && cartera.credito_limite > 0
                ? cartera.credito_limite - creditoUsado
                : 0
              const porcentajeUso = esTarjeta && cartera.credito_limite > 0
                ? (creditoUsado / cartera.credito_limite) * 100
                : 0

              return (
                <div
                  key={cartera.id}
                  className={`bg-snow border rounded-card p-6 transition-all ${proximoPago
                      ? 'border-amber-300'
                      : 'border-fog hover:border-pebble'
                    }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex items-center justify-center w-12 h-12 text-2xl rounded-2xl"
                        style={{ backgroundColor: cartera.color + '15' }}
                      >
                        {ICONOS_TIPO[cartera.tipo] || '💰'}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{cartera.nombre}</p>
                        <p className="text-xs capitalize text-ash">{cartera.tipo}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {proximoPago && (
                        <span className="px-2 py-1 text-xs font-medium text-amber-600 rounded-badge bg-amber-50">
                          ⏰ {diasParaPago === 0 ? '¡Hoy!' : `${diasParaPago}d`}
                        </span>
                      )}
                      <button
                        onClick={() => { setCarteraEditar(cartera); setShowForm(true) }}
                        className="p-1 transition-colors text-ash hover:text-ink"
                        title="Editar"
                      ><Pencil size={16} strokeWidth={2} /></button>
                      <button
                        onClick={() => setCarteraAjustar(cartera)}
                        className="p-1 transition-colors text-ash hover:text-amber-600"
                        title="Ajustar saldo"
                      >
                        <Scale size={16} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleEliminar(cartera.id)}
                        className="p-1 transition-colors rounded-full text-ash hover:text-red-600 hover:bg-red-50"
                        title="Eliminar"
                      ><Trash2 size={16} strokeWidth={2} /></button>
                    </div>
                  </div>

                  {/* Saldo */}
                  <div className="mb-4">
                    <p className="mb-1 text-xs font-medium text-steel">
                      {esTarjeta ? 'Saldo usado' : 'Saldo actual'}
                    </p>
                    <p className={`text-2xl font-bold ${cartera.saldo_actual >= 0 ? 'text-obsidian' : 'text-red-500'
                      }`}>
                      {cartera.saldo_actual < 0 ? '-' : ''}L {formatMonto(Math.abs(cartera.saldo_actual))}
                    </p>
                  </div>

                  {/* Info especial tarjeta */}
                  {esTarjeta && cartera.credito_limite > 0 && (
                    <div className="space-y-3">
                      {/* Barra de uso de crédito */}
                      <div>
                        <div className="flex justify-between mb-1 text-xs">
                          <span className="font-medium text-steel">Crédito usado</span>
                          <span className={porcentajeUso >= 80 ? 'text-red-500 font-medium' : 'text-steel'}>
                            {Math.round(porcentajeUso)}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-fog">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${porcentajeUso >= 80 ? 'bg-red-500' :
                                porcentajeUso >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                            style={{ width: `${Math.min(porcentajeUso, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-xs">
                          <span className="text-ash">
                            Disponible: <span className="text-emerald-600">L {formatMonto(creditoDisponible)}</span>
                          </span>
                          <span className="text-ash">
                            Límite: L {formatMonto(cartera.credito_limite)}
                          </span>
                        </div>
                      </div>

                      {/* Fechas */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-fog">
                        <div className="text-center">
                          <p className="text-xs font-medium text-steel">✂️ Corte</p>
                          <p className="text-sm font-medium text-ink">Día {cartera.fecha_corte}</p>
                        </div>
                        <div className={`text-center rounded-badge py-1 ${proximoPago ? 'bg-amber-50' : ''
                          }`}>
                          <p className="text-xs font-medium text-steel">💳 Pago</p>
                          <p className={`text-sm font-medium ${proximoPago ? 'text-amber-600' : 'text-ink'
                            }`}>
                            Día {cartera.fecha_pago}
                            {diasParaPago !== null && (
                              <span className="block text-xs text-ash">
                                {diasParaPago === 0 ? '¡Hoy!' : `en ${diasParaPago} días`}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!esTarjeta && (
                    <div className="pt-4 mt-4 border-t border-fog">
                      <p className="text-xs text-ash">
                        Saldo inicial: L {formatMonto(Number(cartera.saldo_inicial))}
                      </p>
                    </div>
                  )}
                </div>

              )
            })}
          </div>
        )}

      </div>

      {carteraAjustar && (
        <AjusteSaldo
          cartera={carteraAjustar}
          onClose={() => setCarteraAjustar(null)}
          onSuccess={() => {
            setCarteraAjustar(null)
            cargarCarteras()
          }}
        />
      )}

      {showForm && (
        <FormCartera
          cartera={carteraEditar}
          onClose={() => { setShowForm(false); setCarteraEditar(null) }}
          onSuccess={cargarCarteras}
        />
      )}

      {/* Botón flotante */}
      <button
        onClick={() => { setCarteraEditar(null); setShowForm(true) }}
        className="fixed flex items-center justify-center text-2xl transition-all rounded-full text-snow bg-obsidian hover:bg-graphite shadow-pill bottom-24 right-8 w-14 h-14 hover:scale-110"
      >
        +
      </button>

      {/* Modal */}
      {showForm && (
        <FormCartera
          cartera={carteraEditar}
          onClose={() => { setShowForm(false); setCarteraEditar(null) }}
          onSuccess={cargarCarteras}
        />
      )}

    </AppLayout>
  )
}
