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
  ShieldCheck, User, Activity,
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

type Accion = null | 'crear-grupo' | 'unirse' | 'crear-reparto'

function Compartidos() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'grupos' | 'repartos'>('grupos')
  const [accion, setAccion] = useState<Accion>(null)

  useEffect(() => {
    if (searchParams.get('tab') === 'repartos') setTab('repartos')
  }, [searchParams])

  const cambiarTab = (t: 'grupos' | 'repartos') => {
    setTab(t)
    router.replace(`/grupos${t === 'repartos' ? '?tab=repartos' : ''}`, { scroll: false })
  }

  const nuevo = () => setAccion(tab === 'grupos' ? 'crear-grupo' : 'crear-reparto')
  const labelNuevo = tab === 'grupos' ? 'Nuevo grupo' : 'Nuevo reparto'

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Encabezado */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="mb-1 text-sm font-medium text-steel">Compartidos</p>
            <h1 className="text-3xl font-bold text-obsidian">Divide gastos con otras personas</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={nuevo}
              style={{ background: gradiente }}
              className="items-center hidden gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow sm:inline-flex hover:scale-105 hover:brightness-110"
            >
              <Plus size={18} strokeWidth={2.5} /> {labelNuevo}
            </button>
            <Notificaciones />
          </div>
        </div>

        {tab === 'grupos'
          ? <GruposPanel router={router} accion={accion} setAccion={setAccion} tab={tab} cambiarTab={cambiarTab} />
          : <RepartosPanel router={router} accion={accion} setAccion={setAccion} tab={tab} cambiarTab={cambiarTab} />}
      </div>

      {/* Botón flotante (móvil) */}
      <button
        onClick={nuevo}
        style={{ background: gradiente }}
        className="fixed z-40 flex items-center justify-center transition-transform rounded-full text-snow bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 hover:scale-105 hover:brightness-110 sm:hidden"
        aria-label={labelNuevo}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </AppLayout>
  )
}

