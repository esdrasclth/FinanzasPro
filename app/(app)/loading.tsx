// Esqueleto de las pantallas con sesión.
//
// Solo cubre el hueco del contenido: el menú lo pinta el layout del grupo y
// ese no se desmonta al navegar. Antes el único `loading` era el de la raíz,
// una tarjeta centrada a pantalla completa que tapaba también el menú, y por
// eso cada cambio de pantalla parecía una recarga de la aplicación entera.
export default function Loading() {
  return (
    <div
      className="max-w-[1728px] p-4 mx-auto space-y-6 sm:p-6 lg:p-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando…</span>

      <div className="w-48 h-8 rounded bg-fog animate-pulse" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-6 border bg-snow border-fog rounded-card">
            <div className="w-2/3 h-3 mb-4 rounded bg-fog animate-pulse" />
            <div className="w-1/2 h-8 rounded bg-fog animate-pulse" />
          </div>
        ))}
      </div>

      <div className="p-6 border bg-snow border-fog rounded-card">
        <div className="w-40 h-4 mb-5 rounded bg-fog animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 rounded bg-fog animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
