// Nada se registra en una moneda que no sea la de la cartera.
//
// Un reparto en dólares cobrado en una cartera en lempiras dejaba, cuando no
// había tasa, el monto guardado en USD dentro de esa cartera: la pantalla de
// Carteras acababa mostrando dólares disponibles sin tener ninguna cuenta en
// dólares. Lo mismo pasaba con cualquier par que la app no sabe convertir.
// Ahora esas rutas responden 400 y no escriben nada.
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
  return { st: res.status, txt, j }
}

const email = `sintasa-${Date.now()}@t.local`
await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'prueba123', nombre: 'Sin Tasa' }) })
await req('/api/perfil', { method: 'PUT', body: JSON.stringify({ nombre: 'Sin Tasa', moneda_default: 'HNL' }) })

const cuenta = (await req('/api/carteras', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'Cuenta lempiras', tipo: 'banco', moneda: 'HNL' }),
})).j.cartera

// La app solo cambia entre lempiras y dólares, así que una cartera en euros no
// puede reflejar un reparto en dólares por mucha tasa que haya. Sirve para
// probar el rechazo sin depender de que la base tenga o no tasa cargada.
const euros = (await req('/api/carteras', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'Cuenta euros', tipo: 'banco', moneda: 'EUR' }),
})).j.cartera

const movs = async () => (await req('/api/transacciones/buscar?limit=200')).j?.data || []

// Reparto en dólares: lo pagó otra persona, así que solo se cobra la parte propia.
const reparto = await req('/api/repartos', {
  method: 'POST',
  body: JSON.stringify({
    descripcion: 'Plan de Spotify',
    monto_total: 11.49,
    moneda: 'USD',
    fecha: '2026-07-12',
    metodo: 'igual',
    pagado_por: 'Un amigo',
    metodo_pago: 'tarjeta',
    participantes: [
      { nombre: 'Yo', es_yo: true },
      { nombre: 'Otro', es_yo: false },
    ],
  }),
})
chk('el reparto en dólares se crea', reparto.st === 200, 'st ' + reparto.st + ' ' + (reparto.j?.error || ''))

const detalle = await req(`/api/repartos/${reparto.j.id}`)
const yo = (detalle.j.reparto?.participantes || []).find(p => p.es_yo)
chk('tiene una parte propia', !!yo, JSON.stringify(yo?.monto_asignado))

const antes = (await movs()).length

// Reflejar un monto en dólares dentro de una cartera en euros no se puede.
const aEuros = await req(`/api/repartos/${reparto.j.id}/participantes/${yo.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ pagado: true, wallet_id: euros.id }),
})
chk('un par de monedas no soportado se rechaza', aEuros.st === 400, 'st ' + aEuros.st)
chk('dice por qué', /no se puede convertir/i.test(aEuros.j?.error || ''), aEuros.j?.error)

const despues = await movs()
chk('no se escribió ningún movimiento', despues.length === antes, `${antes} -> ${despues.length}`)
chk('la cartera en euros no quedó con dólares dentro',
  despues.every(t => !(t.wallet_id === euros.id && t.moneda !== 'EUR')),
  JSON.stringify(despues.filter(t => t.wallet_id === euros.id).map(t => t.moneda)))

// Con tasa, la misma operación contra la cartera en lempiras sí entra.
const tasa = await req('/api/tipo-cambio', { method: 'POST', body: JSON.stringify({ tasa: 26 }) })
chk('se puede fijar una tasa manual', tasa.st === 200, 'st ' + tasa.st)

const cobro2 = await req(`/api/repartos/${reparto.j.id}/participantes/${yo.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ pagado: true, wallet_id: cuenta.id }),
})
chk('con tasa el cobro sí se registra', cobro2.st === 200, 'st ' + cobro2.st)

const finales = await movs()
const nuevo = finales.find(t => (t.descripcion || '').startsWith('Mi parte del reparto'))
chk('el movimiento existe', !!nuevo, nuevo?.descripcion)
chk('quedó en la moneda de la cartera', nuevo?.moneda === 'HNL', nuevo?.moneda)
const parte = Number(yo.monto_asignado)
chk('convertido con la tasa fijada', Math.abs(Number(nuevo?.monto) - parte * 26) < 0.02,
  `monto=${nuevo?.monto} esperado=${(parte * 26).toFixed(2)}`)
chk('conserva el monto original en dólares', Math.abs(Number(nuevo?.monto_original) - parte) < 0.01,
  `original=${nuevo?.monto_original} parte=${parte}`)

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`)
process.exit(fallos === 0 ? 0 : 1)
