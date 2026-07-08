'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import FormCartera from '../components/FormCartera'
import AppLayout from '../components/AppLayout'
import AjusteSaldo from '../components/AjusteSaldo'
import Notificaciones from '../components/Notificaciones'
import { SkeletonCard } from '../components/Skeleton'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Pencil, Trash2, Scale, Plus, Wallet, Landmark, CreditCard, PiggyBank,
  Clock, PieChart as PieIcon, ChevronRight, ChevronDown, Search,
  Filter, Coins, type LucideIcon,
} from 'lucide-react'

export default function Carteras() {
  const router = useRouter()
  const [carteras, setCarteras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [carteraEditar, setCarteraEditar] = useState<any>(null)
  const [carteraAjustar, setCarteraAjustar] = useState<any>(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroMoneda, setFiltroMoneda] = useState('todas')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarCarteras()
    }
    checkUser()
  }, [router])

  const cargarCarteras = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('activo', true)
      .order('created_at', { ascending: true })

    // Calcular saldo real de cada cartera
    const carterasConSaldo = await Promise.all(
      (data || []).map(async (cartera) => {
        const { data: trans } = await supabase
          .from('transactions')
          .select('monto, tipo, moneda, created_at, categories(nombre)')
          .eq('wallet_id', cartera.id)

        // Saldos por moneda. Las TC son de doble moneda (HNL + USD); el resto son de una sola.
        // El campo saldo_inicial (carteras antiguas) es la base de la moneda primaria.
        const primaria = cartera.moneda || 'HNL'
        const saldos: Record<string, number> = { [primaria]: Number(cartera.saldo_inicial) }
        ;(trans || []).forEach(t => {
          const m = t.moneda || primaria
          const delta = t.tipo === 'ingreso' ? Number(t.monto) : -Number(t.monto)
          saldos[m] = (saldos[m] || 0) + delta
        })

        const saldo_actual = saldos[primaria] || 0

        // El saldo inicial de aperturas nuevas vive en una transacción "Saldo inicial";
        // las carteras antiguas lo tienen en el campo saldo_inicial.
        const saldoInicialReal = (trans || [])
          .filter(t => t.categories?.nombre === 'Saldo inicial' && (t.moneda || primaria) === primaria)
          .reduce((acc, t) => t.tipo === 'ingreso' ? acc + Number(t.monto) : acc - Number(t.monto),
            Number(cartera.saldo_inicial))

        // Último movimiento real (excluye la apertura "Saldo inicial").
        const ultimoMovimiento = (trans || [])
          .filter(t => t.categories?.nombre !== 'Saldo inicial')
          .reduce((max, t) => {
            const ts = new Date(t.created_at).getTime()
            return ts > max ? ts : max
          }, 0)

        return { ...cartera, saldo_actual, saldos, saldo_inicial_real: saldoInicialReal, ultimo_movimiento: ultimoMovimiento || null }
      })
    )

    setCarteras(carterasConSaldo)
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta cartera?')) return

    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Error: ' + error.message)
      return
    }
    cargarCarteras()
  }

  const formatMonto = (n: number) =>
    new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(n)

  const tiempoRelativo = (ts?: number | null) => {
    if (!ts) return 'Sin movimientos'
    const min = Math.floor((Date.now() - ts) / 60000)
    if (min < 1) return 'Hace un momento'
    if (min < 60) return `Hace ${min} min`
    const horas = Math.floor(min / 60)
    if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`
    const dias = Math.floor(horas / 24)
    if (dias < 30) return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`
    const meses = Math.floor(dias / 30)
    return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  }

  const SIMBOLOS: Record<string, string> = { HNL: 'L', USD: '$', EUR: '€' }
  const simboloMoneda = (codigo?: string) => SIMBOLOS[codigo || 'HNL'] || 'L'

  const ultimos4 = (valor?: string | null) => {
    const digitos = (valor || '').replace(/\D/g, '')
    return digitos.length >= 4 ? digitos.slice(-4) : ''
  }

  // Totales por moneda. HNL es la moneda primaria del resumen; USD se muestra aparte.
  const netoPorMoneda: Record<string, number> = {}
  const disponiblePorMoneda: Record<string, number> = {}
  const creditoUtilPorMoneda: Record<string, number> = {}
  carteras.forEach(c => {
    const esCred = c.tipo === 'credito'
    Object.entries((c.saldos || {}) as Record<string, number>).forEach(([m, vRaw]) => {
      const v = Number(vRaw)
      netoPorMoneda[m] = (netoPorMoneda[m] || 0) + v
      if (!esCred && v > 0) disponiblePorMoneda[m] = (disponiblePorMoneda[m] || 0) + v
      if (esCred && v < 0) creditoUtilPorMoneda[m] = (creditoUtilPorMoneda[m] || 0) + Math.abs(v)
    })
  })

  const valorNeto = netoPorMoneda['HNL'] || 0
  const disponible = disponiblePorMoneda['HNL'] || 0
  const creditoUtilizado = creditoUtilPorMoneda['HNL'] || 0
  const valorNetoUsd = netoPorMoneda['USD'] || 0
  const disponibleUsd = disponiblePorMoneda['USD'] || 0
  const creditoUtilizadoUsd = creditoUtilPorMoneda['USD'] || 0

  const creditoLimiteTotal = carteras
    .filter(c => c.tipo === 'credito')
    .reduce((acc, c) => acc + Number(c.credito_limite || 0), 0)

  const disponiblePct = valorNeto > 0 ? Math.round((disponible / valorNeto) * 100) : 0
  const creditoUsoPct = creditoLimiteTotal > 0 ? Math.round((creditoUtilizado / creditoLimiteTotal) * 100) : 0

  const ICONOS_TIPO: Record<string, LucideIcon> = {
    efectivo: Wallet,
    banco: Landmark,
    credito: CreditCard,
    ahorro: PiggyBank,
  }

  const COLORES = [
    '#2c6e49', '#3B82F6', '#8B5CF6', '#F59E0B',
    '#EF4444', '#EC4899', '#10B981', '#6366F1',
  ]

  // Distribución en HNL (moneda primaria). Los saldos en USD se manejan aparte por ahora.
  const distribucion = carteras
    .map(c => ({ nombre: c.nombre, valor: Number((c.saldos as Record<string, number>)?.['HNL'] || 0) }))
    .filter(d => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  const totalDistribucion = distribucion.reduce((s, d) => s + d.valor, 0)

  const carterasFiltradas = carteras.filter(c => {
    if (filtroTipo !== 'todos' && c.tipo !== filtroTipo) return false
    if (filtroMoneda !== 'todas') {
      const monedas = Object.keys((c.saldos || {}) as Record<string, number>)
      if (c.moneda !== filtroMoneda && !monedas.includes(filtroMoneda)) return false
    }
    if (busqueda && !c.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] p-6 mx-auto space-y-6 lg:p-8">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 border bg-snow border-fog rounded-card animate-pulse">
              <div className="w-2/3 h-3 mb-4 rounded-badge bg-fog" />
              <div className="w-1/2 h-8 rounded-badge bg-fog" />
            </div>
            <div className="p-6 border bg-snow border-fog rounded-card animate-pulse">
              <div className="w-2/3 h-3 mb-4 rounded-badge bg-fog" />
              <div className="w-1/2 h-8 rounded-badge bg-fog" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>

      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="mb-1 text-sm font-medium text-steel">Carteras</p>
            <h1 className="text-3xl font-bold text-obsidian">Gestiona tu patrimonio</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setCarteraEditar(null); setShowForm(true) }}
              style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
              className="items-center hidden gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow sm:inline-flex hover:scale-105 hover:brightness-110"
            >
              <Plus size={18} strokeWidth={2.5} />
              Nueva cartera
            </button>
            <Notificaciones />
          </div>
        </div>

        {/* Hero resumen de patrimonio */}
        <div
          className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        >
          <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
          <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
          <div className="relative px-6 py-9 lg:px-8 lg:py-12">
            <div className="mb-8">
              <h2 className="text-xl font-semibold">Resumen de patrimonio</h2>
              <p className="text-base text-white/60">
                {carteras.length} {carteras.length === 1 ? 'cartera activa' : 'carteras activas'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 sm:divide-x sm:divide-white/10">
              <div className="flex items-start gap-4 sm:pr-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <Wallet size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Patrimonio neto</p>
                  <p className={`text-2xl font-bold break-words sm:text-3xl ${valorNeto >= 0 ? '' : 'text-red-300'}`}>
                    {valorNeto < 0 ? '-' : ''}L {formatMonto(Math.abs(valorNeto))}
                    {valorNetoUsd !== 0 && (
                      <span className="ml-2 text-base font-semibold whitespace-nowrap text-white/70 sm:text-lg">
                        {valorNetoUsd < 0 ? '-' : ''}$ {formatMonto(Math.abs(valorNetoUsd))}
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-white/50">
                    Repartido en {carteras.length} {carteras.length === 1 ? 'cartera' : 'carteras'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 sm:px-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <Landmark size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Disponible</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl">
                    L {formatMonto(disponible)}
                    {disponibleUsd !== 0 && (
                      <span className="ml-2 text-base font-semibold whitespace-nowrap text-white/70 sm:text-lg">
                        $ {formatMonto(disponibleUsd)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-emerald-300">
                    {disponiblePct}% del patrimonio
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 sm:pl-6">
                <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                  <CreditCard size={20} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base text-white/60">Crédito utilizado</p>
                  <p className="text-2xl font-bold break-words sm:text-3xl">
                    L {formatMonto(creditoUtilizado)}
                    {creditoUtilizadoUsd !== 0 && (
                      <span className="ml-2 text-base font-semibold whitespace-nowrap text-white/70 sm:text-lg">
                        $ {formatMonto(creditoUtilizadoUsd)}
                      </span>
                    )}
                  </p>
                  <p className={`mt-1.5 text-sm font-medium ${creditoUsoPct >= 80 ? 'text-red-300' : 'text-white/50'}`}>
                    {creditoLimiteTotal > 0 ? `${creditoUsoPct}% del límite` : 'Sin tarjetas de crédito'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna carteras */}
        <div className="lg:col-span-2">

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <FiltroMenu
            icon={Filter}
            value={filtroTipo}
            onChange={setFiltroTipo}
            options={[
              { value: 'todos', label: 'Todos los tipos' },
              { value: 'efectivo', label: 'Efectivo' },
              { value: 'banco', label: 'Banco' },
              { value: 'credito', label: 'Tarjeta de crédito' },
              { value: 'ahorro', label: 'Ahorros' },
            ]}
          />
          <FiltroMenu
            icon={Coins}
            value={filtroMoneda}
            onChange={setFiltroMoneda}
            options={[
              { value: 'todas', label: 'Todas las monedas' },
              { value: 'HNL', label: 'Lempira (HNL)' },
              { value: 'USD', label: 'Dólar (USD)' },
              { value: 'EUR', label: 'Euro (EUR)' },
            ]}
          />
          <div className="relative flex-1 min-w-[10rem]">
            <Search size={15} strokeWidth={2} className="absolute -translate-y-1/2 pointer-events-none left-3 top-1/2 text-ash" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cartera..."
              className="w-full py-2.5 pl-9 pr-3 text-sm transition-colors border rounded-full bg-snow border-fog text-ink placeholder-ash focus:outline-none focus:border-obsidian"
            />
          </div>
        </div>

        <h2 className="mb-4 text-sm font-semibold text-steel">Mis carteras</h2>
        {carteras.length === 0 ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <Wallet size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
            <p className="mb-2 text-steel">No tienes carteras aún</p>
            <p className="text-sm text-ash">
              Crea tu primera cartera con el botón +
            </p>
          </div>
        ) : carterasFiltradas.length === 0 ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <Search size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
            <p className="mb-2 text-steel">Ninguna cartera coincide con los filtros</p>
            <p className="text-sm text-ash">Prueba con otros criterios de búsqueda</p>
          </div>
        ) : (
          <div className="grid items-stretch grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
            {carterasFiltradas.map(cartera => {
              const esTarjeta = cartera.tipo === 'credito'

              // Calcular días para próximo pago
              const hoy = new Date()
              const diaHoy = hoy.getDate()
              const diasParaPago = esTarjeta ? (() => {
                const diaPago = cartera.fecha_pago || 15
                let diff = diaPago - diaHoy
                if (diff < 0) {
                  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
                  diff = diasEnMes - diaHoy + diaPago
                }
                return diff
              })() : null

              const proximoPago = diasParaPago !== null && diasParaPago <= 5
              const creditoUsado = esTarjeta && cartera.credito_limite > 0 ? Math.abs(cartera.saldo_actual) : 0
              const porcentajeUso = esTarjeta && cartera.credito_limite > 0 ? (creditoUsado / cartera.credito_limite) * 100 : 0
              const num = ultimos4(esTarjeta ? cartera.numero_tarjeta : cartera.numero_cuenta)
              const Icono = ICONOS_TIPO[cartera.tipo] || Wallet

              return (
                <div
                  key={cartera.id}
                  className={`flex flex-col h-full p-5 transition-all border bg-snow rounded-card ${proximoPago ? 'border-amber-300' : 'border-fog hover:border-pebble'}`}
                >
                  {/* Encabezado: ícono + nombre · Ajustar / Eliminar arriba */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center min-w-0 gap-3">
                      <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-2xl" style={{ backgroundColor: cartera.color + '15', color: cartera.color }}>
                        <Icono size={22} strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate text-ink">{cartera.nombre}</p>
                        <p className="text-xs capitalize text-ash">{cartera.tipo} · {cartera.moneda || 'HNL'}</p>
                      </div>
                    </div>
                    <div className="flex items-center flex-shrink-0 gap-1">
                      {proximoPago && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 mr-1 text-xs font-medium text-amber-600 rounded-badge bg-amber-50">
                          <Clock size={12} strokeWidth={2} />
                          {diasParaPago === 0 ? '¡Hoy!' : `${diasParaPago}d`}
                        </span>
                      )}
                      <button
                        onClick={() => setCarteraAjustar(cartera)}
                        className="p-1.5 transition-colors rounded-full text-ash hover:text-amber-600 hover:bg-amber-50"
                        title="Ajustar saldo"
                      ><Scale size={16} strokeWidth={2} /></button>
                      <button
                        onClick={() => handleEliminar(cartera.id)}
                        className="p-1.5 transition-colors rounded-full text-ash hover:text-red-600 hover:bg-red-50"
                        title="Eliminar"
                      ><Trash2 size={16} strokeWidth={2} /></button>
                    </div>
                  </div>

                  {/* Saldo + último movimiento */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {esTarjeta ? (
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                          {['HNL', 'USD']
                            .filter(m => m === 'HNL' || Number((cartera.saldos || {})[m] || 0) !== 0)
                            .map(m => {
                              const val = Number((cartera.saldos || {})[m] || 0)
                              return (
                                <p key={m} className={`text-2xl font-bold ${val < 0 ? 'text-red-500' : 'text-obsidian'}`}>
                                  {val < 0 ? '-' : ''}{SIMBOLOS[m]} {formatMonto(Math.abs(val))}
                                </p>
                              )
                            })}
                        </div>
                      ) : (
                        <p className={`text-2xl font-bold ${cartera.saldo_actual >= 0 ? 'text-obsidian' : 'text-red-500'}`}>
                          {cartera.saldo_actual < 0 ? '-' : ''}{simboloMoneda(cartera.moneda)} {formatMonto(Math.abs(cartera.saldo_actual))}
                        </p>
                      )}
                      <p className={`mt-1 text-xs font-medium ${esTarjeta ? 'text-steel' : 'text-emerald-600'}`}>
                        {esTarjeta
                          ? (cartera.credito_limite > 0
                            ? `Utilizado de ${simboloMoneda(cartera.moneda)} ${formatMonto(cartera.credito_limite)}`
                            : 'Saldo usado')
                          : 'Disponible'}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-ash">Último movimiento</p>
                      <p className="text-xs font-medium text-steel">{tiempoRelativo(cartera.ultimo_movimiento)}</p>
                    </div>
                  </div>

                  {/* Barra de uso de crédito */}
                  {esTarjeta && cartera.credito_limite > 0 && (
                    <div className="mt-3">
                      <div className="w-full h-2 rounded-full bg-fog">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${porcentajeUso >= 80 ? 'bg-red-500' : porcentajeUso >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(porcentajeUso, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs">
                        <span className={porcentajeUso >= 80 ? 'text-red-500 font-medium' : 'text-steel'}>{Math.round(porcentajeUso)}% usado</span>
                        <span className="text-ash">Corte {cartera.fecha_corte} · Pago {cartera.fecha_pago}</span>
                      </div>
                    </div>
                  )}

                  {/* Número de cuenta / tarjeta */}
                  {num && (
                    <p className="mt-3 font-mono text-xs tracking-wider text-steel">•••• {num}</p>
                  )}

                  {/* Acciones inferiores: Editar · Ver movimientos */}
                  <div className="flex items-center justify-between pt-3 mt-auto border-t border-fog">
                    <button
                      onClick={() => { setCarteraEditar(cartera); setShowForm(true) }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors text-graphite hover:text-ink"
                    >
                      <Pencil size={15} strokeWidth={2} /> Editar
                    </button>
                    <button
                      onClick={() => router.push(`/transacciones?cartera=${cartera.id}`)}
                      className="inline-flex items-center gap-1 text-sm font-medium transition-colors text-graphite hover:text-ink"
                    >
                      Ver movimientos <ChevronRight size={15} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </div>

        {/* Columna distribución */}
        <div className="lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-steel">Distribución del patrimonio</h2>
          <div className="p-6 border bg-snow border-fog rounded-card">
            {distribucion.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PieIcon size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                <p className="text-sm text-steel">Sin saldos positivos para mostrar</p>
              </div>
            ) : (
              <>
                <div className="relative w-[180px] h-[180px] mx-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribucion}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={82}
                        paddingAngle={3}
                        cornerRadius={4}
                        dataKey="valor"
                        stroke="none"
                      >
                        {distribucion.map((_, index) => (
                          <Cell key={index} fill={COLORES[index % COLORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`L ${formatMonto(Number(value) || 0)}`, 'Saldo']}
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                        labelStyle={{ color: '#71717a' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[11px] font-medium text-steel">Total</span>
                    <span className="text-lg font-bold leading-tight text-ink">L {formatMonto(totalDistribucion)}</span>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {distribucion.map((item, index) => {
                    const pct = totalDistribucion > 0 ? Math.round((item.valor / totalDistribucion) * 100) : 0
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORES[index % COLORES.length] }} />
                        <span className="flex-1 min-w-0 text-sm truncate text-ink">{item.nombre}</span>
                        <span className="text-sm font-medium text-ink whitespace-nowrap">L {formatMonto(item.valor)}</span>
                        <span className="text-xs font-medium text-right text-steel w-9">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        </div>

      </div>

      {carteraAjustar && (
        <AjusteSaldo
          cartera={carteraAjustar}
          onClose={() => setCarteraAjustar(null)}
          onSuccess={() => {
            setCarteraAjustar(null)
            cargarCarteras()
          }}
        />
      )}

      {showForm && (
        <FormCartera
          cartera={carteraEditar}
          onClose={() => { setShowForm(false); setCarteraEditar(null) }}
          onSuccess={cargarCarteras}
        />
      )}

      {/* Botón flotante */}
      <button
        onClick={() => { setCarteraEditar(null); setShowForm(true) }}
        style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110 sm:hidden"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

    </AppLayout>
  )
}

function FiltroMenu({ icon: Icon, value, onChange, options }: {
  icon?: LucideIcon
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const label = options.find(o => o.value === value)?.label || ''
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 py-2.5 pl-3.5 pr-2.5 text-sm font-medium transition-colors border rounded-full bg-snow border-fog text-graphite hover:bg-mist"
      >
        {Icon && <Icon size={15} strokeWidth={2} className="text-steel" />}
        {label}
        <ChevronDown size={14} strokeWidth={2} className={`text-steel transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[11rem]">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`block w-full px-3 py-1.5 text-sm text-left transition-colors hover:bg-mist ${value === o.value ? 'text-ink font-medium' : 'text-steel'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
