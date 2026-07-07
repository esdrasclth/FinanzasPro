'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  presupuesto?: any
  onClose: () => void
  onSuccess: () => void
}

export default function FormPresupuesto({ presupuesto, onClose, onSuccess }: Props) {
  const [categorias, setCategorias] = useState<any[]>([])
  const [categoriaId, setCategoriaId] = useState(presupuesto?.category_id || '')
  const [montoLimite, setMontoLimite] = useState(
    presupuesto?.monto_limite?.toString() || ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mesActual = new Date().getMonth() + 1
  const añoActual = new Date().getFullYear()
  const esEdicion = !!presupuesto

  useEffect(() => {
    cargarCategorias()
  }, [])

  const cargarCategorias = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},es_sistema.eq.true`)
      .eq('tipo', 'gasto')
      .order('nombre')

    setCategorias(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!categoriaId) {
      setError('Selecciona una categoría')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (esEdicion) {
      const { error } = await supabase
        .from('budgets')
        .update({ monto_limite: parseFloat(montoLimite) })
        .eq('id', presupuesto.id)
      if (error) { setError('Error al actualizar'); setLoading(false); return }
    } else {
      // Verificar si ya existe presupuesto para esa categoría este mes
      const { data: existing } = await supabase
        .from('budgets')
        .select('id')
        .eq('user_id', user.id)
        .eq('category_id', categoriaId)
        .eq('mes', mesActual)
        .eq('año', añoActual)
        .single()

      if (existing) {
        setError('Ya tienes un presupuesto para esta categoría este mes')
        setLoading(false)
        return
      }

      const { error } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          category_id: categoriaId,
          monto_limite: parseFloat(montoLimite),
          mes: mesActual,
          año: añoActual
        })
      if (error) { setError('Error al crear'); setLoading(false); return }
    }

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="bg-snow border border-fog rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-6 border-b border-fog">
          <h2 className="text-lg font-semibold text-ink">
            {esEdicion ? 'Editar presupuesto' : 'Nuevo presupuesto'}
          </h2>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Categoría */}
          {!esEdicion && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">
                Categoría
              </label>
              <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-48">
                {categorias.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoriaId(cat.id)}
                    className={`p-2.5 rounded-xl text-xs text-center transition-all border ${
                      categoriaId === cat.id
                        ? 'border-obsidian bg-obsidian/5 text-ink'
                        : 'border-fog text-steel hover:border-pebble'
                    }`}
                  >
                    <div className="mb-1 text-lg">{cat.icono || '📦'}</div>
                    <div className="leading-tight">{cat.nombre}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {esEdicion && (
            <div className="flex items-center gap-3 p-4 bg-mist rounded-input">
              <span className="text-2xl">{presupuesto.categories?.icono}</span>
              <div>
                <p className="font-medium text-ink">{presupuesto.categories?.nombre}</p>
                <p className="text-xs text-steel">Categoría seleccionada</p>
              </div>
            </div>
          )}

          {/* Monto límite */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Límite mensual
            </label>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={montoLimite}
                onChange={(e) => setMontoLimite(e.target.value)}
                placeholder="0.00"
                min="1"
                step="0.01"
                required
                className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
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