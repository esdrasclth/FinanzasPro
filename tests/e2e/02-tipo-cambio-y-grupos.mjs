// Pruebas de los "bugs sueltos": aislamiento de la tasa manual entre usuarios
// y moneda de los movimientos de grupo. Corre contra el Postgres LOCAL.

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const log = []
let fallos = 0

function check(nombre, cond, detalle = '') {
  if (!cond) fallos++
  log.push(`${cond ? '  OK  ' : ' FALLA'} | ${nombre}${detalle ? ' -> ' + detalle : ''}`)
}

// Cada sesión lleva su propia cookie para poder simular dos usuarios a la vez.
function nuevaSesion() {
  const s = { cookie: '' }
  s.req = async (path, opts = {}) => {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(s.cookie ? { cookie: s.cookie } : {}), ...(opts.headers || {}) },
    })
    for (const c of res.headers.getSetCookie?.() || []) {
      if (c.startsWith('finanzas-pro-session=')) s.cookie = c.split(';')[0]
    }
    let json = null
    try { json = await res.json() } catch {}
    return { status: res.status, ok: res.ok, json }
  }
  s.db = async (table, op, extra = {}) =>
    (await s.req('/api/db', { method: 'POST', body: JSON.stringify({ table, op, ...extra }) })).json
  s.sel = async (table, filters = []) => (await s.db(table, 'select', { filters }))?.data || []
  return s
}

const registrar = async (s, etiqueta) =>
  s.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `${etiqueta}-${Date.now()}@test.local`, password: 'prueba123', nombre: etiqueta }),
  })

const mkWallet = (s, nombre, tipo, moneda) =>
  s.db('wallets', 'insert', { single: true, payload: { nombre, tipo, moneda, saldo_inicial: 0, activo: true, color: '#2c6e49' } })

async function main() {
  // ---------- 1) La tasa manual de un usuario no debe tocar a los demas ----------
  const ana = nuevaSesion()
  const beto = nuevaSesion()
  await registrar(ana, 'ana')
  await registrar(beto, 'beto')
  check('dos usuarios distintos', ana.cookie !== beto.cookie && !!ana.cookie && !!beto.cookie)

  const tcBase = (await beto.req('/api/tipo-cambio')).json
  const tasaBase = tcBase?.tasa
  check('beto ve una tasa inicial', typeof tasaBase === 'number', `tasa=${tasaBase} fuente=${tcBase?.fuente}`)

  // Ana fija una tasa manual absurda.
  const fija = await ana.req('/api/tipo-cambio', { method: 'POST', body: JSON.stringify({ tasa: 99 }) })
  check('ana fija su tasa manual en 99', fija.ok && fija.json?.tasa === 99)

  const tcAna = (await ana.req('/api/tipo-cambio')).json
  check('ana recibe SU tasa manual', tcAna?.tasa === 99 && tcAna?.fuente === 'manual', `tasa=${tcAna?.tasa}`)

  const tcBeto = (await beto.req('/api/tipo-cambio')).json
  check('beto NO recibe la tasa manual de ana', tcBeto?.tasa !== 99, `tasa=${tcBeto?.tasa} fuente=${tcBeto?.fuente}`)
  check('beto sigue con la tasa global', tcBeto?.tasa === tasaBase, `${tcBeto?.tasa} vs ${tasaBase}`)

  // Beto fija la suya: cada quien conserva la propia.
  await beto.req('/api/tipo-cambio', { method: 'POST', body: JSON.stringify({ tasa: 11 }) })
  const anaOtraVez = (await ana.req('/api/tipo-cambio')).json
  const betoOtraVez = (await beto.req('/api/tipo-cambio')).json
  check('ana conserva 99 tras el cambio de beto', anaOtraVez?.tasa === 99, `tasa=${anaOtraVez?.tasa}`)
  check('beto tiene la suya en 11', betoOtraVez?.tasa === 11, `tasa=${betoOtraVez?.tasa}`)

  // La tasa manual de cada uno debe usarse al sellar sus transacciones.
  const anaHnl = (await mkWallet(ana, 'Banco HNL', 'banco', 'HNL'))?.data
  const anaUsd = (await mkWallet(ana, 'Ahorro USD', 'ahorro', 'USD'))?.data
  const t = await ana.req('/api/transferencias', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: anaHnl.id, wallet_destino_id: anaUsd.id, monto: 10, fecha: '2026-07-23' }),
  })
  check('transferencia de ana usa SU tasa (10 USD * 99)', t.ok && t.json?.monto_origen === 990, `monto_origen=${t.json?.monto_origen}`)

  // ---------- 2) Los movimientos de grupo respetan la moneda ----------
  // Grupo en USD, cartera en HNL: el gasto debe reflejarse convertido a HNL.
  const g = await ana.req('/api/grupos', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Viaje E2E', moneda: 'USD' }),
  })
  const grupoId = g.json?.id || g.json?.grupo?.id
  check('crear grupo en USD', g.ok && !!grupoId, `status ${g.status}`)
  if (!grupoId) { imprimir(); return }

  const yo = (await ana.req('/api/auth/session')).json?.user?.id
  const antes = (await ana.sel('transactions', [{ type: 'eq', column: 'wallet_id', value: anaHnl.id }])).length

  const gasto = await ana.req(`/api/grupos/${grupoId}/gastos`, {
    method: 'POST',
    body: JSON.stringify({
      descripcion: 'Cena del grupo',
      monto_total: 50,
      fecha: '2026-07-23',
      metodo_division: 'exacto',
      pagos: [{ user_id: yo, monto: 50, wallet_id: anaHnl.id }],
      divisiones: [{ user_id: yo, valor: 50 }],
    }),
  })
  check('registrar gasto compartido de $50', gasto.ok, `status ${gasto.status} ${JSON.stringify(gasto.json)}`)

  const despues = await ana.sel('transactions', [{ type: 'eq', column: 'wallet_id', value: anaHnl.id }])
  check('el gasto se reflejo en la cartera', despues.length === antes + 1, `${antes} -> ${despues.length}`)
  const reflejo = despues.find(x => (x.descripcion || '').includes('Cena del grupo'))
  check('gasto de grupo etiquetado como HNL (moneda de la cartera)', reflejo?.moneda === 'HNL', `moneda=${reflejo?.moneda}`)
  check('gasto de grupo convertido: $50 * 99 = 4950', Number(reflejo?.monto) === 4950, `monto=${reflejo?.monto}`)
  check('conserva el monto original en USD', Number(reflejo?.monto_original) === 50, `original=${reflejo?.monto_original}`)
  check('sella la tasa aplicada', Number(reflejo?.tasa_cambio) === 99, `tasa=${reflejo?.tasa_cambio}`)

  // Liquidacion del grupo hacia una cartera HNL.
  const liq = await ana.req(`/api/grupos/${grupoId}/liquidar`, {
    method: 'POST',
    body: JSON.stringify({ de_user_id: yo, a_user_id: yo, monto: 20 }),
  })
  check('liquidacion consigo mismo rechazada', liq.status === 400, `status ${liq.status}`)

  imprimir()
}

function imprimir() {
  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
