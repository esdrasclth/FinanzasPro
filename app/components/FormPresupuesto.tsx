'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X } from 'lucide-react'
import IconoCategoria from './IconoCategoria'
import { emitirCambio } from '../lib/datos-bus'
import { esCategoriaInterna } from '../lib/finanzas'

interface Props {
  presupuesto?: any
  // Categoría con la que abrir el formulario ya elegida. La usa el aviso de
  // "estás gastando aquí sin presupuesto": el usuario ya dijo cuál quiere.
  categoriaInicial?: string
  tipo?: 'gasto' | 'ingreso'
  mes?: number
  anio?: number
  // Las partidas ya existentes de ese mes, para calcular el límite de un padre.
  partidasDelMes?: any[]
  onClose: () => void
  onSuccess: () => void
}

export default function FormPresupuesto({ presupuesto, categoriaInicial, tipo = 'gasto', mes, anio, partidasDelMes = [], onClose, onSuccess }: Props) {
  const [categorias, setCategorias] = useState<any[]>([])
  const [categoriaId, setCategoriaId] = useState(presupuesto?.category_id || categoriaInicial || '')
  const [busqueda, setBusqueda] = useState('')
  const [montoLimite, setMontoLimite] = useState(
    presupuesto?.monto_limite?.toString() || ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mesActual = mes ?? new Date().getMonth() + 1
  const añoActual = anio ?? new Date().getFullYear()
  const esEdicion = !!presupuesto
  const esIngreso = (presupuesto?.categories?.tipo || tipo) === 'ingreso'

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const cargarCategorias = useCallback(async () => {
    const res = await fetch('/api/categorias')
    if (!res.ok) return
    const { categorias: todas } = await res.json()
    // Las internas ("Saldo inicial", "Ajuste de saldo", "Transferencia") no son
    // categorías de gasto del usuario y ademas quedan fuera de los totales, asi
    // que un presupuesto sobre ellas marcaria cero para siempre.
    const data = (todas || []).filter(
      (c: any) => c.tipo === tipo && !esCategoriaInterna(c.nombre)
    )

    // Las subcategorías de deudas completadas quedan archivadas: no se ofrecen
    // para nuevos presupuestos, pero su historial se conserva.
    setCategorias((data || []).filter((c: any) => !c.archivada))
  }, [tipo])

  useEffect(() => {
    const timeout = window.setTimeout(cargarCategorias, 0)
    return () => window.clearTimeout(timeout)
  }, [cargarCategorias])

  const subcategorias = (parentId: string) => categorias.filter(c => c.parent_id === parentId)

  // El límite de una categoría padre es la suma de las partidas de sus hijas,
  // así que no se teclea. Se calcula aquí solo para enseñarlo: quien manda es
  // el servidor (ver presupuesto-server.ts).
  const hijasDe = (padreId: string) => new Set(
    categorias.filter(c => c.parent_id === padreId).map(c => c.id)
  )
  const sumaHijas = (padreId: string): number | null => {
    if (!padreId) return null
    const hijas = hijasDe(padreId)
    const suyas = (partidasDelMes || []).filter(p => hijas.has(p.category_id))
    if (suyas.length === 0) return null
    return suyas.reduce((t, p) => t + Number(p.monto_limite || 0), 0)
  }

  const calculado = sumaHijas(categoriaId)

  // Buscador. Sin él la lista era una caja con scroll y una veintena de
  // categorías dentro: una que estuviera por debajo del corte —y las de
  // usuario, que van al final— parecía sencillamente no existir.
  //
  // Si el nombre del padre coincide se muestra el grupo entero; si coincide
  // solo una hija, se muestra su padre con esa hija, para no sacar la
  // subcategoría de su contexto.
  const q = busqueda.trim().toLowerCase()
  const coincide = (nombre?: string) => (nombre || '').toLowerCase().includes(q)

  const principales = categorias
    .filter(c => !c.parent_id)
    .filter(c => !q || coincide(c.nombre) || subcategorias(c.id).some(sub => coincide(sub.nombre)))

  const subsVisibles = (parentId: string, nombrePadre?: string) => {
    const subs = subcategorias(parentId)
    if (!q || coincide(nombrePadre)) return subs
    return subs.filter(sub => coincide(sub.nombre))
  }

  // La lista se desplaza: si se abre con una categoría ya elegida —desde el
  // aviso de gasto sin presupuesto— hay que traerla a la vista o parece que no
  // se seleccionó nada.
  const elegidaRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!categoriaId || categorias.length === 0) return
    elegidaRef.current?.scrollIntoView({ block: 'nearest' })
  }, [categoriaId, categorias.length])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!categoriaId) {
      setError('Selecciona una categoría')
      setLoading(false)
      return
    }

    // El servidor valida el límite y traduce el choque de unicidad a un
    // mensaje entendible.
    const res = await fetch('/api/presupuesto', {
      method: esEdicion ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: presupuesto?.id,
        category_id: categoriaId,
        monto_limite: calculado ?? parseFloat(montoLimite),
        mes: mesActual,
        anio: añoActual,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setError(json?.error?.message || 'No se pudo guardar')
      setLoading(false)
      return
    }

    emitirCambio('presupuesto')

    onSuccess()
    onClose()
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
            <h2 className="text-base font-semibold text-ink sm:text-lg">
              {esEdicion
                ? (esIngreso ? 'Editar meta de ingreso' : 'Editar presupuesto')
                : (esIngreso ? 'Nueva meta de ingreso' : 'Nuevo presupuesto')}
            </h2>
            <button onClick={onClose} className="flex items-center justify-center w-11 h-11 -mr-1 transition-colors rounded-full text-ash hover:text-ink hover:bg-mist">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4 sm:px-6 sm:space-y-5">

          {/* Categoría */}
          {!esEdicion && (
            <div>
              <label className="block mb-2 text-sm font-medium text-graphite">
                Categoría o subcategoría
              </label>

              <div className="relative mb-2">
                <Search size={15} strokeWidth={2} aria-hidden="true"
                  className="absolute -translate-y-1/2 pointer-events-none left-3 top-1/2 text-ash" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar categoría…"
                  autoFocus
                  className="w-full py-2 pl-9 pr-3 text-sm transition-colors border border-transparent bg-mist text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                />
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-72 pr-1">
                {principales.length === 0 && (
                  <p className="py-6 text-sm text-center text-ash">
                    {q
                      ? `Ninguna categoría coincide con “${busqueda}”`
                      : `No hay categorías de ${esIngreso ? 'ingreso' : 'gasto'} disponibles`}
                  </p>
                )}
                {principales.map(cat => {
                  const todasSubs = subcategorias(cat.id)
                  const subs = subsVisibles(cat.id, cat.nombre)
                  const tieneSubs = todasSubs.length > 0
                  return (
                    <div key={cat.id}>
                      {/* Una categoría con subcategorías sí se puede presupuestar:
                          su límite cubre al grupo entero, porque lo gastado en las
                          hijas suma en el padre. Antes estaba deshabilitada, y a la
                          vez la API lo permitía, así que quien lo hacía desde otro
                          camino se quedaba con una partida que marcaba cero. */}
                      <button
                        type="button"
                        ref={categoriaId === cat.id ? elegidaRef : undefined}
                        onClick={() => setCategoriaId(cat.id)}
                        className={`flex items-center w-full gap-2.5 px-3 py-2 text-sm text-left transition-all border rounded-xl ${
                          categoriaId === cat.id
                            ? 'border-obsidian bg-obsidian/5 text-ink font-medium'
                            : 'border-fog text-steel hover:border-pebble'
                        }`}
                      >
                        <IconoCategoria nombre={cat.icono} size={18} />
                        <span className="truncate">{cat.nombre}</span>
                        {tieneSubs && (
                          <span className="ml-auto text-xs text-ash whitespace-nowrap">
                            incluye sus {todasSubs.length} subcategorías
                          </span>
                        )}
                      </button>
                      {subs.map(sub => (
                        <button
                          key={sub.id}
                          type="button"
                          ref={categoriaId === sub.id ? elegidaRef : undefined}
                          onClick={() => setCategoriaId(sub.id)}
                          className={`flex items-center w-full gap-2.5 pl-8 pr-3 py-1.5 mt-1 text-sm text-left transition-all border rounded-xl ${
                            categoriaId === sub.id
                              ? 'border-obsidian bg-obsidian/5 text-ink font-medium'
                              : 'border-fog text-steel hover:border-pebble'
                          }`}
                        >
                          <span className="flex-shrink-0 w-1 h-1 rounded-full bg-pebble" />
                          <IconoCategoria nombre={sub.icono} size={16} />
                          <span className="truncate">{sub.nombre}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {esEdicion && (
            <div className="flex items-center gap-3 p-4 bg-mist rounded-input">
              <IconoCategoria nombre={presupuesto.categories?.icono} size={24} />
              <div>
                <p className="font-medium text-ink">{presupuesto.categories?.nombre}</p>
                <p className="text-xs text-steel">Categoría seleccionada</p>
              </div>
            </div>
          )}

          {/* Monto límite */}
          <div>
            <label className="block mb-2 text-sm font-medium text-graphite">
              {esIngreso ? 'Meta mensual de ingreso' : 'Límite mensual'}
            </label>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 text-ash">L</span>
              <input
                type="number"
                value={calculado !== null ? calculado.toFixed(2) : montoLimite}
                onChange={(e) => setMontoLimite(e.target.value)}
                placeholder="0.00"
                min="1"
                step="0.01"
                required
                readOnly={calculado !== null}
                aria-describedby={calculado !== null ? 'limite-calculado' : undefined}
                className={`w-full py-3 pl-8 pr-4 text-ink transition-colors border bg-mist border-transparent placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow ${
                  calculado !== null ? 'cursor-not-allowed text-steel' : ''
                }`}
              />
            </div>
            {calculado !== null && (
              <p id="limite-calculado" className="mt-2 text-xs text-steel">
                Es la suma de las subcategorías presupuestadas. Para cambiarlo,
                edita sus subcategorías.
              </p>
            )}
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
