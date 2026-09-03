import assert from 'node:assert/strict'
import test from 'node:test'
import { conHijasAcumuladas, partidasSinSolapar, porCategoria } from '../../app/lib/finanzas'

// El gasto se etiqueta siempre en la subcategoría, así que un presupuesto en la
// categoría padre solo funciona si suma lo de sus hijas. Sin esto la partida se
// queda en cero para siempre y la pantalla contradice al dashboard.

const arbol = [
  { id: 'comida', parent_id: null },
  { id: 'super', parent_id: 'comida' },
  { id: 'restau', parent_id: 'comida' },
  { id: 'transporte', parent_id: null },
]

test('el padre suma lo gastado en sus hijas', () => {
  const r = conHijasAcumuladas({ super: 1800, restau: 1200 }, arbol)

  assert.equal(r.comida, 3000)
  assert.equal(r.super, 1800, 'la hija conserva su cifra propia')
  assert.equal(r.restau, 1200)
})

test('el padre suma también lo suyo directo', () => {
  const r = conHijasAcumuladas({ comida: 500, super: 1800 }, arbol)
  assert.equal(r.comida, 2300)
})

test('una categoría sin hijas se queda igual', () => {
  const r = conHijasAcumuladas({ transporte: 900 }, arbol)
  assert.equal(r.transporte, 900)
})

test('sin gasto en las hijas el padre no aparece de la nada', () => {
  const r = conHijasAcumuladas({ transporte: 900 }, arbol)
  assert.equal(r.comida, undefined)
})

test('no se pierde precisión al acumular centavos', () => {
  const r = conHijasAcumuladas({ super: 0.1, restau: 0.2 }, arbol)
  assert.equal(r.comida, 0.3)
})

test('el caso completo: presupuesto en el padre, gasto en las hijas', () => {
  const movs = [
    { monto: 1800, tipo: 'gasto', moneda: 'HNL', category_id: 'super', categories: { nombre: 'Supermercado', tipo: 'gasto' } },
    { monto: 1200, tipo: 'gasto', moneda: 'HNL', category_id: 'restau', categories: { nombre: 'Restaurantes', tipo: 'gasto' } },
  ]

  const directo = porCategoria(movs, 'HNL', 26).gasto
  assert.equal(directo.comida, undefined, 'sin acumular, el padre no ve nada')

  const acumulado = conHijasAcumuladas(directo, arbol)
  assert.equal(acumulado.comida, 3000, 'acumulado, el padre ve los 3000 del grupo')
})

test('los reembolsos restan también en el padre', () => {
  // Un ingreso con categoría de gasto es una devolución: baja lo gastado.
  const movs = [
    { monto: 1800, tipo: 'gasto', moneda: 'HNL', category_id: 'super', categories: { nombre: 'Supermercado', tipo: 'gasto' } },
    { monto: 300, tipo: 'ingreso', moneda: 'HNL', category_id: 'super', categories: { nombre: 'Supermercado', tipo: 'gasto' } },
  ]

  const acumulado = conHijasAcumuladas(porCategoria(movs, 'HNL', 26).gasto, arbol)
  assert.equal(acumulado.super, 1500)
  assert.equal(acumulado.comida, 1500)
})

// Los totales de la cabecera suman partidas entre sí. Como el padre ya incluye
// a sus hijas, sumar también la partida de una hija contaba su gasto dos veces
// y "Gastado" salía por encima del gasto real del mes.

const partida = (category_id: string, parent_id: string | null = null) =>
  ({ category_id, categories: { parent_id } })

test('una hija con partida propia no se suma aparte de su padre', () => {
  const r = partidasSinSolapar([
    partida('comida'),
    partida('super', 'comida'),
    partida('transporte'),
  ])

  assert.deepEqual(r.map(p => p.category_id), ['comida', 'transporte'])
})

test('una hija cuyo padre NO tiene partida sí cuenta', () => {
  const r = partidasSinSolapar([
    partida('super', 'comida'),
    partida('transporte'),
  ])

  assert.deepEqual(r.map(p => p.category_id), ['super', 'transporte'])
})

test('sin jerarquía se devuelven todas', () => {
  const r = partidasSinSolapar([partida('a'), partida('b')])
  assert.equal(r.length, 2)
})

test('el total no supera el gasto real del mes', () => {
  // Comida 3000 (incluye Supermercado 1800) + Supermercado 1800 = 4800,
  // cuando en realidad se gastaron 3000.
  const partidas = [
    { category_id: 'comida', categories: { parent_id: null }, gastado: 3000 },
    { category_id: 'super', categories: { parent_id: 'comida' }, gastado: 1800 },
  ]

  const ingenuo = partidas.reduce((s, p) => s + p.gastado, 0)
  const correcto = partidasSinSolapar(partidas).reduce((s, p) => s + p.gastado, 0)

  assert.equal(ingenuo, 4800)
  assert.equal(correcto, 3000)
})
