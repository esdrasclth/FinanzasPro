'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { simboloMoneda } from '../lib/dinero'
import { fechaHoyLocal } from '../lib/fecha'

const gradiente = 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)'

interface Miembro { user_id: string; nombre: string }
interface Prefill { de_user_id: string; a_user_id: string; monto: number }
interface Props {
  grupoId: string
  moneda: string
  miembros: Miembro[]
  yo: string
  prefill?: Prefill | null
  onClose: () => void
  onSuccess: () => void
}

export default function FormLiquidar({ grupoId, moneda, miembros, yo, prefill, onClose, onSuccess }: Props) {
  const simbolo = simboloMoneda(moneda)
  const [deUser, setDeUser] = useState(prefill?.de_user_id || yo)
  const [aUser, setAUser] = useState(prefill?.a_user_id || miembros.find(m => m.user_id !== yo)?.user_id || '')
  const [monto, setMonto] = useState(prefill ? String(prefill.monto) : '')
  const [fecha, setFecha] = useState(fechaHoyLocal())
  const [nota, setNota] = useState('')
  const [wallets, setWallets] = useState<any[]>([])
  const [walletId, setWalletId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from('wallets').select('*').eq('user_id', yo).eq('activo', true).order('created_at', { ascending: true })
      setWallets(data || [])
      if (data && data.length > 0) setWalletId(data[0].id)
    }
    cargar()
  }, [yo])

  const yoParticipa = deUser === yo || aUser === yo
  const yoPago = deUser === yo

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (deUser === aUser) { setError('El que paga y el que recibe no pueden ser el mismo'); return }
    if (!yoParticipa) { setError('Solo puedes registrar pagos donde participas tú'); return }
    if (!(Number(monto) > 0)) { setError('Ingresa un monto válido'); return }

    setLoading(true)
    const res = await fetch(`/api/grupos/${grupoId}/liquidar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        de_user_id: deUser, a_user_id: aUser, monto: Number(monto), fecha, nota,
        wallet_id: wallets.length > 0 ? walletId : undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Error al registrar'); setLoading(false); return }
    onSuccess()
    onClose()
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/40 backdrop-blur-sm animate-fade sm:items-center sm:p-4">
      <div onClick={e => e.stopPropagation()} className="bg-snow w-full max-w-md max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-card sm:border sm:border-fog animate-sheet pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
        <div className="sticky top-0 z-10 bg-snow/95 backdrop-blur">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-pebble" />
          </div>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-fog sm:px-6 sm:py-4">
            <h2 className="text-base font-semibold text-ink sm:text-lg">Saldar cuenta</h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Paga</label>
              <select value={deUser} onChange={e => setDeUser(e.target.value)}
                className="w-full px-3 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                {miembros.map(m => <option key={m.user_id} value={m.user_id}>{m.nombre}{m.user_id === yo ? ' (yo)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Recibe</label>
              <select value={aUser} onChange={e => setAUser(e.target.value)}
                className="w-full px-3 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                {miembros.filter(m => m.user_id !== deUser).map(m => <option key={m.user_id} value={m.user_id}>{m.nombre}{m.user_id === yo ? ' (yo)' : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Monto</label>
            <div className="relative">
              <span className="absolute text-xl font-medium -translate-y-1/2 left-4 top-1/2 text-ash">{simbolo}</span>
              <input type="number" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} min="0.01" step="0.01" required placeholder="0.00"
                className="w-full py-4 pl-10 pr-4 text-2xl font-bold border bg-mist border-transparent placeholder-ash rounded-input text-obsidian focus:outline-none focus:border-obsidian focus:bg-snow" />
            </div>
          </div>

          {yoParticipa && wallets.length > 0 && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">
                {yoPago ? 'Sale de mi cartera' : 'Entra a mi cartera'}
              </label>
              <select value={walletId} onChange={e => setWalletId(e.target.value)}
                className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Nota <span className="font-normal text-steel">(opcional)</span></label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: transferencia bancaria"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
          </div>

          {error && <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">{error}</div>}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onClose} className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: gradiente }} className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40">{loading ? 'Registrando...' : 'Registrar pago'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
