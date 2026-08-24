// Rutas de escritura de los últimos formularios: carteras (con apertura),
// presupuestos, recurrentes y movimientos simples.
const BASE = process.env.BASE_URL || 'http://localhost:3000'
let cookie = ''
let fallos = 0
const chk = (n, c, d = '') => { if (!c) fallos++; console.log(`${c ? '  OK  ' : ' FALLA'} | ${n}${d ? ' -> ' + d : ''}`) }

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  })
  for (const c of res.headers.getSetCookie?.() || []) {
    if (c.startsWith('finanzas-pro-session=')) cookie = c.split(';')[0]
  }
  const txt = await res.text()
  let j = null
  try { j = JSON.parse(txt) } catch {}
  return { st: res.status, j }
}

// Registro y perfil por las rutas nuevas, como hacen ahora las pantallas.
await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `z-${Date.now()}@t.local`, password: 'prueba123', nombre: 'Z' }) })
const pf = await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'Z', moneda_default: 'HNL' }) })
chk('registro + perfil sin el shim', pf.st === 200)

// ---------- Cartera con saldo de apertura ----------
const w = await req('/api/carteras', { method: 'POST', body: JSON.stringify({ nombre: 'Banco', tipo: 'banco', moneda: 'HNL', color: '#000', saldo_inicial: 1500 }) })
chk('crear cartera', w.st === 200 && !!w.j.cartera?.id)
const lista = await req('/api/carteras')
const banco = (lista.j.carteras || []).find(c => c.id === w.j.cartera.id)
chk('la apertura quedó en el saldo', banco?.saldos?.HNL === 1500, 'saldo=' + banco?.saldos?.HNL)
chk('la apertura NO cuenta como movimiento', banco?.movimientos === 0, 'n=' + banco?.movimientos)

// Tarjeta con doble apertura.
const tc = await req('/api/carteras', { method: 'POST', body: JSON.stringify({ nombre: 'Tarjeta', tipo: 'credito', credito_limite: 5000, saldo_inicial: -300, saldo_inicial_usd: -20 }) })
chk('crear tarjeta con doble apertura', tc.st === 200)
const t2 = (await req('/api/carteras')).j.carteras.find(c => c.id === tc.j.cartera.id)
chk('apertura HNL de la tarjeta', t2?.saldos?.HNL === -300, 'HNL=' + t2?.saldos?.HNL)
chk('apertura USD de la tarjeta', t2?.saldos?.USD === -20, 'USD=' + t2?.saldos?.USD)

// Un ajuste en USD de una tarjeta solo debe cambiar su saldo en USD.
const ajusteUsd = await req('/api/transacciones', { method: 'POST', body: JSON.stringify({ wallet_id: tc.j.cartera.id, monto: 7, moneda: 'USD', tipo: 'gasto', categoria_sistema: 'Ajuste de saldo', descripcion: 'Ajuste USD' }) })
const tarjetaAjustada = (await req('/api/carteras')).j.carteras.find(c => c.id === tc.j.cartera.id)
chk('acepta ajuste USD en tarjeta', ajusteUsd.st === 200 && ajusteUsd.j.transaccion?.moneda === 'USD')
chk('el ajuste USD no cambia HNL', tarjetaAjustada?.saldos?.HNL === -300, 'HNL=' + tarjetaAjustada?.saldos?.HNL)
chk('el ajuste USD cambia solo USD', tarjetaAjustada?.saldos?.USD === -27, 'USD=' + tarjetaAjustada?.saldos?.USD)

const wEdit = await req('/api/carteras', { method: 'PUT', body: JSON.stringify({ id: w.j.cartera.id, nombre: 'Banco Atlántida', tipo: 'banco', moneda: 'HNL' }) })
chk('editar cartera', wEdit.st === 200)
chk('editar no reescribe la apertura', (await req('/api/carteras')).j.carteras.find(c => c.id === w.j.cartera.id)?.saldos?.HNL === 1500)

