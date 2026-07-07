'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  deuda?: any
  onClose: () => void
  onSuccess: () => void
}

export default function FormDeuda({ deuda, onClose, onSuccess }: Props) {
  const [nombre, setNombre] = useState(deuda?.nombre || '')
  const [descripcion, setDescripcion] = useState(deuda?.descripcion || '')
  const [tipo, setTipo] = useState<'debo' | 'me_deben'>(deuda?.tipo || 'debo')
  const [montoTotal, setMontoTotal] = useState(deuda?.monto_total?.toString() || '')
  const [montoPagado, setMontoPagado] = useState(deuda?.monto_pagado?.toString() || '0')
  const [fechaLimite, setFechaLimite] = useState(deuda?.fecha_limite || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const esEdicion = !!deuda

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      nombre,
      descripcion,
      tipo,
      monto_total: parseFloat(montoTotal),
      monto_pagado: parseFloat(montoPagado) || 0,
      fecha_limite: fechaLimite || null,
      completada: deuda?.completada || false
    }

    if (esEdicion) {
      const { error } = await supabase
        .from('debts')
        .upsert({ id: deuda.id, ...payload })
      if (error) { setError('Error al actualizar'); setLoading(false); return }
    } else {
      const { error } = await supabase
        .from('debts')
        .insert(payload)
      if (error) { setError('Error al crear: ' + error.message); setLoading(false); return }
    }

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="bg-snow border border-fog rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-6 border-b border-fog">
          <h2 className="text-lg font-semibold text-ink">
            {esEdicion ? 'Editar deuda' : 'Nueva deuda'}
          </h2>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-mist rounded-input">
            <button
              type="button"
              onClick={() => setTipo('debo')}
              className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                tipo === 'debo'
                  ? 'bg-red-500 text-white'
                  : 'text-steel hover:text-ink'
              }`}
            >
              💸 Yo debo
            </button>
            <button
              type="button"
              onClick={() => setTipo('me_deben')}
              className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                tipo === 'me_deben'
                  ? 'bg-emerald-500 text-white'
                  : 'text-steel hover:text-ink'
              }`}
            >
              💰 Me deben
            </button>
          </div>

          {/* Nombre */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              {tipo === 'debo' ? '¿A quién le debes?' : '¿Quién te debe?'}
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Banco Atlántida, Juan Pérez"
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Descripción
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Préstamo personal, Celular"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Monto total */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Monto total
            </label>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={montoTotal}
                onChange={(e) => setMontoTotal(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          </div>

          {/* Monto pagado */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Monto ya pagado
            </label>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={montoPagado}
                onChange={(e) => setMontoPagado(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          </div>

          {/* Fecha límite */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Fecha límite <span className="font-normal text-steel">(opcional)</span>
            </label>
            <input
              type="date"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

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
              disabled={loading}
              className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40"
            >
              {loading ? 'Guardando...' : esEdicion ? 'Actualizar' : 'Crear'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}