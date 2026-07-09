'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X } from 'lucide-react'

interface Props {
  presupuesto?: any
  tipo?: 'gasto' | 'ingreso'
  mes?: number
  anio?: number
  onClose: () => void
  onSuccess: () => void
}

export default function FormPresupuesto({ presupuesto, tipo = 'gasto', mes, anio, onClose, onSuccess }: Props) {
  const [categorias, setCategorias] = useState<any[]>([])
  const [categoriaId, setCategoriaId] = useState(presupuesto?.category_id || '')
  const [montoLimite, setMontoLimite] = useState(
    presupuesto?.monto_limite?.toString() || ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mesActual = mes ?? new Date().getMonth() + 1
  const añoActual = anio ?? new Date().getFullYear()
  const esEdicion = !!presupuesto
  const esIngreso = (presupuesto?.categories?.tipo || tipo) === 'ingreso'

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    cargarCategorias()
  }, [tipo])

  const cargarCategorias = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},es_sistema.eq.true`)
      .eq('tipo', tipo)
      .order('nombre')

    setCategorias(data || [])
  }

  const principales = categorias.filter(c => !c.parent_id)
  const subcategorias = (parentId: string) => categorias.filter(c => c.parent_id === parentId)

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
        setError(esIngreso
          ? 'Ya tienes una meta para esta categoría este mes'
          : 'Ya tienes un presupuesto para esta categoría este mes')
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
              {esEdicion
                ? (esIngreso ? 'Editar meta de ingreso' : 'Editar presupuesto')
                : (esIngreso ? 'Nueva meta de ingreso' : 'Nuevo presupuesto')}
            </h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">

          {/* Categoría */}
          {!esEdicion && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">
                Categoría o subcategoría
              </label>
              <div className="space-y-1.5 overflow-y-auto max-h-64 pr-1">
                {principales.length === 0 && (
                  <p className="py-6 text-sm text-center text-ash">
                    No hay categorías de {esIngreso ? 'ingreso' : 'gasto'} disponibles
                  </p>
                )}
                {principales.map(cat => {
                  const subs = subcategorias(cat.id)
                  const tieneSubs = subs.length > 0
                  return (
                    <div key={cat.id}>
                      <button
                        type="button"
                        disabled={tieneSubs}
                        onClick={() => setCategoriaId(cat.id)}
                        title={tieneSubs ? 'Asigna el presupuesto en sus subcategorías' : undefined}
                        className={`flex items-center w-full gap-2.5 px-3 py-2 text-sm text-left transition-all border rounded-xl ${
                          tieneSubs
                            ? 'border-fog text-ash cursor-not-allowed opacity-70'
                            : categoriaId === cat.id
                            ? 'border-obsidian bg-obsidian/5 text-ink font-medium'
                            : 'border-fog text-steel hover:border-pebble'
                        }`}
                      >
                        <span className="text-lg">{cat.icono || '📦'}</span>
                        <span className="truncate">{cat.nombre}</span>
                        {tieneSubs && (
                          <span className="ml-auto text-xs text-ash whitespace-nowrap">Elige una subcategoría</span>
                        )}
                      </button>
                      {subs.map(sub => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setCategoriaId(sub.id)}
                          className={`flex items-center w-full gap-2.5 pl-8 pr-3 py-1.5 mt-1 text-sm text-left transition-all border rounded-xl ${
                            categoriaId === sub.id
                              ? 'border-obsidian bg-obsidian/5 text-ink font-medium'
                              : 'border-fog text-steel hover:border-pebble'
                          }`}
                        >
                          <span className="flex-shrink-0 w-1 h-1 rounded-full bg-pebble" />
                          <span className="text-base">{sub.icono || '📦'}</span>
                          <span className="truncate">{sub.nombre}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
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
              {esIngreso ? 'Meta mensual de ingreso' : 'Límite mensual'}
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