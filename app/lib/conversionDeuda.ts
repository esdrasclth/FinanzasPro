import { convertir } from './tipoCambio'

// Pasar deuda de una moneda a la otra dentro de la MISMA tarjeta de crédito.
//
// Se registra como una transferencia de la tarjeta a sí misma, y ahí está la
// parte que se invierte sola si no se escribe una vez y se prueba:
//
//   la deuda que el usuario dice pasar es la que queda SALDADA, y saldar una
//   deuda es un INGRESO -> va como DESTINO de la transferencia.
//   la otra moneda es la que CRECE, y eso es un GASTO -> va como ORIGEN.
//
// Leído al revés parece un error, y por eso vive aquí en vez de repartido entre
// el formulario y la ruta.

export type MonedaTarjeta = 'HNL' | 'USD'

export const otraMoneda = (m: MonedaTarjeta): MonedaTarjeta => (m === 'HNL' ? 'USD' : 'HNL')

/**
 * Monedas que le corresponden a cada pierna de la transferencia cuando se pasa
 * deuda desde `deudaDe` a la otra moneda de la misma tarjeta.
 */
export function monedasConversionDeuda(deudaDe: MonedaTarjeta) {
  return {
    // La que se salda: entra un ingreso que la reduce.
    monedaDestino: deudaDe,
    // La que crece: sale un gasto que la aumenta.
    monedaOrigen: otraMoneda(deudaDe),
  }
}

/**
 * Cómo queda la tarjeta tras pasar `monto` de deuda desde `deudaDe`.
 * `monto` va en la moneda de la deuda que se salda. `tasa` es HNL por 1 USD.
 *
 * Devuelve los deltas que se aplican a cada saldo, con el signo ya puesto: la
 * deuda se guarda en negativo, así que saldar suma y endeudarse resta.
 */
export function efectoConversionDeuda(
  deudaDe: MonedaTarjeta,
  monto: number,
  tasa: number
): { salda: MonedaTarjeta; crece: MonedaTarjeta; montoSalda: number; montoCrece: number } {
  const { monedaDestino, monedaOrigen } = monedasConversionDeuda(deudaDe)
  return {
    salda: monedaDestino,
    crece: monedaOrigen,
    montoSalda: monto,
    montoCrece: convertir(monto, monedaDestino, monedaOrigen, tasa),
  }
}
