'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle2, AlertTriangle, ChevronRight, X, RotateCcw } from 'lucide-react'

interface Aviso {
  id: string
  clave: string
  periodo: string
  tipo: 'advertencia' | 'peligro'
  titulo: string
  mensaje: string
  href: string
}

export default function Notificaciones() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [descartados, setDescartados] = useState(0)
  const [mostrar, setMostrar] = useState(false)
  const router = useRouter()

  useEffect(() => { cargar() }, [])

  // Los avisos se calculan en /api/notificaciones. Antes se armaban en el
  // cliente con una consulta por presupuesto y sin convertir monedas.
  const cargar = async () => {
    try {
      const res = await fetch('/api/notificaciones')
      if (!res.ok) return
      const json = await res.json()
      setAvisos(json.avisos || [])
      setDescartados(json.descartados || 0)
    } catch {
      // Sin conexión se deja lo que ya estaba en pantalla.
    }
  }

  // El descarte se guarda por periodo: el aviso vuelve el siguiente ciclo.
  const descartar = async (a: Aviso) => {
    setAvisos(prev => prev.filter(x => x.clave !== a.clave))
    setDescartados(n => n + 1)
    try {
      await fetch('/api/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: a.clave, periodo: a.periodo }),
      })
    } catch {
      cargar()
    }
  }

  const restaurar = async () => {
    try {
      await fetch('/api/notificaciones', { method: 'DELETE' })
    } finally {
      cargar()
    }
  }

  const cantidad = avisos.length

  return (
    <div className="relative">
      <button
        onClick={() => setMostrar(!mostrar)}
        aria-label={`Notificaciones${cantidad > 0 ? ` (${cantidad})` : ''}`}
        className="relative flex items-center justify-center transition-colors border rounded-full w-11 h-11 bg-snow border-fog shadow-soft text-graphite hover:text-ink hover:bg-mist"
      >
        <Bell size={19} strokeWidth={2} />
        {cantidad > 0 && (
          <span className="absolute flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full -top-1 -right-1">
            {cantidad > 9 ? '9+' : cantidad}
          </span>
        )}
      </button>

      {mostrar && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMostrar(false)} />

          {/* En móvil el panel se ancla al borde de la pantalla para no salirse. */}
          <div className="fixed left-4 right-4 z-50 overflow-hidden border shadow-soft top-20 bg-snow border-fog rounded-card sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80">
            <div className="flex items-center justify-between gap-2 p-4 border-b border-fog">
              <h3 className="text-sm font-semibold text-ink">Notificaciones</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-steel">{cantidad} {cantidad === 1 ? 'alerta' : 'alertas'}</span>
                <button
                  onClick={() => setMostrar(false)}
                  aria-label="Cerrar notificaciones"
                  className="flex items-center justify-center w-7 h-7 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist sm:hidden"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            </div>

            {cantidad === 0 ? (
              <div className="p-6 text-center">
                <CheckCircle2 size={32} strokeWidth={1.75} className="mx-auto mb-2 text-emerald-500" />
                <p className="text-sm text-graphite">Todo en orden</p>
                <p className="mt-1 text-xs text-steel">
                  {descartados > 0
                    ? `${descartados} ${descartados === 1 ? 'aviso descartado' : 'avisos descartados'} este periodo`
                    : 'No tienes alertas pendientes'}
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[60vh] sm:max-h-80">
                {avisos.map(n => (
                  <div
                    key={n.clave}
                    className={`relative border-b border-fog border-l-2 transition-colors ${
                      n.tipo === 'peligro'
                        ? 'bg-red-50 border-l-red-500 hover:bg-red-100/60'
                        : 'bg-amber-50 border-l-amber-500 hover:bg-amber-100/60'
                    }`}
                  >
                    <button
                      onClick={() => { setMostrar(false); router.push(n.href) }}
                      className="w-full p-4 pr-11 text-left"
                    >
                      <p className="text-sm font-medium text-ink">{n.titulo}</p>
                      <p className="text-graphite text-xs mt-0.5">{n.mensaje}</p>
                      <p className={`flex items-center gap-1 text-xs mt-1 font-medium ${
                        n.tipo === 'peligro' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        <AlertTriangle size={13} strokeWidth={2} />
                        {n.tipo === 'peligro' ? 'Atención requerida' : 'Revisar'}
                      </p>
                    </button>
                    <button
                      onClick={() => descartar(n)}
                      aria-label="Descartar aviso"
                      title="Descartar hasta el próximo periodo"
                      className="absolute flex items-center justify-center w-8 h-8 transition-colors -translate-y-1/2 rounded-full right-2 top-1/2 text-ash hover:text-ink hover:bg-snow/80"
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 p-3 border-t border-fog">
              <button
                onClick={() => { setMostrar(false); router.push('/presupuesto') }}
                className="inline-flex items-center gap-0.5 text-xs font-medium transition-colors text-steel hover:text-ink"
              >
                Ver presupuestos
                <ChevronRight size={14} strokeWidth={2} />
              </button>
              {descartados > 0 && (
                <button
                  onClick={restaurar}
                  className="inline-flex items-center gap-1 text-xs font-medium transition-colors text-steel hover:text-ink"
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  Ver descartados ({descartados})
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
