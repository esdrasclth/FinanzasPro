'use client'

import { useState } from 'react'
import { fechaHoyLocal } from '../lib/fecha'
import { simboloMoneda } from '../lib/dinero'
import { emitirCambio } from '../lib/datos-bus'

interface Props {
  cartera: any
  onClose: () => void
  onSuccess: () => void
}

const NOMBRES: Record<string, string> = {
  HNL: 'Lempiras (L)',
  USD: 'Dólares ($)',
  EUR: 'Euros (€)',
}

// Monedas que se pueden ajustar en esta cartera: la primaria, más cualquiera
// en la que ya haya saldo. Las tarjetas llevan HNL y USD por diseño, así que
// ofrecen ambas aunque una esté en cero — es justo el caso de estrenar el saldo
// en dólares de una tarjeta.
function monedasAjustables(cartera: any): string[] {
  const primaria = cartera.moneda || 'HNL'
  const lista = [primaria]
  if (cartera.tipo === 'credito') {
    for (const m of ['HNL', 'USD']) if (!lista.includes(m)) lista.push(m)
  }
  for (const [m, v] of Object.entries((cartera.saldos || {}) as Record<string, number>)) {
    if (!lista.includes(m) && Number(v) !== 0) lista.push(m)
  }
  return lista
}

export default function AjusteSaldo({ cartera, onClose, onSuccess }: Props) {
  const monedas = monedasAjustables(cartera)
  const [moneda, setMoneda] = useState(monedas[0])

  // El saldo de la moneda elegida sale de `saldos`, no de `saldo_actual`: ese
  // solo refleja la moneda primaria, y por eso el saldo en dólares de una
  // tarjeta no había forma de ajustarlo.
  const saldoDe = (m: string) => {
    const saldos = (cartera.saldos || {}) as Record<string, number>
    if (m in saldos) return Number(saldos[m]) || 0
    return m === (cartera.moneda || 'HNL') ? Number(cartera.saldo_actual) || 0 : 0
  }

  const [nuevoSaldo, setNuevoSaldo] = useState(saldoDe(monedas[0]).toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cambiarMoneda = (m: string) => {
    setMoneda(m)
    setNuevoSaldo(saldoDe(m).toString())
    setError('')
  }

  const simbolo = simboloMoneda(moneda)
  const saldoActual = saldoDe(moneda)
  const nuevoSaldoNum = parseFloat(nuevoSaldo) || 0
  const diferencia = nuevoSaldoNum - saldoActual
  const esIngreso = diferencia > 0

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(Math.abs(n))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (diferencia === 0) {
      setError('El saldo nuevo es igual al actual — no hay nada que ajustar')
      return
    }

    setLoading(true)
    setError('')

    // El endpoint resuelve (y crea si falta) la categoría de sistema
    // "Ajuste de saldo": antes eran hasta tres llamadas sueltas desde aquí.
    const res = await fetch('/api/transacciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_id: cartera.id,
        monto: Math.abs(diferencia),
        // Sin esto el servidor caía en la moneda primaria de la cartera y el
        // ajuste en dólares terminaba descontándose de los lempiras.
        moneda,
        tipo: esIngreso ? 'ingreso' : 'gasto',
        categoria_sistema: 'Ajuste de saldo',
        descripcion: `Ajuste de saldo — ${cartera.nombre}`,
        fecha: fechaHoyLocal(),
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setError(json?.error?.message || 'No se pudo registrar el ajuste')
      setLoading(false)
      return
    }

    emitirCambio('transacciones')

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md border bg-snow border-fog rounded-card">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-fog">
          <div>
            <h2 className="text-lg font-semibold text-ink">Ajuste de saldo</h2>
            <p className="text-steel text-xs mt-0.5">{cartera.nombre}</p>
          </div>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Las tarjetas admiten saldo independiente en lempiras y dólares. */}
          {monedas.length > 1 && (
            <div>
              <label htmlFor="moneda-ajuste" className="block mb-2 text-sm font-medium text-graphite">
                Moneda a ajustar
              </label>
              <select
                id="moneda-ajuste"
                value={moneda}
                onChange={(e) => cambiarMoneda(e.target.value)}
                className="w-full px-4 py-3 text-ink border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              >
                {monedas.map((codigo) => (
                  <option key={codigo} value={codigo}>
                    {NOMBRES[codigo] || codigo}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Saldo actual */}
          <div className="p-4 bg-mist rounded-input">
            <p className="mb-1 text-xs text-steel">Saldo actual registrado</p>
            <p className="text-2xl font-bold text-ink">
              {simbolo} {formatMonto(saldoActual)}
            </p>
          </div>

          {/* Nuevo saldo */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              ¿Cuánto hay realmente?
            </label>
            <div className="relative">
              <span className="absolute font-medium -translate-y-1/2 left-4 top-1/2 text-ash">{simbolo}</span>
              <input
                type="number"
                value={nuevoSaldo}
                onChange={(e) => setNuevoSaldo(e.target.value)}
                placeholder="0.00"
                step="0.01"
                required
                className="w-full py-3 pl-8 pr-4 text-lg text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          </div>

          {/* Preview del ajuste */}
          {nuevoSaldo !== '' && diferencia !== 0 && (
            <div className={`rounded-input p-4 border ${
              esIngreso
                ? 'bg-emerald-50 border-emerald-100'
                : 'bg-red-50 border-red-100'
            }`}>
              <p className="mb-2 text-xs text-steel">Se registrará automáticamente:</p>
              <div className="flex items-center gap-2">
                <span className="text-lg">⚖️</span>
                <div>
                  <p className={`font-semibold ${esIngreso ? 'text-emerald-600' : 'text-red-500'}`}>
                    {esIngreso ? '+' : '-'}{simbolo} {formatMonto(diferencia)}
                  </p>
                  <p className="text-xs text-steel">
                    Ajuste de saldo · {esIngreso ? 'Ingreso' : 'Gasto'} · Hoy
                  </p>
                </div>
              </div>
            </div>
          )}

          {diferencia === 0 && nuevoSaldo !== '' && (
            <div className="p-3 text-center bg-mist rounded-input">
              <p className="text-sm text-steel">El saldo ya está correcto ✓</p>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || diferencia === 0}
              className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40"
            >
              {loading ? 'Ajustando...' : 'Aplicar ajuste'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
