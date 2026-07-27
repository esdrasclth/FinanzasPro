// Repartos: quién pagó y con qué medio (el escenario de Arnold).
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
const eqf = (c, v) => ({ type: 'eq', column: c, value: v })

await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `arn-${Date.now()}@t.local`, password: 'prueba123', nombre: 'Arnold' }) })
await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'Arnold', moneda_default: 'HNL' }) })
const w = (await req('/api/carteras', { method: 'POST', body: JSON.stringify({ nombre: 'BAC', tipo: 'credito', credito_limite: 5000 }) })).j.cartera
const efe = (await req('/api/carteras', { method: 'POST', body: JSON.stringify({ nombre: 'Efectivo', tipo: 'efectivo', moneda: 'HNL' }) })).j.cartera

// /api/db no expone repartos; para movimientos se usa el buscador.
const trans = async () => (await req('/api/transacciones/buscar?limit=200')).j?.data || []

// ---------- Caso A: pagaste tú (comportamiento anterior) ----------
const a = await req('/api/repartos', {
  method: 'POST',
  body: JSON.stringify({
    descripcion: 'Pizza', monto_total: 50, moneda: 'HNL', metodo: 'igual', fecha: '2026-07-10',
    wallet_id: w.id,
    participantes: [{ nombre: 'Arnold', es_yo: true }, { nombre: 'Oscar' }, { nombre: 'Melin' }],
  }),
})
chk('A crear reparto pagado por mí', a.st === 200, 'st ' + a.st)
const txA = await trans()
chk('A registra el gasto en mi cartera', txA.some(t => (t.descripcion || '').includes('Reparto: Pizza') && t.tipo === 'gasto'))

// ---------- Caso B: pagó otra persona ----------
const antes = (await trans()).length
const b = await req('/api/repartos', {
  method: 'POST',
  body: JSON.stringify({
    descripcion: 'Combustible', monto_total: 150, moneda: 'HNL', metodo: 'igual', fecha: '2026-07-12',
    pagado_por: 'Oscar', metodo_pago: 'tarjeta', metodo_detalle: 'BAC ••••1234',
    participantes: [{ nombre: 'Arnold', es_yo: true }, { nombre: 'Oscar' }, { nombre: 'Melin' }],
  }),
})
chk('B crear reparto pagado por Oscar', b.st === 200, 'st ' + b.st)
chk('B NO toca mis carteras', (await trans()).length === antes, `${antes} -> ${(await trans()).length}`)

const rep = (await req(`/api/repartos/${b.j.id}`)).j?.reparto
chk('B guarda quién pagó', rep?.pagado_por === 'Oscar', 'pagado_por=' + rep?.pagado_por)
chk('B guarda el método', rep?.metodo_pago === 'tarjeta')
chk('B guarda el detalle de la tarjeta', rep?.metodo_detalle === 'BAC ••••1234')
chk('B no guarda cartera propia', !rep?.wallet_id)

// Exige el método cuando pagó otro.
const sinMetodo = await req('/api/repartos', {
  method: 'POST',
  body: JSON.stringify({
    descripcion: 'Hotel', monto_total: 160, moneda: 'HNL', metodo: 'igual', fecha: '2026-07-13',
    pagado_por: 'Melin',
    participantes: [{ nombre: 'Arnold', es_yo: true }, { nombre: 'Melin' }],
  }),
})
chk('B exige indicar cómo pagó', sinMetodo.st === 400, 'st ' + sinMetodo.st)

// ---------- Caso C: dirección del dinero al saldar ----------
const parts = (await req(`/api/repartos/${b.j.id}`)).j?.reparto?.participantes || []
const yo = parts.find(p => p.es_yo)
const otro = parts.find(p => !p.es_yo && p.nombre === 'Melin')

// Melin le paga a Oscar: no debe tocar mis carteras.
const antesC = (await trans()).length
const pm = await req(`/api/repartos/${b.j.id}/participantes/${otro.id}`, { method: 'PATCH', body: JSON.stringify({ pagado: true }) })
chk('C marcar a un tercero como pagado', pm.st === 200, 'st ' + pm.st)
chk('C NO entra dinero a mi cartera', (await trans()).length === antesC, `${antesC} -> ${(await trans()).length}`)

// Mi parte SÍ sale de mi cartera: le pago a Oscar.
const pmYo = await req(`/api/repartos/${b.j.id}/participantes/${yo.id}`, { method: 'PATCH', body: JSON.stringify({ pagado: true, wallet_id: efe.id }) })
chk('C pagar mi parte', pmYo.st === 200, 'st ' + pmYo.st)
const txC = await trans()
const mio = txC.find(t => (t.descripcion || '').includes('Mi parte del reparto'))
chk('C crea un GASTO por mi parte', !!mio && mio.tipo === 'gasto', 'tipo=' + mio?.tipo)
chk('C la descripción dice a quién le pagué', (mio?.descripcion || '').includes('Oscar'), mio?.descripcion)
chk('C el monto es mi parte (150/3=50)', Number(mio?.monto) === 50, 'monto=' + mio?.monto)

// ---------- Caso D: en el caso "pagué yo", mi parte NO mueve dinero ----------
const partsA = (await req(`/api/repartos/${a.j.id}`)).j?.reparto?.participantes || []
const yoA = partsA.find(p => p.es_yo)
const antesD = (await trans()).length
await req(`/api/repartos/${a.j.id}/participantes/${yoA.id}`, { method: 'PATCH', body: JSON.stringify({ pagado: true }) })
chk('D mi parte no mueve dinero si yo pagué', (await trans()).length === antesD)

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'))
process.exit(fallos === 0 ? 0 : 1)
