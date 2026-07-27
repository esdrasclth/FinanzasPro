// Punto 6: protección de rutas en el servidor (proxy.ts) y saldos de carteras
// calculados en la base de datos. Corre contra el Postgres LOCAL.

const BASE = process.env.BASE_URL || 'http://localhost:3000'
let cookie = ''
const log = []
let fallos = 0

function check(n, c, d = '') {
  if (!c) fallos++
  log.push(`${c ? '  OK  ' : ' FALLA'} | ${n}${d ? ' -> ' + d : ''}`)
}

// Sin seguir redirecciones, para poder inspeccionarlas.
async function crudo(path, conSesion = false) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: conSesion && cookie ? { cookie } : {},
  })
  return { status: res.status, location: res.headers.get('location') }
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
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100

async function main() {
  // ---------- 1) Rutas protegidas SIN sesión ----------
  const raiz = await crudo('/')
  check('raiz redirige sin sesion', raiz.status === 307 && (raiz.location || '').includes('/login'), `${raiz.status} ${raiz.location}`)

  for (const r of ['/dashboard', '/carteras', '/transacciones', '/presupuesto', '/reportes']) {
    const x = await crudo(r)
    const ok = x.status === 307 && (x.location || '').includes('/login')
    check(`${r} bloqueada sin sesion`, ok, `${x.status} ${x.location}`)
  }
  const conNext = await crudo('/presupuesto')
  check('guarda a donde iba en ?next', (conNext.location || '').includes('next=%2Fpresupuesto'), conNext.location)

  for (const r of ['/login', '/registro']) {
    const x = await crudo(r)
    check(`${r} accesible sin sesion`, x.status === 200, String(x.status))
  }

  // Las rutas de API no se redirigen: siguen respondiendo JSON.
  const api = await fetch(BASE + '/api/carteras', { redirect: 'manual' })
  check('las /api NO se redirigen (siguen dando 401 JSON)', api.status === 401, String(api.status))

  // ---------- 2) Con sesión ----------
  await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `e2e4-${Date.now()}@test.local`, password: 'prueba123', nombre: 'E2E4' }),
  })
  check('sesion iniciada', !!cookie)

  const login = await crudo('/login', true)
  check('con sesion, /login manda al dashboard', login.status === 307 && (login.location || '').includes('/dashboard'), `${login.status} ${login.location}`)

  // Sin onboarding completado, el dashboard debe mandar a /onboarding.
  const dashSinOnb = await crudo('/dashboard', true)
  check('sin onboarding, /dashboard manda a /onboarding', dashSinOnb.status === 307 && (dashSinOnb.location || '').includes('/onboarding'), `${dashSinOnb.status} ${dashSinOnb.location}`)

  // Completar perfil para poder ver las pantallas.
  const yo = (await req('/api/auth/session')).json?.user?.id
  await db('profiles', 'upsert', { payload: { id: yo, nombre: 'E2E4', moneda_default: 'HNL', onboarding_completado: true } })

  for (const r of ['/dashboard', '/carteras']) {
    const x = await crudo(r, true)
    check(`${r} accesible con sesion y onboarding`, x.status === 200, `${x.status} ${x.location || ''}`)
  }

  // ---------- 3) Saldos calculados en la base ----------
  const mk = (nombre, tipo, moneda) =>
    db('wallets', 'insert', { single: true, payload: { nombre, tipo, moneda, saldo_inicial: 0, activo: true, color: '#2c6e49' } })
  const banco = (await mk('Banco', 'banco', 'HNL'))?.data
  const tarjeta = (await mk('Tarjeta', 'credito', 'HNL'))?.data

  const tx = (wallet, monto, tipo, moneda) =>
    db('transactions', 'insert', { payload: { wallet_id: wallet, monto, tipo, moneda, fecha: '2026-07-15', descripcion: 'x' } })

  await tx(banco.id, 1000, 'ingreso', 'HNL')
  await tx(banco.id, 250, 'gasto', 'HNL')
  await tx(banco.id, 40, 'gasto', 'USD')      // moneda distinta: saldo aparte
  await tx(tarjeta.id, 300, 'gasto', 'HNL')
  await tx(tarjeta.id, 20, 'gasto', 'USD')

  const res = await req('/api/carteras')
  check('la API de carteras responde', res.ok, `status ${res.status}`)
  const porId = Object.fromEntries((res.json?.carteras || []).map(c => [c.id, c]))
  const b = porId[banco.id]
  const t = porId[tarjeta.id]

  check('saldo HNL del banco = 1000 - 250 = 750', round2(b?.saldos?.HNL) === 750, `HNL=${b?.saldos?.HNL}`)
  check('saldo USD del banco = -40 (aparte)', round2(b?.saldos?.USD) === -40, `USD=${b?.saldos?.USD}`)
  check('saldo_actual usa la moneda primaria', round2(b?.saldo_actual) === 750, `actual=${b?.saldo_actual}`)
  check('cuenta los movimientos', b?.movimientos === 3, `n=${b?.movimientos}`)
  check('registra el ultimo movimiento', !!b?.ultimo_movimiento)
  check('tarjeta lleva doble moneda: HNL -300', round2(t?.saldos?.HNL) === -300, `HNL=${t?.saldos?.HNL}`)
  check('tarjeta lleva doble moneda: USD -20', round2(t?.saldos?.USD) === -20, `USD=${t?.saldos?.USD}`)

  // La apertura "Saldo inicial" no debe contar como movimiento real.
  const catIni = (await db('categories', 'insert', {
    single: true, payload: { nombre: 'Saldo inicial', tipo: 'ingreso', es_sistema: true, icono: '🏦' },
  }))?.data
  await db('transactions', 'insert', {
    payload: { wallet_id: banco.id, category_id: catIni.id, monto: 500, tipo: 'ingreso', moneda: 'HNL', fecha: '2026-07-01', descripcion: 'Saldo inicial' },
  })
  const res2 = await req('/api/carteras')
  const b2 = (res2.json?.carteras || []).find(c => c.id === banco.id)
  check('la apertura suma al saldo', round2(b2?.saldos?.HNL) === 1250, `HNL=${b2?.saldos?.HNL}`)
  check('la apertura NO cuenta como movimiento', b2?.movimientos === 3, `n=${b2?.movimientos}`)
  check('saldo_inicial_real refleja la apertura', round2(b2?.saldo_inicial_real) === 500, `ini=${b2?.saldo_inicial_real}`)

  // ---------- 4) Archivadas ----------
  await db('wallets', 'update', { payload: { activo: false }, filters: [{ type: 'eq', column: 'id', value: tarjeta.id }] })
  const res3 = await req('/api/carteras')
  check('la archivada sale de las activas', !(res3.json?.carteras || []).some(c => c.id === tarjeta.id))
  check('la archivada aparece en su lista', (res3.json?.archivadas || []).some(c => c.id === tarjeta.id))

  imprimir()
}

function imprimir() {
  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
