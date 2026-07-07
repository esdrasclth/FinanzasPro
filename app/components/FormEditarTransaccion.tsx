'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Trash2 } from 'lucide-react'

interface Props {
  transaccion: any
  onClose: () => void
  onSuccess: () => void
}

export default function FormEditarTransaccion({ transaccion, onClose, onSuccess }: Props) {
  const [monto, setMonto] = useState(transaccion.monto?.toString() || '')
  const [descripcion, setDescripcion] = useState(transaccion.descripcion || '')
  const [fecha, setFecha] = useState(transaccion.fecha || '')
  const [categoriaId, setCategoriaId] = useState(transaccion.category_id || '')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [categorias, setCategorias] = useState<any[]>([])
  const [wallets, setWallets] = useState<any[]>([])
  const [walletId, setWalletId] = useState(transaccion.wallet_id || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},es_sistema.eq.true`)
      .order('nombre')

    setCategorias(cats || [])

    // Detectar si la categoría actual es subcategoría
    const catActual = cats?.find(c => c.id === transaccion.category_id)
    if (catActual?.parent_id) {
      setCategoriaId(catActual.parent_id)
      setSubcategoriaId(catActual.id)
    }

    const { data: walls } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('activo', true)

    setWallets(walls || [])
  }

  const categoriasPrincipales = categorias.filter(
    c => c.tipo === transaccion.tipo && !c.parent_id
  )

  const subcategorias = categorias.filter(
    c => c.parent_id === categoriaId
  )

  const tieneSubcategorias = subcategorias.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const categoryFinal = subcategoriaId || categoriaId

    const { error } = await supabase
      .from('transactions')
      .upsert({
        id: transaccion.id,
        user_id: transaccion.user_id,
        wallet_id: walletId,
        category_id: categoryFinal,
        monto: parseFloat(monto),
        tipo: transaccion.tipo,
        descripcion,
        fecha
      })

    if (error) {
      setError('Error al actualizar: ' + error.message)
      setLoading(false)
      return
    }

    onSuccess()
    onClose()
  }

  const handleEliminar = async () => {
    if (!confirm('¿Eliminar esta transacción?')) return
    await supabase.from('transactions').delete().eq('id', transaccion.id)
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-obsidian/30 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-snow border border-fog rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-fog">
          <div>
            <h2 className="text-lg font-semibold text-ink">Editar transacción</h2>
            <p className={`text-xs mt-0.5 ${
              transaccion.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {transaccion.tipo === 'ingreso' ? '💰 Ingreso' : '💸 Gasto'}
            </p>
          </div>
          <button onClick={onClose} className="text-ash hover:text-ink text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Monto */}
          <div>
            <label className="text-graphite text-sm font-medium block mb-2">
              Monto (HNL)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ash font-medium">L</span>
              <input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className="w-full bg-mist border border-transparent text-ink placeholder-ash rounded-input pl-8 pr-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-graphite text-sm font-medium block mb-2">
              Descripción
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="¿En qué gastaste?"
              className="w-full bg-mist border border-transparent text-ink placeholder-ash rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
            />
          </div>

          {/* Categoría */}
          <div>
            <label className="text-graphite text-sm font-medium block mb-2">
              Categoría
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto">
              {categoriasPrincipales.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { setCategoriaId(cat.id); setSubcategoriaId('') }}
                  className={`p-2.5 rounded-xl text-xs text-center transition-all border ${
                    categoriaId === cat.id
                      ? 'border-obsidian bg-obsidian/5 text-ink'
                      : 'border-fog text-steel hover:border-pebble'
                  }`}
                >
                  <div className="text-lg mb-1">{cat.icono || '📦'}</div>
                  <div className="leading-tight">{cat.nombre}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Subcategorías */}
          {categoriaId && tieneSubcategorias && (
            <div>
              <label className="text-graphite text-sm font-medium block mb-2">
                Subcategoría
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                {subcategorias.map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSubcategoriaId(sub.id)}
                    className={`p-2.5 rounded-xl text-xs text-center transition-all border ${
                      subcategoriaId === sub.id
                        ? 'border-obsidian bg-obsidian/5 text-ink'
                        : 'border-fog text-steel hover:border-pebble'
                    }`}
                  >
                    <div className="text-lg mb-1">{sub.icono || '📦'}</div>
                    <div className="leading-tight">{sub.nombre}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cartera */}
          <div>
            <label className="text-graphite text-sm font-medium block mb-2">
              Cartera
            </label>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="w-full bg-mist border border-transparent text-ink rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
            >
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.nombre}</option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className="text-graphite text-sm font-medium block mb-2">
              Fecha
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-mist border border-transparent text-ink rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-input text-sm">
              {error}
            </div>
          )}

          {/* Botones */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleEliminar}
              className="inline-flex items-center justify-center gap-2 py-3 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-all font-medium"
            >
              <Trash2 size={16} strokeWidth={2} />
              Eliminar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-3 rounded-full bg-obsidian hover:bg-graphite disabled:opacity-40 text-snow font-medium shadow-pill transition-all"
            >
              {loading ? 'Guardando...' : 'Actualizar'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}