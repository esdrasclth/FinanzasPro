'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import AppLayout from '../../components/AppLayout'
import FormGastoCompartido from '../../components/FormGastoCompartido'
import FormLiquidar from '../../components/FormLiquidar'
import { formatoMoneda, simboloMoneda } from '../../lib/dinero'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

interface Miembro { user_id: string; nombre: string; email?: string }
interface Saldo { user_id: string; nombre: string; pagado: number; tocaba: number; neto: number }
interface Sugerencia { de_user_id: string; de_nombre: string; a_user_id: string; a_nombre: string; monto: number }

export default function GrupoDetalle() {
  const router = useRouter()
  const params = useParams()
  const grupoId = params.id as string

  const [grupo, setGrupo] = useState<any>(null)
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [removidos, setRemovidos] = useState<Miembro[]>([])
  const [yo, setYo] = useState('')
  const [gastos, setGastos] = useState<any[]>([])
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [totalGrupo, setTotalGrupo] = useState(0)
  const [loading, setLoading] = useState(true)

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())

  const [showGasto, setShowGasto] = useState(false)
  const [editGasto, setEditGasto] = useState<any>(null)
  const [showLiquidar, setShowLiquidar] = useState(false)
  const [prefillLiq, setPrefillLiq] = useState<any>(null)
  const [copiado, setCopiado] = useState(false)

  const cargarBase = useCallback(async () => {
    const res = await fetch(`/api/grupos/${grupoId}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.status === 403 || res.status === 404) { router.push('/grupos'); return }
    const json = await res.json()
    setGrupo(json.grupo)
    setMiembros(json.miembros)
    setRemovidos(json.removidos || [])
    setYo(json.yo)
  }, [grupoId, router])

  const cargarMes = useCallback(async () => {
    const q = `mes=${mes}&anio=${anio}`
    const [rg, rs] = await Promise.all([
      fetch(`/api/grupos/${grupoId}/gastos?${q}`),
      fetch(`/api/grupos/${grupoId}/saldos?${q}`),
    ])
    const jg = await rg.json()
    const js = await rs.json()
    setGastos(jg.gastos || [])
    setSaldos(js.saldos || [])
    setSugerencias(js.sugerencias || [])
    setTotalGrupo(js.totalGrupo || 0)
    setLoading(false)
  }, [grupoId, mes, anio])

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await cargarBase()
    }
    check()
  }, [router, cargarBase])

  useEffect(() => { if (grupo) cargarMes() }, [grupo, cargarMes])

  // Refresca miembros + mes. Al recargar la base (setGrupo con nueva referencia)
  // se dispara el efecto de arriba que vuelve a traer gastos y saldos del mes.
  const recargar = () => cargarBase()

  // Refresco automático: al volver a la pestaña y cada 10s, para ver de
  // inmediato lo que hagan otros miembros (nuevos usuarios, gastos, pagos).
  useEffect(() => {
    const tick = () => { if (!document.hidden) cargarBase() }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    const iv = setInterval(tick, 10000)
    return () => {
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
      clearInterval(iv)
    }
  }, [cargarBase])

  const cambiarMes = (delta: number) => {
    let m = mes + delta
    let a = anio
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAnio(a)
  }

  const copiarCodigo = () => {
    navigator.clipboard?.writeText(grupo.codigo_invitacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  const moneda = grupo?.moneda || 'USD'
  const simbolo = simboloMoneda(moneda)
  const miSaldo = saldos.find(s => s.user_id === yo)
  const esCreador = !!grupo && grupo.creado_por === yo

  const regenerarCodigo = async () => {
    if (!confirm('¿Generar un código nuevo? El código anterior dejará de funcionar y tendrás que compartir el nuevo.')) return
    const res = await fetch(`/api/grupos/${grupoId}/codigo`, { method: 'POST' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo regenerar'); return }
    recargar()
  }

  const eliminarMiembro = async (userId: string, nombre: string) => {
    if (!confirm(`¿Quitar a ${nombre} del grupo?`)) return
    const res = await fetch(`/api/grupos/${grupoId}/miembros/${userId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo quitar'); return }
    recargar()
  }

  const readmitirMiembro = async (userId: string, nombre: string) => {
    if (!confirm(`¿Readmitir a ${nombre} en el grupo?`)) return
    const res = await fetch(`/api/grupos/${grupoId}/miembros/${userId}`, { method: 'POST' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo readmitir'); return }
    recargar()
  }

  const eliminarGasto = async (g: any) => {
    if (!confirm(`¿Eliminar el gasto "${g.descripcion}"? Se revertirán las transacciones reflejadas en las carteras.`)) return
    const res = await fetch(`/api/grupos/${grupoId}/gastos/${g.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'No se pudo eliminar'); return }
    recargar()
  }

  if (loading && !grupo) {
    return (
      <AppLayout>
        <div className="max-w-3xl px-6 py-8 mx-auto space-y-4">
          <div className="w-48 h-8 rounded-badge bg-fog animate-pulse" />
          <div className="h-32 rounded-card bg-fog animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-3xl px-6 py-8 mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button onClick={() => router.push('/grupos')} className="mb-1 text-sm text-steel hover:text-ink">← Grupos</button>
            <h1 className="text-2xl font-bold text-obsidian">{grupo?.nombre}</h1>
            <p className="text-sm text-steel">{miembros.length} miembros · {moneda}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button onClick={copiarCodigo} className="px-3 py-2 text-right transition-all border rounded-card border-fog hover:border-pebble bg-snow">
              <span className="block text-[10px] text-steel">Código {copiado ? '¡copiado!' : '(toca para copiar)'}</span>
              <span className="font-mono text-sm font-bold tracking-widest text-obsidian">{grupo?.codigo_invitacion}</span>
            </button>
            {esCreador && (
              <button onClick={regenerarCodigo} className="text-[11px] font-medium text-steel hover:text-ink">
                ↻ Regenerar código
              </button>
            )}
          </div>
        </div>

        {/* Selector de mes */}
        <div className="flex items-center justify-between p-2 mb-6 border bg-snow border-fog rounded-full">
          <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-full text-steel hover:bg-mist">‹</button>
          <span className="text-sm font-medium text-ink">{MESES[mes - 1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-full text-steel hover:bg-mist">›</button>
        </div>

        {/* Total del mes */}
        <div className="p-6 mb-6 text-center bg-obsidian rounded-card-lg">
          <p className="mb-1 text-xs font-medium text-ash">Total del grupo en {MESES[mes - 1]}</p>
          <p className="text-4xl font-bold text-snow">{formatoMoneda(totalGrupo, moneda)}</p>
          {miSaldo && (
            <p className={`mt-2 text-sm ${miSaldo.neto > 0.005 ? 'text-emerald-400' : miSaldo.neto < -0.005 ? 'text-red-400' : 'text-ash'}`}>
              {miSaldo.neto > 0.005 ? `Te deben ${formatoMoneda(miSaldo.neto, moneda)}`
                : miSaldo.neto < -0.005 ? `Debes ${formatoMoneda(-miSaldo.neto, moneda)}`
                : 'Estás al día'}
            </p>
          )}
        </div>

        {/* Miembros */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-graphite">Miembros</h2>
          <div className="overflow-hidden border bg-snow border-fog rounded-card">
            {miembros.map((m, i) => (
              <div key={m.user_id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-fog' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 text-sm font-bold rounded-lg text-snow bg-obsidian">
                    {m.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{m.nombre}{m.user_id === yo ? ' (yo)' : ''}</p>
                    <p className="text-xs text-ash">{m.user_id === grupo?.creado_por ? 'Creador' : 'Miembro'}</p>
                  </div>
                </div>
                {esCreador && m.user_id !== grupo?.creado_por && (
                  <button onClick={() => eliminarMiembro(m.user_id, m.nombre)}
                    className="px-3 py-1 text-xs font-medium text-red-600 transition-all rounded-full hover:bg-red-50">
                    Quitar
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Removidos (solo el creador puede readmitir) */}
          {esCreador && removidos.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-ash">Removidos</p>
              <div className="overflow-hidden border bg-snow border-fog rounded-card">
                {removidos.map((m, i) => (
                  <div key={m.user_id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-fog' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 text-sm font-bold rounded-lg text-steel bg-mist">
                        {m.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-steel">{m.nombre}</p>
                        <p className="text-xs text-ash">No puede reingresar con el código</p>
                      </div>
                    </div>
                    <button onClick={() => readmitirMiembro(m.user_id, m.nombre)}
                      className="px-3 py-1 text-xs font-medium transition-all rounded-full text-emerald-600 hover:bg-emerald-50">
                      Readmitir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Saldos por persona */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-graphite">Saldos</h2>
          <div className="overflow-hidden border bg-snow border-fog rounded-card">
            {saldos.map((s, i) => (
              <div key={s.user_id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-fog' : ''}`}>
                <div>
                  <p className="text-sm font-medium text-ink">{s.nombre}{s.user_id === yo ? ' (yo)' : ''}</p>
                  <p className="text-xs text-ash">Pagó {simbolo}{s.pagado.toFixed(2)} · le tocaba {simbolo}{s.tocaba.toFixed(2)}</p>
                </div>
                <span className={`text-sm font-semibold ${s.neto > 0.005 ? 'text-emerald-600' : s.neto < -0.005 ? 'text-red-500' : 'text-steel'}`}>
                  {s.neto > 0.005 ? `+${formatoMoneda(s.neto, moneda)}` : s.neto < -0.005 ? formatoMoneda(s.neto, moneda) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sugerencias para saldar */}
        {sugerencias.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-graphite">Para quedar a mano</h2>
            <div className="space-y-2">
              {sugerencias.map((sg, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 border bg-snow border-fog rounded-card">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{sg.de_nombre}</span> paga a <span className="font-medium">{sg.a_nombre}</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-obsidian">{formatoMoneda(sg.monto, moneda)}</span>
                    {(sg.de_user_id === yo || sg.a_user_id === yo) && (
                      <button onClick={() => { setPrefillLiq(sg); setShowLiquidar(true) }}
                        className="px-3 py-1 text-xs font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite">
                        Saldar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de gastos */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-graphite">Gastos del mes</h2>
          {gastos.length === 0 ? (
            <div className="p-8 text-center border bg-snow border-fog rounded-card">
              <span className="block mb-2 text-4xl">🧾</span>
              <p className="text-sm text-steel">Sin gastos en {MESES[mes - 1]}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {gastos.map(g => {
                const miDiv = g.divisiones.find((d: any) => d.user_id === yo)
                const quienPago = g.pagos.map((p: any) => p.nombre).join(', ')
                return (
                  <div key={g.id} className="p-4 border bg-snow border-fog rounded-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-ink">{g.descripcion}</p>
                        <p className="text-xs text-ash">Pagó {quienPago} · {new Date(g.fecha).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <span className="text-sm font-bold text-obsidian">{formatoMoneda(g.monto_total, moneda)}</span>
                    </div>
                    {miDiv && (
                      <p className="pt-2 mt-2 text-xs border-t text-steel border-fog">
                        A ti te toca <span className="font-semibold text-ink">{formatoMoneda(miDiv.monto_asignado, moneda)}</span>
                      </p>
                    )}
                    {(esCreador || g.creado_por === yo) && (
                      <div className="flex gap-2 pt-2 mt-2 border-t border-fog">
                        <button onClick={() => setEditGasto(g)}
                          className="px-3 py-1 text-xs font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">
                          Editar
                        </button>
                        <button onClick={() => eliminarGasto(g)}
                          className="px-3 py-1 text-xs font-medium text-red-600 transition-all rounded-full hover:bg-red-50">
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowGasto(true)} className="flex-1 py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite shadow-pill">
            + Nuevo gasto
          </button>
          <button onClick={() => { setPrefillLiq(null); setShowLiquidar(true) }} className="flex-1 py-3 font-medium transition-all border rounded-full border-pebble text-graphite hover:bg-fog">
            Saldar cuenta
          </button>
        </div>
      </div>

      {showGasto && (
        <FormGastoCompartido grupoId={grupoId} moneda={moneda} miembros={miembros} yo={yo}
          onClose={() => setShowGasto(false)} onSuccess={recargar} />
      )}
      {editGasto && (
        <FormGastoCompartido grupoId={grupoId} moneda={moneda} miembros={miembros} yo={yo} gasto={editGasto}
          onClose={() => setEditGasto(null)} onSuccess={recargar} />
      )}
      {showLiquidar && (
        <FormLiquidar grupoId={grupoId} moneda={moneda} miembros={miembros} yo={yo} prefill={prefillLiq}
          onClose={() => setShowLiquidar(false)} onSuccess={recargar} />
      )}
    </AppLayout>
  )
}
