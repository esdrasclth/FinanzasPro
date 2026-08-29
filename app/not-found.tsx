import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex items-center justify-center min-h-screen p-6 bg-mist">
      <section className="w-full max-w-md p-8 text-center border shadow-soft bg-snow border-fog rounded-card">
        <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 text-steel rounded-2xl bg-mist"><SearchX size={26} aria-hidden="true" /></div>
        <p className="mb-2 text-sm font-medium text-steel">Error 404</p>
        <h1 className="mb-2 text-xl font-bold text-obsidian">No encontramos esa pantalla</h1>
        <p className="mb-6 text-sm text-steel">El enlace puede haber cambiado o ya no estar disponible.</p>
        <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-full bg-obsidian text-snow hover:bg-graphite"><ArrowLeft size={17} aria-hidden="true" />Volver al dashboard</Link>
      </section>
    </main>
  )
}
