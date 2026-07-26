'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fechaHoyLocal } from '../lib/fecha'
import { X } from 'lucide-react'
import { useMoneda } from '../lib/moneda-context'

interface Props {
  meta: any
  onClose: () => void
  onSuccess: () => void
}

export default function FormAporteMeta({ meta, onClose, onSuccess }: Props) {
  const [monto, setMonto] = useState('')
  const [wallets, setWallets] = useState<any[]>([])
  const [walletOrigen, setWalletOrigen] = useState('')
  const [walletDestino, setWalletDestino] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { simbolo } = useMoneda()

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('wallets').select('id, nombre, tipo, moneda')
        .eq('user_id', user.id).eq('activo', true)
        .order('posicion', { ascending: true })
      const lista = data || []
      setWallets(lista)
      // Por defecto: sale de la primera cartera y se guarda en una de ahorros.
      const ahorro = lista.find((w: any) => w.tipo === 'ahorro')
      const origen = lista.find((w: any) => w.id !== ahorro?.id)
      if (origen) setWalletOrigen(origen.id)
      if (ahorro) setWalletDestino(ahorro.id)
      else if (lista.length > 1) setWalletDestino(lista.find((w: any) => w.id !== origen?.id)?.id || '')
    }
    cargar()
  }, [])

  const objetivo = Number(meta.monto_objetivo)
  const actual = Number(meta.monto_actual)
  const restante = Math.max(0, objetivo - actual)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) { setError('El monto debe ser mayor a 0'); setLoading(false); return }
    if (montoNum > restante) { setError(`El aporte no puede superar lo restante (${simbolo} ${formatMonto(restante)})`); setLoading(false); return }

    if (!walletOrigen || !walletDestino) {
      setError('Elige de qué cartera sale y en cuál se guarda'); setLoading(false); return
    }

    // El servidor crea las dos transacciones y actualiza la meta en una sola
    // transacción de base de datos.
    try {
      const res = await fetch(`/api/metas/${meta.id}/aportes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto: montoNum,
          wallet_id: walletOrigen,
          wallet_destino_id: walletDestino,
          fecha: fechaHoyLocal(),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setError(json?.error?.message || 'Error al registrar el aporte')
        setLoading(false)
        return
      }
    } catch {
      setError('Error de red al registrar el aporte')
      setLoading(false)
      return
    }

    onSuccess()
    onClose()
  }

  const pct = objetivo > 0 ? Math.min((actual / objetivo) * 100, 100) : 0

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
            <div>
              <h2 className="text-base font-semibold text-ink sm:text-lg">Aportar a la meta</h2>
              <p className="text-xs text-steel mt-0.5">{meta.icono} {meta.nombre}</p>
            </div>
            <button onClick={onClose} className="flex items-center justify-center w-11 h-11 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Resumen */}
        <div className="p-4 mx-5 mt-4 sm:mx-6 bg-mist rounded-input">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-steel">Objetivo</p>
              <p className="font-medium text-ink">{simbolo} {formatMonto(objetivo)}</p>
            </div>
            <div>
              <p className="text-xs text-steel">Ahorrado</p>
              <p className="font-medium text-emerald-600">{simbolo} {formatMonto(actual)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-steel">Falta por ahorrar</p>
              <p className="text-lg font-semibold text-obsidian">{simbolo} {formatMonto(restante)}</p>
            </div>
          </div>
          <div className="w-full h-1.5 bg-fog rounded-full mt-3">
            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color || '#2c6e49' }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6">

          {/* Monto */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Monto del aporte</label>
            <div className="relative">
              <span className="absolute text-lg font-medium -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                autoFocus
                className="w-full py-4 pl-10 pr-4 text-2xl font-bold text-obsidian transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
            {restante > 0 && (
              <button
                type="button"
                onClick={() => setMonto(restante.toFixed(2))}
                className="mt-2 text-xs font-medium text-graphite hover:text-ink"
              >
                Completar meta ({simbolo} {formatMonto(restante)}) →
              </button>
            )}
          </div>

          {/* El aporte es un movimiento real de dinero: sale de una cartera y se
              guarda en otra. Antes solo subía un número y el dinero seguía
              disponible en la cuenta. */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Sale de</label>
            <select
              value={walletOrigen}
              onChange={(e) => setWalletOrigen(e.target.value)}
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            >
              <option value="">— Selecciona cartera —</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              Se guarda en <span className="font-normal text-steel">(cartera de ahorro)</span>
            </label>
            <select
              value={walletDestino}
              onChange={(e) => setWalletDestino(e.target.value)}
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            >
              <option value="">— Selecciona cartera —</option>
              {wallets.filter(w => w.id !== walletOrigen).map(w => (
                <option key={w.id} value={w.id}>{w.nombre}</option>
              ))}
            </select>
            {wallets.length < 2 && (
              <p className="mt-2 text-xs text-amber-600">
                Necesitas al menos dos carteras para apartar el ahorro. Crea una de tipo Ahorros en Carteras.
              </p>
            )}
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
              {loading ? 'Guardando...' : 'Aportar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
