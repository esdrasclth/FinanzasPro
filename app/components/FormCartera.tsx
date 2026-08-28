'use client'

import { useState, useEffect } from 'react'
import { X, Wallet, Landmark, CreditCard, PiggyBank } from 'lucide-react'
import { emitirCambio } from '../lib/datos-bus'

interface Props {
  cartera?: any
  onClose: () => void
  onSuccess: () => void
}

const TIPOS = [
  { valor: 'efectivo', label: 'Efectivo', icono: Wallet },
  { valor: 'banco', label: 'Banco', icono: Landmark },
  { valor: 'credito', label: 'Tarjeta crédito', icono: CreditCard },
  { valor: 'ahorro', label: 'Ahorros', icono: PiggyBank },
]

const COLORES = [
  '#0D9488', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EF4444', '#EC4899', '#10B981', '#F97316'
]

const MONEDAS = [
  { codigo: 'HNL', simbolo: 'L', label: 'Lempira (HNL)' },
  { codigo: 'USD', simbolo: '$', label: 'Dólar (USD)' },
  { codigo: 'EUR', simbolo: '€', label: 'Euro (EUR)' },
]

export default function FormCartera({ cartera, onClose, onSuccess }: Props) {
  const [nombre, setNombre] = useState(cartera?.nombre || '')
  const [tipo, setTipo] = useState(cartera?.tipo || 'efectivo')
  const [saldoInicial, setSaldoInicial] = useState(cartera?.saldo_inicial?.toString() || '0')
  const [saldoInicialUsd, setSaldoInicialUsd] = useState('0')
  const [moneda, setMoneda] = useState(cartera?.moneda || 'HNL')
  const [color, setColor] = useState(cartera?.color || '#0D9488')
  const [creditoLimite, setCreditoLimite] = useState(cartera?.credito_limite?.toString() || '')
  const [fechaCorte, setFechaCorte] = useState(cartera?.fecha_corte?.toString() || '1')
  const [fechaPago, setFechaPago] = useState(cartera?.fecha_pago?.toString() || '15')
  const [numeroCuenta, setNumeroCuenta] = useState(cartera?.numero_cuenta || '')
  const [numeroTarjeta, setNumeroTarjeta] = useState(cartera?.numero_tarjeta || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const esEdicion = !!cartera
  const esTarjeta = tipo === 'credito'
  const esBanco = tipo === 'banco'
  const monedaSimbolo = MONEDAS.find(m => m.codigo === moneda)?.simbolo || 'L'

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // El servidor crea la cartera y su saldo de apertura en una sola
    // transacción: eran dos escrituras sueltas, así que si fallaba la segunda
    // quedaba una cartera en cero sin rastro del dinero que ya tenía.
    const res = await fetch('/api/carteras', {
      method: esEdicion ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cartera?.id,
        nombre,
        tipo,
        color,
        moneda,
        credito_limite: parseFloat(creditoLimite) || 0,
        fecha_corte: parseInt(fechaCorte) || 1,
        fecha_pago: parseInt(fechaPago) || 15,
        numero_tarjeta: numeroTarjeta.trim() || null,
        numero_cuenta: numeroCuenta.trim() || null,
        // Solo cuentan al crear: la apertura no se reescribe al editar.
        saldo_inicial: esEdicion ? 0 : parseFloat(saldoInicial) || 0,
        saldo_inicial_usd: esEdicion ? 0 : parseFloat(saldoInicialUsd) || 0,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setError(json?.error?.message || 'No se pudo guardar la cartera')
      setLoading(false)
      return
    }

    emitirCambio('carteras')

    onSuccess()
    onClose()
  }

  const dias = Array.from({ length: 31 }, (_, i) => i + 1)

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
            <h2 className="text-base font-semibold text-ink sm:text-lg">
              {esEdicion ? 'Editar cartera' : 'Nueva cartera'}
            </h2>
            <button onClick={onClose} className="flex items-center justify-center w-11 h-11 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">

          {/* Nombre */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: GASCARD, Cuenta Atlántida"
              required
              className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map(t => {
                const Icono = t.icono
                return (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setTipo(t.valor)}
                    className={`flex items-center gap-2 p-3 rounded-xl text-sm text-left transition-all border ${
                      tipo === t.valor
                        ? 'border-obsidian bg-obsidian/5 text-ink'
                        : 'border-fog text-steel hover:border-pebble'
                    }`}
                  >
                    <Icono size={18} strokeWidth={2} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Moneda — las TC son de doble moneda fija (HNL + USD) */}
          {!esTarjeta && (
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Moneda</label>
            <div className="grid grid-cols-3 gap-2">
              {MONEDAS.map(m => (
                <button
                  key={m.codigo}
                  type="button"
                  onClick={() => setMoneda(m.codigo)}
                  className={`flex items-center justify-center gap-1.5 p-3 rounded-xl text-sm transition-all border ${
                    moneda === m.codigo
                      ? 'border-obsidian bg-obsidian/5 text-ink'
                      : 'border-fog text-steel hover:border-pebble'
                  }`}
                >
                  <span className="font-semibold">{m.simbolo}</span>
                  {m.codigo}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Número de cuenta — solo banco */}
          {esBanco && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">
                Número de cuenta
                <span className="ml-1 font-normal text-steel">(opcional)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={numeroCuenta}
                onChange={(e) => setNumeroCuenta(e.target.value)}
                placeholder="Ej: 0000-0000-0000"
                className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
              />
            </div>
          )}

          {/* Saldo inicial — solo en creación y no tarjeta */}
          {!esEdicion && !esTarjeta && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">Saldo inicial</label>
              <div className="relative">
                <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">{monedaSimbolo}</span>
                <input
                  type="number"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                />
              </div>
            </div>
          )}

          {/* Configuración especial tarjeta de crédito */}
          {esTarjeta && (
            <div className="p-4 space-y-4 border bg-violet-50 border-violet-100 rounded-input">
              <p className="flex items-center gap-2 text-sm font-medium text-violet-600">
                <CreditCard size={16} strokeWidth={2} /> Configuración de tarjeta
              </p>

              {/* Número de tarjeta */}
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">
                  Número de tarjeta
                  <span className="ml-1 font-normal text-steel">(opcional)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numeroTarjeta}
                  onChange={(e) => setNumeroTarjeta(e.target.value)}
                  placeholder="Ej: 0000 0000 0000 0000"
                  className="w-full px-4 py-3 text-ink transition-colors border bg-snow border-fog placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                />
              </div>

              {/* Saldos iniciales por moneda — solo en creación */}
              {!esEdicion && (
                <div>
                  <label className="block mb-2 text-sm font-medium text-graphite">
                    Saldo inicial
                    <span className="ml-1 font-normal text-steel">(deuda actual, usa negativo)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <span className="absolute -translate-y-1/2 left-3 top-1/2 text-xs font-semibold text-ash">L</span>
                      <input
                        type="number"
                        value={saldoInicial}
                        onChange={(e) => setSaldoInicial(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        className="w-full py-3 pl-7 pr-3 text-ink transition-colors border bg-snow border-fog placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute -translate-y-1/2 left-3 top-1/2 text-xs font-semibold text-ash">$</span>
                      <input
                        type="number"
                        value={saldoInicialUsd}
                        onChange={(e) => setSaldoInicialUsd(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        className="w-full py-3 pl-7 pr-3 text-ink transition-colors border bg-snow border-fog placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-steel">
                    HNL y USD por separado. Ej: −5,000 y −200.
                  </p>
                </div>
              )}

              {/* Límite de crédito */}
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">
                  Límite de crédito
                </label>
                <div className="relative">
                  <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">{monedaSimbolo}</span>
                  <input
                    type="number"
                    value={creditoLimite}
                    onChange={(e) => setCreditoLimite(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                  />
                </div>
              </div>

              {/* Fecha de corte */}
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">
                  Día de corte
                  <span className="ml-1 font-normal text-steel">
                    (día del mes en que cierra el período)
                  </span>
                </label>
                <select
                  value={fechaCorte}
                  onChange={(e) => setFechaCorte(e.target.value)}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                >
                  {dias.map(d => (
                    <option key={d} value={d}>Día {d}</option>
                  ))}
                </select>
              </div>

              {/* Fecha de pago */}
              <div>
                <label className="block mb-2 text-sm font-medium text-graphite">
                  Día de pago
                  <span className="ml-1 font-normal text-steel">
                    (día límite para pagar sin intereses)
                  </span>
                </label>
                <select
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                >
                  {dias.map(d => (
                    <option key={d} value={d}>Día {d}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">Color</label>
            <div className="flex flex-wrap gap-3">
              {COLORES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-11 h-11 sm:w-8 sm:h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-obsidian ring-offset-2 ring-offset-snow scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40"
            >
              {loading ? 'Guardando...' : esEdicion ? 'Actualizar' : 'Crear'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}