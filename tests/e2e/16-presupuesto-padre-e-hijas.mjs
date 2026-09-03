// Presupuesto en la categoría padre y gasto en sus hijas, más el aviso de
// gasto sin presupuestar. Corre contra el Postgres LOCAL (docker).
//
// El caso que arregla: el formulario obliga a etiquetar el gasto en la
// subcategoría, así que un presupuesto puesto en el padre comparaba su id
// contra el de la hija, nunca coincidía y se quedaba en cero para siempre.

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
  for (const c of (res.headers.getSetCookie?.() || [])) {
    if (c.startsWith('finanzas-pro-session=')) cookie = c.split(';')[0]
  }
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, ok: res.ok, json }
}

const db = async (table, op, extra = {}) =>
  (await req('/api/db', { method: 'POST', body: JSON.stringify({ table, op, ...extra }) })).json

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100

async function main() {
  const h = new Date()
  const MES = h.getMonth() + 1
  const ANIO = h.getFullYear()
  const fecha = `${ANIO}-${String(MES).padStart(2, '0')}-10`

  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `e2e-presu-${Date.now()}@test.local`, password: 'prueba123', nombre: 'E2E presu' }),
  })
  check('registro de usuario de prueba', reg.ok && cookie, `status ${reg.status}`)
  if (!cookie) { console.log(log.join('\n')); process.exit(1) }

  await db('profiles', 'upsert', {
    payload: { nombre: 'E2E presu', moneda_default: 'HNL', onboarding_completado: true },
  })

  const w = (await db('wallets', 'insert', {
    single: true,
    payload: { nombre: 'Banco', tipo: 'banco', moneda: 'HNL', saldo_inicial: 0, activo: true, color: '#2c6e49' },
  }))?.data

  const cat = async (nombre, extra = {}) => (await db('categories', 'insert', {
    single: true,
    payload: { nombre, tipo: 'gasto', icono: 'Tag', color: '#EF4444', ...extra },
  }))?.data

  const comida = await cat('Comida')
  const superm = await cat('Supermercado', { parent_id: comida.id })
  const restau = await cat('Restaurantes', { parent_id: comida.id })
  const transp = await cat('Transporte')
  check('crear el árbol de categorías', !!(comida?.id && superm?.id && restau?.id && transp?.id))

  const gastar = (categoryId, monto, desc) => req('/api/transacciones', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: w.id, monto, moneda: 'HNL', tipo: 'gasto', category_id: categoryId, descripcion: desc, fecha }),
  })

  const leer = async () => (await req(`/api/presupuesto?mes=${MES}&anio=${ANIO}`)).json
  const partidaDe = (d, id) => (d?.presupuestos || []).find(p => p.category_id === id)
  const sueltaDe = (d, id) => (d?.sinPresupuesto || []).find(c => c.category_id === id)

  // ---------- A: presupuesto en el padre, gasto en las hijas ----------
  await req('/api/presupuesto', {
    method: 'POST',
    body: JSON.stringify({ category_id: comida.id, monto_limite: 5000, mes: MES, anio: ANIO }),
  })
  await gastar(superm.id, 1800, 'Super')
  await gastar(restau.id, 1200, 'Cena')

  let d = await leer()
  let padre = partidaDe(d, comida.id)
  check('A el presupuesto del padre suma lo gastado en sus hijas',
    Number(padre?.gastado) === 3000, `gastado=${padre?.gastado}`)
  check('A el porcentaje sale de esa suma', Math.round(Number(padre?.porcentaje)) === 60, `${padre?.porcentaje}%`)

  check('A las hijas cubiertas por el padre NO se avisan como sueltas',
    !sueltaDe(d, superm.id) && !sueltaDe(d, restau.id))

  // ---------- B: el gasto directo en el padre también cuenta ----------
  await gastar(comida.id, 500, 'Directo al padre')
  d = await leer()
  padre = partidaDe(d, comida.id)
  check('B el padre suma lo suyo directo además de lo de las hijas',
    Number(padre?.gastado) === 3500, `gastado=${padre?.gastado}`)

  // ---------- C: gasto sin ningún presupuesto que lo cubra ----------
  await gastar(transp.id, 900, 'Gasolina')
  d = await leer()
  const suelta = sueltaDe(d, transp.id)
  check('C una categoría sin presupuesto aparece en el aviso', !!suelta, JSON.stringify(suelta))
  check('C con el monto correcto', round2(Number(suelta?.gastado)) === 900, `gastado=${suelta?.gastado}`)
  check('C y no está en la lista de partidas', !partidaDe(d, transp.id))

  // ---------- D: al presupuestarla, desaparece del aviso ----------
  await req('/api/presupuesto', {
    method: 'POST',
    body: JSON.stringify({ category_id: transp.id, monto_limite: 1200, mes: MES, anio: ANIO }),
  })
  d = await leer()
  check('D deja de avisarse en cuanto tiene presupuesto', !sueltaDe(d, transp.id))
  check('D y pasa a medirse como partida', Number(partidaDe(d, transp.id)?.gastado) === 900,
    `gastado=${partidaDe(d, transp.id)?.gastado}`)

  // ---------- E: una hija con presupuesto propio se mide sola ----------
  await req('/api/presupuesto', {
    method: 'POST',
    body: JSON.stringify({ category_id: superm.id, monto_limite: 2000, mes: MES, anio: ANIO }),
  })
  d = await leer()
  check('E la hija con presupuesto propio mide solo lo suyo',
    Number(partidaDe(d, superm.id)?.gastado) === 1800, `gastado=${partidaDe(d, superm.id)?.gastado}`)
  check('E y el padre sigue viendo el total del grupo',
    Number(partidaDe(d, comida.id)?.gastado) === 3500, `gastado=${partidaDe(d, comida.id)?.gastado}`)

  // ---------- F: nada de esto altera el gasto real del mes ----------
  const dash = await req('/api/dashboard')
  check('F el total del mes sigue cuadrando con el dashboard',
    Number(dash.json?.resumen?.gastos) === 4400, `gastos=${dash.json?.resumen?.gastos}`)

  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
