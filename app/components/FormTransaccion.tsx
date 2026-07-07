'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function FormTransaccion({ onClose, onSuccess }: Props) {
  const [tipo, setTipo] = useState<'gasto' | 'ingreso' | 'transferencia'>('gasto')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [categorias, setCategorias] = useState<any[]>([])
  const [wallets, setWallets] = useState<any[]>([])
  const [walletId, setWalletId] = useState('')
  const [walletDestinoId, setWalletDestinoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const montoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { cargarDatos() }, [])
  useEffect(() => { setSubcategoriaId('') }, [categoriaId])
  useEffect(() => {
    const disponibles = wallets.filter(w => w.id !== walletId)
    if (disponibles.length > 0) {
      setWalletDestinoId(disponibles[0].id)
    } else {
      setWalletDestinoId('')
    }
  }, [walletId, wallets])

  const cargarDatos = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},es_sistema.eq.true`)
      .order('nombre')
    setCategorias(cats || [])

    let { data: walls } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('activo', true)

    if (!walls || walls.length === 0) {
      const { data: nuevaWallet } = await supabase
        .from('wallets')
        .insert({
          user_id: user.id,
          nombre: 'Efectivo',
          tipo: 'efectivo',
          saldo_inicial: 0,
          moneda: 'HNL',
          color: '#0D9488'
        })
        .select()
        .single()
      walls = nuevaWallet ? [nuevaWallet] : []
    }

    setWallets(walls || [])
    if (walls && walls.length > 0) {
      setWalletId(walls[0].id)
      setWalletDestinoId(walls.length > 1 ? walls[1].id : '')
    }
  }

  const categoriasPrincipales = categorias.filter(
    c => c.tipo === tipo && !c.parent_id
  )
  const subcategorias = categorias.filter(c => c.parent_id === categoriaId)
  const tieneSubcategorias = subcategorias.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (tipo === 'transferencia') {
      if (!walletDestinoId) {
        setError('Selecciona una cuenta destino')
        setLoading(false)
        return
      }

      let { data: catTransfer } = await supabase
        .from('categories')
        .select('id')
        .eq('nombre', 'Transferencia')
        .eq('es_sistema', true)
        .limit(1)

      let catId = catTransfer?.[0]?.id

      if (!catId) {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            nombre: 'Transferencia',
            tipo: 'gasto',
            icono: '↔️',
            color: '#6366F1',
            es_sistema: true,
            user_id: user.id
          })
          .select()
          .single()
        catId = newCat?.id
      }

      const { error: e1 } = await supabase.from('transactions').insert({
        user_id: user.id,
        wallet_id: walletId,
        category_id: catId,
        monto: parseFloat(monto),
        tipo: 'gasto',
        descripcion: descripcion || `Transferencia a ${wallets.find(w => w.id === walletDestinoId)?.nombre}`,
        fecha,
        wallet_destino_id: walletDestinoId
      })

      const { error: e2 } = await supabase.from('transactions').insert({
        user_id: user.id,
        wallet_id: walletDestinoId,
        category_id: catId,
        monto: parseFloat(monto),
        tipo: 'ingreso',
        descripcion: descripcion || `Transferencia desde ${wallets.find(w => w.id === walletId)?.nombre}`,
        fecha,
        wallet_destino_id: walletId
      })

      if (e1 || e2) {
        setError('Error al registrar transferencia')
        setLoading(false)
        return
      }

    } else {
      if (!categoriaId) {
        setError('Selecciona una categoría')
        setLoading(false)
        return
      }
      if (tieneSubcategorias && !subcategoriaId) {
        setError('Selecciona una subcategoría')
        setLoading(false)
        return
      }

      const categoryFinal = subcategoriaId || categoriaId
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        wallet_id: walletId,
        category_id: categoryFinal,
        monto: parseFloat(monto),
        tipo,
        descripcion,
        fecha
      })

      if (error) {
        setError('Error al guardar: ' + error.message)
        setLoading(false)
        return
      }
    }

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="bg-snow border border-fog rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-6 border-b border-fog">
          <h2 className="text-lg font-semibold text-ink">Nueva transacción</h2>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-mist rounded-full">
            <button type="button" onClick={() => { setTipo('gasto'); setCategoriaId('') }}
              className={`py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'gasto' ? 'bg-red-500 text-white' : 'text-steel hover:text-ink'}`}>
              💸 Gasto
            </button>
            <button type="button" onClick={() => { setTipo('ingreso'); setCategoriaId('') }}
              className={`py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'ingreso' ? 'bg-emerald-500 text-white' : 'text-steel hover:text-ink'}`}>
              💰 Ingreso
            </button>
            <button type="button" onClick={() => { setTipo('transferencia'); setCategoriaId('') }}
              className={`py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'transferencia' ? 'bg-indigo-500 text-white' : 'text-steel hover:text-ink'}`}>
              ↔️ Mover
            </button>
          </div>

          {/* Monto */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Monto (HNL)</label>
            <div
              className="relative cursor-text"
              onClick={() => montoRef.current?.focus()}
            >
              <span className="absolute text-xl font-medium -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                ref={montoRef}
                type="number"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className="w-full py-4 pl-10 pr-4 text-2xl font-bold text-obsidian transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Descripción <span className="font-normal text-steel">(opcional)</span>
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={tipo === 'transferencia' ? 'Ej: Pago de tarjeta' : '¿En qué gastaste?'}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Transferencia */}
          {tipo === 'transferencia' ? (
            <div className="p-4 space-y-4 border bg-indigo-50 border-indigo-100 rounded-input">
              <p className="text-sm font-medium text-indigo-600">↔️ Mover dinero entre cuentas</p>
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">Desde</label>
                <select value={walletId} onChange={(e) => { setWalletId(e.target.value); setWalletDestinoId('') }}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              </div>
              <div className="flex justify-center text-2xl text-indigo-500">↓</div>
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">Hacia</label>
                <select value={walletDestinoId} onChange={(e) => setWalletDestinoId(e.target.value)}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                  <option value="">— Selecciona cuenta —</option>
                  {wallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <>
              {/* Categoría */}
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">Categoría</label>
                <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-44">
                  {categoriasPrincipales.map(cat => (
                    <button key={cat.id} type="button" onClick={() => setCategoriaId(cat.id)}
                      className={`p-2.5 rounded-xl text-xs text-center transition-all border ${categoriaId === cat.id ? 'border-obsidian bg-obsidian/5 text-ink' : 'border-fog text-steel hover:border-pebble'}`}>
                      <div className="mb-1 text-lg">{cat.icono || '📦'}</div>
                      <div className="leading-tight">{cat.nombre}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subcategorías */}
              {categoriaId && tieneSubcategorias && (
                <div>
                  <label className="block mb-2 text-sm font-medium text-graphite">
                    Subcategoría <span className="font-normal text-steel">(requerida)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-36">
                    {subcategorias.map(sub => (
                      <button key={sub.id} type="button" onClick={() => setSubcategoriaId(sub.id)}
                        className={`p-2.5 rounded-xl text-xs text-center transition-all border ${subcategoriaId === sub.id ? 'border-obsidian bg-obsidian/5 text-ink' : 'border-fog text-steel hover:border-pebble'}`}>
                        <div className="mb-1 text-lg">{sub.icono || '📦'}</div>
                        <div className="leading-tight">{sub.nombre}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cartera */}
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">Cartera</label>
                <select value={walletId} onChange={(e) => { setWalletId(e.target.value); setWalletDestinoId('') }}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Fecha */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
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
              className="py-3 rounded-full bg-obsidian text-snow hover:bg-graphite font-medium shadow-pill transition-all disabled:opacity-40">
              {loading ? 'Guardando...' : tipo === 'transferencia' ? 'Mover dinero' : 'Guardar'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}