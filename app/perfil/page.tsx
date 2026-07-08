'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import AppLayout from '../components/AppLayout'
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

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUsuario(user)

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile) {
        setPerfil(profile)
        setNombre(profile.nombre || '')
        setMoneda(profile.moneda_default || 'HNL')
      }

      setLoading(false)
    }
    init()
  }, [router])

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setMensaje('')

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: usuario.id,
        nombre,
        moneda_default: moneda
      })

    if (error) {
      setMensaje('❌ Error al guardar: ' + error.message)
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

    const { error } = await supabase.auth.updateUser({
      password: passwordNuevo
    })

    if (error) {
      setMensajePassword('❌ Error: ' + error.message)
    } else {
      setMensajePassword('✅ Contraseña actualizada correctamente')
      setPasswordActual('')
      setPasswordNuevo('')
      setPasswordConfirm('')
      setCambiarPassword(false)
    }
    setGuardandoPassword(false)
  }

  const handleEliminarCuenta = async () => {
    if (!confirm('¿Estás seguro? Esta acción eliminará TODOS tus datos y no se puede deshacer.')) return
    if (!confirm('¿Confirmas que quieres eliminar tu cuenta permanentemente?')) return
    await supabase.auth.signOut()
    router.push('/')
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
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-steel animate-pulse">Cargando...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1728px] p-6 mx-auto lg:p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-obsidian">Perfil y Configuración</h1>
          <p className="mt-1 text-sm text-steel">
            Personaliza tu cuenta y preferencias
          </p>
        </div>

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
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={passwordNuevo}
                  onChange={(e) => setPasswordNuevo(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
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
          <EstadisticasCuenta userId={usuario?.id} />
        </div>

        {/* Zona de peligro */}
        <div className="p-6 border bg-snow border-red-200 rounded-card">
          <h2 className="mb-2 font-semibold text-red-500">Zona de peligro</h2>
          <p className="mb-4 text-sm text-steel">
            Estas acciones son irreversibles. Procede con cuidado.
          </p>
          <button
            onClick={handleEliminarCuenta}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 transition-all border border-red-200 hover:bg-red-50 rounded-full"
          >
            <Trash2 size={16} strokeWidth={2} />
            Cerrar y eliminar cuenta
          </button>
        </div>

      </div>
    </AppLayout>
  )
}

// Componente separado para estadísticas
function EstadisticasCuenta({ userId }: { userId: string }) {
  const [stats, setStats] = useState({
    transacciones: 0,
    carteras: 0,
    categorias: 0,
    presupuestos: 0,
    deudas: 0
  })

  useEffect(() => {
    if (!userId) return
    const cargar = async () => {
      const [trans, wallets, cats, budgets, debts] = await Promise.all([
        supabase.from('transactions').select('id', { count: 'exact' }).eq('user_id', userId),
        supabase.from('wallets').select('id', { count: 'exact' }).eq('user_id', userId).eq('activo', true),
        supabase.from('categories').select('id', { count: 'exact' }).eq('user_id', userId),
        supabase.from('budgets').select('id', { count: 'exact' }).eq('user_id', userId),
        supabase.from('debts').select('id', { count: 'exact' }).eq('user_id', userId),
      ])
      setStats({
        transacciones: trans.count || 0,
        carteras: wallets.count || 0,
        categorias: cats.count || 0,
        presupuestos: budgets.count || 0,
        deudas: debts.count || 0,
      })
    }
    cargar()
  }, [userId])

  const items = [
    { label: 'Transacciones', valor: stats.transacciones, Icon: ArrowLeftRight },
    { label: 'Carteras', valor: stats.carteras, Icon: Wallet },
    { label: 'Categorías', valor: stats.categorias, Icon: Tag },
    { label: 'Presupuestos', valor: stats.presupuestos, Icon: Target },
    { label: 'Deudas', valor: stats.deudas, Icon: Handshake },
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
