'use client'

// Bus de cambios de datos.
//
// Cuando se registra un movimiento, las demás pantallas que ya están montadas
// —en esta pestaña y en las otras del mismo navegador— se enteran y recargan
// solas, sin que el usuario tenga que refrescar.
//
// No hay WebSocket ni SSE a propósito. El cambio lo provoca este mismo
// navegador, así que el evento ya está aquí: mandarlo al servidor para que lo
// devuelva sería dar la vuelta al mundo para cruzar la calle, y en Vercel las
// funciones serverless ni siquiera sostienen una conexión abierta. Para el día
// en que haga falta avisar de cambios que ocurrieron en OTRO dispositivo o en
// la sesión de otro miembro de un grupo, basta con abrir una conexión SSE que
// llame a `emitirCambio()`: las pantallas ya están suscritas y no cambian.

import { useCallback, useEffect, useRef } from 'react'

export type Recurso =
  | 'transacciones'
  | 'carteras'
  | 'categorias'
  | 'presupuesto'
  | 'deudas'
  | 'metas'
  | 'suscripciones'
  | 'grupos'
  | 'repartos'
  | 'reportes'

// Quién más queda desactualizado cuando cambia un recurso. Vive aquí y no en
// cada formulario para que el que registra un gasto solo tenga que decir
// "cambiaron las transacciones" sin acordarse de que eso también mueve el
// saldo de la cartera y consume presupuesto.
//
// La expansión es de un solo nivel, no transitiva: así el alcance de un
// `emitirCambio` se lee de un vistazo en esta tabla y no hay que perseguir
// cadenas ni cuidarse de los ciclos (transacciones ↔ carteras).
const DERIVADOS: Partial<Record<Recurso, Recurso[]>> = {
  // Un movimiento mueve el saldo de la cartera, consume presupuesto y entra
  // en los reportes.
  transacciones: ['carteras', 'presupuesto', 'reportes'],
  // Renombrar o archivar una cartera cambia las etiquetas de la lista de
  // movimientos y el patrimonio de los reportes.
  carteras: ['transacciones', 'reportes'],
  // Las categorías etiquetan movimientos y son el eje de presupuestos y
  // reportes.
  categorias: ['transacciones', 'presupuesto', 'reportes'],
  // Una deuda crea su subcategoría, y cada abono es un movimiento real.
  deudas: ['transacciones', 'carteras', 'categorias'],
  // Los aportes a una meta salen de una cartera.
  metas: ['transacciones', 'carteras', 'presupuesto'],
  // Registrar el cobro de una suscripción crea el movimiento.
  suscripciones: ['transacciones', 'carteras'],
  // Un gasto compartido deja el movimiento propio, y liquidar mueve dinero.
  grupos: ['transacciones', 'carteras'],
  repartos: ['transacciones', 'carteras'],
}

type Listener = (recursos: Recurso[]) => void

const CANAL = 'finanzas-pro:datos'

const listeners = new Set<Listener>()
let canal: BroadcastChannel | null = null
let canalListo = false

// El canal se abre en el primer uso y no en la carga del módulo: en el
// servidor `BroadcastChannel` no existe y este archivo también se importa
// desde componentes que Next renderiza allí.
function abrirCanal(): BroadcastChannel | null {
  if (canalListo) return canal
  canalListo = true
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }
  canal = new BroadcastChannel(CANAL)
  // BroadcastChannel no le entrega el mensaje a quien lo envió, así que esto
  // solo corre en las OTRAS pestañas: no hay eco ni recarga doble.
  canal.onmessage = (ev: MessageEvent) => {
    const recursos = ev.data?.recursos
    if (Array.isArray(recursos)) despachar(recursos)
  }
  return canal
}

function despachar(recursos: Recurso[]) {
  // Se copia el set: un listener que se da de baja durante el recorrido no
  // debe alterar la iteración en curso.
  for (const l of Array.from(listeners)) {
    try {
      l(recursos)
    } catch {
      // Una pantalla que falle al recargar no puede dejar sin avisar a las demás.
    }
  }
}

function expandir(recursos: Recurso[]): Recurso[] {
  const todos = new Set<Recurso>(recursos)
  for (const r of recursos) {
    for (const d of DERIVADOS[r] || []) todos.add(d)
  }
  return Array.from(todos)
}

/**
 * Avisa que uno o más recursos cambiaron. Se llama después de que el servidor
 * confirmó la escritura, nunca antes: si el POST falla no hay nada que avisar.
 */
export function emitirCambio(...recursos: Recurso[]) {
  if (recursos.length === 0) return
  const afectados = expandir(recursos)
  despachar(afectados)
  abrirCanal()?.postMessage({ recursos: afectados })
}

function suscribir(l: Listener): () => void {
  abrirCanal()
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// Ventana de agrupación. Lo bastante corta para que la recarga se sienta
// instantánea y lo bastante ancha para fundir en una sola petición los avisos
// que llegan juntos.
const ESPERA = 50

/**
 * Le da a una pantalla su función de recarga y, de paso, la suscribe a los
 * recursos que le importan.
 *
 * Devuelve un `recargar` estable que sirve para las dos cosas: llamarlo a mano
 * después de escribir, y recibir los avisos del bus. Que ambos caminos compartan
 * el mismo temporizador es justo el punto —la pantalla que registra el
 * movimiento también está suscrita a él, así que si fueran caminos separados
 * cada escritura dispararía dos peticiones idénticas al servidor.
 *
 * La lista de recursos se compara por contenido, así que puede escribirse en
 * línea (`['transacciones']`) sin memoizarla, y `cargar` se lee siempre en su
 * versión más reciente: tampoco hace falta envolverla en `useCallback`.
 *
 * Importante: `cargar` nunca debe llamar a `emitirCambio`. Recargar es leer;
 * si además avisara, cada aviso provocaría otro y el ciclo no pararía.
 */
export function useRecarga(recursos: Recurso[], cargar: () => void): () => void {
  // El cargador se guarda en un ref y se refresca después de cada render, no
  // durante: así el temporizador siempre llama a la versión más reciente —con
  // los filtros y el mes que la pantalla tenga en ese momento— sin que quien
  // usa el hook tenga que envolverlo en `useCallback`.
  const cb = useRef(cargar)
  useEffect(() => { cb.current = cargar })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendiente = useRef(false)

  // Estable de por vida: se puede pasar como `onSuccess` sin re-renderizar los
  // formularios en cada render de la pantalla.
  const programar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      cb.current()
    }, ESPERA)
  }, [])

  // La lista se aplana a string para que el efecto dependa de su contenido y
  // no de la identidad del array, que cambia en cada render.
  const clave = recursos.join(',')

  useEffect(() => {
    if (!clave) return

    const mios = new Set(clave.split(',') as Recurso[])

    const quitar = suscribir(cambiados => {
      if (!cambiados.some(r => mios.has(r))) return
      // Pedirle datos al servidor para una pestaña que nadie está mirando es
      // gasto puro. Se anota y se recarga cuando vuelva al frente.
      if (document.visibilityState === 'hidden') {
        pendiente.current = true
        return
      }
      programar()
    })

    const alVolver = () => {
      if (document.visibilityState === 'visible' && pendiente.current) {
        pendiente.current = false
        programar()
      }
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      quitar()
      document.removeEventListener('visibilitychange', alVolver)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [clave, programar])

  return programar
}
