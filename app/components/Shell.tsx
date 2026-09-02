'use client'

import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import { MonedaProvider } from '../lib/moneda-context'
import { useRecarga, type Recurso } from '../lib/datos-bus'
import type { PerfilUsuario } from '../lib/sesion-server'

// Cualquier cambio invalida la caché de rutas del router. Ver abajo.
const TODOS_LOS_RECURSOS: Recurso[] = [
  'transacciones', 'carteras', 'categorias', 'presupuesto', 'deudas',
  'metas', 'suscripciones', 'grupos', 'repartos', 'reportes',
]

// El armazón de las pantallas con sesión: menú lateral, barra inferior del
// móvil y el hueco del contenido.
//
// Vive en el layout del grupo (app), no dentro de cada pantalla. Esa es la
// diferencia que se nota al navegar: el layout de un grupo no se vuelve a
// montar al cambiar de ruta hermana, así que el menú se queda quieto y solo
// se reemplaza `children`. Cuando esto colgaba de cada página, Next
// desmontaba el árbol entero en cada clic y la app parpadeaba a la pantalla
// de carga, menú incluido.
export default function Shell({
  usuario,
  children,
}: {
  usuario: PerfilUsuario
  children: React.ReactNode
}) {
  const router = useRouter()

  // Contrapeso de `staleTimes` (next.config.ts). El router guarda en memoria
  // lo ya visitado, así que volver a una pantalla es inmediato; el problema es
  // que el bus de datos solo recarga las pantallas MONTADAS. Sin esto, añadir
  // un movimiento y volver a Carteras podía enseñar el saldo de antes, servido
  // de la caché.
  //
  // `router.refresh()` la invalida entera, así que la siguiente pantalla que
  // se visite vuelve a pedirse al servidor. Va aquí, en el armazón, porque es
  // lo único que está montado en todas: cada pantalla suelta solo escucha lo
  // suyo y no se enteraría de lo que cambió estando en otra.
  useRecarga(TODOS_LOS_RECURSOS, () => router.refresh())

  return (
    <MonedaProvider moneda={usuario.moneda_default}>
      <div className="min-h-screen bg-mist">
        <Sidebar usuario={usuario} />
        <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0">
          {children}
        </main>
      </div>
    </MonedaProvider>
  )
}
