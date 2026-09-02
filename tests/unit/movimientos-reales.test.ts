import assert from 'node:assert/strict'
import test from 'node:test'
import {
  esMovimientoReal, esAjusteSaldo, totales, porCategoria,
  CAT_SALDO_INICIAL, CAT_AJUSTE_SALDO,
} from '../../app/lib/finanzas'

// Qué cuenta como ganancia o pérdida. Los tres casos que NO cuentan mueven el
// saldo igual que cualquier movimiento, así que la única forma de notar que se
// colaron en los totales es que las cifras del mes no cuadren con la realidad.

const gasto = (extra = {}) => ({ monto: 100, tipo: 'gasto', moneda: 'HNL', ...extra })
const ingreso = (extra = {}) => ({ monto: 100, tipo: 'ingreso', moneda: 'HNL', ...extra })
const cat = (nombre: string) => ({ categories: { nombre, tipo: 'gasto' } })

test('un ajuste de saldo no es un movimiento real', () => {
  assert.equal(esAjusteSaldo(gasto(cat(CAT_AJUSTE_SALDO))), true)
  assert.equal(esMovimientoReal(gasto(cat(CAT_AJUSTE_SALDO))), false)
  assert.equal(esMovimientoReal(ingreso(cat(CAT_AJUSTE_SALDO))), false)
})

test('siguen fuera las aperturas y los traspasos', () => {
  assert.equal(esMovimientoReal(ingreso(cat(CAT_SALDO_INICIAL))), false)
  assert.equal(esMovimientoReal(gasto({ wallet_destino_id: 'otra-cartera' })), false)
})

test('un gasto normal sí cuenta', () => {
  assert.equal(esMovimientoReal(gasto(cat('Comida'))), true)
  assert.equal(esMovimientoReal(ingreso({ categories: { nombre: 'Sueldo', tipo: 'ingreso' } })), true)
})

test('los ajustes no inflan ingresos ni gastos del mes', () => {
  const movs = [
    gasto({ monto: 250, ...cat('Comida') }),
    ingreso({ monto: 1_000, categories: { nombre: 'Sueldo', tipo: 'ingreso' } }),
    // Pasar deuda de lempiras a dolares a mano: un ingreso enorme que no lo es.
    ingreso({ monto: 5_000, ...cat(CAT_AJUSTE_SALDO) }),
    gasto({ monto: 192.31, moneda: 'USD', tasa_cambio: 26, ...cat(CAT_AJUSTE_SALDO) }),
    ingreso({ monto: 300, ...cat(CAT_SALDO_INICIAL) }),
    gasto({ monto: 400, wallet_destino_id: 'otra' }),
  ]

  const t = totales(movs, 'HNL', 26)

  assert.equal(t.ingresos, 1_000)
  assert.equal(t.gastos, 250)
  assert.equal(t.neto, 750)
})

test('un ajuste no consume presupuesto de su categoría', () => {
  const movs = [
    gasto({ monto: 250, category_id: 'cat-comida', ...cat('Comida') }),
    gasto({ monto: 900, category_id: 'cat-comida', ...cat(CAT_AJUSTE_SALDO) }),
  ]

  const porCat = porCategoria(movs, 'HNL', 26)
  assert.equal(porCat.gasto['cat-comida'], 250)
})

test('sin el nombre de la categoría el ajuste no se puede detectar', () => {
  // Documenta la dependencia: si una consulta olvida traer categories(nombre),
  // el ajuste vuelve a contar como gasto. Es lo que hay que vigilar al añadir
  // pantallas nuevas.
  assert.equal(esMovimientoReal(gasto({ category_id: 'x' })), true)
})
