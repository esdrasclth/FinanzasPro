'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fechaHoyLocal } from '../lib/fecha'

interface Props {
  cartera: any
  onClose: () => void
  onSuccess: () => void
}

export default function AjusteSaldo({ cartera, onClose, onSuccess }: Props) {
  const [nuevoSaldo, setNuevoSaldo] = useState(
    cartera.saldo_actual?.toString() || '0'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const saldoActual = Number(cartera.saldo_actual) || 0
  const nuevoSaldoNum = parseFloat(nuevoSaldo) || 0
  const diferencia = nuevoSaldoNum - saldoActual
  const esIngreso = diferencia > 0

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(Math.abs(n))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (diferencia === 0) {
      setError('El saldo nuevo es igual al actual — no hay nada que ajustar')
      return
    }

    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Buscar categoría de ajuste
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('nombre', 'Ajuste de saldo')
      .eq('tipo', esIngreso ? 'ingreso' : 'gasto')
      .eq('es_sistema', true)
      .limit(1)

    let categoriaId = cats?.[0]?.id

    // Si no existe la categoría, crearla
    if (!categoriaId) {
      const { data: newCat } = await supabase
        .from('categories')
        .insert({
          nombre: 'Ajuste de saldo',
          tipo: esIngreso ? 'ingreso' : 'gasto',
          icono: '⚖️',
          color: '#64748B',
          es_sistema: true,
          user_id: user.id
        })
        .select()
        .single()
      categoriaId = newCat?.id
    }

    // Registrar la transacción de ajuste
    const { error: transError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        wallet_id: cartera.id,
        category_id: categoriaId,
        monto: Math.abs(diferencia),
        tipo: esIngreso ? 'ingreso' : 'gasto',
        descripcion: `Ajuste de saldo — ${cartera.nombre}`,
        fecha: fechaHoyLocal()
      })

    if (transError) {
      setError('Error al registrar ajuste: ' + transError.message)
      setLoading(false)
      return
    }

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md border bg-snow border-fog rounded-card">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-fog">
          <div>
            <h2 className="text-lg font-semibold text-ink">Ajuste de saldo</h2>
            <p className="text-steel text-xs mt-0.5">{cartera.nombre}</p>
          </div>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Saldo actual */}
          <div className="p-4 bg-mist rounded-input">
            <p className="mb-1 text-xs text-steel">Saldo actual registrado</p>
            <p className="text-2xl font-bold text-ink">
              L {formatMonto(saldoActual)}
            </p>
          </div>

          {/* Nuevo saldo */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              ¿Cuánto hay realmente?
            </label>
            <div className="relative">
              <span className="absolute font-medium -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={nuevoSaldo}
                onChange={(e) => setNuevoSaldo(e.target.value)}
                placeholder="0.00"
                step="0.01"
                required
                className="w-full py-3 pl-8 pr-4 text-lg text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          </div>

          {/* Preview del ajuste */}
          {nuevoSaldo !== '' && diferencia !== 0 && (
            <div className={`rounded-input p-4 border ${
              esIngreso
                ? 'bg-emerald-50 border-emerald-100'
                : 'bg-red-50 border-red-100'
            }`}>
              <p className="mb-2 text-xs text-steel">Se registrará automáticamente:</p>
              <div className="flex items-center gap-2">
                <span className="text-lg">⚖️</span>
                <div>
                  <p className={`font-semibold ${esIngreso ? 'text-emerald-600' : 'text-red-500'}`}>
                    {esIngreso ? '+' : '-'}L {formatMonto(diferencia)}
                  </p>
                  <p className="text-xs text-steel">
                    Ajuste de saldo · {esIngreso ? 'Ingreso' : 'Gasto'} · Hoy
                  </p>
                </div>
              </div>
            </div>
          )}

          {diferencia === 0 && nuevoSaldo !== '' && (
            <div className="p-3 text-center bg-mist rounded-input">
              <p className="text-sm text-steel">El saldo ya está correcto ✓</p>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || diferencia === 0}
              className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40"
            >
              {loading ? 'Ajustando...' : 'Aplicar ajuste'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}