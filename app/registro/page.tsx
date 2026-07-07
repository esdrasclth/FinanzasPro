'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Registro() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        nombre,
        moneda_default: 'HNL'
      })
      setSuccess(true)
    }

    setLoading(false)
  }

  if (success) {
    return (
      <main className="min-h-screen bg-mist flex items-center justify-center px-4">
        <div className="text-center">
          <span className="text-6xl">✅</span>
          <h2 className="text-2xl font-bold text-obsidian mt-4">¡Cuenta creada!</h2>
          <p className="text-steel mt-2 mb-6">
            Tu cuenta está lista, ya puedes iniciar sesión
          </p>
          <Link
            href="/login"
            className="bg-obsidian hover:bg-graphite text-snow font-medium px-8 py-3 rounded-full shadow-pill transition-all"
          >
            Ir al Login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-mist flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">💧</span>
          <h1 className="text-3xl font-bold text-obsidian mt-2">Caudal</h1>
          <p className="text-steel mt-1">Crea tu cuenta gratis</p>
        </div>

        {/* Card */}
        <div className="bg-snow border border-fog rounded-card-lg p-8">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-input mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegistro} className="space-y-5">
            <div>
              <label className="text-steel text-xs font-medium block mb-2">
                Nombre completo
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Esdras Clother"
                required
                className="w-full bg-mist border border-transparent text-ink placeholder-ash rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
              />
            </div>

            <div>
              <label className="text-steel text-xs font-medium block mb-2">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full bg-mist border border-transparent text-ink placeholder-ash rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
              />
            </div>

            <div>
              <label className="text-steel text-xs font-medium block mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                className="w-full bg-mist border border-transparent text-ink placeholder-ash rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-obsidian hover:bg-graphite disabled:opacity-40 disabled:cursor-not-allowed text-snow font-medium py-3 rounded-full shadow-pill transition-all duration-200"
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>

          <p className="text-center text-steel text-sm mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-ink font-semibold hover:text-graphite">
              Inicia sesión
            </Link>
          </p>
        </div>

      </div>
    </main>
  )
}
