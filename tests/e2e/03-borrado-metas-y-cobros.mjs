// Borrado atómico de movimientos compuestos + metas y suscripciones que mueven
// dinero de verdad. Corre contra el Postgres LOCAL.

const BASE = process.env.BASE_URL || 'http://localhost:3000'
let cookie = ''
const log = []
let fallos = 0

function check(n, cond, det = '') {
  if (!cond) fallos++
  log.push(`${cond ? '  OK  ' : ' FALLA'} | ${n}${det ? ' -> ' + det : ''}`)
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  })
  for (const c of res.headers.getSetCookie?.() || []) {
    if (c.startsWith('finanzas-pro-session=')) cookie = c.split(';')[0]
  }
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, ok: res.ok, json }
}

const db = async (t, op, extra = {}) => (await req('/api/db', { method: 'POST', body: JSON.stringify({ table: t, op, ...extra }) })).json
const sel = async (t, filters = []) => (await db(t, 'select', { filters }))?.data || []
const eqf = (col, value) => ({ type: 'eq', column: col, value })
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100

async function main() {
  await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `e2e3-${Date.now()}@test.local`, password: 'prueba123', nombre: 'E2E3' }),
  })
  check('sesion iniciada', !!cookie)
  if (!cookie) return imprimir()

  const TASA = 25
  await req('/api/tipo-cambio', { method: 'POST', body: JSON.stringify({ tasa: TASA }) })

  const mk = (nombre, tipo, moneda) =>
    db('wallets', 'insert', { single: true, payload: { nombre, tipo, moneda, saldo_inicial: 0, activo: true, color: '#2c6e49' } })
  const banco = (await mk('Banco', 'banco', 'HNL'))?.data
  const ahorro = (await mk('Ahorros', 'ahorro', 'HNL'))?.data
  const usd = (await mk('Dolares', 'ahorro', 'USD'))?.data
  check('carteras creadas', banco?.id && ahorro?.id && usd?.id)

  const txDe = async w => sel('transactions', [eqf('wallet_id', w)])
  const totalTx = async () => (await sel('transactions')).length

  // ---------- A) Borrar una transferencia borra LAS DOS piernas ----------
  const tr = await req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: banco.id, wallet_destino_id: ahorro.id, monto: 400, fecha: '2026-07-20' }),
  })
  check('A transferencia creada', tr.ok && !!tr.json?.transfer_id, `transfer_id=${tr.json?.transfer_id?.slice(0, 8)}`)
  const antesA = await totalTx()
  const delA = await req(`/api/transacciones/${tr.json.salida_id}`, { method: 'DELETE' })
  check('A borrado responde ok', delA.ok, `status ${delA.status}`)
  check('A informa que borro 2 filas', delA.json?.eliminadas === 2, `eliminadas=${delA.json?.eliminadas}`)
  check('A desaparecieron AMBAS piernas', (await totalTx()) === antesA - 2, `${antesA} -> ${await totalTx()}`)
  check('A no quedo pierna huerfana en destino', (await txDe(ahorro.id)).length === 0)

  // ---------- B) Borrar un abono devuelve el monto a la deuda ----------
  const deuda = (await db('debts', 'insert', {
    single: true,
    payload: { nombre: 'Prestamo', tipo: 'debo', monto_total: 500, monto_pagado: 0, completada: false },
  }))?.data
  const ab = await req(`/api/deudas/${deuda.id}/abonos`, {
    method: 'POST', body: JSON.stringify({ monto: 500, wallet_id: banco.id, fecha: '2026-07-21' }),
  })
  check('B abono que salda la deuda', ab.ok)
  let d = (await sel('debts', [eqf('id', deuda.id)]))[0]
  check('B deuda quedo completada', d?.completada === true && Number(d?.monto_pagado) === 500)
  check('B el pago quedo enlazado a su transaccion',
    (await sel('debt_payments', [eqf('debt_id', deuda.id)]))[0]?.transaction_id === ab.json?.transaction_id)

  const delB = await req(`/api/transacciones/${ab.json.transaction_id}`, { method: 'DELETE' })
  check('B borrado del abono ok', delB.ok, `status ${delB.status}`)
  d = (await sel('debts', [eqf('id', deuda.id)]))[0]
  check('B monto_pagado volvio a 0', Number(d?.monto_pagado) === 0, `pagado=${d?.monto_pagado}`)
  check('B la deuda se reabrio', d?.completada === false)
  check('B se borro el pago del historial', (await sel('debt_payments', [eqf('debt_id', deuda.id)])).length === 0)

  // ---------- C) Aporte a meta mueve dinero de verdad ----------
  const meta = (await db('metas', 'insert', {
    single: true, payload: { nombre: 'Viaje', monto_objetivo: 1000, monto_actual: 0, completada: false },
  }))?.data
  const antesBanco = (await txDe(banco.id)).length
  const antesAhorro = (await txDe(ahorro.id)).length

  const ap = await req(`/api/metas/${meta.id}/aportes`, {
    method: 'POST',
    body: JSON.stringify({ monto: 300, wallet_id: banco.id, wallet_destino_id: ahorro.id, fecha: '2026-07-22' }),
  })
  check('C aporte de 300 ok', ap.ok, `status ${ap.status} ${JSON.stringify(ap.json)}`)
  check('C la meta avanzo a 300', ap.json?.monto_actual === 300)
  check('C salio dinero del banco', (await txDe(banco.id)).length === antesBanco + 1)
  check('C entro dinero al ahorro', (await txDe(ahorro.id)).length === antesAhorro + 1)
  const entrada = (await txDe(ahorro.id)).find(t => t.transfer_id === ap.json?.transfer_id)
  check('C la entrada es un ingreso de 300', entrada?.tipo === 'ingreso' && Number(entrada?.monto) === 300)
  check('C quedo registrado en el historial de aportes',
    (await sel('meta_aportes', [eqf('meta_id', meta.id)])).length === 1)

  // Deshacer el aporte revierte la meta y las dos transacciones.
  const delC = await req(`/api/transacciones/${entrada.id}`, { method: 'DELETE' })
  check('C deshacer el aporte ok', delC.ok && delC.json?.meta_revertida === meta.id, `meta_revertida=${delC.json?.meta_revertida}`)
  const m = (await sel('metas', [eqf('id', meta.id)]))[0]
  check('C la meta volvio a 0', Number(m?.monto_actual) === 0, `actual=${m?.monto_actual}`)
  check('C se borro el aporte del historial', (await sel('meta_aportes', [eqf('meta_id', meta.id)])).length === 0)
  check('C las dos transacciones desaparecieron',
    (await txDe(banco.id)).length === antesBanco && (await txDe(ahorro.id)).length === antesAhorro)

  // El aporte no puede superar el objetivo.
  const exceso = await req(`/api/metas/${meta.id}/aportes`, {
    method: 'POST',
    body: JSON.stringify({ monto: 5000, wallet_id: banco.id, wallet_destino_id: ahorro.id }),
  })
  check('C aporte mayor al objetivo rechazado', exceso.status === 400)
  check('C el rechazo no dejo transacciones', (await txDe(banco.id)).length === antesBanco)

  // ---------- D) Confirmar cobro de suscripcion crea el gasto ----------
  const sub = (await db('subscriptions', 'insert', {
    single: true,
    payload: {
      nombre: 'Streaming', monto: 12, moneda: 'USD', frecuencia: 'mensual',
      fecha_inicio: '2026-06-10', proximo_cobro: '2026-07-10', estado: 'activa', wallet_id: banco.id,
    },
  }))?.data
  check('D suscripcion creada en USD', sub?.id && sub?.moneda === 'USD')

  const antesD = (await txDe(banco.id)).length
  const cobro = await req(`/api/suscripciones/${sub.id}/cobros`, {
    method: 'POST', body: JSON.stringify({ fecha: '2026-07-10' }),
  })
  check('D cobro confirmado', cobro.ok, `status ${cobro.status} ${JSON.stringify(cobro.json)}`)
  check('D creo el gasto en la cartera', (await txDe(banco.id)).length === antesD + 1)
  const gasto = (await txDe(banco.id)).find(t => t.id === cobro.json?.transaction_id)
  check('D el gasto va en HNL (moneda de la cartera)', gasto?.moneda === 'HNL', `moneda=${gasto?.moneda}`)
  check('D convertido: $12 * 25 = 300', Number(gasto?.monto) === 300, `monto=${gasto?.monto}`)
  check('D conserva el original en USD', Number(gasto?.monto_original) === 12)
  check('D adelanto el proximo cobro a agosto', cobro.json?.proximo_cobro === '2026-08-10', `proximo=${cobro.json?.proximo_cobro}`)

  const repetido = await req(`/api/suscripciones/${sub.id}/cobros`, {
    method: 'POST', body: JSON.stringify({ fecha: '2026-07-10' }),
  })
  check('D no deja cobrar dos veces el mismo ciclo', repetido.status === 409, `status ${repetido.status}`)
  check('D el intento repetido no creo otro gasto', (await txDe(banco.id)).length === antesD + 1)

  // Borrar el gasto libera el ciclo para volver a confirmarlo.
  const delD = await req(`/api/transacciones/${cobro.json.transaction_id}`, { method: 'DELETE' })
  check('D borrar el gasto revierte el cobro', delD.ok && delD.json?.cobro_revertido === true)
  const reintento = await req(`/api/suscripciones/${sub.id}/cobros`, {
    method: 'POST', body: JSON.stringify({ fecha: '2026-07-10' }),
  })
  check('D se puede volver a confirmar tras deshacer', reintento.ok, `status ${reintento.status}`)

  // ---------- E) Lo ligado a un grupo no se borra desde aqui ----------
  const g = await req('/api/grupos', { method: 'POST', body: JSON.stringify({ nombre: 'Grupo E2E', moneda: 'HNL' }) })
  const grupoId = g.json?.id || g.json?.grupo?.id
  const yo = (await req('/api/auth/session')).json?.user?.id
  await req(`/api/grupos/${grupoId}/gastos`, {
    method: 'POST',
    body: JSON.stringify({
      descripcion: 'Cena', monto_total: 100, fecha: '2026-07-23', metodo_division: 'exacto',
      pagos: [{ user_id: yo, monto: 100, wallet_id: banco.id }],
      divisiones: [{ user_id: yo, valor: 100 }],
    }),
  })
  const delGrupo = (await txDe(banco.id)).find(t => (t.descripcion || '').includes('Cena'))
  const rechazo = await req(`/api/transacciones/${delGrupo.id}`, { method: 'DELETE' })
  check('E movimiento de grupo NO se borra desde transacciones', rechazo.status === 409, `status ${rechazo.status}`)
  check('E el movimiento de grupo sigue ahi',
    !!(await txDe(banco.id)).find(t => t.id === delGrupo.id))

  imprimir()
}

function imprimir() {
  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
