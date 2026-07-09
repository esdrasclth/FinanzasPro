'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X } from 'lucide-react'

interface Props {
  meta?: any
  onClose: () => void
  onSuccess: () => void
}

const ICONOS = ['🎯', '🏠', '🚗', '✈️', '🎓', '💍', '📱', '💻', '🏖️', '🚨', '👶', '🎁']

const COLORES = [
  '#2c6e49', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EF4444', '#EC4899', '#10B981', '#6366F1',
]

export default function FormMeta({ meta, onClose, onSuccess }: Props) {
  const [nombre, setNombre] = useState(meta?.nombre || '')
  const [icono, setIcono] = useState(meta?.icono || '🎯')
  const [color, setColor] = useState(meta?.color || '#2c6e49')
  const [montoObjetivo, setMontoObjetivo] = useState(meta?.monto_objetivo?.toString() || '')
  const [montoActual, setMontoActual] = useState(meta?.monto_actual?.toString() || '0')
  const [fechaLimite, setFechaLimite] = useState(meta?.fecha_limite || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const esEdicion = !!meta

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const objetivo = parseFloat(montoObjetivo)
    const actual = parseFloat(montoActual) || 0
    if (!objetivo || objetivo <= 0) { setError('Ingresa un objetivo válido'); setLoading(false); return }
    if (actual > objetivo) { setError('Lo ahorrado no puede superar el objetivo'); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      nombre,
      icono,
      color,
      monto_objetivo: objetivo,
      monto_actual: actual,
      fecha_limite: fechaLimite || null,
      completada: actual >= objetivo,
    }

    if (esEdicion) {
      const { error } = await supabase.from('metas').upsert({ id: meta.id, ...payload })
      if (error) { setError('Error al actualizar'); setLoading(false); return }
    } else {
      const { error } = await supabase.from('metas').insert(payload)
      if (error) { setError('Error al crear: ' + error.message); setLoading(false); return }
    }

    onSuccess()
    onClose()
  }

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/40 backdrop-blur-sm animate-fade sm:items-center sm:p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-snow w-full max-w-md max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-card sm:border sm:border-fog animate-sheet pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">

        <div className="sticky top-0 z-10 bg-snow/95 backdrop-blur">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-pebble" />
          </div>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-fog sm:px-6 sm:py-4">
            <h2 className="text-base font-semibold text-ink sm:text-lg">
              {esEdicion ? 'Editar meta de ahorro' : 'Nueva meta de ahorro'}
            </h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">

          {/* Nombre */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Nombre de la meta</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Fondo de emergencia, Viaje a Europa"
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Ícono */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Ícono</label>
            <div className="grid grid-cols-6 gap-2">
              {ICONOS.map(ic => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcono(ic)}
                  className={`flex items-center justify-center py-2 text-xl transition-all border rounded-xl ${
                    icono === ic ? 'border-obsidian bg-obsidian/5' : 'border-fog hover:border-pebble'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Objetivo */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Objetivo a ahorrar</label>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={montoObjetivo}
                onChange={(e) => setMontoObjetivo(e.target.value)}
                placeholder="0.00"
                min="1"
                step="0.01"
                required
                className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          </div>

          {/* Ya ahorrado */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Ya ahorrado <span className="font-normal text-steel">(opcional)</span>
            </label>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={montoActual}
                onChange={(e) => setMontoActual(e.target.value)}
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

          {/* Color */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Color</label>
            <div className="flex flex-wrap gap-3">
              {COLORES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-obsidian ring-offset-2 ring-offset-snow scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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
              className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40"
            >
              {loading ? 'Guardando...' : esEdicion ? 'Actualizar' : 'Crear'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
