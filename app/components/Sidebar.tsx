'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, ArrowLeftRight, Target, Wallet, Users, Tag,
  Download, Handshake, BarChart3, Settings, Droplets, LogOut, Plus,
  RefreshCw, X, type LucideIcon,
} from 'lucide-react'

interface NavItem {
  href: string
  Icon: LucideIcon
  label: string
}

// Orden por frecuencia de uso: primero el día a día, luego lo que se planifica,
// después el análisis y al final la configuración.
// `enBarra` marca las cuatro que salen en la barra inferior del móvil; el resto
// se agrupan bajo "Más". Antes eran dos listas sueltas que podían desincronizarse
// y dejar una pantalla sin acceso desde el teléfono.
const NAV_ITEMS: (NavItem & { enBarra?: boolean })[] = [
  { href: '/dashboard', Icon: LayoutDashboard, label: 'Dashboard', enBarra: true },
  { href: '/transacciones', Icon: ArrowLeftRight, label: 'Movimientos', enBarra: true },
  { href: '/carteras', Icon: Wallet, label: 'Carteras', enBarra: true },
  { href: '/presupuesto', Icon: Target, label: 'Presupuestos', enBarra: true },
  { href: '/deudas', Icon: Handshake, label: 'Deudas' },
  { href: '/suscripciones', Icon: RefreshCw, label: 'Recurrentes' },
  { href: '/grupos', Icon: Users, label: 'Compartidos' },
  { href: '/reportes', Icon: BarChart3, label: 'Reportes' },
  { href: '/categorias', Icon: Tag, label: 'Categorías' },
  { href: '/exportar', Icon: Download, label: 'Exportar' },
  { href: '/perfil', Icon: Settings, label: 'Configuración' },
]

// Etiquetas cortas para la barra inferior, donde no cabe el nombre completo.
const LABEL_BARRA: Record<string, string> = {
  '/dashboard': 'Inicio',
  '/transacciones': 'Movimientos',
  '/carteras': 'Carteras',
  '/presupuesto': 'Presupuesto',
}

const ITEMS_BARRA = NAV_ITEMS.filter(i => i.enBarra)
const ITEMS_MAS = NAV_ITEMS.filter(i => !i.enBarra)

export default function Sidebar({ usuario }: { usuario: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const [masAbierto, setMasAbierto] = useState(false)

  // El submenú se cierra al navegar, para no dejarlo abierto sobre la pantalla
  // nueva.
  const ir = (href: string) => {
    setMasAbierto(false)
    router.push(href)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  return (
    <>
      {/* Sidebar Desktop */}
      <aside className="fixed top-0 left-0 flex-col hidden w-64 min-h-screen border-r lg:flex bg-snow border-fog">

        {/* Logo */}
        <div className="p-6 border-b border-fog">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center bg-obsidian w-9 h-9 rounded-xl">
              <Droplets size={18} strokeWidth={2} className="text-snow" />
            </div>
            <div>
              <p className="text-lg font-bold leading-none text-obsidian">Caudal</p>
              <p className="text-xs text-steel">Finanzas Personales</p>
            </div>
          </div>
        </div>

        {/* Usuario */}
        <div className="p-4 mx-3 mt-4 bg-mist rounded-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 text-sm font-bold text-snow rounded-lg bg-obsidian">
              {usuario?.nombre?.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-ink truncate">{usuario?.nombre}</p>
              <p className="text-xs text-steel">Cuenta activa</p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-4 mt-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, Icon, label }) => {
            const activo = pathname === href
            return (
              <button
                key={href}
                onClick={() => ir(href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm transition-colors ${activo
                    ? 'bg-obsidian text-snow font-medium'
                    : 'text-steel hover:bg-mist hover:text-ink'
                  }`}
              >
                <Icon size={18} strokeWidth={2} className="shrink-0" />
                {label}
                {activo && <div className="ml-auto w-1.5 h-1.5 bg-snow rounded-full" />}
              </button>
            )
          })}
        </nav>

        {/* Cerrar sesión */}
        <div className="p-4 border-t border-fog">
          <button
            onClick={handleLogout}
            className="flex items-center w-full gap-3 px-4 py-3 text-sm transition-colors rounded-full text-steel hover:text-red-600 hover:bg-red-50"
          >
            <LogOut size={18} strokeWidth={2} className="shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Barra inferior (móvil).
          El overlay y el panel del submenú van FUERA del <nav>: el nav tiene
          z-50 y backdrop-blur, así que crea su propio contexto de apilamiento y
          cualquier overlay puesto dentro acababa tapando sus propios botones.
          Con el orden overlay(40) < nav(50) < panel(60) la barra sigue visible y
          se puede tocar mientras el submenú está abierto. */}
      {masAbierto && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-obsidian/30 backdrop-blur-sm"
          onClick={() => setMasAbierto(false)}
          aria-hidden
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t lg:hidden bg-snow/90 backdrop-blur border-fog pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center">
          {ITEMS_BARRA.map(({ href, Icon }) => {
            const activo = pathname === href && !masAbierto
            return (
              <button
                key={href}
                onClick={() => ir(href)}
                aria-label={LABEL_BARRA[href] || href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-all ${activo ? 'text-obsidian' : 'text-steel'
                  }`}
              >
                <Icon size={22} strokeWidth={2} className={`transition-transform ${activo ? 'scale-110' : ''}`} />
                <span className="text-[10px] leading-tight">{LABEL_BARRA[href]}</span>
                {activo && <div className="w-1 h-1 rounded-full bg-obsidian" />}
              </button>
            )
          })}

          <button
            onClick={() => setMasAbierto(v => !v)}
            aria-expanded={masAbierto}
            aria-label={masAbierto ? 'Cerrar menú' : 'Más opciones'}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-all ${
              masAbierto || ITEMS_MAS.some(i => i.href === pathname) ? 'text-obsidian' : 'text-steel'
            }`}
          >
            <Plus size={22} strokeWidth={2} className={`transition-transform ${masAbierto ? 'rotate-45' : ''}`} />
            <span className="text-[10px] leading-tight">{masAbierto ? 'Cerrar' : 'Más'}</span>
            {ITEMS_MAS.some(i => i.href === pathname) && !masAbierto && (
              <div className="w-1 h-1 rounded-full bg-obsidian" />
            )}
          </button>
        </div>
      </nav>

      {/* Panel del submenú: hoja anclada sobre la barra, a lo ancho de la
          pantalla para que los destinos sean fáciles de tocar. */}
      {masAbierto && (
        <div className="fixed left-0 right-0 z-[60] lg:hidden bottom-[calc(4.25rem+env(safe-area-inset-bottom))] px-3">
          <div className="overflow-hidden border shadow-soft bg-snow border-fog rounded-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-fog">
              <p className="text-sm font-semibold text-ink">Más opciones</p>
              <button
                onClick={() => setMasAbierto(false)}
                aria-label="Cerrar menú"
                className="flex items-center justify-center transition-colors rounded-full w-9 h-9 text-ash hover:text-ink hover:bg-mist"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {ITEMS_MAS.map(({ href, Icon, label }) => {
                const activo = pathname === href
                return (
                  <button
                    key={href}
                    onClick={() => ir(href)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm transition-colors border-b border-fog last:border-0 ${activo ? 'bg-obsidian text-snow font-medium' : 'text-steel hover:bg-mist hover:text-ink'
                      }`}
                  >
                    <Icon size={18} strokeWidth={2} className="shrink-0" />
                    {label}
                    {activo && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-snow" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}