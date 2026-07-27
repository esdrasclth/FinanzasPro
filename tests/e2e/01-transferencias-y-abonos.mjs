// Prueba de punta a punta de los caminos que mueven dinero.
// Corre contra el Postgres LOCAL (docker), nunca contra Neon.

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
  const email = `e2e-${Date.now()}@test.local`
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'prueba123', nombre: 'E2E' }),
  })
  check('registro de usuario de prueba', reg.ok && cookie, `status ${reg.status}`)
  if (!cookie) return

  // Tasa manual fija para que la conversion sea determinista.
  const TASA = 26
  const tc = await req('/api/tipo-cambio', { method: 'POST', body: JSON.stringify({ tasa: TASA }) })
  check('fijar tasa manual 26 HNL/USD', tc.ok && tc.json?.tasaVenta === TASA, `tasaVenta=${tc.json?.tasaVenta}`)

  const mkWallet = (nombre, tipo, moneda) =>
    db('wallets', 'insert', { single: true, payload: { nombre, tipo, moneda, saldo_inicial: 0, activo: true, color: '#2c6e49' } })

  const hnl = (await mkWallet('Banco HNL', 'banco', 'HNL'))?.data
  const usd = (await mkWallet('Ahorro USD', 'ahorro', 'USD'))?.data
  const tarjeta = (await mkWallet('Tarjeta', 'credito', 'HNL'))?.data
  check('crear 3 carteras', hnl?.id && usd?.id && tarjeta?.id)

  const transDe = async walletId => (await sel('transactions', [{ type: 'eq', column: 'wallet_id', value: walletId }]))

  // ---------- A: transferencia misma moneda ----------
  const a = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: hnl.id, wallet_destino_id: tarjeta.id, monto: 500, moneda_destino: 'HNL', fecha: '2026-07-20' }),
  })
  check('A transferencia HNL->HNL responde ok', a.ok, `status ${a.status}`)
  const aSal = (await transDe(hnl.id)).filter(t => t.id === a.json?.salida_id)[0]
  const aEnt = (await transDe(tarjeta.id)).filter(t => t.id === a.json?.entrada_id)[0]
  check('A crea las DOS piernas', aSal && aEnt)
  check('A salida = gasto 500 HNL', aSal?.tipo === 'gasto' && Number(aSal?.monto) === 500 && aSal?.moneda === 'HNL')
  check('A entrada = ingreso 500 HNL', aEnt?.tipo === 'ingreso' && Number(aEnt?.monto) === 500 && aEnt?.moneda === 'HNL')
  check('A ambas piernas marcadas como transferencia', !!aSal?.wallet_destino_id && !!aEnt?.wallet_destino_id)
  check('A sella tasa_cambio (punto 4)', Number(aSal?.tasa_cambio) === TASA, `tasa=${aSal?.tasa_cambio}`)

  // ---------- B: transferencia con conversion ----------
  // El monto se expresa en la moneda de DESTINO (USD); deben salir monto*26 del origen HNL.
  const b = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: hnl.id, wallet_destino_id: usd.id, monto: 100, fecha: '2026-07-21' }),
  })
  check('B transferencia HNL->USD responde ok', b.ok, `status ${b.status}`)
  check('B monto_origen = 100 USD * 26 = 2600 HNL', round2(b.json?.monto_origen) === 2600, `monto_origen=${b.json?.monto_origen}`)
  const bSal = (await transDe(hnl.id)).filter(t => t.id === b.json?.salida_id)[0]
  const bEnt = (await transDe(usd.id)).filter(t => t.id === b.json?.entrada_id)[0]
  check('B salida 2600 HNL', Number(bSal?.monto) === 2600 && bSal?.moneda === 'HNL')
  check('B entrada 100 USD', Number(bEnt?.monto) === 100 && bEnt?.moneda === 'USD')
  check('B guarda monto_original cruzado', Number(bSal?.monto_original) === 100 && Number(bEnt?.monto_original) === 2600)

  // ---------- C: transferencias invalidas NO deben escribir nada ----------
  const antesC = (await transDe(hnl.id)).length
  const c1 = await req('/api/transferencias', {
    method: 'POST', body: JSON.stringify({ wallet_id: hnl.id, wallet_destino_id: hnl.id, monto: 50 }),
  })
  const c2 = await req('/api/transferencias', {
    method: 'POST', body: JSON.stringify({ wallet_id: hnl.id, wallet_destino_id: '11111111-1111-1111-1111-111111111111', monto: 50 }),
  })
  const c3 = await req('/api/transferencias', {
    method: 'POST', body: JSON.stringify({ wallet_id: hnl.id, wallet_destino_id: usd.id, monto: -5 }),
  })
  const despuesC = (await transDe(hnl.id)).length
  check('C origen==destino rechazado', c1.status === 400)
  check('C cartera ajena/inexistente rechazada', c2.status === 404, `status ${c2.status}`)
  check('C monto negativo rechazado', c3.status === 400)
  check('C ninguna transferencia invalida escribio nada', antesC === despuesC, `${antesC} -> ${despuesC}`)

  // ---------- D/E/F: abonos a deuda ----------
  const deuda = (await db('debts', 'insert', {
    single: true,
    payload: { nombre: 'Prestamo E2E', tipo: 'debo', monto_total: 1000, monto_pagado: 0, completada: false },
  }))?.data
  check('crear deuda de 1000', Number(deuda?.monto_total) === 1000)

  const abonar = (monto, extra = {}) => req(`/api/deudas/${deuda.id}/abonos`, {
    method: 'POST', body: JSON.stringify({ monto, wallet_id: hnl.id, fecha: '2026-07-22', ...extra }),
  })
  const leerDeuda = async () => (await sel('debts', [{ type: 'eq', column: 'id', value: deuda.id }]))[0]
  const contarPagos = async () => (await sel('debt_payments', [{ type: 'eq', column: 'debt_id', value: deuda.id }])).length

  const d = await abonar(300, { nota: 'primera cuota' })
  check('D abono parcial de 300 ok', d.ok, `status ${d.status}`)
  let dd = await leerDeuda()
  check('D deuda avanza a 300', Number(dd?.monto_pagado) === 300, `pagado=${dd?.monto_pagado}`)
  check('D deuda sigue abierta', dd?.completada === false)
  check('D crea 1 pago', (await contarPagos()) === 1)
  const tLigada = (await transDe(hnl.id)).find(t => t.debt_id === deuda.id)
  check('D crea la transaccion ligada (debt_id)', !!tLigada && Number(tLigada.monto) === 300)
  check('D transaccion ligada sella tasa', Number(tLigada?.tasa_cambio) === TASA)

  // F: abono que excede -> debe rechazar y NO dejar rastro
  const pagosAntesF = await contarPagos()
  const transAntesF = (await transDe(hnl.id)).length
  const f = await abonar(9999)
  dd = await leerDeuda()
  check('F abono que excede rechazado', f.status === 400, `status ${f.status}`)
  check('F NO creo pago huerfano', (await contarPagos()) === pagosAntesF)
  check('F NO creo transaccion huerfana', (await transDe(hnl.id)).length === transAntesF)
  check('F deuda intacta en 300', Number(dd?.monto_pagado) === 300, `pagado=${dd?.monto_pagado}`)

  // G: concurrencia — dos abonos simultaneos que juntos exceden el pendiente (700)
  const [g1, g2] = await Promise.all([abonar(600), abonar(600)])
  dd = await leerDeuda()
  const exitos = [g1, g2].filter(r => r.ok).length
  check('G exactamente 1 de 2 abonos concurrentes de 600 pasa', exitos === 1, `exitos=${exitos} (${g1.status}/${g2.status})`)
  check('G monto_pagado NUNCA supera el total', Number(dd?.monto_pagado) <= 1000, `pagado=${dd?.monto_pagado}`)
  check('G pagos registrados coinciden con exitos', (await contarPagos()) === 1 + exitos, `pagos=${await contarPagos()}`)

  // E: abono final que completa la deuda
  const pendiente = round2(1000 - Number(dd.monto_pagado))
  const e = await abonar(pendiente)
  dd = await leerDeuda()
  check('E abono final ok', e.ok, `status ${e.status} pendiente=${pendiente}`)
  check('E deuda queda completada', dd?.completada === true)
  check('E monto_pagado == monto_total', Number(dd?.monto_pagado) === 1000, `pagado=${dd?.monto_pagado}`)

  const h = await abonar(10)
  check('E abono sobre deuda saldada rechazado', h.status === 400)

  // ---------- consistencia global ----------
  const pagos = await sel('debt_payments', [{ type: 'eq', column: 'debt_id', value: deuda.id }])
  const sumaPagos = round2(pagos.reduce((s, p) => s + Number(p.monto), 0))
  dd = await leerDeuda()
  check('INVARIANTE suma(debt_payments) == debts.monto_pagado', sumaPagos === Number(dd.monto_pagado), `${sumaPagos} vs ${dd.monto_pagado}`)
  const ligadas = (await transDe(hnl.id)).filter(t => t.debt_id === deuda.id)
  const sumaLigadas = round2(ligadas.reduce((s, t) => s + Number(t.monto), 0))
  check('INVARIANTE suma(transacciones ligadas) == monto_pagado', sumaLigadas === Number(dd.monto_pagado), `${sumaLigadas} vs ${dd.monto_pagado}`)

  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
