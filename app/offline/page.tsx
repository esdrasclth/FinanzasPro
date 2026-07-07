export const metadata = { title: 'Sin conexión · Caudal' }

export default function Offline() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center bg-mist">
      <div className="flex items-center justify-center text-2xl bg-obsidian w-14 h-14 rounded-2xl">💧</div>
      <h1 className="text-xl font-bold text-obsidian">Sin conexión</h1>
      <p className="max-w-xs text-sm text-steel">
        No pudimos conectar. Revisa tu internet e inténtalo de nuevo; tus datos siguen a salvo.
      </p>
    </div>
  )
}
