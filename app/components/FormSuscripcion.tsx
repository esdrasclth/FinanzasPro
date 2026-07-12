'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X } from 'lucide-react'

interface Props {
  suscripcion?: any
  onClose: () => void
  onSuccess: () => void
}

const COLORES = [
  '#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6',
  '#EC4899', '#10B981', '#6366F1', '#2c6e49',
]

const hoyLocal = () => {
  const d = new Date()
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().split('T')[0]
}

export default function FormSuscripcion({ suscripcion, onClose, onSuccess }: Props) {
  const [categorias, setCategorias] = useState<any[]>([])
  const [nombre, setNombre] = useState(suscripcion?.nombre || '')
  const [plan, setPlan] = useState(suscripcion?.plan || '')
  const [monto, setMonto] = useState(suscripcion?.monto?.toString() || '')
  const [frecuencia, setFrecuencia] = useState<'semanal' | 'mensual' | 'trimestral' | 'anual'>(
    suscripcion?.frecuencia || 'mensual'
  )
  const [fechaInicio, setFechaInicio] = useState(suscripcion?.fecha_inicio || hoyLocal())
  const [categoriaId, setCategoriaId] = useState(suscripcion?.category_id || '')
  const [color, setColor] = useState(suscripcion?.color || COLORES[7])
  const [notas, setNotas] = useState(suscripcion?.notas || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const esEdicion = !!suscripcion

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},es_sistema.eq.true`)
        .eq('tipo', 'gasto')
        .order('nombre')
      setCategorias((data || []).filter((c: any) => !c.archivada && !c.parent_id))
    }
    cargar()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      nombre,
      plan: plan || null,
      monto: parseFloat(monto),
      moneda: 'HNL',
      frecuencia,
      category_id: categoriaId || null,
      fecha_inicio: fechaInicio,
      color,
      notas: notas || null,
      estado: suscripcion?.estado || 'activa',
    }

    if (esEdicion) {
      const { error } = await supabase
        .from('subscriptions')
        .upsert({ id: suscripcion.id, ...payload })
      if (error) { setError('Error al actualizar'); setLoading(false); return }
    } else {
      const { error } = await supabase.from('subscriptions').insert(payload)
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
              {esEdicion ? 'Editar suscripción' : 'Nueva suscripción'}
            </h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">

          {/* Nombre */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Nombre del servicio</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Netflix, Spotify, ChatGPT Plus"
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Plan */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Plan <span className="font-normal text-steel">(opcional)</span>
            </label>
            <input
              type="text"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Ej: Premium, Familiar, Individual"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Monto + Frecuencia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Monto</label>
              <div className="relative">
                <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
                <input
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                />
              </div>
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Frecuencia</label>
              <select
                value={frecuencia}
                onChange={(e) => setFrecuencia(e.target.value as any)}
                className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              >
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
          </div>

          {/* Fecha de inicio / primer cobro */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Fecha del primer cobro</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Categoría */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Categoría <span className="font-normal text-steel">(opcional)</span>
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            >
              <option value="">Sin categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.icono ? `${c.icono} ` : ''}{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-obsidian scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Notas <span className="font-normal text-steel">(opcional)</span>
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Cuenta compartida con familia"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
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
