'use client'

import { useEffect, useState, Suspense, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/AppLayout'
import FormReparto from '../components/FormReparto'
import Notificaciones from '../components/Notificaciones'
import { SkeletonCard } from '../components/Skeleton'
import { formatoMoneda } from '../lib/dinero'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Plus, Search, X, ChevronDown, Users, Receipt, Coins, HandCoins, KeyRound,
  CheckCircle2, Clock, ArrowDownLeft, ArrowUpRight, Scale, PieChart as PieIcon,
  type LucideIcon,
} from 'lucide-react'

const COLORES = [
  '#2c6e49', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EF4444', '#EC4899', '#10B981', '#6366F1',
]

const gradiente = 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)'

export default function CompartidosPage() {
  return (
    <Suspense fallback={null}>
      <Compartidos />
    </Suspense>
  )
}

function Compartidos() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'grupos' | 'repartos'>('grupos')

  useEffect(() => {
    if (searchParams.get('tab') === 'repartos') setTab('repartos')
  }, [searchParams])

  const cambiarTab = (t: 'grupos' | 'repartos') => {
    setTab(t)
    router.replace(`/grupos${t === 'repartos' ? '?tab=repartos' : ''}`, { scroll: false })
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="mb-1 text-sm font-medium text-steel">Compartidos</p>
            <h1 className="text-3xl font-bold text-obsidian">Divide gastos con otras personas</h1>
          </div>
          <Notificaciones />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 mb-8 border w-fit bg-snow border-fog rounded-full">
          {([
            { id: 'grupos' as const, label: 'Grupos', icon: Users },
            { id: 'repartos' as const, label: 'Repartos', icon: Receipt },
          ]).map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => cambiarTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${tab === t.id ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'}`}
              >
                <Icon size={15} strokeWidth={2} /> {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'grupos' ? <GruposPanel router={router} /> : <RepartosPanel router={router} />}
      </div>
    </AppLayout>
  )
}

/* ============================ GRUPOS ============================ */

interface Grupo {
  id: string
  nombre: string
  moneda: string
  codigo_invitacion: string
  creado_por: string
  miembros: number
  mi_saldo: number
  total_mes: number
}

function GruposPanel({ router }: { router: ReturnType<typeof useRouter> }) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [monedaDefault, setMonedaDefault] = useState('USD')
  const [loading, setLoading] = useState(true)
  const [showCrear, setShowCrear] = useState(false)
  const [showUnirse, setShowUnirse] = useState(false)

  const cargar = async () => {
    const res = await fetch('/api/grupos')
    if (res.status === 401) { router.push('/login'); return }
    const json = await res.json()
    setGrupos(json.grupos || [])
    setLoading(false)
  }

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('moneda_default').eq('id', user.id).single()
      if (profile?.moneda_default) setMonedaDefault(profile.moneda_default)
      cargar()
    }
    check()
  }, [])

  // Refresca al volver a la pestaña.
  useEffect(() => {
    const tick = () => { if (!document.hidden) cargar() }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const fmt = (n: number) => formatoMoneda(n, monedaDefault)

  // Métricas globales (aproximación en la moneda por defecto).
  const teDeben = grupos.filter(g => g.mi_saldo > 0.005).reduce((s, g) => s + g.mi_saldo, 0)
  const debes = grupos.filter(g => g.mi_saldo < -0.005).reduce((s, g) => s - g.mi_saldo, 0)
  const gastoMes = grupos.reduce((s, g) => s + g.total_mes, 0)
  const neto = teDeben - debes

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 rounded-2xl bg-fog animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (grupos.length === 0) {
    return (
      <>
        <div className="p-12 text-center border bg-snow border-fog rounded-card">
          <Users size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
          <p className="mb-2 text-steel">Aún no tienes grupos</p>
          <p className="mb-6 text-sm text-ash">Crea un grupo para gastos recurrentes (casa, viaje) o únete con un código de invitación.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setShowCrear(true)} style={{ background: gradiente }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow hover:scale-105 hover:brightness-110">
              <Plus size={18} strokeWidth={2.5} /> Crear grupo
            </button>
            <button onClick={() => setShowUnirse(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border rounded-input border-fog text-graphite hover:bg-mist">
              <KeyRound size={16} strokeWidth={2} /> Unirme con código
            </button>
          </div>
        </div>
        {showCrear && <ModalCrear onClose={() => setShowCrear(false)} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
        {showUnirse && <ModalUnirse onClose={() => setShowUnirse(false)} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
      </>
    )
  }

  return (
    <>
      {/* Acciones */}
      <div className="flex justify-end gap-2 mb-6 -mt-2">
        <button onClick={() => setShowUnirse(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">
          <KeyRound size={15} strokeWidth={2} /> Unirme con código
        </button>
        <button onClick={() => setShowCrear(true)} style={{ background: gradiente }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-transform rounded-full text-snow hover:scale-105 hover:brightness-110">
          <Plus size={16} strokeWidth={2.5} /> Nuevo grupo
        </button>
      </div>

      {/* Hero */}
      <div className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl" style={{ background: gradiente }}>
        <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
        <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
        <div className="relative px-6 py-9 lg:px-8 lg:py-12">
          <div className="mb-8">
            <h2 className="text-xl font-semibold">Tu balance en grupos</h2>
            <p className="text-base text-white/60">{grupos.length} {grupos.length === 1 ? 'grupo activo' : 'grupos activos'}</p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 lg:divide-x lg:divide-white/10">
            <HeroMetrica icon={ArrowDownLeft} label="Te deben" valor={fmt(teDeben)} />
            <HeroMetrica icon={ArrowUpRight} label="Debes" valor={fmt(debes)} className="lg:px-6" />
            <HeroMetrica icon={Scale} label="Balance neto" valor={fmt(neto)}
              nota={<span className={neto > 0.005 ? 'text-emerald-300' : neto < -0.005 ? 'text-red-300' : 'text-white/50'}>
                {neto > 0.005 ? 'A tu favor' : neto < -0.005 ? 'En contra' : 'Al día'}
              </span>} className="lg:px-6" />
            <HeroMetrica icon={Coins} label="Gastos este mes" valor={fmt(gastoMes)} className="lg:pl-6" />
          </div>
        </div>
      </div>

      {/* Tarjetas de grupos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map(g => {
          const saldo = g.mi_saldo
          const alDia = Math.abs(saldo) <= 0.005
          return (
            <button key={g.id} onClick={() => router.push(`/grupos/${g.id}`)}
              className="p-5 text-left transition-all border bg-snow border-fog rounded-card hover:border-pebble hover:shadow-soft active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl" style={{ background: gradiente }}>
                    <Users size={18} strokeWidth={2} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate text-ink">{g.nombre}</p>
                    <p className="text-xs text-ash">{g.miembros} {g.miembros === 1 ? 'miembro' : 'miembros'} · {g.moneda}</p>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold tracking-widest flex-shrink-0 text-steel bg-mist rounded-badge px-2 py-0.5">{g.codigo_invitacion}</span>
              </div>
              <div className="flex items-end justify-between pt-3 border-t border-fog">
                <div>
                  <p className="text-xs text-ash">Este mes</p>
                  <p className="text-sm font-semibold text-ink">{formatoMoneda(g.total_mes, g.moneda)}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-badge ${alDia ? 'text-steel bg-mist' : saldo > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                  {alDia ? 'Al día' : saldo > 0 ? `Te deben ${formatoMoneda(saldo, g.moneda)}` : `Debes ${formatoMoneda(-saldo, g.moneda)}`}
                </span>
              </div>
            </button>
          )
        })}
        <button onClick={() => setShowCrear(true)}
          className="flex flex-col items-center justify-center gap-2 py-10 text-sm font-medium transition-colors border border-dashed rounded-card border-pebble text-graphite hover:bg-mist hover:text-ink min-h-[150px]">
          <Plus size={22} strokeWidth={2} /> Nuevo grupo
        </button>
      </div>

      {showCrear && <ModalCrear onClose={() => setShowCrear(false)} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
      {showUnirse && <ModalUnirse onClose={() => setShowUnirse(false)} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
    </>
  )
}

/* ============================ REPARTOS ============================ */

interface Reparto {
  id: string
  descripcion: string
  monto_total: number
  moneda: string
  metodo: string
  fecha: string
  participantes: number
  pagados: number
  monto_pagado: number
}

function RepartosPanel({ router }: { router: ReturnType<typeof useRouter> }) {
  const [repartos, setRepartos] = useState<Reparto[]>([])
  const [monedaDefault, setMonedaDefault] = useState('HNL')
  const [loading, setLoading] = useState(true)
  const [showCrear, setShowCrear] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [orden, setOrden] = useState('recientes')

  const cargar = async () => {
    const res = await fetch('/api/repartos')
    if (res.status === 401) { router.push('/login'); return }
    const json = await res.json()
    setRepartos(json.repartos || [])
    setLoading(false)
  }

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('moneda_default').eq('id', user.id).single()
      if (profile?.moneda_default) setMonedaDefault(profile.moneda_default)
      cargar()
    }
    check()
  }, [])

  const fmt = (n: number) => formatoMoneda(n, monedaDefault)
  const estadoDe = (r: Reparto) => r.participantes > 0 && r.pagados === r.participantes ? 'liquidado' : 'pendiente'
  const pendienteDe = (r: Reparto) => Math.max(0, r.monto_total - r.monto_pagado)

  const totalMonto = repartos.reduce((s, r) => s + r.monto_total, 0)
  const totalPagado = repartos.reduce((s, r) => s + r.monto_pagado, 0)
  const totalPendiente = Math.max(0, totalMonto - totalPagado)
  const personasPendientes = repartos.reduce((s, r) => s + (r.participantes - r.pagados), 0)
  const liquidados = repartos.filter(r => estadoDe(r) === 'liquidado').length
  const cobradoPct = totalMonto > 0 ? (totalPagado / totalMonto) * 100 : 0

  const q = busqueda.trim().toLowerCase()
  const filtrados = repartos
    .filter(r => filtroEstado === 'todos' ? true : estadoDe(r) === filtroEstado)
    .filter(r => !q || r.descripcion.toLowerCase().includes(q))
    .sort((a, b) => {
      if (orden === 'monto') return b.monto_total - a.monto_total
      if (orden === 'pendiente') return pendienteDe(b) - pendienteDe(a)
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    })

  const topPendientes = [...repartos]
    .filter(r => pendienteDe(r) > 0)
    .sort((a, b) => pendienteDe(b) - pendienteDe(a))
    .slice(0, 4)

  const distribucion = [...repartos]
    .filter(r => r.monto_total > 0)
    .sort((a, b) => b.monto_total - a.monto_total)
    .slice(0, 6)
    .map((r, i) => ({ nombre: r.descripcion, valor: r.monto_total, color: COLORES[i % COLORES.length] }))

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 rounded-2xl bg-fog animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (repartos.length === 0) {
    return (
      <>
        <div className="p-12 text-center border bg-snow border-fog rounded-card">
          <Receipt size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
          <p className="mb-2 text-steel">Aún no tienes repartos</p>
          <p className="mb-6 text-sm text-ash">Divide un gasto puntual entre varias personas y sigue quién ya pagó.</p>
          <button onClick={() => setShowCrear(true)} style={{ background: gradiente }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow hover:scale-105 hover:brightness-110">
            <Plus size={18} strokeWidth={2.5} /> Crear primer reparto
          </button>
        </div>
        {showCrear && <FormReparto monedaDefault={monedaDefault} onClose={() => setShowCrear(false)} onSuccess={(id) => router.push(`/repartos/${id}`)} />}
      </>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-6 -mt-2">
        <button onClick={() => setShowCrear(true)} style={{ background: gradiente }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-transform rounded-full text-snow hover:scale-105 hover:brightness-110">
          <Plus size={16} strokeWidth={2.5} /> Nuevo reparto
        </button>
      </div>

      {/* Hero */}
      <div className="relative mb-8 overflow-hidden text-white shadow-soft rounded-2xl" style={{ background: gradiente }}>
        <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
        <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />
        <div className="relative px-6 py-9 lg:px-8 lg:py-12">
          <div className="mb-8">
            <h2 className="text-xl font-semibold">Resumen de tus repartos</h2>
            <p className="text-base text-white/60">{repartos.length} {repartos.length === 1 ? 'reparto' : 'repartos'} · {liquidados} liquidados</p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 lg:divide-x lg:divide-white/10">
            <HeroMetrica icon={Coins} label="Total repartido" valor={fmt(totalMonto)} />
            <HeroMetrica icon={CheckCircle2} label="Ya cobrado" valor={fmt(totalPagado)}
              nota={<span className="text-emerald-300">{Math.round(cobradoPct)}% del total</span>} className="lg:px-6" />
            <HeroMetrica icon={HandCoins} label="Por cobrar" valor={fmt(totalPendiente)} className="lg:px-6" />
            <HeroMetrica icon={Users} label="Personas pendientes" valor={`${personasPendientes}`} className="lg:pl-6" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} strokeWidth={2} className="absolute -translate-y-1/2 left-3.5 top-1/2 text-ash" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar reparto..."
            className="w-full py-2.5 pl-10 pr-10 text-sm text-ink transition-colors border bg-snow border-fog placeholder-ash rounded-full focus:outline-none focus:border-obsidian" />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute flex items-center justify-center w-6 h-6 -translate-y-1/2 rounded-full right-2.5 top-1/2 text-ash hover:text-ink hover:bg-fog">
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FiltroMenu icon={Clock} value={filtroEstado} onChange={setFiltroEstado} options={[
            { value: 'todos', label: 'Todos' },
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'liquidado', label: 'Liquidados' },
          ]} />
          <FiltroMenu value={orden} onChange={setOrden} options={[
            { value: 'recientes', label: 'Más recientes' },
            { value: 'monto', label: 'Mayor monto' },
            { value: 'pendiente', label: 'Más por cobrar' },
          ]} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lista */}
        <div className="lg:col-span-2">
          {filtrados.length === 0 ? (
            <div className="px-6 py-16 text-center border bg-snow border-fog rounded-card">
              <Search size={32} strokeWidth={1.5} className="mx-auto mb-3 text-pebble" />
              <p className="text-sm text-steel">Sin repartos que coincidan con el filtro</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filtrados.map(r => {
                const pct = r.monto_total > 0 ? Math.round((r.monto_pagado / r.monto_total) * 100) : 0
                const liquidado = estadoDe(r) === 'liquidado'
                return (
                  <button key={r.id} onClick={() => router.push(`/repartos/${r.id}`)}
                    className="p-5 text-left transition-all border bg-snow border-fog rounded-card hover:border-pebble hover:shadow-soft active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <p className="font-semibold truncate text-ink">{r.descripcion}</p>
                        <p className="text-xs text-ash mt-0.5">
                          {r.participantes} {r.participantes === 1 ? 'persona' : 'personas'} · {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-badge ${liquidado ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                        {liquidado ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <Clock size={12} strokeWidth={2.5} />}
                        {liquidado ? 'Liquidado' : 'Pendiente'}
                      </span>
                    </div>
                    <div className="flex items-end justify-between mb-2">
                      <span className="text-xl font-bold text-obsidian">{formatoMoneda(r.monto_total, r.moneda)}</span>
                      {!liquidado && <span className="text-xs font-medium text-steel">Faltan {formatoMoneda(pendienteDe(r), r.moneda)}</span>}
                    </div>
                    <div className="w-full h-2 overflow-hidden rounded-full bg-mist">
                      <div className="h-full transition-all rounded-full" style={{ width: `${pct}%`, background: liquidado ? '#10b981' : '#2c6e49' }} />
                    </div>
                    <p className="mt-1.5 text-xs text-steel">{pct}% pagado · {r.pagados}/{r.participantes} personas</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="space-y-6 lg:col-span-1">
          <div className="p-5 border bg-snow border-fog rounded-card">
            <h3 className="mb-4 text-sm font-semibold text-steel">Resumen de cobros</h3>
            <p className="text-xs text-ash">Por cobrar</p>
            <p className="text-2xl font-bold text-obsidian">{fmt(totalPendiente)}</p>
            <div className="w-full h-2 mt-3 overflow-hidden rounded-full bg-fog">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${cobradoPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-steel">{Math.round(cobradoPct)}% cobrado · {liquidados}/{repartos.length} repartos liquidados</p>
          </div>

          <div className="p-5 border bg-snow border-fog rounded-card">
            <h3 className="mb-4 text-sm font-semibold text-steel">Pendientes de cobro</h3>
            {topPendientes.length === 0 ? (
              <div className="flex items-center gap-2 py-2 text-sm text-emerald-600">
                <CheckCircle2 size={16} strokeWidth={2} /> ¡Todo cobrado!
              </div>
            ) : (
              <div className="space-y-3">
                {topPendientes.map(r => (
                  <button key={r.id} onClick={() => router.push(`/repartos/${r.id}`)}
                    className="flex items-center justify-between w-full gap-3 text-left group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate text-ink group-hover:text-obsidian">{r.descripcion}</p>
                      <p className="text-xs text-ash">{r.participantes - r.pagados} {r.participantes - r.pagados === 1 ? 'persona' : 'personas'} sin pagar</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-amber-600">{formatoMoneda(pendienteDe(r), r.moneda)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border bg-snow border-fog rounded-card">
            <h3 className="mb-5 text-sm font-semibold text-steel">Distribución del gasto</h3>
            {distribucion.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <PieIcon size={36} strokeWidth={1.5} className="mb-3 text-pebble" />
                <p className="text-sm text-steel">Sin datos para mostrar</p>
              </div>
            ) : (
              <div className="flex items-center gap-5">
                <div className="relative flex-shrink-0 w-[136px] h-[136px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distribucion} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} cornerRadius={4} dataKey="valor" stroke="none">
                        {distribucion.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [fmt(Number(value) || 0), 'Total']}
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ececee', borderRadius: 16, color: '#18181b' }}
                        labelStyle={{ color: '#71717a' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-medium text-steel">Total</span>
                    <span className="text-sm font-bold leading-tight text-ink">{fmt(totalMonto)}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-2.5">
                  {distribucion.map((d, i) => {
                    const pct = totalMonto > 0 ? Math.round((d.valor / totalMonto) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="flex-1 min-w-0 text-sm truncate text-ink">{d.nombre}</span>
                        <span className="w-8 text-xs font-medium text-right text-steel">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCrear && <FormReparto monedaDefault={monedaDefault} onClose={() => setShowCrear(false)} onSuccess={(id) => router.push(`/repartos/${id}`)} />}
    </>
  )
}

/* ============================ MODALES GRUPO ============================ */

function ModalCrear({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/grupos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, moneda }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Error al crear'); setLoading(false); return }
    onSuccess(json.grupo.id)
  }

  return (
    <Modal titulo="Crear grupo" onClose={onClose}>
      <form onSubmit={submit} className="px-5 py-5 space-y-5 sm:px-6">
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Nombre del grupo</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Casa, Viaje a la playa" required autoFocus
            className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
        </div>
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Moneda</label>
          <select value={moneda} onChange={e => setMoneda(e.target.value)}
            className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent rounded-input focus:outline-none focus:border-obsidian focus:bg-snow">
            <option value="USD">USD — Dólar ($)</option>
            <option value="HNL">HNL — Lempira (L)</option>
            <option value="EUR">EUR — Euro (€)</option>
            <option value="MXN">MXN — Peso mexicano ($)</option>
          </select>
        </div>
        {error && <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">{error}</div>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={onClose} className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">Cancelar</button>
          <button type="submit" disabled={loading} style={{ background: gradiente }}
            className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40">{loading ? 'Creando...' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ModalUnirse({ onClose, onSuccess }: { onClose: () => void; onSuccess: (id: string) => void }) {
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/grupos/unirse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Error al unirse'); setLoading(false); return }
    onSuccess(json.grupo_id)
  }

  return (
    <Modal titulo="Unirme a un grupo" onClose={onClose}>
      <form onSubmit={submit} className="px-5 py-5 space-y-5 sm:px-6">
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Código de invitación</label>
          <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej: AB3K9P" required maxLength={6} autoFocus
            className="w-full px-4 py-3 font-mono text-lg tracking-widest text-center uppercase transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
        </div>
        {error && <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">{error}</div>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={onClose} className="py-3 font-medium transition-colors border rounded-full border-fog text-graphite hover:bg-mist">Cancelar</button>
          <button type="submit" disabled={loading} style={{ background: gradiente }}
            className="py-3 font-medium transition-all rounded-full text-snow hover:brightness-110 disabled:opacity-40">{loading ? 'Uniéndome...' : 'Unirme'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
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
            <h2 className="text-base font-semibold text-ink sm:text-lg">{titulo}</h2>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ============================ COMPARTIDOS UI ============================ */

function HeroMetrica({ icon: Icon, label, valor, nota, className = '' }: {
  icon: LucideIcon
  label: string
  valor: string
  nota?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start gap-4 ${className}`}>
      <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
        <Icon size={20} strokeWidth={2} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-base text-white/60">{label}</p>
        <p className="text-2xl font-bold break-words sm:text-3xl">{valor}</p>
        {nota && <p className="mt-1.5 text-sm font-medium">{nota}</p>}
      </div>
    </div>
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
      <button type="button" onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 py-2.5 pl-3.5 pr-2.5 text-sm font-medium transition-colors border rounded-full bg-snow border-fog text-graphite hover:bg-mist">
        {Icon && <Icon size={15} strokeWidth={2} className="text-steel" />}
        {label}
        <ChevronDown size={14} strokeWidth={2} className={`text-steel transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 py-1 mt-1 border shadow-soft bg-snow border-fog rounded-xl min-w-[11rem]">
            {options.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                className={`block w-full px-3 py-1.5 text-sm text-left transition-colors hover:bg-mist ${value === o.value ? 'text-ink font-medium' : 'text-steel'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
