'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <main className="min-h-screen bg-mist flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">💧</span>
          <h1 className="text-3xl font-bold text-obsidian mt-2">Caudal</h1>
          <p className="text-steel mt-1">Inicia sesión en tu cuenta</p>
        </div>

        {/* Card */}
        <div className="bg-snow border border-fog rounded-card-lg p-8">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-input mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
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
                placeholder="••••••••"
                required
                className="w-full bg-mist border border-transparent text-ink placeholder-ash rounded-input px-4 py-3 focus:outline-none focus:border-obsidian focus:bg-snow transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-obsidian hover:bg-graphite disabled:opacity-40 disabled:cursor-not-allowed text-snow font-medium py-3 rounded-full shadow-pill transition-all duration-200"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="text-center text-steel text-sm mt-6">
            ¿No tienes cuenta?{' '}
            <Link href="/registro" className="text-ink font-semibold hover:text-graphite">
              Regístrate gratis
            </Link>
          </p>
        </div>

      </div>
    </main>
  )
}
