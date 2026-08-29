'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmDialog({
  open,
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Confirmar',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [open, busy, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-obsidian/40 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md p-6 border shadow-soft bg-snow border-fog rounded-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3"><div className="flex items-center justify-center w-10 h-10 text-amber-700 rounded-xl bg-amber-50"><AlertTriangle size={20} aria-hidden="true" /></div><h2 id="confirm-title" className="text-lg font-semibold text-ink">{title}</h2></div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Cerrar" className="flex items-center justify-center w-9 h-9 rounded-full text-ash hover:bg-mist disabled:opacity-50"><X size={18} /></button>
        </div>
        <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-steel">{message}</p>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2.5 text-sm font-medium rounded-full text-graphite hover:bg-mist disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="px-4 py-2.5 text-sm font-medium rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{busy ? 'Procesando…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
