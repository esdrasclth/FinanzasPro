'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fechaHoyLocal } from '../lib/fecha'
import { abonarDeuda, crearSubcategoriaDeuda } from '../lib/deudas'

interface Props {
  deuda: any
  onClose: () => void
  onSuccess: () => void
}

export default function FormAbono({ deuda, onClose, onSuccess }: Props) {
  const [monto, setMonto] = useState('')
  const [walletId, setWalletId] = useState('')
  const [wallets, setWallets] = useState<any[]>([])
  const [fecha, setFecha] = useState(fechaHoyLocal())
  const [nota, setNota] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargarWallets()
  }, [])

  const cargarWallets = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('activo', true)
    setWallets(data || [])
    if (data && data.length > 0) setWalletId(data[0].id)
  }

  const pendiente = Number(deuda.monto_total) - Number(deuda.monto_pagado)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const montoNum = parseFloat(monto)
    if (montoNum <= 0) { setError('El monto debe ser mayor a 0'); setLoading(false); return }
    if (montoNum > pendiente) { setError(`El monto no puede superar el pendiente de L ${pendiente.toFixed(2)}`); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Subcategoría propia de la deuda (bajo "Deudas"). Se crea si faltara
    // (deudas creadas antes de esta función) para que el abono cuente en su
    // presupuesto mensual.
    let catId = deuda.category_id
    if (!catId) {
      catId = await crearSubcategoriaDeuda(user.id, { id: deuda.id, nombre: deuda.nombre })
    }

    const { error } = await abonarDeuda({
      userId: user.id,
      deudaId: deuda.id,
      nombreDeuda: deuda.nombre,
      montoPagadoActual: Number(deuda.monto_pagado),
      montoTotal: Number(deuda.monto_total),
      walletId,
      monto: montoNum,
      fecha,
      nota,
      categoryId: catId,
    })

    if (error) { setError(error); setLoading(false); return }

    onSuccess()
    onClose()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md overflow-y-auto border bg-snow border-fog rounded-card max-h-[90vh]">

        <div className="flex items-center justify-between p-6 border-b border-fog">
          <div>
            <h2 className="text-lg font-semibold text-ink">Registrar abono</h2>
            <p className="text-xs text-steel mt-0.5">{deuda.nombre}</p>
          </div>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>

        {/* Resumen de la deuda */}
        <div className="p-4 mx-6 mt-4 bg-mist rounded-input">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-steel">Total deuda</p>
              <p className="font-medium text-ink">L {formatMonto(Number(deuda.monto_total))}</p>
            </div>
            <div>
              <p className="text-xs text-steel">Pagado</p>
              <p className="font-medium text-emerald-600">L {formatMonto(Number(deuda.monto_pagado))}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-steel">Pendiente</p>
              <p className="text-lg font-semibold text-red-500">L {formatMonto(pendiente)}</p>
            </div>
          </div>
          <div className="w-full h-1.5 bg-fog rounded-full mt-3">
            <div
              className="h-1.5 bg-emerald-500 rounded-full"
              style={{ width: `${Math.min((Number(deuda.monto_pagado) / Number(deuda.monto_total)) * 100, 100)}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Monto */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Monto del abono</label>
            <div className="relative">
              <span className="absolute text-lg font-medium -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                autoFocus
                className="w-full py-4 pl-10 pr-4 text-2xl font-bold text-obsidian transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
            <button
              type="button"
              onClick={() => setMonto(pendiente.toFixed(2))}
              className="mt-2 text-xs font-medium text-graphite hover:text-ink"
            >
              Pagar todo (L {formatMonto(pendiente)}) →
            </button>
          </div>

          {/* Cartera */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Desde cartera</label>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            >
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.nombre}</option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Nota */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Nota <span className="font-normal text-steel">(opcional)</span>
            </label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: Cuota mensual"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {error && (
            <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40">
              {loading ? 'Registrando...' : '💳 Registrar abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}