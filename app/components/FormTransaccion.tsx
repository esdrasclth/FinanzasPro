'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { fechaHoyLocal } from '../lib/fecha'
import { abonarDeuda } from '../lib/deudas'
import { obtenerTipoCambio, fijarTasaManual, convertir, type TipoCambio } from '../lib/tipoCambio'
import { simboloMoneda } from '../lib/dinero'
import FormGastoCompartido from './FormGastoCompartido'
import FormReparto from './FormReparto'
import { X, TrendingUp, TrendingDown, ArrowLeftRight, ArrowDown, Users, Split, RefreshCw } from 'lucide-react'

interface Props {
  onClose: () => void
  onSuccess: () => void
  tipoInicial?: 'gasto' | 'ingreso' | 'transferencia'
}

interface GrupoResumen { id: string; nombre: string; moneda: string }
interface Miembro { user_id: string; nombre: string }
interface GrupoData { moneda: string; miembros: Miembro[]; yo: string }

export default function FormTransaccion({ onClose, onSuccess, tipoInicial = 'gasto' }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState<'gasto' | 'ingreso' | 'transferencia'>(tipoInicial)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(fechaHoyLocal())
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

  // Repartir el gasto entre personas (sin grupo).
  const [deseaRepartir, setDeseaRepartir] = useState(false)

  // Conversión de moneda al mover dinero entre carteras de distinta moneda
  // (p. ej. pagar deuda en USD de una TC desde una cuenta en HNL).
  const [tc, setTc] = useState<TipoCambio | null>(null)
  const [tcCargando, setTcCargando] = useState(false)
  const [monedaDestinoTC, setMonedaDestinoTC] = useState<'HNL' | 'USD'>('USD')
  const [tasaManual, setTasaManual] = useState('')
  // Moneda del gasto/ingreso cuando la cartera maneja dos monedas (TC HNL + $).
  const [monedaGasto, setMonedaGasto] = useState<'HNL' | 'USD'>('HNL')

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
    // Las subcategorías de deudas completadas quedan archivadas: no se ofrecen
    // en el selector, pero su historial se conserva.
    setCategorias((cats || []).filter((c: any) => !c.archivada))

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

  // Cartera del gasto/ingreso: las TC (tipo credito) manejan HNL y $ a la vez.
  const walletActual = wallets.find(w => w.id === walletId)
  const actualEsCredito = walletActual?.tipo === 'credito'
  const monedaMovimiento = actualEsCredito ? monedaGasto : (walletActual?.moneda || 'HNL')

  // --- Conversión de moneda para transferencias ---
  const walletOrigen = wallets.find(w => w.id === walletId)
  const walletDestino = wallets.find(w => w.id === walletDestinoId)
  const destEsCredito = walletDestino?.tipo === 'credito'
  const monedaOrigen = walletOrigen?.moneda || 'HNL'
  // Las TC llevan deuda en HNL y USD; el usuario elige cuál paga.
  const monedaDestino = destEsCredito ? monedaDestinoTC : (walletDestino?.moneda || 'HNL')
  const necesitaConversion = tipo === 'transferencia' && !!walletDestinoId && monedaOrigen !== monedaDestino
  const tasaVigente = tc?.tasaVenta || 0
  const montoNum = parseFloat(monto) || 0
  // El monto se ingresa en la moneda de destino (lo que se paga/recibe);
  // calculamos lo que sale de la cartera origen.
  const montoOrigen = necesitaConversion && tasaVigente > 0
    ? convertir(montoNum, monedaDestino, monedaOrigen, tasaVigente)
    : montoNum

  useEffect(() => {
    if (!necesitaConversion) return
    let cancelado = false
    setTcCargando(true)
    obtenerTipoCambio().then(r => {
      if (cancelado) return
      setTc(r)
      setTcCargando(false)
    })
    return () => { cancelado = true }
  }, [necesitaConversion])

  const refrescarTasa = async () => {
    setTcCargando(true)
    const r = await obtenerTipoCambio(true)
    setTc(r)
    setTcCargando(false)
  }

  const aplicarTasaManual = async () => {
    const v = parseFloat(tasaManual)
    if (!v || v <= 0) return
    setTcCargando(true)
    const r = await fijarTasaManual(v)
    setTc(r)
    setTasaManual('')
    setTcCargando(false)
  }

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

      const conv = necesitaConversion
      if (conv && !(tasaVigente > 0)) {
        setError('No hay tasa de cambio disponible. Actualízala o ingresa una manual.')
        setLoading(false)
        return
      }

      // Origen: sale montoOrigen en su moneda. Destino: entra el monto en la moneda pagada.
      const { error: e1 } = await supabase.from('transactions').insert({
        user_id: user.id,
        wallet_id: walletId,
        category_id: catId,
        monto: montoOrigen,
        moneda: monedaOrigen,
        monto_original: conv ? montoNum : null,
        tasa_cambio: conv ? tasaVigente : null,
        tipo: 'gasto',
        descripcion: descripcion || `Transferencia a ${walletDestino?.nombre}`,
        fecha,
        wallet_destino_id: walletDestinoId
      })

      const { error: e2 } = await supabase.from('transactions').insert({
        user_id: user.id,
        wallet_id: walletDestinoId,
        category_id: catId,
        monto: montoNum,
        moneda: monedaDestino,
        monto_original: conv ? montoOrigen : null,
        tasa_cambio: conv ? tasaVigente : null,
        tipo: 'ingreso',
        descripcion: descripcion || `Transferencia desde ${walletOrigen?.nombre}`,
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

      // Si la categoría elegida es la subcategoría de una deuda activa (tipo
      // 'debo'), el gasto manual se registra como un abono real: descuenta la
      // deuda, crea el pago y la transacción ligada (debt_id).
      if (tipo === 'gasto') {
        const { data: deudaMatch } = await supabase
          .from('debts')
          .select('*')
          .eq('user_id', user.id)
          .eq('category_id', categoryFinal)
          .eq('tipo', 'debo')
          .eq('completada', false)
          .limit(1)

        const deuda = deudaMatch?.[0]
        if (deuda) {
          const montoAbono = parseFloat(monto)
          const pendiente = Number(deuda.monto_total) - Number(deuda.monto_pagado)
          if (montoAbono > pendiente) {
            setError(`El abono supera el pendiente de la deuda (L ${pendiente.toFixed(2)})`)
            setLoading(false)
            return
          }

          const { error: errAbono } = await abonarDeuda({
            userId: user.id,
            deudaId: deuda.id,
            nombreDeuda: deuda.nombre,
            montoPagadoActual: Number(deuda.monto_pagado),
            montoTotal: Number(deuda.monto_total),
            walletId,
            monto: montoAbono,
            fecha,
            categoryId: categoryFinal,
            moneda: monedaMovimiento,
            descripcion: descripcion || undefined,
          })

          if (errAbono) {
            setError(errAbono)
            setLoading(false)
            return
          }

          onSuccess()
          onClose()
          return
        }
      }

      // Se guarda en la moneda seleccionada; no se convierte al registrar
      // (la conversión ocurre solo al pagar la tarjeta).
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        wallet_id: walletId,
        category_id: categoryFinal,
        monto: parseFloat(monto),
        moneda: monedaMovimiento,
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
        descripcionInicial={descripcion}
        montoInicial={monto}
        fechaInicial={fecha}
        onClose={() => setGrupoSel('')}
        onSuccess={() => { onSuccess(); onClose() }}
      />
    )
  }

  // Si desea repartir el gasto entre personas, delegamos al formulario de reparto.
  if (deseaRepartir) {
    return (
      <FormReparto
        descripcionInicial={descripcion}
        montoInicial={monto}
        fechaInicial={fecha}
        onClose={() => setDeseaRepartir(false)}
        onSuccess={(id) => { onClose(); router.push(`/repartos/${id}`) }}
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
            <button type="button" onClick={() => { setTipo('ingreso'); setCategoriaId(''); setEsCompartido(false); setGrupoSel(''); setDeseaRepartir(false) }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'ingreso' ? 'bg-emerald-500 text-white' : 'text-steel hover:text-ink'}`}>
              <TrendingUp size={16} strokeWidth={2} /> Ingreso
            </button>
            <button type="button" onClick={() => { setTipo('transferencia'); setCategoriaId(''); setEsCompartido(false); setGrupoSel(''); setDeseaRepartir(false) }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition-all ${tipo === 'transferencia' ? 'bg-violet-500 text-white' : 'text-steel hover:text-ink'}`}>
              <ArrowLeftRight size={16} strokeWidth={2} /> Mover
            </button>
          </div>

          {/* Gasto compartido / reparto */}
          {tipo === 'gasto' && (
            <div className="p-4 space-y-3 border bg-mist/60 border-fog rounded-input">
              {grupos.length > 0 && (
                <>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-medium text-graphite">
                      <Users size={16} strokeWidth={2} /> ¿Es un gasto compartido?
                    </span>
                    <input
                      type="checkbox"
                      checked={esCompartido}
                      onChange={(e) => { setEsCompartido(e.target.checked); if (e.target.checked) setDeseaRepartir(false); else setGrupoSel('') }}
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
                </>
              )}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-medium text-graphite">
                  <Split size={16} strokeWidth={2} /> ¿Desea repartir este gasto?
                </span>
                <input
                  type="checkbox"
                  checked={deseaRepartir}
                  onChange={(e) => { setDeseaRepartir(e.target.checked); if (e.target.checked) { setEsCompartido(false); setGrupoSel('') } }}
                  className="w-4 h-4 accent-obsidian"
                />
              </label>
            </div>
          )}

          {/* Monto */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Monto ({tipo === 'transferencia' ? monedaDestino : monedaMovimiento})
              {tipo === 'transferencia' && destEsCredito && (
                <span className="font-normal text-steel"> · lo que pagas de la tarjeta</span>
              )}
            </label>
            <div
              className="relative cursor-text"
              onClick={() => montoRef.current?.focus()}
            >
              <span className="absolute text-xl font-medium -translate-y-1/2 left-4 top-1/2 text-ash">
                {simboloMoneda(tipo === 'transferencia' ? monedaDestino : monedaMovimiento)}
              </span>
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

              {/* Moneda de la deuda a pagar (las TC llevan HNL y USD) */}
              {destEsCredito && (
                <div>
                  <label className="block mb-2 text-sm font-medium text-graphite">¿Qué deuda pagas?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['HNL', 'USD'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setMonedaDestinoTC(m)}
                        className={`py-2.5 rounded-input text-sm font-medium transition-all border ${monedaDestinoTC === m ? 'border-obsidian bg-obsidian/5 text-ink' : 'border-fog text-steel hover:border-pebble'}`}>
                        {m === 'HNL' ? 'Lempiras (L)' : 'Dólares ($)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Panel de conversión cuando origen y destino son de distinta moneda */}
              {necesitaConversion && (
                <div className="p-3 space-y-2 border rounded-input bg-amber-50 border-amber-200">
                  {tcCargando ? (
                    <p className="text-sm text-amber-700">Cargando tasa de cambio…</p>
                  ) : tasaVigente > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-800">
                          Tasa {tc?.fuente === 'manual' ? 'manual' : 'BCH'}: L {tasaVigente.toFixed(4)} / $1
                        </span>
                        <button type="button" onClick={refrescarTasa}
                          className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900">
                          <RefreshCw size={12} strokeWidth={2} /> Actualizar
                        </button>
                      </div>
                      {tc?.stale && (
                        <p className="text-xs text-amber-600">⚠ No es la tasa de hoy (BCH no disponible). Revisa o fija una manual.</p>
                      )}
                      <p className="text-sm font-semibold text-amber-900">
                        Saldrán {simboloMoneda(monedaOrigen)}{montoOrigen.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de {walletOrigen?.nombre}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-amber-700">No se pudo obtener la tasa. Ingresa una manual abajo.</p>
                  )}
                  <div className="flex gap-2">
                    <input type="number" inputMode="decimal" value={tasaManual}
                      onChange={(e) => setTasaManual(e.target.value)} placeholder="Tasa manual (L/$)"
                      className="flex-1 px-3 py-2 text-sm border bg-snow border-amber-200 rounded-input focus:outline-none focus:border-amber-400" />
                    <button type="button" onClick={aplicarTasaManual}
                      className="px-3 py-2 text-sm font-medium text-white rounded-input bg-amber-600 hover:bg-amber-700 disabled:opacity-40"
                      disabled={!tasaManual}>
                      Fijar
                    </button>
                  </div>
                </div>
              )}
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

              {/* Moneda del movimiento cuando la cartera maneja dos monedas (TC) */}
              {actualEsCredito && (
                <div>
                  <label className="block mb-2 text-sm font-medium text-graphite">
                    ¿En qué moneda es {tipo === 'ingreso' ? 'el ingreso' : 'el gasto'}?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['HNL', 'USD'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setMonedaGasto(m)}
                        className={`py-2.5 rounded-input text-sm font-medium transition-all border ${monedaGasto === m ? 'border-obsidian bg-obsidian/5 text-ink' : 'border-fog text-steel hover:border-pebble'}`}>
                        {m === 'HNL' ? 'Lempiras (L)' : 'Dólares ($)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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