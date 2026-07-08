'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import AppLayout from '../components/AppLayout'
import { SkeletonCard } from '../components/Skeleton'

interface Grupo {
  id: string
  nombre: string
  moneda: string
  codigo_invitacion: string
  miembros: number
}

export default function Grupos() {
  const router = useRouter()
  const [grupos, setGrupos] = useState<Grupo[]>([])
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
      cargar()
    }
    check()
  }, [router])

  // Refresca al volver a la pestaña, para reflejar grupos nuevos o cambios de miembros.
  useEffect(() => {
    const tick = () => { if (!document.hidden) cargar() }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1728px] px-6 py-8 mx-auto space-y-6">
          <div className="w-56 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] px-6 py-8 mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-obsidian">Gastos compartidos</h1>
            <p className="text-sm text-steel">Divide gastos con otras personas y cuadra cuentas</p>
          </div>
          <button
            onClick={() => setShowUnirse(true)}
            className="hidden px-4 py-2 text-sm font-medium transition-all border rounded-full sm:block border-pebble text-graphite hover:bg-fog"
          >
            Unirme con código
          </button>
        </div>

        {grupos.length === 0 ? (
          <div className="p-12 text-center border bg-snow border-fog rounded-card">
            <span className="block mb-4 text-5xl">👥</span>
            <p className="mb-2 text-steel">Aún no tienes grupos</p>
            <p className="mb-6 text-sm text-ash">Crea uno o únete con un código de invitación</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowCrear(true)} className="px-5 py-2.5 rounded-full bg-obsidian text-snow font-medium shadow-pill hover:bg-graphite">
                Crear grupo
              </button>
              <button onClick={() => setShowUnirse(true)} className="px-5 py-2.5 rounded-full border border-pebble text-graphite font-medium hover:bg-fog">
                Unirme con código
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {grupos.map(g => (
              <button
                key={g.id}
                onClick={() => router.push(`/grupos/${g.id}`)}
                className="p-6 text-left transition-all border bg-snow border-fog rounded-card hover:border-pebble"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 text-2xl bg-obsidian/5 rounded-2xl">👥</div>
                  <div>
                    <p className="font-semibold text-ink">{g.nombre}</p>
                    <p className="text-xs text-ash">{g.miembros} {g.miembros === 1 ? 'miembro' : 'miembros'} · {g.moneda}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-fog">
                  <span className="text-xs text-steel">Código</span>
                  <span className="font-mono text-sm font-semibold tracking-widest text-obsidian">{g.codigo_invitacion}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowCrear(true)}
        className="fixed flex items-center justify-center text-2xl transition-all rounded-full text-snow bg-obsidian hover:bg-graphite shadow-pill bottom-24 right-8 w-14 h-14 hover:scale-110"
      >
        +
      </button>

      {showCrear && <ModalCrear onClose={() => setShowCrear(false)} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
      {showUnirse && <ModalUnirse onClose={() => setShowUnirse(false)} onSuccess={(id) => router.push(`/grupos/${id}`)} />}
    </AppLayout>
  )
}

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
      <form onSubmit={submit} className="p-6 space-y-5">
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Nombre del grupo</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Casa, Viaje a la playa" required
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
          <button type="button" onClick={onClose} className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">Cancelar</button>
          <button type="submit" disabled={loading} className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40">{loading ? 'Creando...' : 'Crear'}</button>
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
      <form onSubmit={submit} className="p-6 space-y-5">
        <div>
          <label className="block mb-2 text-sm font-medium text-graphite">Código de invitación</label>
          <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej: AB3K9P" required maxLength={6}
            className="w-full px-4 py-3 font-mono text-lg tracking-widest text-center transition-colors border uppercase bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow" />
        </div>
        {error && <div className="px-4 py-3 text-sm text-red-600 border bg-red-50 border-red-200 rounded-input">{error}</div>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={onClose} className="py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">Cancelar</button>
          <button type="submit" disabled={loading} className="py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill disabled:opacity-40">{loading ? 'Uniéndome...' : 'Unirme'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-obsidian/30 backdrop-blur-sm sm:items-center">
      <div className="bg-snow border border-fog rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-fog">
          <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
          <button onClick={onClose} className="text-xl text-ash hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
