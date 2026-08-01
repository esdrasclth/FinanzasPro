// Migración de Movimientos y Presupuesto a Server Components.
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
  return { st: res.status, txt, j }
}
// La fecha local, no la de UTC: en la noche del último día del mes toISOString()
// ya devuelve el mes siguiente y las aserciones por mes fallan sin motivo.
const fechaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const db = (t, op, e = {}) => req('/api/db', { method: 'POST', body: JSON.stringify({ table: t, op, ...e }) })

const email = `mig-${Date.now()}@t.local`
await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'prueba123', nombre: 'Mig' }) })
await db('profiles', 'upsert', { payload: { nombre: 'Mig', moneda_default: 'HNL', onboarding_completado: true } })

const w = (await db('wallets', 'insert', { single: true, payload: { nombre: 'B', tipo: 'banco', moneda: 'HNL', saldo_inicial: 0, activo: true } })).j.data
const cat = (await db('categories', 'insert', { single: true, payload: { nombre: 'Comida', tipo: 'gasto', icono: 'C' } })).j.data

const hoy = new Date()
const m = hoy.getMonth() + 1, a = hoy.getFullYear()
const pm = m === 1 ? 12 : m - 1, pa = m === 1 ? a - 1 : a
const hoyISO = fechaLocal(hoy)

// Presupuesto SOLO en el mes anterior: el traspaso debe copiarlo al actual.
await db('budgets', 'insert', { payload: { category_id: cat.id, monto_limite: 400, mes: pm, 'año': pa } })
await db('transactions', 'insert', { payload: { wallet_id: w.id, category_id: cat.id, monto: 150, tipo: 'gasto', moneda: 'HNL', fecha: hoyISO, descripcion: 'Almuerzo' } })

const r1 = await req('/presupuesto')
chk('Presupuesto renderiza', r1.st === 200, 'st ' + r1.st)

const p1 = await req(`/api/presupuesto?mes=${m}&anio=${a}&actual=1`)
chk('el traspaso copió el presupuesto del mes anterior', (p1.j.presupuestos || []).length === 1, 'n=' + (p1.j.presupuestos || []).length)
chk('calcula lo gastado del mes', (p1.j.presupuestos || [])[0]?.gastado === 150, 'gastado=' + (p1.j.presupuestos || [])[0]?.gastado)
chk('expone el año como la pantalla lo espera', (p1.j.presupuestos || [])[0]?.['año'] === a)
chk('trae categorías y metas', Array.isArray(p1.j.categorias) && Array.isArray(p1.j.metas))

const p2 = await req(`/api/presupuesto?mes=${m}&anio=${a}&actual=1`)
chk('no vuelve a copiar en la segunda visita', (p2.j.presupuestos || []).length === 1, 'n=' + (p2.j.presupuestos || []).length)

const mes = `${a}-${String(m).padStart(2, '0')}`
const t1 = await req(`/api/transacciones/mes?mes=${mes}`)
chk('movimientos del mes', (t1.j.transacciones || []).length === 1)
chk('trae categorías, carteras y tasa', Array.isArray(t1.j.categorias) && Array.isArray(t1.j.carteras) && 'tasa' in t1.j)
chk('la fila trae categoría y cartera', !!(t1.j.transacciones || [])[0]?.categories && !!(t1.j.transacciones || [])[0]?.wallets)

const tx = (t1.j.transacciones || [])[0]
const d1 = await req(`/api/transacciones/${tx.id}/duplicar`, { method: 'POST', body: '{}' })
chk('duplicar funciona', d1.st === 200, 'st ' + d1.st)
chk('ahora hay 2 movimientos', ((await req(`/api/transacciones/mes?mes=${mes}`)).j.transacciones || []).length === 2)

// Una transferencia no debe poder duplicarse.
const w2 = (await db('wallets', 'insert', { single: true, payload: { nombre: 'A', tipo: 'ahorro', moneda: 'HNL', saldo_inicial: 0, activo: true } })).j.data
const tr = await req('/api/transferencias', { method: 'POST', body: JSON.stringify({ wallet_id: w.id, wallet_destino_id: w2.id, monto: 50, fecha: hoyISO }) })
const d2 = await req(`/api/transacciones/${tr.j.salida_id}/duplicar`, { method: 'POST', body: '{}' })
chk('no deja duplicar una transferencia', d2.st === 409, 'st ' + d2.st)

const r2 = await req('/transacciones')
chk('Movimientos renderiza con datos', r2.st === 200 && /Resumen de movimientos/.test(r2.txt))
chk('el HTML ya trae el movimiento', /Almuerzo/.test(r2.txt))

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'))
process.exit(fallos === 0 ? 0 : 1)