// ---------- Movimiento simple ----------
const cat = await req('/api/categorias', { method: 'POST', body: JSON.stringify({ nombre: 'Comida', tipo: 'gasto', icono: 'C' }) })
const mov = await req('/api/transacciones', { method: 'POST', body: JSON.stringify({ wallet_id: w.j.cartera.id, category_id: cat.j.categoria.id, monto: 250, tipo: 'gasto', descripcion: 'Almuerzo' }) })
chk('crear movimiento', mov.st === 200 && mov.j.transaccion?.monto === 250)
chk('sella la tasa', mov.j.transaccion?.tasa_cambio !== undefined)
const movEdit = await req('/api/transacciones', { method: 'PUT', body: JSON.stringify({ id: mov.j.transaccion.id, wallet_id: w.j.cartera.id, category_id: cat.j.categoria.id, monto: 300, descripcion: 'Almuerzo caro', fecha: mov.j.transaccion.fecha }) })
chk('editar movimiento', movEdit.st === 200 && movEdit.j.transaccion?.monto === 300)

// Una transferencia no se edita por esta ruta.
const w3 = await req('/api/carteras', { method: 'POST', body: JSON.stringify({ nombre: 'Ahorro', tipo: 'ahorro', moneda: 'HNL' }) })
const tr = await req('/api/transferencias', { method: 'POST', body: JSON.stringify({ wallet_id: w.j.cartera.id, wallet_destino_id: w3.j.cartera.id, monto: 100 }) })
const trEdit = await req('/api/transacciones', { method: 'PUT', body: JSON.stringify({ id: tr.j.salida_id, wallet_id: w.j.cartera.id, monto: 999 }) })
chk('NO deja editar una transferencia', trEdit.st === 409, 'st ' + trEdit.st)

// Ajuste de saldo: el endpoint resuelve la categoría de sistema.
const aj = await req('/api/transacciones', { method: 'POST', body: JSON.stringify({ wallet_id: w.j.cartera.id, monto: 50, tipo: 'ingreso', categoria_sistema: 'Ajuste de saldo', descripcion: 'Ajuste' }) })
chk('ajuste de saldo con categoría automática', aj.st === 200 && !!aj.j.transaccion?.category_id)
chk('la categoría se llama como toca', aj.j.transaccion?.categories?.nombre === 'Ajuste de saldo')

// ---------- Presupuesto ----------
const hoy = new Date()
const bp = await req('/api/presupuesto', { method: 'POST', body: JSON.stringify({ category_id: cat.j.categoria.id, monto_limite: 800, mes: hoy.getMonth() + 1, anio: hoy.getFullYear() }) })
chk('crear presupuesto', bp.st === 200)
const bpDup = await req('/api/presupuesto', { method: 'POST', body: JSON.stringify({ category_id: cat.j.categoria.id, monto_limite: 900, mes: hoy.getMonth() + 1, anio: hoy.getFullYear() }) })
chk('rechaza duplicado con mensaje claro', bpDup.st === 409, 'st ' + bpDup.st)
const bpEdit = await req('/api/presupuesto', { method: 'PUT', body: JSON.stringify({ id: bp.j.presupuesto.id, monto_limite: 1200 }) })
chk('editar presupuesto', bpEdit.st === 200)

// ---------- Recurrente ----------
const sub = await req('/api/suscripciones', { method: 'POST', body: JSON.stringify({ nombre: 'Netflix', tipo: 'gasto', monto: 299, frecuencia: 'mensual', fecha_inicio: '2026-07-01' }) })
chk('crear recurrente', sub.st === 200 && sub.j.suscripcion?.nombre === 'Netflix')
const subMal = await req('/api/suscripciones', { method: 'POST', body: JSON.stringify({ nombre: 'X', monto: 10, fecha_inicio: 'no-es-fecha' }) })
chk('rechaza fecha inválida', subMal.st === 400)
const subEdit = await req('/api/suscripciones', { method: 'PUT', body: JSON.stringify({ id: sub.j.suscripcion.id, nombre: 'Netflix Premium', tipo: 'gasto', monto: 399, frecuencia: 'mensual', fecha_inicio: '2026-07-01' }) })
chk('editar recurrente', subEdit.st === 200 && subEdit.j.suscripcion?.monto === 399)

// ---------- Las pantallas siguen vivas ----------
for (const r of ['/dashboard', '/transacciones', '/carteras', '/presupuesto', '/deudas', '/suscripciones', '/categorias', '/perfil', '/reportes', '/exportar', '/grupos']) {
  const x = await req(r)
  chk(`${r} renderiza`, x.st === 200, 'st ' + x.st)
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'))
process.exit(fallos === 0 ? 0 : 1)
