// Migración de Deudas, Compartidos, Perfil, Repartos, Carteras y Dashboard.
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
const db = (t, op, e = {}) => req('/api/db', { method: 'POST', body: JSON.stringify({ table: t, op, ...e }) })

await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `m2-${Date.now()}@t.local`, password: 'prueba123', nombre: 'M2' }) })
await db('profiles', 'upsert', { payload: { nombre: 'M2', moneda_default: 'HNL', onboarding_completado: true } })

const w = (await db('wallets', 'insert', { single: true, payload: { nombre: 'Banco', tipo: 'banco', moneda: 'HNL', saldo_inicial: 0, activo: true } })).j.data
const w2 = (await db('wallets', 'insert', { single: true, payload: { nombre: 'Vacia', tipo: 'efectivo', moneda: 'HNL', saldo_inicial: 0, activo: true } })).j.data
const hoyISO = new Date().toISOString().slice(0, 10)

// ---------- Perfil ----------
await db('transactions', 'insert', { payload: { wallet_id: w.id, monto: 100, tipo: 'gasto', moneda: 'HNL', fecha: hoyISO, descripcion: 'x' } })
const pf = await req('/api/perfil')
chk('perfil responde con conteos', pf.st === 200 && pf.j.stats?.carteras === 2, JSON.stringify(pf.j.stats))
const pu = await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'M2 editado', moneda_default: 'USD' }) })
chk('guardar perfil funciona', pu.st === 200 && pu.j.perfil?.moneda_default === 'USD')
const pmal = await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'x', moneda_default: 'XXX' }) })
chk('rechaza moneda no soportada', pmal.st === 400)
await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'M2', moneda_default: 'HNL' }) })

// ---------- Deudas ----------
const d = (await db('debts', 'insert', { single: true, payload: { nombre: 'Prestamo', tipo: 'debo', monto_total: 500, monto_pagado: 0, completada: false } })).j.data
const dl = await req('/api/deudas')
chk('lista de deudas', dl.st === 200 && (dl.j.deudas || []).length === 1)
const dp = await req('/api/deudas', { method: 'PATCH', body: JSON.stringify({ id: d.id, completada: true }) })
chk('marcar saldada', dp.st === 200)
chk('quedó saldada', (await req('/api/deudas')).j.deudas[0].completada === true)
const dd = await req(`/api/deudas/${d.id}`)
chk('detalle trae deuda, pagos y carteras', dd.st === 200 && !!dd.j.deuda && Array.isArray(dd.j.pagos) && Array.isArray(dd.j.carteras))
const ddel = await req(`/api/deudas?id=${d.id}`, { method: 'DELETE' })
chk('eliminar deuda', ddel.st === 200 && (await req('/api/deudas')).j.deudas.length === 0)

// ---------- Carteras: archivar, restaurar, reordenar, borrar ----------
const ca = await req('/api/carteras', { method: 'PATCH', body: JSON.stringify({ id: w2.id, activo: false }) })
chk('archivar cartera', ca.st === 200)
const c1 = await req('/api/carteras')
chk('la archivada sale de activas', !(c1.j.carteras || []).some(c => c.id === w2.id) && (c1.j.archivadas || []).some(c => c.id === w2.id))
await req('/api/carteras', { method: 'PATCH', body: JSON.stringify({ id: w2.id, activo: true }) })
chk('restaurar cartera', (await req('/api/carteras')).j.carteras.some(c => c.id === w2.id))
const cor = await req('/api/carteras', { method: 'PATCH', body: JSON.stringify({ orden: [w2.id, w.id] }) })
chk('reordenar carteras', cor.st === 200)
chk('el orden se aplicó', (await req('/api/carteras')).j.carteras[0].id === w2.id)
const cdel = await req(`/api/carteras?id=${w.id}`, { method: 'DELETE' })
chk('NO deja borrar una cartera con movimientos', cdel.st === 409, 'st ' + cdel.st)
const cdel2 = await req(`/api/carteras?id=${w2.id}`, { method: 'DELETE' })
chk('sí deja borrar una cartera vacía', cdel2.st === 200, 'st ' + cdel2.st)

// ---------- Dashboard ----------
const dash = await req('/api/dashboard?offset=0')
chk('dashboard responde', dash.st === 200 && 'resumen' in dash.j && 'resumenPrev' in dash.j)
chk('el resumen suma el gasto', dash.j.resumen?.gastos === 100, 'gastos=' + dash.j.resumen?.gastos)
const dashPrev = await req('/api/dashboard?offset=-1')
chk('acepta meses anteriores', dashPrev.st === 200)

// ---------- Carteras de la lista ligera ----------
const cl = await req('/api/carteras/lista')
chk('lista ligera de carteras', cl.st === 200 && Array.isArray(cl.j.carteras))

// ---------- Todas las páginas siguen renderizando ----------
for (const ruta of ['/dashboard', '/transacciones', '/carteras', '/presupuesto', '/deudas', '/grupos', '/perfil', '/reportes', '/suscripciones', '/categorias', '/exportar']) {
  const r = await req(ruta)
  chk(`${ruta} renderiza`, r.st === 200 && !/Application error|Unhandled Runtime/i.test(r.txt), 'st ' + r.st)
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'))
process.exit(fallos === 0 ? 0 : 1)
