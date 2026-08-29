'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
import { Encabezado, Hero } from '../components/Encabezado'
import { Wallet as WalletIcon, Coins } from 'lucide-react'
import { Trash2, ArrowLeftRight, Wallet, Tag, Target, Handshake } from 'lucide-react'

export default function Perfil() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState('HNL')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [cambiarPassword, setCambiarPassword] = useState(false)
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNuevo, setPasswordNuevo] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [guardandoPassword, setGuardandoPassword] = useState(false)
  const [mensajePassword, setMensajePassword] = useState('')
  const [statsCuenta, setStatsCuenta] = useState<any>(null)
  const [eliminandoCuenta, setEliminandoCuenta] = useState(false)
  const [confirmacionEliminar, setConfirmacionEliminar] = useState('')
  const [passwordEliminar, setPasswordEliminar] = useState('')
  const [mensajeEliminar, setMensajeEliminar] = useState('')
  const [procesandoEliminar, setProcesandoEliminar] = useState(false)

  useEffect(() => {
    const init = async () => {
      const [ses, res] = await Promise.all([
        fetch('/api/auth/session').then(r => r.json()).catch(() => null),
        fetch('/api/perfil').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (!ses?.user) { router.push('/login'); return }
      setUsuario(ses.user)
      if (res?.perfil) {
        setPerfil(res.perfil)
        setNombre(res.perfil.nombre || '')
        setMoneda(res.perfil.moneda_default || 'HNL')
      }
      if (res?.stats) setStatsCuenta(res.stats)
      setLoading(false)
    }
    init()
  }, [router])

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setMensaje('')

    const res = await fetch('/api/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, moneda_default: moneda }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      setMensaje('❌ ' + (json?.error?.message || 'Error al guardar'))
    } else {
      setMensaje('✅ Perfil actualizado correctamente')
    }
    setGuardando(false)
  }

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoPassword(true)
    setMensajePassword('')

    if (passwordNuevo !== passwordConfirm) {
      setMensajePassword('❌ Las contraseñas no coinciden')
      setGuardandoPassword(false)
      return
    }

    if (passwordNuevo.length < 6) {
      setMensajePassword('❌ La contraseña debe tener al menos 6 caracteres')
      setGuardandoPassword(false)
      return
    }

    const res = await fetch('/api/auth/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: passwordActual,
        password: passwordNuevo,
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setMensajePassword('❌ ' + (json?.error?.message || 'No se pudo actualizar'))
    } else {
      setMensajePassword('✅ Contraseña actualizada correctamente')
      setPasswordActual('')
      setPasswordNuevo('')
      setPasswordConfirm('')
      setCambiarPassword(false)
    }
    setGuardandoPassword(false)
  }

  const handleEliminarCuenta = async (e: React.FormEvent) => {
    e.preventDefault()
    setMensajeEliminar('')
    setProcesandoEliminar(true)
    try {
      const res = await fetch('/api/perfil', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: passwordEliminar,
          confirmacion: confirmacionEliminar,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setMensajeEliminar(json?.error?.message || 'No se pudo eliminar la cuenta')
        return
      }
      router.replace('/login')
    } catch {
      setMensajeEliminar('No se pudo conectar. Intenta de nuevo.')
    } finally {
      setProcesandoEliminar(false)
    }
  }

  const MONEDAS = [
    { codigo: 'HNL', nombre: 'Lempira hondureño', simbolo: 'L' },
    { codigo: 'USD', nombre: 'Dólar americano', simbolo: '$' },
    { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
    { codigo: 'MXN', nombre: 'Peso mexicano', simbolo: '$' },
    { codigo: 'GTQ', nombre: 'Quetzal guatemalteco', simbolo: 'Q' },
    { codigo: 'CRC', nombre: 'Colón costarricense', simbolo: '₡' },
  ]

  if (loading) {
    return (
      <AppLayout usuario={perfil}>
        <div className="flex items-center justify-center h-96">
          <p className="text-steel animate-pulse">Cargando...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout usuario={perfil}>
      <div className="max-w-[1728px] p-4 mx-auto sm:p-6 lg:p-8">

        <Encabezado seccion="Configuración" titulo="Tu cuenta y preferencias" />

        <Hero
          titulo={perfil?.nombre || 'Tu cuenta'}
          subtitulo={usuario?.email}
          metricas={[
            {
              icon: ArrowLeftRight,
              label: 'Movimientos',
              valor: String(statsCuenta?.transacciones ?? 0),
              nota: <span className="text-white/50">registrados</span>,
            },
            {
              icon: WalletIcon,
              label: 'Carteras',
              valor: String(statsCuenta?.carteras ?? 0),
              nota: <span className="text-white/50">activas</span>,
            },
            {
              icon: Coins,
              label: 'Moneda',
              valor: moneda,
              nota: <span className="text-white/50">principal</span>,
            },
          ]}
        />


        {/* Avatar y email */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 text-3xl font-bold border text-obsidian bg-mist border-fog rounded-2xl">
              {nombre?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-lg font-semibold text-ink">{nombre}</p>
              <p className="text-sm text-steel">{usuario?.email}</p>
              <p className="mt-1 text-xs text-ash">
                Miembro desde {new Date(usuario?.created_at).toLocaleDateString('es-HN', {
                  year: 'numeric', month: 'long'
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Información personal */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card">
          <h2 className="mb-4 font-semibold text-ink">Información personal</h2>
          <form onSubmit={handleGuardarPerfil} className="space-y-4">

            <div>
              <label className="block mb-2 text-xs font-medium text-steel">
                Nombre completo
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                required
                className="w-full px-4 py-3 transition-colors border bg-mist border-fog text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
              />
            </div>

            <div>
              <label className="block mb-2 text-xs font-medium text-steel">
                Correo electrónico
              </label>
              <input
                type="email"
                value={usuario?.email}
                disabled
                className="w-full px-4 py-3 border cursor-not-allowed bg-mist border-fog text-ash rounded-input"
              />
              <p className="mt-1 text-xs text-ash">El email no se puede cambiar</p>
            </div>

            <div>
              <label className="block mb-2 text-xs font-medium text-steel">
                Moneda principal
              </label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full px-4 py-3 transition-colors border bg-mist border-fog text-ink rounded-input focus:outline-none focus:border-obsidian"
              >
                {MONEDAS.map(m => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.simbolo} — {m.nombre} ({m.codigo})
                  </option>
                ))}
              </select>
            </div>

            {mensaje && (
              <div className={`px-4 py-3 rounded-input text-sm border ${
                mensaje.includes('✅')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-red-50 border-red-200 text-red-500'
              }`}>
                {mensaje}
              </div>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="w-full py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite disabled:bg-ash shadow-pill"
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>
        </div>

        {/* Cambiar contraseña */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">Contraseña</h2>
            <button
              onClick={() => setCambiarPassword(!cambiarPassword)}
              className="text-sm font-medium transition-colors text-graphite hover:text-ink"
            >
              {cambiarPassword ? 'Cancelar' : 'Cambiar'}
            </button>
          </div>

          {!cambiarPassword ? (
            <p className="text-sm text-ash">
              ••••••••••••
            </p>
          ) : (
            <form onSubmit={handleCambiarPassword} className="space-y-4">
              <div>
                <label className="block mb-2 text-xs font-medium text-steel">
                  Contraseña actual
                </label>
                <input
                  type="password"
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 transition-colors border bg-mist border-fog text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                />
              </div>

              <div>
                <label className="block mb-2 text-xs font-medium text-steel">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={passwordNuevo}
                  onChange={(e) => setPasswordNuevo(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  required
                  className="w-full px-4 py-3 transition-colors border bg-mist border-fog text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                />
              </div>

              <div>
                <label className="block mb-2 text-xs font-medium text-steel">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  required
                  className="w-full px-4 py-3 transition-colors border bg-mist border-fog text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian"
                />
              </div>

              {mensajePassword && (
                <div className={`px-4 py-3 rounded-input text-sm border ${
                  mensajePassword.includes('✅')
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    : 'bg-red-50 border-red-200 text-red-500'
                }`}>
                  {mensajePassword}
                </div>
              )}

              <button
                type="submit"
                disabled={guardandoPassword}
                className="w-full py-3 font-medium transition-all rounded-full bg-obsidian text-snow hover:bg-graphite disabled:bg-ash shadow-pill"
              >
                {guardandoPassword ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </form>
          )}
        </div>

        {/* Estadísticas de la cuenta */}
        <div className="p-6 mb-6 border bg-snow border-fog rounded-card">
          <h2 className="mb-4 font-semibold text-ink">Tu cuenta en números</h2>
          <EstadisticasCuenta stats={statsCuenta} />
        </div>

        {/* Zona de peligro */}
        <div className="p-6 border bg-snow border-red-200 rounded-card">
          <h2 className="mb-2 font-semibold text-red-500">Zona de peligro</h2>
          <p className="mb-4 text-sm text-steel">
            Estas acciones son irreversibles. Procede con cuidado.
          </p>
          {!eliminandoCuenta ? (
            <button
              onClick={() => setEliminandoCuenta(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 transition-all border border-red-200 hover:bg-red-50 rounded-full"
            >
              <Trash2 size={16} strokeWidth={2} />
              Eliminar cuenta
            </button>
          ) : (
            <form onSubmit={handleEliminarCuenta} className="max-w-lg p-4 space-y-4 border border-red-200 bg-red-50/50 rounded-input">
              <p className="text-sm text-graphite">
                Se borrarán tus carteras, movimientos, presupuestos y demás datos privados. Los gastos compartidos necesarios para las cuentas de otras personas se conservarán sin tu identidad.
              </p>
              <div>
                <label className="block mb-2 text-xs font-medium text-steel">Contraseña actual</label>
                <input
                  type="password"
                  value={passwordEliminar}
                  onChange={(e) => setPasswordEliminar(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 bg-white border border-red-200 rounded-input focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block mb-2 text-xs font-medium text-steel">
                  Escribe <strong>ELIMINAR</strong> para confirmar
                </label>
                <input
                  value={confirmacionEliminar}
                  onChange={(e) => setConfirmacionEliminar(e.target.value)}
                  autoComplete="off"
                  required
                  className="w-full px-4 py-3 uppercase bg-white border border-red-200 rounded-input focus:outline-none focus:border-red-500"
                />
              </div>
              {mensajeEliminar && (
                <p role="alert" className="text-sm font-medium text-red-600">{mensajeEliminar}</p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={procesandoEliminar || confirmacionEliminar.trim().toUpperCase() !== 'ELIMINAR'}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} strokeWidth={2} />
                  {procesandoEliminar ? 'Eliminando…' : 'Eliminar permanentemente'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEliminandoCuenta(false)
                    setPasswordEliminar('')
                    setConfirmacionEliminar('')
                    setMensajeEliminar('')
                  }}
                  className="px-4 py-2.5 text-sm font-medium rounded-full text-graphite hover:bg-mist"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </AppLayout>
  )
}

// Componente separado para estadísticas
// Los conteos llegan ya calculados junto con el perfil desde /api/perfil.
function EstadisticasCuenta({ stats }: { stats: any }) {
  const s = stats || { transacciones: 0, carteras: 0, categorias: 0, presupuestos: 0, deudas: 0 }
  const items = [
    { label: 'Transacciones', valor: s.transacciones, Icon: ArrowLeftRight },
    { label: 'Carteras', valor: s.carteras, Icon: Wallet },
    { label: 'Categorías', valor: s.categorias, Icon: Tag },
    { label: 'Presupuestos', valor: s.presupuestos, Icon: Target },
    { label: 'Deudas', valor: s.deudas, Icon: Handshake },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map(({ label, valor, Icon }) => (
        <div key={label} className="p-3 text-center bg-mist rounded-2xl">
          <Icon size={20} strokeWidth={2} className="mx-auto mb-1 text-graphite" />
          <p className="text-lg font-bold text-obsidian">{valor}</p>
          <p className="text-xs text-ash">{label}</p>
        </div>
      ))}
    </div>
  )
}
