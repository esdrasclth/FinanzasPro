'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import FormDeuda from '../components/FormDeuda'
import { SkeletonList } from '../components/Skeleton'
import FormAbono from '../components/FormAbono'
import { Pencil, Trash2 } from 'lucide-react'

export default function Deudas() {
  const router = useRouter()
  const [deudas, setDeudas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deudaEditar, setDeudaEditar] = useState<any>(null)
  const [filtro, setFiltro] = useState<'todas' | 'debo' | 'me_deben'>('todas')
  const [deudaAbonar, setDeudaAbonar] = useState<any>(null)
  const [showAbono, setShowAbono] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarDeudas()
    }
    checkUser()
  }, [router])

  const cargarDeudas = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .order('completada', { ascending: true })
      .order('created_at', { ascending: false })

    setDeudas(data || [])
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta deuda?')) return
    await supabase.from('debts').delete().eq('id', id)
    cargarDeudas()
  }

  const actualizarMonto = async (id: string, monto: number) => {
    const { data, error } = await supabase
      .from('debts')
      .update({ monto_total: monto })
      .eq('id', id)

    if (error) console.error(error)
    else console.log('Deuda actualizada', data)
  }

  const handleCompletar = async (deuda: any) => {
    const { data, error } = await supabase
      .from('debts')
      .upsert({
        id: deuda.id,
        completada: !deuda.completada,
        user_id: deuda.user_id // Importante incluir la PK y campos obligatorios en upsert
      })

    if (error) {
      console.error("Error actualizando deuda:", error)
      return
    }

    cargarDeudas()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const deudaFiltradas = deudas.filter(d =>
    filtro === 'todas' ? true : d.tipo === filtro
  )

  const totalDebo = deudas
    .filter(d => d.tipo === 'debo' && !d.completada)
    .reduce((acc, d) => acc + Number(d.monto_total) - Number(d.monto_pagado), 0)

  const totalMeDeben = deudas
    .filter(d => d.tipo === 'me_deben' && !d.completada)
    .reduce((acc, d) => acc + Number(d.monto_total) - Number(d.monto_pagado), 0)

  const porcentajePagado = (deuda: any) => {
    if (!deuda.monto_total) return 0
    return Math.min((deuda.monto_pagado / deuda.monto_total) * 100, 100)
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] px-6 py-8 mx-auto space-y-6">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="p-6 border bg-snow border-fog rounded-card animate-pulse">
                <div className="w-2/3 h-3 mb-4 rounded-badge bg-fog" />
                <div className="w-1/2 h-8 rounded-badge bg-fog" />
              </div>
            ))}
          </div>
          <SkeletonList items={3} />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-obsidian">Deudas y Préstamos</h1>
          <p className="mt-1 text-sm text-steel">
            Controla lo que debes y lo que te deben
          </p>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-6 border bg-snow border-fog rounded-card">
            <p className="mb-1 text-xs font-medium text-steel">Lo que debo</p>
            <p className="text-3xl font-bold text-red-500">
              L {formatMonto(totalDebo)}
            </p>
            <p className="mt-1 text-xs text-ash">
              {deudas.filter(d => d.tipo === 'debo' && !d.completada).length} deudas activas
            </p>
          </div>
          <div className="p-6 border bg-snow border-fog rounded-card">
            <p className="mb-1 text-xs font-medium text-steel">Lo que me deben</p>
            <p className="text-3xl font-bold text-emerald-600">
              L {formatMonto(totalMeDeben)}
            </p>
            <p className="mt-1 text-xs text-ash">
              {deudas.filter(d => d.tipo === 'me_deben' && !d.completada).length} préstamos activos
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex p-1 mb-6 border bg-snow border-fog rounded-full w-fit">
          {[
            { valor: 'todas', label: '📋 Todas' },
            { valor: 'debo', label: '💸 Debo' },
            { valor: 'me_deben', label: '💰 Me deben' },
          ].map(op => (
            <button
              key={op.valor}
              onClick={() => setFiltro(op.valor as any)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${filtro === op.valor
                ? 'bg-obsidian text-snow'
                : 'text-steel hover:text-ink'
                }`}
            >
              {op.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {deudaFiltradas.length === 0 ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <span className="block mb-4 text-5xl">🤝</span>
            <p className="text-steel">No hay deudas registradas</p>
            <p className="mt-1 text-sm text-ash">Agrega una con el botón +</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deudaFiltradas.map(deuda => {
              const pendiente = Number(deuda.monto_total) - Number(deuda.monto_pagado)
              const porcentaje = porcentajePagado(deuda)
              const vencida = deuda.fecha_limite &&
                new Date(deuda.fecha_limite) < new Date() &&
                !deuda.completada

              return (
                <div
                  key={deuda.id}
                  className={`bg-snow border rounded-card p-6 transition-all ${deuda.completada
                    ? 'border-fog opacity-60'
                    : vencida
                      ? 'border-red-300'
                      : 'border-fog hover:border-pebble'
                    }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl ${deuda.tipo === 'debo' ? 'bg-red-50' : 'bg-emerald-50'}`}>
                        {deuda.tipo === 'debo' ? '💸' : '💰'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-ink">{deuda.nombre}</p>
                          {deuda.completada && (
                            <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-badge">
                              ✅ Pagada
                            </span>
                          )}
                          {vencida && (
                            <span className="text-xs font-medium bg-red-50 text-red-500 px-2 py-0.5 rounded-badge">
                              ⚠️ Vencida
                            </span>
                          )}
                        </div>
                        <p className="text-ash text-xs mt-0.5">
                          {deuda.tipo === 'debo' ? 'Le debo a' : 'Me debe'} · {deuda.descripcion || 'Sin descripción'}
                        </p>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2">
                      {!deuda.completada && (
                        <button
                          onClick={() => { setDeudaAbonar(deuda); setShowAbono(true) }}
                          className="px-3 py-1 text-xs font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite"
                        >
                          💳 Abonar
                        </button>
                      )}
                      <button
                        onClick={() => handleCompletar(deuda)}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${deuda.completada
                          ? 'border-pebble text-steel hover:text-ink hover:bg-fog'
                          : 'border-pebble text-graphite hover:bg-fog'
                          }`}
                      >
                        {deuda.completada ? 'Reabrir' : '✓ Completar'}
                      </button>
                      <button
                        onClick={() => { setDeudaEditar(deuda); setShowForm(true) }}
                        className="p-1 transition-colors text-ash hover:text-ink"
                        title="Editar"
                      >
                        <Pencil size={16} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleEliminar(deuda.id)}
                        className="p-1 transition-colors rounded-full text-ash hover:text-red-600 hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  {/* Montos */}
                  <div className="grid grid-cols-3 gap-2 mb-4 sm:gap-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-steel">Total</p>
                      <p className="text-sm font-semibold break-words text-obsidian sm:text-base">L {formatMonto(Number(deuda.monto_total))}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-steel">Pagado</p>
                      <p className="text-sm font-semibold break-words text-emerald-600 sm:text-base">L {formatMonto(Number(deuda.monto_pagado))}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-steel">Pendiente</p>
                      <p className={`text-sm sm:text-base font-semibold break-words ${deuda.tipo === 'debo' ? 'text-red-500' : 'text-emerald-600'}`}>
                        L {formatMonto(pendiente)}
                      </p>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full h-2 mb-2 rounded-full bg-fog">
                    <div
                      className="h-2 transition-all duration-500 bg-emerald-500 rounded-full"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-ash">{Math.round(porcentaje)}% pagado</span>
                    {deuda.fecha_limite && (
                      <span className={`text-xs ${vencida ? 'text-red-500 font-medium' : 'text-ash'}`}>
                        Vence: {new Date(deuda.fecha_limite + 'T12:00:00').toLocaleDateString('es-HN')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Botón flotante */}
      <button
        onClick={() => { setDeudaEditar(null); setShowForm(true) }}
        className="fixed z-40 flex items-center justify-center text-2xl transition-all rounded-full text-snow bg-obsidian hover:bg-graphite shadow-pill bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-110"
      >
        +
      </button>

      {showForm && (
        <FormDeuda
          deuda={deudaEditar}
          onClose={() => { setShowForm(false); setDeudaEditar(null) }}
          onSuccess={cargarDeudas}
        />
      )}

      {showAbono && deudaAbonar && (
        <FormAbono
          deuda={deudaAbonar}
          onClose={() => { setShowAbono(false); setDeudaAbonar(null) }}
          onSuccess={cargarDeudas}
        />
      )}
    </AppLayout>
  )
}
