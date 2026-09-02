import assert from 'node:assert/strict'
import test from 'node:test'
import { monedasConversionDeuda, efectoConversionDeuda, otraMoneda } from '../../app/lib/conversionDeuda'

// El sentido de esta conversión es contraintuitivo leído desde la transferencia:
// la deuda que el usuario pasa es la que se SALDA, o sea la que va como destino.
// Invertirlo no rompe nada visible —los dos saldos se mueven igual— pero deja la
// deuda en la moneda equivocada, así que se fija aquí.

test('la deuda que se pasa es la que se salda, y va como destino', () => {
  assert.deepEqual(monedasConversionDeuda('HNL'), {
    monedaDestino: 'HNL',
    monedaOrigen: 'USD',
  })

  assert.deepEqual(monedasConversionDeuda('USD'), {
    monedaDestino: 'USD',
    monedaOrigen: 'HNL',
  })
})

test('otraMoneda alterna entre las dos monedas de la tarjeta', () => {
  assert.equal(otraMoneda('HNL'), 'USD')
  assert.equal(otraMoneda('USD'), 'HNL')
})

test('pasar deuda de lempiras a dólares divide entre la tasa', () => {
  const r = efectoConversionDeuda('HNL', 5_000, 26.5)

  assert.equal(r.salda, 'HNL')
  assert.equal(r.crece, 'USD')
  assert.equal(r.montoSalda, 5_000)
  // 5000 / 26.5 = 188.6792...  -> 188.68
  assert.equal(r.montoCrece, 188.68)
})

test('pasar deuda de dólares a lempiras multiplica por la tasa', () => {
  const r = efectoConversionDeuda('USD', 200, 26.5)

  assert.equal(r.salda, 'USD')
  assert.equal(r.crece, 'HNL')
  assert.equal(r.montoSalda, 200)
  assert.equal(r.montoCrece, 5_300)
})

test('ida y vuelta a la misma tasa devuelve el monto original', () => {
  const ida = efectoConversionDeuda('HNL', 5_300, 26.5)
  const vuelta = efectoConversionDeuda('USD', ida.montoCrece, 26.5)

  assert.equal(ida.montoCrece, 200)
  assert.equal(vuelta.montoCrece, 5_300)
})
