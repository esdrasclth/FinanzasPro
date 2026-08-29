import assert from 'node:assert/strict'
import test from 'node:test'
import { resumenMultimoneda, signoConjunto } from '../../app/lib/grupos-resumen'

test('no suma monedas incompatibles en el resumen de grupos', () => {
  const resumen = resumenMultimoneda([
    { moneda: 'HNL', mi_saldo: 500, total_mes: 1_200 },
    { moneda: 'USD', mi_saldo: 20, total_mes: 90 },
    { moneda: 'HNL', mi_saldo: -125, total_mes: 300 },
    { moneda: 'USD', mi_saldo: -5, total_mes: 10 },
  ])

  assert.deepEqual(resumen.teDeben, { HNL: 500, USD: 20 })
  assert.deepEqual(resumen.debes, { HNL: 125, USD: 5 })
  assert.deepEqual(resumen.neto, { HNL: 375, USD: 15 })
  assert.deepEqual(resumen.gastoMes, { HNL: 1_500, USD: 100 })
  assert.deepEqual(resumen.maxMes, { HNL: 1_200, USD: 90 })
})

test('detecta un balance mixto sin ocultarlo bajo un único signo', () => {
  assert.equal(signoConjunto({ HNL: 250, USD: -10 }), 'mixto')
  assert.equal(signoConjunto({ HNL: 0.001, USD: 0 }), 'cero')
  assert.equal(signoConjunto({ HNL: -50, USD: -2 }), 'negativo')
})
