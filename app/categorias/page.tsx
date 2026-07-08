'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import FormCategoria from '../components/FormCategoria'
import { Pencil, Trash2 } from 'lucide-react'

export default function Categorias() {
  const router = useRouter()
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [categoriaEditar, setCategoriaEditar] = useState<any>(null)
  const [categoriaParent, setCategoriaParent] = useState<any>(null)
  const [filtroTipo, setFiltroTipo] = useState<'gasto' | 'ingreso'>('gasto')

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      cargarCategorias()
    }
    checkUser()
  }, [router])

  const cargarCategorias = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},es_sistema.eq.true`)
      .order('nombre')

    setCategorias(data || [])
    setLoading(false)
  }

  const handleEliminar = async (id: string) => {
    // Verificar si tiene subcategorías
    const tieneHijos = categorias.some(c => c.parent_id === id)
    if (tieneHijos) {
      alert('Esta categoría tiene subcategorías. Elimínalas primero.')
      return
    }
    if (!confirm('¿Eliminar esta categoría?')) return
    await supabase.from('categories').delete().eq('id', id)
    cargarCategorias()
  }

  // Categorías principales (sin parent)
  const principales = categorias.filter(
    c => !c.parent_id && c.tipo === filtroTipo
  )

  // Subcategorías de una categoría
  const subCategorias = (parentId: string) =>
    categorias.filter(c => c.parent_id === parentId)

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-steel animate-pulse">Cargando...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-[1728px] mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-obsidian">Categorías</h1>
          <p className="text-steel mt-1 text-sm">
            Organiza tus transacciones con categorías y subcategorías personalizadas
          </p>
        </div>

        {/* Tabs Gasto / Ingreso */}
        <div className="flex bg-snow border border-fog rounded-full p-1 mb-6 w-fit">
          <button
            onClick={() => setFiltroTipo('gasto')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              filtroTipo === 'gasto'
                ? 'bg-obsidian text-snow'
                : 'text-steel hover:text-ink'
            }`}
          >
            💸 Gastos
          </button>
          <button
            onClick={() => setFiltroTipo('ingreso')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
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
                        {cat.es_sistema && ' · Sistema'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Agregar subcategoría */}
                    <button
                      onClick={() => {
                        setCategoriaParent(cat)
                        setCategoriaEditar(null)
                        setShowForm(true)
                      }}
                      className="text-xs font-medium text-graphite border border-pebble hover:bg-fog px-2.5 py-1 rounded-full transition-all"
                    >
                      + Sub
                    </button>
                    <button
                      onClick={() => {
                        setCategoriaEditar(cat)
                        setCategoriaParent(null)
                        setShowForm(true)
                      }}
                      className="text-ash hover:text-ink transition-colors p-1"
                      title="Editar"
                    >
                      <Pencil size={16} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleEliminar(cat.id)}
                      className="text-ash hover:text-red-600 hover:bg-red-50 rounded-full transition-colors p-1"
                      title="Eliminar"
                    >
                      <Trash2 size={16} strokeWidth={2} />
                    </button>
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
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setCategoriaEditar(sub)
                              setCategoriaParent(null)
                              setShowForm(true)
                            }}
                            className="text-ash hover:text-ink transition-colors p-1 text-sm"
                            title="Editar"
                          >
                            <Pencil size={14} strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => handleEliminar(sub.id)}
                            className="text-ash hover:text-red-600 hover:bg-red-50 rounded-full transition-colors p-1 text-sm"
                            title="Eliminar"
                          >
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                        </div>
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
        className="fixed bottom-24 lg:bottom-8 right-6 lg:right-8 w-14 h-14 bg-obsidian hover:bg-graphite text-snow rounded-full text-2xl shadow-pill transition-all hover:scale-110 flex items-center justify-center z-40"
      >
        +
      </button>

      {showForm && (
        <FormCategoria
          categoria={categoriaEditar}
          categoriaParent={categoriaParent}
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
