'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Notificaciones from './Notificaciones'

// Encabezado y tarjeta de resumen compartidos.
//
// Este bloque estaba copiado a mano en cada pantalla, así que las que se
// añadieron después (Reportes, Categorías, Exportar, Configuración) se quedaron
// sin él y se veían de otra familia. Tenerlo aquí hace que la consistencia sea
// automática en las pantallas que vengan.

const DEGRADADO = 'linear-gradient(135deg, #2c6e49 0%, #14361f 55%, #000000 100%)'

export function Encabezado({
  seccion,
  titulo,
  acciones,
  conNotificaciones = true,
}: {
  seccion: string
  titulo: string
  acciones?: ReactNode
  conNotificaciones?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5 sm:mb-8">
      <div className="min-w-0">
        <p className="mb-1 text-sm font-medium text-steel">{seccion}</p>
        <h1 className="text-2xl font-bold sm:text-3xl text-obsidian">{titulo}</h1>
      </div>
      <div className="flex items-center flex-shrink-0 gap-3">
        {acciones}
        {conNotificaciones && <Notificaciones />}
      </div>
    </div>
  )
}

export interface Metrica {
  icon: LucideIcon
  label: string
  valor: string
  nota?: ReactNode
}

export function Hero({
  titulo,
  subtitulo,
  metricas,
}: {
  titulo: string
  subtitulo?: string
  metricas: Metrica[]
}) {
  // Con tres o menos caben en una fila desde sm; con cuatro se reparten en dos
  // columnas antes de pasar a cuatro en pantallas grandes.
  const cols =
    metricas.length >= 4
      ? 'sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/10'
      : metricas.length === 3
        ? 'sm:grid-cols-3 sm:divide-x sm:divide-white/10'
        : 'sm:grid-cols-2 sm:divide-x sm:divide-white/10'

  return (
    <div
      className="relative mb-5 overflow-hidden text-white shadow-soft rounded-2xl sm:mb-8"
      style={{ background: DEGRADADO }}
    >
      <div className="absolute top-0 right-0 rounded-full pointer-events-none -mt-16 -mr-16 w-72 h-72 bg-white/5 blur-2xl" />
      <div className="absolute bottom-0 rounded-full pointer-events-none left-1/3 -mb-24 w-72 h-72 bg-emerald-400/10 blur-3xl" />

      <div className="relative px-5 py-6 sm:px-6 sm:py-9 lg:px-8 lg:py-12">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl font-semibold">{titulo}</h2>
          {subtitulo && <p className="text-base capitalize text-white/60">{subtitulo}</p>}
        </div>

        <div className={`grid grid-cols-1 gap-5 sm:gap-6 ${cols}`}>
          {metricas.map(({ icon: Icon, label, valor, nota }, i) => (
            <div
              key={label}
              className={`flex items-start gap-4 ${i > 0 ? 'sm:pl-6' : ''} ${
                i < metricas.length - 1 ? 'sm:pr-6' : ''
              }`}
            >
              <div className="flex items-center justify-center flex-shrink-0 w-11 h-11 rounded-xl bg-white/10">
                <Icon size={20} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-base text-white/60">{label}</p>
                <p className="text-2xl font-bold break-words sm:text-3xl">{valor}</p>
                {nota && <p className="mt-1.5 text-sm font-medium">{nota}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
