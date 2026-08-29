export default function Loading() {
  return (
    <main className="flex items-center justify-center min-h-screen p-6 bg-mist" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-md p-6 border shadow-soft bg-snow border-fog rounded-card">
        <div className="w-32 h-4 mb-6 rounded bg-fog animate-pulse" />
        <div className="h-10 mb-4 rounded bg-fog animate-pulse" />
        <div className="h-24 rounded bg-fog animate-pulse" />
        <p className="mt-4 text-sm text-center text-steel">Cargando Caudal…</p>
      </div>
    </main>
  )
}
