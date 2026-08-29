'use client'

import { useState, useEffect, useCallback } from 'react'
import { eliminarTransaccion, tipoCompuesto, avisoBorrado } from '../lib/transacciones'
import { Trash2, Info } from 'lucide-react'
import IconoCategoria from './IconoCategoria'
import { emitirCambio } from '../lib/datos-bus'

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

  // Transferencia o abono: tienen contraparte, así que no se editan aquí.
  const compuesto = tipoCompuesto(transaccion)

  const cargarDatos = useCallback(async () => {
    const [rc, rw] = await Promise.all([
      fetch('/api/categorias').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/carteras/lista').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])
    const cats = rc?.categorias || []
    setCategorias(cats)

    // Si la categoría actual es una subcategoría, se preselecciona su padre.
    const catActual = cats.find((c: any) => c.id === transaccion.category_id)
    if (catActual?.parent_id) {
      setCategoriaId(catActual.parent_id)
      setSubcategoriaId(catActual.id)
    }

    setWallets(rw?.carteras || [])
  }, [transaccion.category_id])

  useEffect(() => {
    const timeout = window.setTimeout(cargarDatos, 0)
    return () => window.clearTimeout(timeout)
  }, [cargarDatos])

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

    const res = await fetch('/api/transacciones', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: transaccion.id,
        wallet_id: walletId,
        category_id: categoryFinal,
        monto: parseFloat(monto),
        descripcion,
        fecha,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setError(json?.error?.message || 'No se pudo actualizar')
      setLoading(false)
      return
    }

    emitirCambio('transacciones')

    onSuccess()
    onClose()
  }

  const handleEliminar = async () => {
    if (!confirm(avisoBorrado(compuesto))) return
    const { error } = await eliminarTransaccion(transaccion.id)
    if (error) { setError(error); return }
    emitirCambio('transacciones')
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

        {/* Un movimiento compuesto no se puede editar campo por campo: cambiarle
            el monto aquí dejaría descuadrada su contraparte (la otra pierna de
            la transferencia, o el avance de la deuda). Se puede eliminar entero
            y volver a registrarlo. */}
        {compuesto ? (
          <div className="p-6 space-y-4">
            <div className="flex gap-3 p-4 border rounded-input bg-mist border-fog">
              <Info size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5 text-steel" />
              <div className="text-sm">
                <p className="font-medium text-ink">
                  {compuesto === 'transferencia'
                    ? 'Esto es una transferencia entre tus carteras'
                    : 'Esto es un abono a una deuda'}
                </p>
                <p className="mt-1 text-graphite">
                  {compuesto === 'transferencia'
                    ? 'Son dos movimientos ligados: la salida de una cartera y la entrada en la otra. Editar solo este lado dejaría las carteras descuadradas.'
                    : 'Está ligado al pendiente de la deuda y a su historial de pagos. Editar solo el monto aquí dejaría la deuda descuadrada.'}
                </p>
                <p className="mt-2 text-graphite">
                  Para corregirlo, elimínalo y vuelve a registrarlo
                  {compuesto === 'abono' ? ' desde la pantalla de Deudas.' : '.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleEliminar}
                className="inline-flex items-center justify-center gap-2 py-3 font-medium text-red-600 transition-colors border border-red-200 rounded-full bg-red-50 hover:bg-red-100"
              >
                <Trash2 size={16} strokeWidth={2} /> Eliminar
              </button>
            </div>
          </div>
        ) : (
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
                  <div className="flex justify-center mb-1"><IconoCategoria nombre={cat.icono} size={18} /></div>
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
                    <div className="flex justify-center mb-1"><IconoCategoria nombre={sub.icono} size={18} /></div>
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
        )}
      </div>
    </div>
  )
}
