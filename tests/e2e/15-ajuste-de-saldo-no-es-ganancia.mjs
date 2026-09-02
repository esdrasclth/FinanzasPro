// Un ajuste de saldo mueve el saldo, pero no es ganancia ni pérdida.
// Corre contra el Postgres LOCAL (docker), nunca contra Neon.
//
// Lo que se vigila es que la exclusión llegue a TODAS las pantallas. Depende de
// que cada consulta traiga categories(nombre); si una se olvida, el ajuste
// vuelve a contar como ingreso o gasto y solo se nota al cuadrar cifras.

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

async function main() {
  const email = `e2e-ajuste-${Date.now()}@test.local`
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'prueba123', nombre: 'E2E ajuste' }),
  })
  check('registro de usuario de prueba', reg.ok && cookie, `status ${reg.status}`)
  if (!cookie) { console.log(log.join('\n')); process.exit(1) }

  await db('profiles', 'upsert', {
    payload: { nombre: 'E2E ajuste', moneda_default: 'HNL', onboarding_completado: true },
  })

  const banco = (await db('wallets', 'insert', {
    single: true,
    payload: { nombre: 'Banco', tipo: 'banco', moneda: 'HNL', saldo_inicial: 0, activo: true, color: '#2c6e49' },
  }))?.data
  check('crear cartera', !!banco?.id)

  // La suite crea su propia categoría en vez de buscar una del seed: así no
  // depende de que la base esté sembrada, y sobre todo no corre el riesgo de
  // acabar usando una interna ("Saldo inicial", "Ajuste de saldo"), que está
  // excluida a propósito y haría que la prueba midiera lo contrario de lo que
  // cree medir.
  const comida = (await db('categories', 'insert', {
    single: true,
    payload: { nombre: 'Comida E2E', tipo: 'gasto', icono: 'Utensils', color: '#EF4444' },
  }))?.data
  check('crear una categoría de gasto normal', !!comida?.id, comida?.nombre)

  const hoy = new Date()
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-15`

  // Un gasto de verdad: 250.
  const g = await req('/api/transacciones', {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: banco.id, monto: 250, moneda: 'HNL', tipo: 'gasto',
      category_id: comida.id, descripcion: 'Gasto real', fecha,
    }),
  })
  check('registrar un gasto real de 250', g.ok, `status ${g.status}`)

  // Un ajuste de saldo de 5000 como ingreso: es el que no debe contar.
  const aj = await req('/api/transacciones', {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: banco.id, monto: 5000, moneda: 'HNL', tipo: 'ingreso',
      categoria_sistema: 'Ajuste de saldo', descripcion: 'Ajuste', fecha,
    }),
  })
  check('registrar un ajuste de saldo de +5000', aj.ok, `status ${aj.status}`)

  // ---------- el saldo SÍ se mueve ----------
  const carteras = (await req('/api/carteras')).json?.carteras || []
  const saldo = carteras.find(c => c.id === banco.id)?.saldos?.HNL
  check('el ajuste SÍ mueve el saldo de la cartera', saldo === 4750, `saldo=${saldo}`)

  // ---------- pero NO cuenta como ingreso ----------
  const dash = await req('/api/dashboard')
  const r = dash.json?.resumen
  check('dashboard: ingresos no incluyen el ajuste', r?.ingresos === 0, `ingresos=${r?.ingresos}`)
  check('dashboard: gastos solo el gasto real', r?.gastos === 250, `gastos=${r?.gastos}`)
  check('dashboard: neto = -250', r?.neto === -250, `neto=${r?.neto}`)

  // ---------- reportes ----------
  const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const hasta = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-28`
  const rep = await req(`/api/reportes?desde=${desde}&hasta=${hasta}`)
  if (rep.ok) {
    const movs = rep.json?.transacciones || rep.json?.movimientos || []
    const traeAjuste = movs.some(m => (m.categories?.nombre || m.category?.nombre) === 'Ajuste de saldo')
    check('reportes: el ajuste queda fuera de los movimientos', !traeAjuste, `${movs.length} movimientos`)
  } else {
    check('reportes responde', false, `status ${rep.status}`)
  }

  // ---------- presupuesto: no consume ----------
  const pres = await req('/api/presupuesto', {
    method: 'POST',
    body: JSON.stringify({
      category_id: comida.id, monto_limite: 1000,
      mes: hoy.getMonth() + 1, anio: hoy.getFullYear(),
    }),
  })
  if (pres.ok) {
    // Otro ajuste, esta vez como GASTO y con la misma categoría de la partida.
    await req('/api/transacciones', {
      method: 'POST',
      body: JSON.stringify({
        wallet_id: banco.id, monto: 900, moneda: 'HNL', tipo: 'gasto',
        categoria_sistema: 'Ajuste de saldo', descripcion: 'Ajuste 2', fecha,
      }),
    })
    const pl = await req(`/api/presupuesto?mes=${hoy.getMonth() + 1}&anio=${hoy.getFullYear()}`)
    const partida = (pl.json?.presupuestos || []).find(p => p.category_id === comida.id)
    check('presupuesto: el ajuste no consume la partida',
      partida ? Number(partida.gastado) === 250 : false, `gastado=${partida?.gastado}`)
  } else {
    check('crear presupuesto de prueba', false, `status ${pres.status}`)
  }

  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
