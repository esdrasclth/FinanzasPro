// Reporte de liquidación con el ejemplo exacto del cliente.
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

await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `liq-${Date.now()}@t.local`, password: 'prueba123', nombre: 'Arnold' }) })
await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'Arnold', moneda_default: 'HNL' }) })
const w = (await req('/api/carteras', { method: 'POST', body: JSON.stringify({ nombre: 'BAC', tipo: 'credito', credito_limite: 9000 }) })).j.cartera

const trio = () => [{ nombre: 'Arnold', es_yo: true }, { nombre: 'Oscar' }, { nombre: 'Melin' }]

// El ejemplo textual del cliente: pizza 50 (Arnold), combustible 150 (Oscar), hotel 160 (Melin)
await req('/api/repartos', { method: 'POST', body: JSON.stringify({
  descripcion: 'Pizza', lugar: 'Pizza Hut', monto_total: 50, moneda: 'HNL', metodo: 'igual', fecha: '2026-07-05',
  wallet_id: w.id, participantes: trio() }) })
await req('/api/repartos', { method: 'POST', body: JSON.stringify({
  descripcion: 'Combustible', lugar: 'Uno La Ceiba', monto_total: 150, moneda: 'HNL', metodo: 'igual', fecha: '2026-07-09',
  pagado_por: 'Oscar', metodo_pago: 'tarjeta', metodo_detalle: 'BAC ••••1234', participantes: trio() }) })
await req('/api/repartos', { method: 'POST', body: JSON.stringify({
  descripcion: 'Hotel', monto_total: 160, moneda: 'HNL', metodo: 'igual', fecha: '2026-07-14',
  pagado_por: 'Melin', metodo_pago: 'efectivo', participantes: trio() }) })

const r = (await req('/api/repartos/reporte?desde=2026-07-01&hasta=2026-07-31')).j
chk('el reporte responde', !!r && Array.isArray(r.gastos))
chk('trae los 3 gastos', r.gastos.length === 3, 'n=' + r.gastos.length)
chk('el total es 360', r.total === 360, 'total=' + r.total)

const pizza = r.gastos.find(g => g.descripcion === 'Pizza')
chk('cada gasto trae fecha y concepto', pizza?.fecha === '2026-07-05')
chk('el lugar va separado del concepto', pizza?.lugar === 'Pizza Hut', 'lugar=' + pizza?.lugar)
chk('un gasto sin lugar queda vacío, no roto', r.gastos.find(g => g.descripcion === 'Hotel')?.lugar === '')
chk('registra quién pagó', pizza?.pagadoPor === 'Arnold', 'pagó=' + pizza?.pagadoPor)
const comb = r.gastos.find(g => g.descripcion === 'Combustible')
chk('el método sale con la tarjeta', (comb?.metodo || '').includes('Tarjeta') && (comb.metodo || '').includes('1234'), comb?.metodo)
const hotel = r.gastos.find(g => g.descripcion === 'Hotel')
chk('el método efectivo también', hotel?.metodo === 'Efectivo', hotel?.metodo)
chk('indica cómo se repartió', pizza?.reparto === 'Partes iguales', pizza?.reparto)

// A cada uno le toca 120 (360/3)
const s = Object.fromEntries((r.saldos || []).map(x => [x.nombre, x]))
chk('a cada quien le tocan 120', [s.Arnold, s.Oscar, s.Melin].every(x => Math.abs(x.leToca - 120) < 0.05),
  JSON.stringify((r.saldos || []).map(x => `${x.nombre}:${x.leToca}`)))
chk('Arnold puso 50 y debe 70', s.Arnold?.puso === 50 && Math.abs(s.Arnold.neto + 70) < 0.05, 'neto=' + s.Arnold?.neto)
chk('a Oscar le deben 30', Math.abs(s.Oscar?.neto - 30) < 0.05, 'neto=' + s.Oscar?.neto)
chk('a Melin le deben 40', Math.abs(s.Melin?.neto - 40) < 0.05, 'neto=' + s.Melin?.neto)

// Traspasos: Arnold debe 70 y se reparten entre Melin (40) y Oscar (30)
const t = r.traspasos || []
chk('calcula los pagos para quedar a mano', t.length === 2, 'n=' + t.length)
chk('todos los traspasos salen de Arnold', t.every(x => x.de === 'Arnold'), JSON.stringify(t))
chk('los traspasos suman 70', Math.abs(t.reduce((a, x) => a + x.monto, 0) - 70) < 0.05)

// ---------- Montos distintos ----------
const man = await req('/api/repartos', { method: 'POST', body: JSON.stringify({
  descripcion: 'Cena desigual', monto_total: 100, moneda: 'HNL', metodo: 'manual', fecha: '2026-07-20',
  pagado_por: 'Oscar', metodo_pago: 'efectivo',
  participantes: [{ nombre: 'Arnold', es_yo: true, monto_asignado: 70 }, { nombre: 'Oscar', monto_asignado: 30 }] }) })
chk('acepta montos distintos', man.st === 200, 'st ' + man.st)

const r2 = (await req('/api/repartos/reporte?desde=2026-07-01&hasta=2026-07-31')).j
const cena = r2.gastos.find(g => g.descripcion === 'Cena desigual')
chk('marca el reparto como montos distintos', cena?.reparto === 'Montos distintos', cena?.reparto)
chk('respeta los montos por persona', cena?.participantes.find(p => p.nombre === 'Arnold')?.monto === 70,
  JSON.stringify(cena?.participantes))
chk('el total incluye el nuevo gasto', r2.total === 460, 'total=' + r2.total)

// El rango debe excluir lo de fuera
const r3 = (await req('/api/repartos/reporte?desde=2026-07-01&hasta=2026-07-10')).j
chk('el rango de fechas filtra', r3.gastos.length === 2, 'n=' + r3.gastos.length)
chk('y el total se recalcula', r3.total === 200, 'total=' + r3.total)

const malRango = await req('/api/repartos/reporte?desde=2026-07-31&hasta=2026-07-01')
chk('rechaza un rango invertido', malRango.st === 400)

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'))
process.exit(fallos === 0 ? 0 : 1)
