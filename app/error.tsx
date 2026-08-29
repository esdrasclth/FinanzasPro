'use client'

import { useEffect } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Error de renderizado en Caudal', error) }, [error])
  return (
    <main className="flex items-center justify-center min-h-screen p-6 bg-mist">
      <section className="w-full max-w-md p-8 text-center border shadow-soft bg-snow border-fog rounded-card" role="alert">
        <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 text-amber-700 rounded-2xl bg-amber-50"><TriangleAlert size={26} aria-hidden="true" /></div>
        <h1 className="mb-2 text-xl font-bold text-obsidian">Algo no salió como esperábamos</h1>
        <p className="mb-6 text-sm text-steel">La pantalla encontró un problema. Puedes reintentarlo sin perder tus datos.</p>
        <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-full bg-obsidian text-snow hover:bg-graphite"><RefreshCw size={17} aria-hidden="true" />Reintentar</button>
      </section>
    </main>
  )
}
