// Endpoints de escritura de categorías, metas y deudas.
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
const db = (t, op, e = {}) => req('/api/db', { method: 'POST', body: JSON.stringify({ table: t, op, ...e }) })

await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `f-${Date.now()}@t.local`, password: 'prueba123', nombre: 'F' }) })
await db('profiles', 'upsert', { payload: { nombre: 'F', moneda_default: 'HNL', onboarding_completado: true } })

// ---------- Categorías ----------
const c1 = await req('/api/categorias', { method: 'POST', body: JSON.stringify({ nombre: 'Comida', tipo: 'gasto', icono: 'C', color: '#f00' }) })
chk('crear categoría', c1.st === 200 && c1.j.categoria?.nombre === 'Comida')
const sub = await req('/api/categorias', { method: 'POST', body: JSON.stringify({ nombre: 'Rápida', tipo: 'gasto', parent_id: c1.j.categoria.id }) })
chk('crear subcategoría', sub.st === 200 && sub.j.categoria?.parent_id === c1.j.categoria.id)
const malPadre = await req('/api/categorias', { method: 'POST', body: JSON.stringify({ nombre: 'X', tipo: 'gasto', parent_id: '00000000-0000-0000-0000-000000000000' }) })
chk('rechaza padre ajeno', malPadre.st === 400)
const c2 = await req('/api/categorias', { method: 'PUT', body: JSON.stringify({ id: c1.j.categoria.id, nombre: 'Comida y bebida', tipo: 'gasto' }) })
chk('editar categoría', c2.st === 200 && c2.j.categoria?.nombre === 'Comida y bebida')
const cSinNombre = await req('/api/categorias', { method: 'POST', body: JSON.stringify({ nombre: '  ', tipo: 'gasto' }) })
chk('rechaza nombre vacío', cSinNombre.st === 400)
const cBorrar = await req(`/api/categorias?id=${sub.j.categoria.id}`, { method: 'DELETE' })
chk('eliminar subcategoría sin uso', cBorrar.st === 200)

// ---------- Metas ----------
const m1 = await req('/api/metas', { method: 'POST', body: JSON.stringify({ nombre: 'Viaje', monto_objetivo: 1000, icono: 'V', color: '#0f0' }) })
chk('crear meta', m1.st === 200 && m1.j.meta?.monto_objetivo === 1000)
const mMal = await req('/api/metas', { method: 'POST', body: JSON.stringify({ nombre: 'X', monto_objetivo: 0 }) })
chk('rechaza objetivo cero', mMal.st === 400)
const m2 = await req('/api/metas', { method: 'PUT', body: JSON.stringify({ id: m1.j.meta.id, nombre: 'Viaje 2027', monto_objetivo: 2000 }) })
chk('editar meta', m2.st === 200 && m2.j.meta?.nombre === 'Viaje 2027')

// El objetivo no puede quedar por debajo de lo ya ahorrado.
const w = (await db('wallets', 'insert', { single: true, payload: { nombre: 'B', tipo: 'banco', moneda: 'HNL', saldo_inicial: 0, activo: true } })).j.data
const w2 = (await db('wallets', 'insert', { single: true, payload: { nombre: 'A', tipo: 'ahorro', moneda: 'HNL', saldo_inicial: 0, activo: true } })).j.data
await req(`/api/metas/${m1.j.meta.id}/aportes`, { method: 'POST', body: JSON.stringify({ monto: 500, wallet_id: w.id, wallet_destino_id: w2.id }) })
const mBajo = await req('/api/metas', { method: 'PUT', body: JSON.stringify({ id: m1.j.meta.id, nombre: 'Viaje', monto_objetivo: 100 }) })
chk('rechaza objetivo menor a lo ahorrado', mBajo.st === 400, 'st ' + mBajo.st)

// ---------- Deudas ----------
const d1 = await req('/api/deudas', { method: 'POST', body: JSON.stringify({ nombre: 'Préstamo', tipo: 'debo', monto_total: 900 }) })
chk('crear deuda', d1.st === 200 && d1.j.deuda?.monto_total === 900)
chk('crea su subcategoría automáticamente', !!d1.j.deuda?.category_id, 'cat=' + d1.j.deuda?.category_id)

const cats = (await req('/api/categorias')).j.categorias || []
const raiz = cats.find(c => c.protegida && c.nombre === 'Deudas')
chk('crea la raíz "Deudas"', !!raiz)
chk('la subcategoría cuelga de la raíz', cats.find(c => c.id === d1.j.deuda.category_id)?.parent_id === raiz?.id)

const d2 = await req('/api/deudas', { method: 'PUT', body: JSON.stringify({ id: d1.j.deuda.id, nombre: 'Préstamo banco', tipo: 'debo', monto_total: 900 }) })
chk('editar deuda', d2.st === 200)
const cats2 = (await req('/api/categorias')).j.categorias || []
chk('renombra su subcategoría', cats2.find(c => c.id === d1.j.deuda.category_id)?.nombre === 'Préstamo banco')

const d3 = await req('/api/deudas', { method: 'PUT', body: JSON.stringify({ id: d1.j.deuda.id, nombre: 'Préstamo banco', tipo: 'me_deben', monto_total: 900 }) })
chk('cambiar a "me deben" quita la subcategoría', d3.st === 200 && d3.j.deuda?.category_id === null, 'cat=' + d3.j.deuda?.category_id)

// El total no puede quedar por debajo de lo abonado.
const d4 = await req('/api/deudas', { method: 'POST', body: JSON.stringify({ nombre: 'Otra', tipo: 'debo', monto_total: 500 }) })
await req(`/api/deudas/${d4.j.deuda.id}/abonos`, { method: 'POST', body: JSON.stringify({ monto: 300, wallet_id: w.id }) })
const dBajo = await req('/api/deudas', { method: 'PUT', body: JSON.stringify({ id: d4.j.deuda.id, nombre: 'Otra', tipo: 'debo', monto_total: 100 }) })
chk('rechaza total menor a lo abonado', dBajo.st === 400, 'st ' + dBajo.st)

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'))
process.exit(fallos === 0 ? 0 : 1)
