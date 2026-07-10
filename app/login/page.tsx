'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, Droplets, TrendingUp, PieChart, Wallet, ArrowRight } from 'lucide-react'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPass, setVerPass] = useState(false)
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
    <main className="min-h-screen bg-mist lg:grid lg:grid-cols-2">
      <BrandPanel />

      <section className="flex items-center justify-center min-h-screen px-4 py-10 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-obsidian text-snow">
              <Droplets size={26} strokeWidth={2} />
            </span>
            <h1 className="mt-3 text-2xl font-bold text-obsidian">Caudal</h1>
          </div>

          <div className="items-center hidden gap-2.5 mb-8 lg:flex">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-obsidian text-snow">
              <Droplets size={22} strokeWidth={2} />
            </span>
            <span className="text-xl font-bold text-obsidian">Caudal</span>
          </div>

          <div className="mb-7 text-center lg:text-left">
            <h2 className="text-2xl font-bold text-obsidian">Bienvenido de nuevo</h2>
            <p className="mt-1 text-sm text-steel">Inicia sesión para continuar con tus finanzas</p>
          </div>

          <div className="p-7 border shadow-soft bg-snow border-fog rounded-card-lg sm:p-8">
            {error && (
              <div className="px-4 py-3 mb-6 text-sm text-red-600 border border-red-200 bg-red-50 rounded-input">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <Campo label="Correo electrónico" icon={Mail}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="w-full py-3 pl-11 pr-4 transition-colors border border-transparent bg-mist text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                />
              </Campo>

              <Campo label="Contraseña" icon={Lock}>
                <input
                  type={verPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full py-3 pl-11 pr-11 transition-colors border border-transparent bg-mist text-ink placeholder-ash rounded-input focus:outline-none focus:border-obsidian focus:bg-snow"
                />
                <BotonVerPass ver={verPass} onToggle={() => setVerPass(v => !v)} />
              </Campo>

              <button
                type="submit"
                disabled={loading}
                style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
                className="flex items-center justify-center w-full gap-2 py-3 font-medium transition-all duration-200 rounded-full hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-snow shadow-soft"
              >
                {loading ? 'Iniciando sesión...' : <>Iniciar sesión <ArrowRight size={18} strokeWidth={2.5} /></>}
              </button>
            </form>

            <p className="mt-6 text-sm text-center text-steel">
              ¿No tienes cuenta?{' '}
              <Link href="/registro" className="font-semibold text-ink hover:text-graphite">
                Regístrate gratis
              </Link>
            </p>
          </div>

          <p className="mt-6 text-xs text-center text-ash lg:hidden">
            Desarrollado por{' '}
            <a href="https://www.brandsofts.com/" target="_blank" rel="noopener noreferrer" className="font-medium text-steel hover:text-ink">
              Brandsofts
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}

function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between p-14"
      style={{ background: 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)' }}
    >
      <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-20 -mr-20 w-80 h-80 bg-white/5 blur-2xl" />
      <div className="absolute bottom-0 rounded-full pointer-events-none left-1/4 -mb-28 w-80 h-80 bg-emerald-400/10 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 backdrop-blur">
          <Droplets size={24} strokeWidth={2} />
        </span>
        <span className="text-xl font-bold">Caudal</span>
      </div>

      <div className="relative">
        <h2 className="text-4xl font-bold leading-tight">Toma el control<br />de tu dinero.</h2>
        <p className="mt-4 text-lg text-white/60">Gestiona carteras, presupuestos y repartos en un solo lugar.</p>

        <ul className="mt-10 space-y-4">
          <Feature icon={Wallet} texto="Carteras multimoneda con saldos en tiempo real" />
          <Feature icon={PieChart} texto="Presupuestos con metas y rollover mensual" />
          <Feature icon={TrendingUp} texto="Análisis claro de ingresos y gastos" />
        </ul>
      </div>

      <p className="relative text-sm text-white/40">
        © {new Date().getFullYear()} Caudal · Desarrollado por{' '}
        <a href="https://www.brandsofts.com/" target="_blank" rel="noopener noreferrer" className="font-medium text-white/70 hover:text-white">
          Brandsofts
        </a>
      </p>
    </aside>
  )
}

function Feature({ icon: Icon, texto }: { icon: any; texto: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="inline-flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-lg bg-white/10">
        <Icon size={18} strokeWidth={2} className="text-emerald-300" />
      </span>
      <span className="text-white/80">{texto}</span>
    </li>
  )
}

function Campo({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-2 text-xs font-medium text-steel">{label}</label>
      <div className="relative">
        <Icon size={17} strokeWidth={2} className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2 text-ash" />
        {children}
      </div>
    </div>
  )
}

function BotonVerPass({ ver, onToggle }: { ver: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute flex items-center justify-center w-8 h-8 -translate-y-1/2 rounded-lg right-2 top-1/2 text-ash hover:text-ink hover:bg-fog"
      aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {ver ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
    </button>
  )
}
