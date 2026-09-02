// Pasar deuda de una moneda a la otra dentro de la MISMA tarjeta de crédito.
// Corre contra el Postgres LOCAL (docker), nunca contra Neon.
//
// Lo que se vigila aquí es el sentido de la conversión. Las dos piernas mueven
// los mismos dos saldos se haga como se haga, así que invertirlo no rompe nada
// visible: simplemente deja la deuda en la moneda equivocada.

const BASE = process.env.BASE_URL || 'http://localhost:3000'
let cookie = ''

const log = []
let fallos = 0

function check(nombre, cond, detalle = '') {
  const ok = !!cond
  if (!ok) fallos++
  log.push(`${ok ? '  OK  ' : ' FALLA'} | ${nombre}${detalle ? ' -> ' + detalle : ''}`)
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  })
  const sc = res.headers.getSetCookie?.() || []
  for (const c of sc) if (c.startsWith('finanzas-pro-session=')) cookie = c.split(';')[0]
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, ok: res.ok, json }
}

const db = async (table, op, extra = {}) => {
  const r = await req('/api/db', { method: 'POST', body: JSON.stringify({ table, op, ...extra }) })
  return r.json
}

const sel = async (table, filters = []) => (await db(table, 'select', { filters }))?.data || []
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100

async function main() {
  // ---------- preparacion ----------
  const email = `e2e-conv-${Date.now()}@test.local`
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'prueba123', nombre: 'E2E conversion' }),
  })
  check('registro de usuario de prueba', reg.ok && cookie, `status ${reg.status}`)
  if (!cookie) {
    console.log(log.join('\n'))
    process.exit(1)
  }

  const TASA = 26
  const tc = await req('/api/tipo-cambio', { method: 'POST', body: JSON.stringify({ tasa: TASA }) })
  check('fijar tasa manual 26 HNL/USD', tc.ok && tc.json?.tasaVenta === TASA, `tasaVenta=${tc.json?.tasaVenta}`)

  const mkWallet = (nombre, tipo, moneda) =>
    db('wallets', 'insert', {
      single: true,
      payload: { nombre, tipo, moneda, saldo_inicial: 0, activo: true, color: '#2c6e49' },
    })

  const tarjeta = (await mkWallet('TC Bimoneda', 'credito', 'HNL'))?.data
  const banco = (await mkWallet('Banco HNL', 'banco', 'HNL'))?.data
  check('crear tarjeta y cuenta', tarjeta?.id && banco?.id)

  const transDe = async walletId =>
    await sel('transactions', [{ type: 'eq', column: 'wallet_id', value: walletId }])

  // Saldos de la tarjeta por moneda, con el mismo criterio que la app:
  // ingreso suma, cualquier otro tipo resta.
  const saldos = async walletId => {
    const acc = {}
    for (const t of await transDe(walletId)) {
      const m = t.moneda || 'HNL'
      acc[m] = round2((acc[m] || 0) + (t.tipo === 'ingreso' ? 1 : -1) * Number(t.monto))
    }
    return acc
  }

  // ---------- deuda inicial: L 5,000 en la tarjeta ----------
  const gastoInicial = await req('/api/transacciones', {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: tarjeta.id, monto: 5000, moneda: 'HNL', tipo: 'gasto',
      categoria_sistema: 'Ajuste de saldo', descripcion: 'Deuda inicial', fecha: '2026-09-01',
    }),
  })
  check('crear deuda inicial de L5,000', gastoInicial.ok, `status ${gastoInicial.status}`)

  let s = await saldos(tarjeta.id)
  check('la tarjeta arranca con -5000 HNL y sin deuda en USD',
    s.HNL === -5000 && !s.USD, JSON.stringify(s))

  // ---------- A: pasar la deuda de lempiras a dolares ----------
  // El usuario dice "paso la deuda de lempiras". Esa es la que se SALDA, o sea
  // la que va como DESTINO; la de dolares crece y va como ORIGEN.
  const a = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: tarjeta.id,
      wallet_destino_id: tarjeta.id,
      monto: 5000,
      moneda_origen: 'USD',
      moneda_destino: 'HNL',
      fecha: '2026-09-02',
    }),
  })
  check('A conversion en la misma tarjeta responde ok', a.ok, `status ${a.status} ${JSON.stringify(a.json)}`)
  check('A monto_origen = 5000 / 26 = 192.31', round2(a.json?.monto_origen) === 192.31, `monto_origen=${a.json?.monto_origen}`)

  const movs = await transDe(tarjeta.id)
  const aSal = movs.find(t => t.id === a.json?.salida_id)
  const aEnt = movs.find(t => t.id === a.json?.entrada_id)
  check('A crea las DOS piernas en la MISMA cartera',
    aSal && aEnt && aSal.wallet_id === tarjeta.id && aEnt.wallet_id === tarjeta.id)
  check('A la pierna que crece es gasto en USD',
    aSal?.tipo === 'gasto' && aSal?.moneda === 'USD' && Number(aSal?.monto) === 192.31,
    `${aSal?.tipo} ${aSal?.moneda} ${aSal?.monto}`)
  check('A la pierna que salda es ingreso en HNL',
    aEnt?.tipo === 'ingreso' && aEnt?.moneda === 'HNL' && Number(aEnt?.monto) === 5000,
    `${aEnt?.tipo} ${aEnt?.moneda} ${aEnt?.monto}`)
  check('A ambas piernas marcadas como transferencia (fuera de ingresos y gastos)',
    !!aSal?.wallet_destino_id && !!aEnt?.wallet_destino_id)
  check('A ambas comparten transfer_id', aSal?.transfer_id && aSal.transfer_id === aEnt?.transfer_id)
  check('A sella la tasa en las dos piernas',
    Number(aSal?.tasa_cambio) === TASA && Number(aEnt?.tasa_cambio) === TASA)

  s = await saldos(tarjeta.id)
  check('A la deuda en lempiras queda saldada', s.HNL === 0, `HNL=${s.HNL}`)
  check('A la deuda pasa a dolares', s.USD === -192.31, `USD=${s.USD}`)

  // ---------- B: la vuelta, de dolares a lempiras ----------
  const b = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: tarjeta.id, wallet_destino_id: tarjeta.id,
      monto: 192.31, moneda_origen: 'HNL', moneda_destino: 'USD', fecha: '2026-09-03',
    }),
  })
  check('B conversion inversa responde ok', b.ok, `status ${b.status}`)
  check('B monto_origen = 192.31 * 26 = 5000.06', round2(b.json?.monto_origen) === 5000.06, `monto_origen=${b.json?.monto_origen}`)

  s = await saldos(tarjeta.id)
  check('B la deuda en dolares vuelve a cero', s.USD === 0, `USD=${s.USD}`)
  check('B la deuda regresa a lempiras', s.HNL === -5000.06, `HNL=${s.HNL}`)

  // ---------- C: lo que NO se debe permitir ----------
  const antes = (await transDe(tarjeta.id)).length

  const c1 = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: tarjeta.id, wallet_destino_id: tarjeta.id,
      monto: 100, moneda_origen: 'HNL', moneda_destino: 'HNL',
    }),
  })
  check('C misma tarjeta con la MISMA moneda se rechaza', c1.status === 400, `status ${c1.status}`)

  const c2 = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: banco.id, wallet_destino_id: banco.id, monto: 100 }),
  })
  check('C misma cartera NO de credito sigue rechazada', c2.status === 400, `status ${c2.status}`)

  const despues = (await transDe(tarjeta.id)).length
  check('C ninguna conversion invalida escribio nada', antes === despues, `${antes} -> ${despues}`)

  // ---------- D: borrar una pierna borra las dos ----------
  const del = await req(`/api/transacciones/${a.json.salida_id}`, { method: 'DELETE' })
  check('D borrar una pierna responde ok', del.ok, `status ${del.status}`)
  const tras = await transDe(tarjeta.id)
  check('D se fueron las DOS piernas de A',
    !tras.some(t => t.id === a.json.salida_id) && !tras.some(t => t.id === a.json.entrada_id))

  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
