'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { round2, simboloMoneda } from '../lib/dinero'

const gradiente = 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)'

interface Miembro { user_id: string; nombre: string }
interface Props {
  grupoId: string
  moneda: string
  miembros: Miembro[]
  yo: string
  gasto?: any
  onClose: () => void
  onSuccess: () => void
}

type Metodo = 'igual' | 'exacto' | 'porcentaje'

export default function FormGastoCompartido({ grupoId, moneda, miembros, yo, gasto, onClose, onSuccess }: Props) {
  const simbolo = simboloMoneda(moneda)

  const metodoInicial: Metodo = gasto
    ? gasto.metodo_division === 'exacto' ? 'exacto' : gasto.metodo_division === 'porcentaje' ? 'porcentaje' : 'igual'
    : 'igual'
  const valoresIniciales: Record<string, string> = {}
  if (gasto) {
    for (const d of gasto.divisiones) {
      if (gasto.metodo_division === 'exacto') valoresIniciales[d.user_id] = String(d.monto_asignado)
      else if (gasto.metodo_division === 'porcentaje') valoresIniciales[d.user_id] = d.valor != null ? String(d.valor) : ''
    }
  }

  const [descripcion, setDescripcion] = useState(gasto?.descripcion || '')
  const [monto, setMonto] = useState(gasto ? String(gasto.monto_total) : '')
  const [fecha, setFecha] = useState(gasto ? String(gasto.fecha).slice(0, 10) : new Date().toISOString().split('T')[0])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    gasto ? new Set<string>(gasto.divisiones.map((d: any) => d.user_id)) : new Set(miembros.map(m => m.user_id))
  )
  const [metodo, setMetodo] = useState<Metodo>(metodoInicial)
  const [valores, setValores] = useState<Record<string, string>>(valoresIniciales)

  const [variosPagadores, setVariosPagadores] = useState(gasto ? gasto.pagos.length > 1 : false)
  const [pagadorUnico, setPagadorUnico] = useState(gasto && gasto.pagos.length === 1 ? gasto.pagos[0].user_id : yo)
  const [pagos, setPagos] = useState<Record<string, string>>(
    gasto ? Object.fromEntries(gasto.pagos.map((p: any) => [p.user_id, String(p.monto)])) : {}
  )

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

  const total = round2(Number(monto) || 0)
  const participantes = miembros.filter(m => seleccionados.has(m.user_id))

  const toggle = (uid: string) => {
    setSeleccionados(prev => {
      const n = new Set(prev)
      if (n.has(uid)) { if (n.size > 1) n.delete(uid) } else n.add(uid)
      return n
    })
  }

  // Vista previa: cuánto le toca a cada participante.
  const preview = useMemo(() => {
    const out: Record<string, number> = {}
    if (participantes.length === 0 || total <= 0) return out
    if (metodo === 'igual') {
      const base = round2(total / participantes.length)
      participantes.forEach(p => (out[p.user_id] = base))
      const resid = round2(total - base * participantes.length)
      if (resid !== 0) out[participantes[participantes.length - 1].user_id] = round2(base + resid)
    } else if (metodo === 'exacto') {
      participantes.forEach(p => (out[p.user_id] = round2(Number(valores[p.user_id]) || 0)))
    } else {
      const suma = participantes.reduce((s, p) => s + (Number(valores[p.user_id]) || 0), 0)
      participantes.forEach(p => (out[p.user_id] = suma > 0 ? round2((total * (Number(valores[p.user_id]) || 0)) / suma) : 0))
    }
    return out
  }, [participantes, total, metodo, valores])

  const sumaPreview = round2(Object.values(preview).reduce((s, v) => s + v, 0))
  const sumaPagos = variosPagadores
    ? round2(Object.entries(pagos).reduce((s, [, v]) => s + (Number(v) || 0), 0))
    : total

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (total <= 0) { setError('Ingresa un monto válido'); return }
    if (participantes.length === 0) { setError('Selecciona al menos un participante'); return }
    if (metodo === 'exacto' && sumaPreview !== total) { setError(`La división (${sumaPreview}) no cuadra con el total (${total})`); return }
    if (metodo === 'porcentaje') {
      const sp = participantes.reduce((s, p) => s + (Number(valores[p.user_id]) || 0), 0)
      if (sp <= 0) { setError('Ingresa los porcentajes'); return }
    }

    // Construir pagos.
    let pagosPayload: { user_id: string; monto: number; wallet_id?: string }[]
    if (variosPagadores) {
      if (sumaPagos !== total) { setError(`Lo pagado (${sumaPagos}) no cuadra con el total (${total})`); return }
      pagosPayload = Object.entries(pagos)
        .filter(([, v]) => (Number(v) || 0) > 0)
        .map(([uid, v]) => ({ user_id: uid, monto: round2(Number(v)), wallet_id: uid === yo ? walletId : undefined }))
    } else {
      pagosPayload = [{ user_id: pagadorUnico, monto: total, wallet_id: pagadorUnico === yo ? walletId : undefined }]
    }

    // Construir divisiones.
    const metodoServer = metodo === 'igual' ? 'partes' : metodo
    const divisiones = participantes.map(p => ({
      user_id: p.user_id,
      valor: metodo === 'igual' ? 1 : Number(valores[p.user_id]) || 0,
    }))

    setLoading(true)
    const url = gasto ? `/api/grupos/${grupoId}/gastos/${gasto.id}` : `/api/grupos/${grupoId}/gastos`
    const res = await fetch(url, {
      method: gasto ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descripcion, monto_total: total, fecha,
        metodo_division: metodoServer, pagos: pagosPayload, divisiones,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Error al guardar'); setLoading(false); return }
    onSuccess()
    onClose()
  }

  const nombre = (uid: string) => miembros.find(m => m.user_id === uid)?.nombre || 'Usuario'

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/40 backdrop-blur-sm animate-fade sm:items-center sm:p-4">
      <div onClick={e => e.stopPropagation()} className="bg-snow w-full max-w-md max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-card sm:border sm:border-fog animate-sheet pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
        <div className="sticky top-0 z-10 bg-snow/95 backdrop-blur">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-pebble" />
          </div>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-fog sm:px-6 sm:py-4">
            <h2 className="text-base font-semibold text-ink sm:text-lg">{gasto ? 'Editar gasto' : 'Nuevo gasto compartido'}</h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-5 sm:px-6">
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} required placeholder="Ej: Compra en Walmart"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Monto total</label>
            <div className="relative">
              <span className="absolute text-xl font-medium -translate-y-1/2 left-4 top-1/2 text-ash">{simbolo}</span>
              <input type="number" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} min="0.01" step="0.01" required placeholder="0.00"
                className="w-full py-4 pl-10 pr-4 text-2xl font-bold border bg-mist border-transparent placeholder-ash rounded-input text-obsidian focus:outline-none focus:border-obsidian focus:bg-snow" />
            </div>
          </div>

          {/* Participantes */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">¿Entre quiénes se divide?</label>
            <div className="flex flex-wrap gap-2">
              {miembros.map(m => (
                <button key={m.user_id} type="button" onClick={() => toggle(m.user_id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${seleccionados.has(m.user_id) ? 'border-obsidian bg-obsidian text-snow' : 'border-fog text-steel hover:border-pebble'}`}>
                  {m.nombre}{m.user_id === yo ? ' (yo)' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Método */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">¿Cómo se divide?</label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-mist rounded-full">
              {([['igual', 'Igual'], ['exacto', 'Exacto'], ['porcentaje', '%']] as [Metodo, string][]).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => setMetodo(val)}
                  className={`py-2 rounded-full text-sm font-medium transition-all ${metodo === val ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Inputs por participante para exacto / porcentaje */}
          {metodo !== 'igual' && (
            <div className="space-y-2">
              {participantes.map(p => (
                <div key={p.user_id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-ink">{p.nombre}{p.user_id === yo ? ' (yo)' : ''}</span>
                  <div className="relative w-32">
                    <span className="absolute text-sm -translate-y-1/2 left-3 top-1/2 text-ash">{metodo === 'exacto' ? simbolo : '%'}</span>
                    <input type="number" inputMode="decimal" value={valores[p.user_id] || ''} step="0.01" min="0"
                      onChange={e => setValores(v => ({ ...v, [p.user_id]: e.target.value }))}
                      className="w-full py-2 pl-8 pr-2 text-sm text-right border bg-mist border-transparent rounded-input text-ink focus:outline-none focus:border-obsidian focus:bg-snow" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vista previa */}
          {total > 0 && participantes.length > 0 && (
            <div className="p-4 space-y-1 border bg-mist/60 border-fog rounded-input">
              <p className="mb-1 text-xs font-medium text-steel">A cada quien le toca:</p>
              {participantes.map(p => (
                <div key={p.user_id} className="flex justify-between text-sm">
                  <span className="text-ink">{p.nombre}{p.user_id === yo ? ' (yo)' : ''}</span>
                  <span className="font-medium text-obsidian">{simbolo}{(preview[p.user_id] || 0).toFixed(2)}</span>
                </div>
              ))}
              <div className={`flex justify-between pt-1 mt-1 text-xs border-t border-fog ${sumaPreview === total ? 'text-emerald-600' : 'text-red-500'}`}>
                <span>Suma</span><span>{simbolo}{sumaPreview.toFixed(2)} / {simbolo}{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Quién pagó */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-graphite">¿Quién pagó?</label>
              <label className="flex items-center gap-2 text-xs text-steel">
                <input type="checkbox" checked={variosPagadores} onChange={e => setVariosPagadores(e.target.checked)} />
                Pagaron varios
              </label>
            </div>

            {!variosPagadores ? (
              <select value={pagadorUnico} onChange={e => setPagadorUnico(e.target.value)}
                className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                {miembros.map(m => <option key={m.user_id} value={m.user_id}>{m.nombre}{m.user_id === yo ? ' (yo)' : ''}</option>)}
              </select>
            ) : (
              <div className="space-y-2">
                {miembros.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-ink">{m.nombre}{m.user_id === yo ? ' (yo)' : ''}</span>
                    <div className="relative w-32">
                      <span className="absolute text-sm -translate-y-1/2 left-3 top-1/2 text-ash">{simbolo}</span>
                      <input type="number" inputMode="decimal" value={pagos[m.user_id] || ''} step="0.01" min="0"
                        onChange={e => setPagos(v => ({ ...v, [m.user_id]: e.target.value }))}
                        className="w-full py-2 pl-8 pr-2 text-sm text-right border bg-mist border-transparent rounded-input text-ink focus:outline-none focus:border-obsidian focus:bg-snow" />
                    </div>
                  </div>
                ))}
                <div className={`text-xs text-right ${sumaPagos === total ? 'text-emerald-600' : 'text-red-500'}`}>
                  Pagado: {simbolo}{sumaPagos.toFixed(2)} / {simbolo}{total.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Cartera (solo si yo pago algo) */}
          {((!variosPagadores && pagadorUnico === yo) || (variosPagadores && (Number(pagos[yo]) || 0) > 0)) && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Se descuenta de mi cartera</label>
              {wallets.length === 0 ? (
                <p className="text-sm text-red-500">No tienes carteras. Crea una primero.</p>
              ) : (
                <select value={walletId} onChange={e => setWalletId(e.target.value)}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              )}
              <p className="mt-1 text-xs text-ash">Se registra como gasto real en tu cartera. Lo que te deben aparecerá en los saldos del grupo.</p>
            </div>
          )}

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
          </div>

          {error && <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">{error}</div>}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onClose} className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: gradiente }} className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40">{loading ? 'Guardando...' : gasto ? 'Guardar cambios' : 'Guardar gasto'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
