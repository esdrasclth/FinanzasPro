'use client'

import { useState } from 'react'
import AppLayout from '../components/AppLayout'
import { Encabezado, Hero } from '../components/Encabezado'
import FormCategoria from '../components/FormCategoria'
import { Pencil, Trash2, Tag, TrendingUp, TrendingDown } from 'lucide-react'
import { esCategoriaInterna } from '../lib/finanzas'

interface Props {
  usuario: any
  categoriasIniciales: any[]
}

export default function CategoriasCliente({ usuario, categoriasIniciales }: Props) {
  const [categorias, setCategorias] = useState<any[]>(categoriasIniciales)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [categoriaEditar, setCategoriaEditar] = useState<any>(null)
  const [categoriaParent, setCategoriaParent] = useState<any>(null)
  const [filtroTipo, setFiltroTipo] = useState<'gasto' | 'ingreso'>('gasto')

  // La lista llega del Server Component; /api/categorias la refresca.
  const cargarCategorias = async () => {
    try {
      const res = await fetch('/api/categorias')
      if (!res.ok) return
      const json = await res.json()
      // Las subcategorías de deudas completadas quedan archivadas: se gestionan
      // desde la pantalla de Deudas, no aquí.
      setCategorias((json.categorias || []).filter((c: any) => !c.archivada))
    } catch {
      // Se conserva lo que ya está en pantalla.
    }
  }

  // La categoría raíz "Deudas" y sus subcategorías se administran desde la
  // pantalla de Deudas; aquí son de solo lectura.
  const deudasRoot = categorias.find(c => c.protegida)
  const esGestionDeuda = (c: any) =>
    c.protegida || (!!deudasRoot && c.parent_id === deudasRoot.id)

  // Dos cosas distintas se marcan igual con es_sistema:
  //  - las internas ("Saldo inicial", "Transferencia", "Ajuste de saldo"), que
  //    la app usa para su mecánica y no se tocan de ninguna forma;
  //  - las predeterminadas ("Comida", "Salud"...), que son de todos y no se
  //    editan ni se borran, pero sí admiten subcategorías propias.
  const esInterna = (c: any) => esCategoriaInterna(c.nombre)

  const handleEliminar = async (id: string) => {
    const cat = categorias.find(c => c.id === id)
    if (cat && esGestionDeuda(cat)) {
      alert('Esta categoría se administra desde la pantalla de Deudas.')
      return
    }
    // Verificar si tiene subcategorías
    const tieneHijos = categorias.some(c => c.parent_id === id)
    if (tieneHijos) {
      alert('Esta categoría tiene subcategorías. Elimínalas primero.')
      return
    }
    if (!confirm('¿Eliminar esta categoría?')) return
    // El servidor revalida dueño, sistema, subcategorías y movimientos.
    const res = await fetch(`/api/categorias?id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      alert(json?.error?.message || 'No se pudo eliminar la categoría')
      return
    }
    cargarCategorias()
  }

  // Categorías principales (sin parent)
  const principalesTodas = categorias.filter(c => !c.parent_id).length

  const principales = categorias.filter(
    c => !c.parent_id && c.tipo === filtroTipo
  )

  // Subcategorías de una categoría
  const subCategorias = (parentId: string) =>
    categorias.filter(c => c.parent_id === parentId)

  if (loading) {
    return (
      <AppLayout usuario={usuario}>
        <div className="flex items-center justify-center h-96">
          <p className="text-steel animate-pulse">Cargando...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout usuario={usuario}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1728px] mx-auto">

        <Encabezado seccion="Categorías" titulo="Organiza tus movimientos" />

        <Hero
          titulo="Tus categorías"
          subtitulo="Gasto e ingreso, con sus subcategorías"
          metricas={[
            {
              icon: Tag,
              label: 'En total',
              valor: String(categorias.length),
              nota: <span className="text-white/50">{principalesTodas} principales</span>,
            },
            {
              icon: TrendingDown,
              label: 'De gasto',
              valor: String(categorias.filter(c => c.tipo === 'gasto').length),
              nota: <span className="text-red-300">para clasificar salidas</span>,
            },
            {
              icon: TrendingUp,
              label: 'De ingreso',
              valor: String(categorias.filter(c => c.tipo === 'ingreso').length),
              nota: <span className="text-emerald-300">para clasificar entradas</span>,
            },
          ]}
        />

        {/* Tabs Gasto / Ingreso */}
        <div className="flex bg-snow border border-fog rounded-full p-1 mb-6 w-fit">
          <button
            onClick={() => setFiltroTipo('gasto')}
            className={`px-6 py-2.5 rounded-full text-sm font-medium sm:py-2 transition-all ${
              filtroTipo === 'gasto'
                ? 'bg-obsidian text-snow'
                : 'text-steel hover:text-ink'
            }`}
          >
            💸 Gastos
          </button>
          <button
            onClick={() => setFiltroTipo('ingreso')}
            className={`px-6 py-2.5 rounded-full text-sm font-medium sm:py-2 transition-all ${
              filtroTipo === 'ingreso'
                ? 'bg-obsidian text-snow'
                : 'text-steel hover:text-ink'
            }`}
          >
            💰 Ingresos
          </button>
        </div>

        {/* Lista de categorías */}
        {principales.length === 0 ? (
          <div className="bg-snow border border-fog rounded-card p-12 text-center">
            <span className="text-5xl block mb-4">🏷️</span>
            <p className="text-steel">No hay categorías de {filtroTipo}s aún</p>
            <p className="text-ash text-sm mt-1">
              Crea tu primera categoría con el botón +
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {principales.map(cat => (
              <div key={cat.id} className="bg-snow border border-fog hover:border-pebble transition-colors rounded-card overflow-hidden">

                {/* Categoría principal */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                      style={{ backgroundColor: cat.color + '15' }}
                    >
                      {cat.icono || '📦'}
                    </div>
                    <div>
                      <p className="text-ink font-medium">{cat.nombre}</p>
                      <p className="text-ash text-xs">
                        {subCategorias(cat.id).length} subcategorías
                        {cat.protegida ? ' · Deudas' : cat.es_sistema && ' · Sistema'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {esGestionDeuda(cat) ? (
                      <span className="text-xs text-ash">Gestionar en Deudas</span>
                    ) : esInterna(cat) ? (
                      <span className="text-xs text-ash">La usa la app</span>
                    ) : (
                      <>
                        {/* Las predeterminadas son de todas las cuentas: se
                            pueden editar (se crea una copia propia) y admiten
                            subcategorías, pero no se borran. */}
                        {cat.es_sistema && (
                          <span className="text-xs text-ash">Predeterminada</span>
                        )}
                        {/* Agregar subcategoría */}
                        <button
                          onClick={() => {
                            setCategoriaParent(cat)
                            setCategoriaEditar(null)
                            setShowForm(true)
                          }}
                          className="py-2.5 sm:py-1 text-xs font-medium text-graphite border border-pebble hover:bg-fog px-2.5 py-1 rounded-full transition-all"
                        >
                          + Sub
                        </button>
                        <button
                          onClick={() => {
                            setCategoriaEditar(cat)
                            setCategoriaParent(null)
                            setShowForm(true)
                          }}
                          className="flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto sm:p-1 text-ash hover:text-ink transition-colors"
                          title={cat.es_sistema ? 'Editar (crea tu propia copia)' : 'Editar'}
                        >
                          <Pencil size={16} strokeWidth={2} />
                        </button>
                        {!cat.es_sistema && (
                          <button
                            onClick={() => handleEliminar(cat.id)}
                            className="flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto sm:p-1 text-ash hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} strokeWidth={2} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Subcategorías */}
                {subCategorias(cat.id).length > 0 && (
                  <div className="border-t border-fog">
                    {subCategorias(cat.id).map((sub, idx) => (
                      <div
                        key={sub.id}
                        className={`flex items-center justify-between px-4 py-3 ${
                          idx < subCategorias(cat.id).length - 1
                            ? 'border-b border-fog' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 ml-6">
                          <div className="w-1 h-1 bg-pebble rounded-full" />
                          <div
                            className="w-8 h-8 rounded-badge flex items-center justify-center text-base"
                            style={{ backgroundColor: sub.color + '15' }}
                          >
                            {sub.icono || '📦'}
                          </div>
                          <p className="text-graphite text-sm">{sub.nombre}</p>
                        </div>
                        {esGestionDeuda(sub) ? (
                          <span className="text-xs text-ash">Deuda</span>
                        ) : esInterna(sub) || sub.es_sistema ? (
                          <span className="text-xs text-ash">
                            {esInterna(sub) ? 'La usa la app' : 'Predeterminada'}
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setCategoriaEditar(sub)
                                setCategoriaParent(null)
                                setShowForm(true)
                              }}
                              className="text-ash hover:text-ink transition-colors p-1 text-sm"
                              title="Editar o mover a otra categoría"
                            >
                              <Pencil size={14} strokeWidth={2} />
                            </button>
                            <button
                              onClick={() => handleEliminar(sub.id)}
                              className="flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto sm:p-1 text-sm text-ash hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              </div>
            ))}
          </div>
        )}

      </div>

      {/* Botón flotante */}
      <button
        onClick={() => {
          setCategoriaEditar(null)
          setCategoriaParent(null)
          setShowForm(true)
        }}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-8 right-6 lg:right-8 w-14 h-14 bg-obsidian hover:bg-graphite text-snow rounded-full text-2xl shadow-pill transition-all hover:scale-110 flex items-center justify-center z-40"
      >
        +
      </button>

      {showForm && (
        <FormCategoria
          categoria={categoriaEditar}
          categoriaParent={categoriaParent}
          categorias={categorias}
          tipo={filtroTipo}
          onClose={() => {
            setShowForm(false)
            setCategoriaEditar(null)
            setCategoriaParent(null)
          }}
          onSuccess={cargarCategorias}
        />
      )}
    </AppLayout>
  )
}
