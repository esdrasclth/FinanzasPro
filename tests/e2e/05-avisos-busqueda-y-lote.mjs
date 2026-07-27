// Avisos descartables, búsqueda global, duplicar, lote y recurrentes de ingreso.
const BASE = process.env.BASE_URL || 'http://localhost:3000'
let cookie = ''
const log = []
let fallos = 0
const check = (n, c, d = '') => { if (!c) fallos++; log.push(`${c ? '  OK  ' : ' FALLA'} | ${n}${d ? ' -> ' + d : ''}`) }

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
const sel = async (t, f = []) => (await db(t, 'select', { filters: f }))?.data || []
const eqf = (c, v) => ({ type: 'eq', column: c, value: v })

async function main() {
  await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `e2e5-${Date.now()}@t.local`, password: 'prueba123', nombre: 'E2E5' }) })
  const yo = (await req('/api/auth/session')).json.user.id
  await db('profiles', 'upsert', { payload: { id: yo, nombre: 'E2E5', moneda_default: 'HNL', onboarding_completado: true } })
  check('sesion lista', !!cookie)

  const w = (await db('wallets', 'insert', { single: true, payload: { nombre: 'Banco', tipo: 'banco', moneda: 'HNL', saldo_inicial: 0, activo: true } }))?.data
  const cat = (await db('categories', 'insert', { single: true, payload: { nombre: 'Comida', tipo: 'gasto', icono: '🍔' } }))?.data
  const cat2 = (await db('categories', 'insert', { single: true, payload: { nombre: 'Transporte', tipo: 'gasto', icono: '🚗' } }))?.data

  const hoy = new Date()
  const mes = hoy.getMonth() + 1, anio = hoy.getFullYear()
  const dd = n => String(n).padStart(2, '0')
  const hoyISO = `${anio}-${dd(mes)}-${dd(hoy.getDate())}`

  // ---------- 1) Avisos descartables ----------
  await db('budgets', 'insert', { payload: { category_id: cat.id, monto_limite: 100, mes, año: anio } })
  await db('transactions', 'insert', { payload: { wallet_id: w.id, category_id: cat.id, monto: 95, tipo: 'gasto', moneda: 'HNL', fecha: hoyISO, descripcion: 'Almuerzo caro' } })

  let av = (await req('/api/notificaciones')).json
  check('avisa presupuesto al 95%', (av?.avisos || []).some(a => a.clave.startsWith('presupuesto:')), `n=${av?.avisos?.length}`)
  const aviso = av.avisos.find(a => a.clave.startsWith('presupuesto:'))

  await req('/api/notificaciones', { method: 'POST', body: JSON.stringify({ clave: aviso.clave, periodo: aviso.periodo }) })
  av = (await req('/api/notificaciones')).json
  check('el aviso descartado desaparece', !(av?.avisos || []).some(a => a.clave === aviso.clave))
  check('se informa cuantos hay descartados', av?.descartados >= 1, `descartados=${av?.descartados}`)

  // Descartar el mismo aviso en OTRO periodo no debe ocultarlo ahora.
  await req('/api/notificaciones', { method: 'DELETE' })
  av = (await req('/api/notificaciones')).json
  check('restaurar los vuelve a mostrar', (av?.avisos || []).some(a => a.clave === aviso.clave))

  // ---------- 2) Búsqueda global ----------
  // Un movimiento de hace meses, fuera del mes en curso.
  await db('transactions', 'insert', { payload: { wallet_id: w.id, category_id: cat.id, monto: 55, tipo: 'gasto', moneda: 'HNL', fecha: '2026-01-14', descripcion: 'Uber al aeropuerto' } })
  await db('transactions', 'insert', { payload: { wallet_id: w.id, category_id: cat2.id, monto: 30, tipo: 'gasto', moneda: 'HNL', fecha: '2026-02-20', descripcion: 'Uber a la oficina' } })

  const b1 = (await req('/api/transacciones/buscar?q=uber')).json
  check('busca en todo el historial', b1?.total === 2, `total=${b1?.total}`)
  check('devuelve los resultados', (b1?.data || []).length === 2)
  check('trae la categoria y la cartera', !!b1?.data?.[0]?.categories && !!b1?.data?.[0]?.wallets)

  const b2 = (await req('/api/transacciones/buscar?q=uber&categoria=Transporte')).json
  check('filtra por categoria', b2?.total === 1, `total=${b2?.total}`)

  const b3 = (await req('/api/transacciones/buscar?q=uber&desde=2026-02-01')).json
  check('filtra por fecha desde', b3?.total === 1, `total=${b3?.total}`)

  const b4 = (await req('/api/transacciones/buscar?q=UBER')).json
  check('la busqueda ignora mayusculas', b4?.total === 2, `total=${b4?.total}`)

  // ---------- 3) Lote: recategorizar y eliminar ----------
  const ids = (b1.data || []).map(t => t.id)
  const rc = await req('/api/transacciones/lote', { method: 'POST', body: JSON.stringify({ accion: 'categorizar', ids, category_id: cat2.id }) })
  check('recategoriza en lote', rc.ok && rc.json?.actualizadas === 2, `n=${rc.json?.actualizadas}`)
  const trasRc = (await req('/api/transacciones/buscar?q=uber&categoria=Transporte')).json
  check('quedaron en la categoria nueva', trasRc?.total === 2, `total=${trasRc?.total}`)

  // Una transferencia no debe recategorizarse.
  const w2 = (await db('wallets', 'insert', { single: true, payload: { nombre: 'Ahorro', tipo: 'ahorro', moneda: 'HNL', saldo_inicial: 0, activo: true } }))?.data
  const tr = await req('/api/transferencias', { method: 'POST', body: JSON.stringify({ wallet_id: w.id, wallet_destino_id: w2.id, monto: 200, fecha: hoyISO }) })
  const rc2 = await req('/api/transacciones/lote', { method: 'POST', body: JSON.stringify({ accion: 'categorizar', ids: [tr.json.salida_id], category_id: cat2.id }) })
  check('no recategoriza transferencias', rc2.json?.actualizadas === 0 && rc2.json?.omitidos === 1, JSON.stringify(rc2.json))

  // Borrado en lote incluyendo las dos piernas de la transferencia.
  const antes = (await sel('transactions')).length
  const del = await req('/api/transacciones/lote', { method: 'POST', body: JSON.stringify({ accion: 'eliminar', ids: [...ids, tr.json.salida_id, tr.json.entrada_id] }) })
  check('borra en lote', del.ok, `status ${del.status}`)
  check('la transferencia cuenta como 2 y no se procesa dos veces', del.json?.eliminadas === 4, `eliminadas=${del.json?.eliminadas}`)
  check('quedan 4 filas menos', (await sel('transactions')).length === antes - 4)

  // ---------- 4) Recurrente de ingreso ----------
  const sub = (await db('subscriptions', 'insert', {
    single: true,
    payload: { nombre: 'Sueldo', tipo: 'ingreso', monto: 20000, moneda: 'HNL', frecuencia: 'mensual', fecha_inicio: '2026-06-01', proximo_cobro: '2026-07-01', estado: 'activa', wallet_id: w.id },
  }))?.data
  check('se guarda el tipo ingreso', sub?.tipo === 'ingreso', `tipo=${sub?.tipo}`)

  const cob = await req(`/api/suscripciones/${sub.id}/cobros`, { method: 'POST', body: JSON.stringify({ fecha: '2026-07-01' }) })
  check('confirma el cobro del recurrente', cob.ok, `status ${cob.status}`)
  const tx = (await sel('transactions', [eqf('id', cob.json?.transaction_id)]))[0]
  check('crea un INGRESO, no un gasto', tx?.tipo === 'ingreso', `tipo=${tx?.tipo}`)
  check('lo describe como ingreso recurrente', (tx?.descripcion || '').startsWith('Ingreso recurrente'), tx?.descripcion)
  check('adelanta el ciclo', cob.json?.proximo_cobro === '2026-08-01', cob.json?.proximo_cobro)

  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1) })
