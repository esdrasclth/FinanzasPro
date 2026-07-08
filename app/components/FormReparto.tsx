'use client'

import { useEffect, useMemo, useState } from 'react'
import { round2, simboloMoneda } from '../lib/dinero'

interface ParticipanteUI { key: string; nombre: string; monto: string }
interface Props {
  reparto?: any
  monedaDefault?: string
  onClose: () => void
  onSuccess: (id: string) => void
}

type Metodo = 'igual' | 'manual'

let contador = 0
const nuevaKey = () => `p${Date.now()}_${contador++}`

export default function FormReparto({ reparto, monedaDefault = 'HNL', onClose, onSuccess }: Props) {
  const [descripcion, setDescripcion] = useState(reparto?.descripcion || '')
  const [monto, setMonto] = useState(reparto ? String(reparto.monto_total) : '')
  const [moneda, setMoneda] = useState(reparto?.moneda || monedaDefault)
  const [fecha, setFecha] = useState(reparto ? String(reparto.fecha).slice(0, 10) : new Date().toISOString().split('T')[0])
  const [metodo, setMetodo] = useState<Metodo>(reparto?.metodo === 'manual' ? 'manual' : 'igual')
  const [participantes, setParticipantes] = useState<ParticipanteUI[]>(
    reparto
      ? reparto.participantes.map((p: any) => ({ key: nuevaKey(), nombre: p.nombre, monto: String(p.monto_asignado) }))
      : [{ key: nuevaKey(), nombre: '', monto: '' }]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Bloquea el scroll del fondo mientras el sheet está abierto (evita saltos raros).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const simbolo = simboloMoneda(moneda)
  const total = round2(Number(monto) || 0)
  const conNombre = participantes.filter(p => p.nombre.trim().length > 0)

  const agregar = () => setParticipantes(prev => [...prev, { key: nuevaKey(), nombre: '', monto: '' }])
  const quitar = (key: string) => setParticipantes(prev => prev.length > 1 ? prev.filter(p => p.key !== key) : prev)
  const editar = (key: string, campo: 'nombre' | 'monto', valor: string) =>
    setParticipantes(prev => prev.map(p => p.key === key ? { ...p, [campo]: valor } : p))

  // Reparte lo que falta del total en partes iguales entre quienes no tienen monto.
  const repartirRestante = () => {
    const conNom = participantes.filter(p => p.nombre.trim().length > 0)
    const vacios = conNom.filter(p => !(Number(p.monto) > 0))
    if (vacios.length === 0) { setError('Todos ya tienen un monto. Deja en blanco a quienes repartir.'); return }
    const asignado = round2(conNom.filter(p => Number(p.monto) > 0).reduce((s, p) => s + Number(p.monto), 0))
    const restante = round2(total - asignado)
    if (restante <= 0) { setError('No queda monto por repartir.'); return }
    const base = round2(restante / vacios.length)
    let acumulado = 0
    const keysVacios = vacios.map(p => p.key)
    setError('')
    setParticipantes(prev => prev.map((p) => {
      if (!keysVacios.includes(p.key)) return p
      const esUltimo = p.key === keysVacios[keysVacios.length - 1]
      const valor = esUltimo ? round2(restante - acumulado) : base
      acumulado = round2(acumulado + base)
      return { ...p, monto: String(valor) }
    }))
  }

  // Vista previa de cuánto le toca a cada quien.
  const preview = useMemo(() => {
    const out: Record<string, number> = {}
    if (conNombre.length === 0 || total <= 0) return out
    if (metodo === 'igual') {
      const base = round2(total / conNombre.length)
      conNombre.forEach(p => (out[p.key] = base))
      const resid = round2(total - base * conNombre.length)
      if (resid !== 0) out[conNombre[conNombre.length - 1].key] = round2(base + resid)
    } else {
      conNombre.forEach(p => (out[p.key] = round2(Number(p.monto) || 0)))
    }
    return out
  }, [participantes, total, metodo])

  const sumaManual = round2(conNombre.reduce((s, p) => s + (Number(p.monto) || 0), 0))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!descripcion.trim()) { setError('Escribe una descripción'); return }
    if (total <= 0) { setError('Ingresa un monto válido'); return }
    if (conNombre.length === 0) { setError('Agrega al menos un participante con nombre'); return }
    if (metodo === 'manual' && sumaManual !== total) {
      setError(`La suma (${simbolo}${sumaManual.toFixed(2)}) no cuadra con el total (${simbolo}${total.toFixed(2)})`)
      return
    }

    setLoading(true)
    const payload = {
      descripcion: descripcion.trim(),
      monto_total: total,
      moneda,
      metodo,
      fecha,
      participantes: conNombre.map(p => ({ nombre: p.nombre.trim(), monto_asignado: Number(p.monto) || 0 })),
    }
    const url = reparto ? `/api/repartos/${reparto.id}` : '/api/repartos'
    const res = await fetch(url, {
      method: reparto ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Error al guardar'); setLoading(false); return }
    onSuccess(json.id || reparto?.id)
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
            <h2 className="text-base font-semibold text-ink sm:text-lg">{reparto ? 'Editar reparto' : 'Nuevo reparto'}</h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 text-lg rounded-full text-ash hover:text-ink hover:bg-mist">✕</button>
          </div>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} required placeholder="Ej: Viaje a San Pedro"
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block mb-2 text-sm font-medium text-graphite">Monto total</label>
              <div className="relative">
                <span className="absolute text-xl font-medium -translate-y-1/2 left-4 top-1/2 text-ash">{simbolo}</span>
                <input type="number" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} min="0.01" step="0.01" required placeholder="0.00"
                  className="w-full py-3.5 pl-10 pr-4 text-xl font-bold border bg-mist border-transparent placeholder-ash rounded-input text-obsidian focus:outline-none focus:border-obsidian focus:bg-snow sm:text-2xl sm:py-4" />
              </div>
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Moneda</label>
              <select value={moneda} onChange={e => setMoneda(e.target.value)}
                className="w-full px-3 py-4 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
                <option value="HNL">HNL</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="MXN">MXN</option>
              </select>
            </div>
          </div>

          {/* Método */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">¿Cómo se divide?</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-mist rounded-full">
              {([['igual', 'Partes iguales'], ['manual', 'Ajustar a mano']] as [Metodo, string][]).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => setMetodo(val)}
                  className={`py-2 rounded-full text-sm font-medium transition-all ${metodo === val ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Participantes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-graphite">Personas</label>
              <button type="button" onClick={agregar} className="text-sm font-medium text-graphite hover:text-ink">+ Agregar</button>
            </div>
            <div className="space-y-2">
              {participantes.map(p => (
                <div key={p.key} className="flex items-center gap-2">
                  <input value={p.nombre} onChange={e => editar(p.key, 'nombre', e.target.value)} placeholder="Nombre"
                    className="flex-1 px-3 py-2.5 text-sm text-ink border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
                  {metodo === 'manual' && (
                    <div className="relative w-28">
                      <span className="absolute text-sm -translate-y-1/2 left-3 top-1/2 text-ash">{simbolo}</span>
                      <input type="number" inputMode="decimal" value={p.monto} onChange={e => editar(p.key, 'monto', e.target.value)} step="0.01" min="0" placeholder="0.00"
                        className="w-full py-2.5 pl-7 pr-2 text-sm text-right border bg-mist border-transparent rounded-input text-ink focus:outline-none focus:border-obsidian focus:bg-snow" />
                    </div>
                  )}
                  <button type="button" onClick={() => quitar(p.key)} className="w-8 text-lg text-ash hover:text-red-500 shrink-0">✕</button>
                </div>
              ))}
            </div>
            {metodo === 'manual' && (
              <div className="flex items-center justify-between mt-2">
                <button type="button" onClick={repartirRestante} className="text-xs font-medium text-graphite hover:text-ink">
                  ↻ Repartir lo restante entre los vacíos
                </button>
                <span className={`text-xs ${sumaManual === total ? 'text-emerald-600' : 'text-red-500'}`}>
                  {simbolo}{sumaManual.toFixed(2)} / {simbolo}{total.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Vista previa */}
          {total > 0 && conNombre.length > 0 && (
            <div className="p-4 space-y-1 border bg-mist/60 border-fog rounded-input">
              <p className="mb-1 text-xs font-medium text-steel">A cada quien le toca:</p>
              {conNombre.map(p => (
                <div key={p.key} className="flex justify-between text-sm">
                  <span className="text-ink">{p.nombre}</span>
                  <span className="font-medium text-obsidian">{simbolo}{(preview[p.key] || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
          </div>

          {error && <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">{error}</div>}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onClose} className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">Cancelar</button>
            <button type="submit" disabled={loading} className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40">{loading ? 'Guardando...' : reparto ? 'Guardar cambios' : 'Crear reparto'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
