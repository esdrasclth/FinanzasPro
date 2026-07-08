'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FormGastoCompartido from './FormGastoCompartido'
import { X, TrendingUp, TrendingDown, ArrowLeftRight, ArrowDown, Users } from 'lucide-react'

interface Props {
  onClose: () => void
  onSuccess: () => void
  tipoInicial?: 'gasto' | 'ingreso' | 'transferencia'
}

interface GrupoResumen { id: string; nombre: string; moneda: string }
interface Miembro { user_id: string; nombre: string }
interface GrupoData { moneda: string; miembros: Miembro[]; yo: string }

export default function FormTransaccion({ onClose, onSuccess, tipoInicial = 'gasto' }: Props) {
  const [tipo, setTipo] = useState<'gasto' | 'ingreso' | 'transferencia'>(tipoInicial)
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

  // Gasto compartido con un grupo.
  const [grupos, setGrupos] = useState<GrupoResumen[]>([])
  const [esCompartido, setEsCompartido] = useState(false)
  const [grupoSel, setGrupoSel] = useState('')
  const [grupoData, setGrupoData] = useState<GrupoData | null>(null)
  const [cargandoGrupo, setCargandoGrupo] = useState(false)

  useEffect(() => { cargarDatos() }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (!esCompartido || !grupoSel) { setGrupoData(null); return }
    let cancelado = false
    setCargandoGrupo(true)
    setGrupoData(null)
    fetch(`/api/grupos/${grupoSel}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelado) return
        if (json) setGrupoData({ moneda: json.grupo.moneda, miembros: json.miembros, yo: json.yo })
      })
      .finally(() => { if (!cancelado) setCargandoGrupo(false) })
    return () => { cancelado = true }
  }, [esCompartido, grupoSel])
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

    const rg = await fetch('/api/grupos')
    if (rg.ok) {
      const jg = await rg.json()
      setGrupos(jg.grupos || [])
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

  // Si es gasto compartido y ya se eligió grupo, delegamos al formulario del grupo.
  if (esCompartido && grupoSel && grupoData) {
    return (
      <FormGastoCompartido
        grupoId={grupoSel}
        moneda={grupoData.moneda}
        miembros={grupoData.miembros}
        yo={grupoData.yo}
        onClose={() => setGrupoSel('')}
        onSuccess={() => { onSuccess(); onClose() }}
      />
    )
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
            <h2 className="text-base font-semibold text-ink sm:text-lg">Nueva transacción</h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">

          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-mist rounded-full">
            <button type="button" onClick={() => { setTipo('gasto'); setCategoriaId('') }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'gasto' ? 'bg-red-500 text-white' : 'text-steel hover:text-ink'}`}>
              <TrendingDown size={16} strokeWidth={2} /> Gasto
            </button>
            <button type="button" onClick={() => { setTipo('ingreso'); setCategoriaId(''); setEsCompartido(false); setGrupoSel('') }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'ingreso' ? 'bg-emerald-500 text-white' : 'text-steel hover:text-ink'}`}>
              <TrendingUp size={16} strokeWidth={2} /> Ingreso
            </button>
            <button type="button" onClick={() => { setTipo('transferencia'); setCategoriaId(''); setEsCompartido(false); setGrupoSel('') }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'transferencia' ? 'bg-violet-500 text-white' : 'text-steel hover:text-ink'}`}>
              <ArrowLeftRight size={16} strokeWidth={2} /> Mover
            </button>
          </div>

          {/* Gasto compartido */}
          {tipo === 'gasto' && grupos.length > 0 && (
            <div className="p-4 space-y-3 border bg-mist/60 border-fog rounded-input">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-medium text-graphite">
                  <Users size={16} strokeWidth={2} /> ¿Es un gasto compartido?
                </span>
                <input
                  type="checkbox"
                  checked={esCompartido}
                  onChange={(e) => { setEsCompartido(e.target.checked); if (!e.target.checked) setGrupoSel('') }}
                  className="w-4 h-4 accent-obsidian"
                />
              </label>
              {esCompartido && (
                <div>
                  <label className="block mb-2 text-sm font-medium text-graphite">¿De qué grupo?</label>
                  <select value={grupoSel} onChange={(e) => setGrupoSel(e.target.value)}
                    className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                    <option value="">— Selecciona un grupo —</option>
                    {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                  </select>
                  {cargandoGrupo && <p className="mt-2 text-xs text-ash">Cargando grupo…</p>}
                </div>
              )}
            </div>
          )}

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
            <div className="p-4 space-y-4 border bg-violet-50 border-violet-100 rounded-input">
              <p className="flex items-center gap-2 text-sm font-medium text-violet-600">
                <ArrowLeftRight size={16} strokeWidth={2} /> Mover dinero entre cuentas
              </p>
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">Desde</label>
                <select value={walletId} onChange={(e) => { setWalletId(e.target.value); setWalletDestinoId('') }}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              </div>
              <div className="flex justify-center text-violet-500"><ArrowDown size={22} strokeWidth={2} /></div>
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
              className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40">
              {loading ? 'Guardando...' : tipo === 'transferencia' ? 'Mover dinero' : 'Guardar'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}