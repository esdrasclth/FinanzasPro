'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, ArrowLeftRight, Target, Wallet, Users, Tag,
  Download, Handshake, BarChart3, Settings, Droplets, LogOut, Plus,
  RefreshCw, type LucideIcon,
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

function MasMenu({ pathname, router }: { pathname: string, router: any }) {
  const [abierto, setAbierto] = useState(false)

  const MAS_ITEMS = ITEMS_MAS

  const algunoActivo = MAS_ITEMS.some(i => i.href === pathname)

  return (
    <>
      {abierto && (
        <div className="fixed inset-0 z-40 bg-obsidian/30 backdrop-blur-sm" onClick={() => setAbierto(false)} />
      )}

      {abierto && (
        <div className="fixed z-50 w-48 overflow-hidden border shadow-soft bottom-16 right-2 bg-snow border-fog rounded-card">
          {MAS_ITEMS.map(({ href, Icon, label }) => {
            const activo = pathname === href
            return (
              <button
                key={href}
                onClick={() => { router.push(href); setAbierto(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b border-fog last:border-0 ${activo ? 'bg-obsidian text-snow font-medium' : 'text-steel hover:bg-mist hover:text-ink'
                  }`}
              >
                <Icon size={18} strokeWidth={2} className="shrink-0" />
                {label}
                {activo && <div className="ml-auto w-1.5 h-1.5 bg-snow rounded-full" />}
              </button>
            )
          })}
        </div>
      )}

      <button
        onClick={() => setAbierto(!abierto)}
        className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs transition-all ${algunoActivo || abierto ? 'text-obsidian' : 'text-steel'
          }`}
      >
        <Plus size={22} strokeWidth={2} className={`transition-transform ${abierto ? 'rotate-45' : ''}`} />
        <span className="text-[10px]">Más</span>
        {algunoActivo && !abierto && <div className="w-1 h-1 bg-obsidian rounded-full" />}
      </button>
    </>
  )
}

export default function Sidebar({ usuario }: { usuario: any }) {
  const pathname = usePathname()
  const router = useRouter()

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
                onClick={() => router.push(href)}
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

      {/* Bottom Nav Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t lg:hidden bg-snow/90 backdrop-blur border-fog pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center">
          {ITEMS_BARRA.map(({ href, Icon }) => {
            const activo = pathname === href
            return (
              <button
                key={href}
                onClick={() => router.push(href)}
                aria-label={LABEL_BARRA[href] || href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-all ${activo ? 'text-obsidian' : 'text-steel'
                  }`}
              >
                <Icon size={22} strokeWidth={2} className={`transition-transform ${activo ? 'scale-110' : ''}`} />
                <span className="text-[10px] leading-tight">{LABEL_BARRA[href]}</span>
                {activo && <div className="w-1 h-1 bg-obsidian rounded-full" />}
              </button>
            )
          })}
          <MasMenu pathname={pathname} router={router} />
        </div>
      </nav>
    </>
  )
}