function Tabs({ tab, onChange }: { tab: 'grupos' | 'repartos'; onChange: (t: 'grupos' | 'repartos') => void }) {
  return (
    <div className="flex items-center flex-shrink-0 gap-1 p-1 border w-fit bg-snow border-fog rounded-full">
      {([
        { id: 'grupos' as const, label: 'Grupos', icon: Users },
        { id: 'repartos' as const, label: 'Repartos', icon: Receipt },
      ]).map(t => {
        const Icon = t.icon
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${tab === t.id ? 'bg-obsidian text-snow' : 'text-steel hover:text-ink'}`}
          >
            <Icon size={15} strokeWidth={2} /> {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* ============================ GRUPOS ============================ */

interface Grupo {
  id: string
  nombre: string
  moneda: string
  icono: string
  color: string
  codigo_invitacion: string
  creado_por: string
  mi_rol: string
  miembros: number
  mi_saldo: number
  total_mes: number
  ultima_actividad: { descripcion: string; fecha: string } | null
}

interface Actividad {
  id: string
  grupo_id: string
  grupo_nombre: string
  grupo_color: string
  grupo_icono: string
  descripcion: string
  monto: number
  moneda: string
  autor: string
  fecha: string
}

const ICONOS_GRUPO = ['👥', '🏠', '✈️', '🎉', '🍽️', '🚗', '🏖️', '⚽', '🎓', '💼', '🛒', '🎁', '🏢', '🐾', '💡', '❤️']

// "hace X" legible a partir de un ISO.
function haceTiempo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })
}

function GruposPanel({ router, accion, setAccion, tab, cambiarTab }: {
  router: ReturnType<typeof useRouter>
  accion: Accion
  setAccion: (a: Accion) => void
  tab: 'grupos' | 'repartos'
  cambiarTab: (t: 'grupos' | 'repartos') => void
}) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [actividad, setActividad] = useState<Actividad[]>([])
  const [monedaDefault, setMonedaDefault] = useState('USD')
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const showCrear = accion === 'crear-grupo'
  const showUnirse = accion === 'unirse'
  const cerrar = () => setAccion(null)

  const cargar = async () => {
    const res = await fetch('/api/grupos')
    if (res.status === 401) { router.push('/login'); return }
    const json = await res.json()
    setGrupos(json.grupos || [])
    setActividad(json.actividad || [])
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

  const modales = (
    <>
      {showCrear && <ModalCrear onClose={cerrar} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
      {showUnirse && <ModalUnirse onClose={cerrar} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
    </>
  )

  if (grupos.length === 0) {
    return (
      <>
        <div className="mb-6"><Tabs tab={tab} onChange={cambiarTab} /></div>
        <div className="p-12 text-center border bg-snow border-fog rounded-card">
          <Users size={40} strokeWidth={1.5} className="mx-auto mb-4 text-pebble" />
          <p className="mb-2 text-steel">Aún no tienes grupos</p>
          <p className="mb-6 text-sm text-ash">Crea un grupo para gastos recurrentes (casa, viaje) o únete con un código de invitación.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setAccion('crear-grupo')} style={{ background: gradiente }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-transform rounded-input text-snow hover:scale-105 hover:brightness-110">
              <Plus size={18} strokeWidth={2.5} /> Crear grupo
            </button>
            <button onClick={() => setAccion('unirse')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border rounded-input border-fog text-graphite hover:bg-mist">
              <KeyRound size={16} strokeWidth={2} /> Unirme con código
            </button>
          </div>
        </div>
        {modales}
      </>
    )
  }

  const maxMes = Math.max(...grupos.map(g => g.total_mes), 1)
  const miembrosTotales = grupos.reduce((s, g) => s + g.miembros, 0)
  const q = busqueda.trim().toLowerCase()
  const filtrados = q ? grupos.filter(g => g.nombre.toLowerCase().includes(q)) : grupos

  return (
    <>
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden text-white shadow-soft rounded-2xl" style={{ background: gradiente }}>
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

      {/* Controles (debajo del hero): tabs + buscador (col 1) · unirme (col 2) */}
      <div className="grid grid-cols-1 gap-3 mb-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:col-span-2">
          <Tabs tab={tab} onChange={cambiarTab} />
          <div className="relative flex-1">
            <Search size={16} strokeWidth={2} className="absolute -translate-y-1/2 left-3.5 top-1/2 text-ash" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar grupo..."
              className="w-full py-2 pl-10 pr-10 text-sm text-ink transition-colors border bg-snow border-fog placeholder-ash rounded-full focus:outline-none focus:border-obsidian" />
            {busqueda && (
              <button onClick={() => setBusqueda('')}
                className="absolute flex items-center justify-center w-6 h-6 -translate-y-1/2 rounded-full right-2.5 top-1/2 text-ash hover:text-ink hover:bg-fog">
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div className="flex lg:justify-end lg:col-span-1">
          <button onClick={() => setAccion('unirse')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border rounded-full bg-snow border-fog text-graphite hover:bg-mist">
            <KeyRound size={15} strokeWidth={2} /> Unirme con código
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lista de grupos */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-steel">Mis grupos</h3>
            <span className="text-xs text-ash">{filtrados.length} {filtrados.length === 1 ? 'grupo' : 'grupos'}</span>
          </div>
          <div className="overflow-hidden border bg-snow border-fog rounded-card">
            {filtrados.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Search size={28} strokeWidth={1.5} className="mx-auto mb-3 text-pebble" />
                <p className="text-sm text-steel">Ningún grupo coincide con "{busqueda}"</p>
              </div>
            )}
            {filtrados.map((g) => {
              const saldo = g.mi_saldo
              const alDia = Math.abs(saldo) <= 0.005
              const color = g.color
              const esAdmin = g.mi_rol === 'admin'
              return (
                <button key={g.id} onClick={() => router.push(`/grupos/${g.id}`)}
                  className="flex items-center w-full gap-4 px-5 py-4 text-left transition-colors border-b border-fog last:border-b-0 hover:bg-mist/50">
                  <div className="flex items-center justify-center flex-shrink-0 text-xl w-12 h-12 rounded-xl" style={{ backgroundColor: color + '1a' }}>
                    {g.icono}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate text-ink">{g.nombre}</p>
                      <span className={`inline-flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-badge ${esAdmin ? 'text-emerald-700 bg-emerald-50' : 'text-steel bg-mist'}`}>
                        {esAdmin ? <ShieldCheck size={11} strokeWidth={2.5} /> : <User size={11} strokeWidth={2.5} />}
                        {esAdmin ? 'Administrador' : 'Miembro'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Avatares n={g.miembros} />
                      <span className="text-xs text-ash">{g.miembros} {g.miembros === 1 ? 'miembro' : 'miembros'}</span>
                    </div>
                    <p className="mt-1 text-xs truncate text-ash">
                      {g.ultima_actividad
                        ? <>Última: {g.ultima_actividad.descripcion} · {haceTiempo(g.ultima_actividad.fecha)}</>
                        : 'Sin actividad todavía'}
                    </p>
                    <div className="w-full h-1.5 mt-2 overflow-hidden rounded-full bg-fog max-w-[220px]">
                      <div className="h-full rounded-full" style={{ width: `${(g.total_mes / maxMes) * 100}%`, backgroundColor: color }} />
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-ash">Este mes</p>
                    <p className="text-sm font-semibold text-ink">{formatoMoneda(g.total_mes, g.moneda)}</p>
                    <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 text-xs font-medium rounded-badge ${alDia ? 'text-steel bg-mist' : saldo > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                      {alDia ? 'Al día' : saldo > 0 ? `Te deben ${formatoMoneda(saldo, g.moneda)}` : `Debes ${formatoMoneda(-saldo, g.moneda)}`}
                    </span>
                  </div>
                </button>
              )
            })}
            <button onClick={() => setAccion('crear-grupo')}
              className="flex items-center justify-center w-full gap-2 py-4 text-sm font-medium transition-colors text-graphite hover:bg-mist hover:text-ink">
              <Plus size={18} strokeWidth={2} /> Nuevo grupo
            </button>
          </div>
        </div>

        {/* Insights */}
        <div className="space-y-6 lg:col-span-1">
          <div className="p-5 border bg-snow border-fog rounded-card">
            <h3 className="mb-4 text-sm font-semibold text-steel">Resumen general</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatMini icon={Users} label="Grupos" valor={`${grupos.length}`} color="#2c6e49" />
              <StatMini icon={User} label="Miembros" valor={`${miembrosTotales}`} color="#3B82F6" />
              <StatMini icon={Coins} label="Gasto del mes" valor={fmt(gastoMes)} color="#F59E0B" full />
            </div>
          </div>

          <div className="p-5 border bg-snow border-fog rounded-card">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} strokeWidth={2} className="text-steel" />
              <h3 className="text-sm font-semibold text-steel">Actividad reciente</h3>
            </div>
            {actividad.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity size={32} strokeWidth={1.5} className="mb-3 text-pebble" />
                <p className="text-sm text-steel">Aún no hay movimientos</p>
              </div>
            ) : (
              <div className="space-y-1">
                {actividad.map(a => (
                  <button key={a.id} onClick={() => router.push(`/grupos/${a.grupo_id}`)}
                    className="flex items-center w-full gap-3 px-2 py-2 -mx-2 text-left transition-colors rounded-xl hover:bg-mist">
                    <span className="flex items-center justify-center flex-shrink-0 text-base rounded-full w-9 h-9" style={{ backgroundColor: a.grupo_color + '1a' }}>
                      {a.grupo_icono}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate text-ink">
                        <span className="font-medium">{a.autor}</span> agregó <span className="font-medium">{a.descripcion}</span>
                      </p>
                      <p className="text-xs truncate text-ash">{a.grupo_nombre} · {haceTiempo(a.fecha)}</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-ink">{formatoMoneda(a.monto, a.moneda)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 border bg-emerald-50/50 border-emerald-100 rounded-card">
            <div className="flex items-center gap-2 mb-2 text-emerald-700">
              <HandCoins size={16} strokeWidth={2} />
              <h3 className="text-sm font-semibold">Consejo rápido</h3>
            </div>
            <p className="text-sm text-graphite">Comparte el código de invitación de cada grupo para que tus contactos se unan y registren gastos juntos.</p>
          </div>
        </div>
      </div>

      {modales}
    </>
  )
}

function Avatares({ n }: { n: number }) {
  const visibles = Math.min(n, 3)
  const extra = n - visibles
  return (
    <div className="flex -space-x-1.5">
      {Array.from({ length: visibles }).map((_, i) => (
        <span key={i} className="inline-flex items-center justify-center w-5 h-5 text-[9px] font-semibold rounded-full ring-2 ring-snow text-steel"
          style={{ backgroundColor: COLORES[i % COLORES.length] + '30' }}>
          {String.fromCharCode(65 + i)}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 text-[9px] font-semibold rounded-full ring-2 ring-snow bg-fog text-steel">
          +{extra}
        </span>
      )}
    </div>
  )
}

function StatMini({ icon: Icon, label, valor, color, full }: { icon: LucideIcon; label: string; valor: string; color: string; full?: boolean }) {
  return (
    <div className={`p-3.5 border rounded-card border-fog bg-mist/40 ${full ? 'col-span-2' : ''}`}>
      <span className="inline-flex items-center justify-center w-8 h-8 mb-2 rounded-lg" style={{ backgroundColor: color + '1a', color }}>
        <Icon size={16} strokeWidth={2.5} />
      </span>
      <p className="text-xs text-ash">{label}</p>
      <p className="text-lg font-bold leading-tight text-ink">{valor}</p>
    </div>
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

function RepartosPanel({ router, accion, setAccion, tab, cambiarTab }: {
  router: ReturnType<typeof useRouter>
  accion: Accion
  setAccion: (a: Accion) => void
  tab: 'grupos' | 'repartos'
  cambiarTab: (t: 'grupos' | 'repartos') => void
}) {
  const [repartos, setRepartos] = useState<Reparto[]>([])
  const [monedaDefault, setMonedaDefault] = useState('HNL')
  const [loading, setLoading] = useState(true)
  const showCrear = accion === 'crear-reparto'
  const setShowCrear = (v: boolean) => setAccion(v ? 'crear-reparto' : null)
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
        <div className="mb-6"><Tabs tab={tab} onChange={cambiarTab} /></div>
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

      {/* Controles (debajo del hero): tabs · buscador · filtros */}
      <div className="flex flex-col gap-3 mb-6 lg:flex-row lg:items-center">
        <Tabs tab={tab} onChange={cambiarTab} />
        <div className="relative flex-1 lg:max-w-xs">
          <Search size={16} strokeWidth={2} className="absolute -translate-y-1/2 left-3.5 top-1/2 text-ash" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar reparto..."
            className="w-full py-2 pl-10 pr-10 text-sm text-ink transition-colors border bg-snow border-fog placeholder-ash rounded-full focus:outline-none focus:border-obsidian" />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute flex items-center justify-center w-6 h-6 -translate-y-1/2 rounded-full right-2.5 top-1/2 text-ash hover:text-ink hover:bg-fog">
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
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
  const [icono, setIcono] = useState('👥')
  const [color, setColor] = useState(COLORES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/grupos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, moneda, icono, color }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Error al crear'); setLoading(false); return }
    onSuccess(json.grupo.id)
  }

  return (
    <Modal titulo="Crear grupo" onClose={onClose}>
      <form onSubmit={submit} className="px-5 py-5 space-y-5 sm:px-6">
        {/* Vista previa */}
        <div className="flex items-center gap-3 p-4 border rounded-card border-fog bg-mist/40">
          <div className="flex items-center justify-center flex-shrink-0 text-2xl w-14 h-14 rounded-2xl" style={{ backgroundColor: color + '1a' }}>
            {icono}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate text-ink">{nombre || 'Nombre del grupo'}</p>
            <p className="text-xs text-ash">{moneda} · tú serás administrador</p>
          </div>
        </div>

        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Nombre del grupo</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Casa, Viaje a la playa" required autoFocus
            className="w-full px-4 py-3 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
        </div>

        {/* Icono */}
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Icono</label>
          <div className="grid grid-cols-8 gap-2">
            {ICONOS_GRUPO.map(ic => (
              <button key={ic} type="button" onClick={() => setIcono(ic)}
                className={`flex items-center justify-center h-10 text-xl transition-all rounded-xl ${icono === ic ? 'bg-obsidian/5 ring-2 ring-obsidian' : 'bg-mist hover:bg-fog'}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Color</label>
          <div className="flex flex-wrap gap-3">
            {COLORES.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-obsidian ring-offset-2 ring-offset-snow scale-110' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
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
