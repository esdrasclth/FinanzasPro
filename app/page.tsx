import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-mist flex items-center justify-center py-20">
      <div className="text-center px-6 max-w-3xl mx-auto">

        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <div className="w-20 h-20 bg-snow border border-fog rounded-card flex items-center justify-center text-5xl">
            💧
          </div>
        </div>

        {/* Título */}
        <h1 className="text-5xl sm:text-6xl font-bold text-obsidian leading-[1.05] tracking-tight mb-5">
          Caudal
        </h1>
        <p className="text-xl sm:text-2xl font-semibold mb-3">
          <span className="text-ink">Finanzas</span>{' '}
          <span className="text-ash">Personales</span>
        </p>
        <p className="text-steel text-base mb-14 italic">
          Tu dinero, en flujo
        </p>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="bg-obsidian hover:bg-graphite text-snow font-medium px-8 py-3 rounded-full shadow-pill transition-all duration-200 text-lg"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="border border-pebble hover:bg-fog text-graphite font-medium px-8 py-3 rounded-full transition-all duration-200 text-lg"
          >
            Crear cuenta
          </Link>
        </div>

        {/* Stack */}
        <div className="mt-20 flex gap-3 justify-center flex-wrap">
          {['Next.js', 'Supabase', 'FastAPI'].map((tech) => (
            <span
              key={tech}
              className="rounded-badge bg-fog text-graphite text-xs font-medium px-3 py-1"
            >
              {tech}
            </span>
          ))}
        </div>

      </div>
    </main>
  )
}
