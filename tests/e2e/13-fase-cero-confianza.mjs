// Regresiones de fase 0: sesiones, precisión monetaria y borrado de cuenta.

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const log = []
let fallos = 0

function check(nombre, condicion, detalle = '') {
  if (!condicion) fallos++
  log.push(`${condicion ? '  OK  ' : ' FALLA'} | ${nombre}${detalle ? ' -> ' + detalle : ''}`)
}

function nuevaSesion() {
  const sesion = { cookie: '' }
  sesion.req = async (path, opts = {}) => {
    const res = await fetch(BASE + path, {
      ...opts,
      redirect: opts.redirect || 'manual',
      headers: {
        'Content-Type': 'application/json',
        ...(sesion.cookie ? { cookie: sesion.cookie } : {}),
        ...(opts.headers || {}),
      },
    })
    for (const c of res.headers.getSetCookie?.() || []) {
      if (c.startsWith('finanzas-pro-session=')) sesion.cookie = c.split(';')[0]
    }
    const texto = await res.text()
    let json = null
    try { json = JSON.parse(texto) } catch {}
    return { status: res.status, ok: res.ok, json, texto }
  }
  sesion.db = async (table, op, extra = {}) =>
    (await sesion.req('/api/db', {
      method: 'POST',
      body: JSON.stringify({ table, op, ...extra }),
    })).json
  return sesion
}

async function main() {
  const sello = Date.now()
  const email = `fase0-${sello}@test.local`
  const ana = nuevaSesion()
  const beto = nuevaSesion()

  // Contratos de UI críticos, visibles incluso antes de hidratar React.
  const login = await ana.req('/login')
  check('login renderiza email y contraseña', login.status === 200 && /correo|email/i.test(login.texto) && /contrase/i.test(login.texto))
  const registro = await ana.req('/registro')
  check('registro renderiza sus campos principales', registro.status === 200 && /nombre/i.test(registro.texto) && /contrase/i.test(registro.texto))

  const alta = await ana.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'prueba123', nombre: 'Ana Fase 0' }),
  })
  check('crea la cuenta y emite sesión', alta.status === 200 && !!ana.cookie)
  await ana.db('profiles', 'upsert', {
    payload: { nombre: 'Ana Fase 0', moneda_default: 'HNL', onboarding_completado: true },
  })

  const perfilHtml = await ana.req('/perfil')
  check('perfil expone cambio y eliminación de cuenta', perfilHtml.status === 200 && /Cambiar contraseña/i.test(perfilHtml.texto) && /Eliminar mi cuenta/i.test(perfilHtml.texto))

  // Reautenticación e invalidación de todos los JWT anteriores.
  const cookieVieja = ana.cookie
  const cambioMalo = await ana.req('/api/auth/update-user', {
    method: 'POST',
    body: JSON.stringify({ current_password: 'incorrecta', password: 'segura456' }),
  })
  check('rechaza cambio sin contraseña actual', cambioMalo.status === 403)

  const cambio = await ana.req('/api/auth/update-user', {
    method: 'POST',
    body: JSON.stringify({ current_password: 'prueba123', password: 'segura456' }),
  })
  check('cambia contraseña y renueva la sesión actual', cambio.status === 200 && ana.cookie !== cookieVieja)

  const sesionRevocada = await fetch(BASE + '/api/perfil', { headers: { cookie: cookieVieja } })
  check('revoca inmediatamente el JWT anterior', sesionRevocada.status === 401, `status=${sesionRevocada.status}`)
  const loginReautenticacion = await fetch(BASE + '/login', {
    redirect: 'manual',
    headers: { cookie: cookieVieja },
  })
  check('una sesión revocada puede volver al login sin bucle', loginReautenticacion.status === 200)
  check('la sesión renovada sigue activa', (await ana.req('/api/perfil')).status === 200)

  // Los Decimal salen de la API como number y conservan las sumas esperadas.
  const cartera = await ana.req('/api/carteras', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Precisión', tipo: 'efectivo', moneda: 'HNL', saldo_inicial: 0.1 }),
  })
  const walletId = cartera.json?.cartera?.id
  check('cartera devuelve importes numéricos', cartera.ok && typeof cartera.json?.cartera?.saldo_inicial === 'number')

  const movimiento = await ana.req('/api/transacciones', {
    method: 'POST',
    body: JSON.stringify({ wallet_id: walletId, monto: 0.2, tipo: 'ingreso', moneda: 'HNL', fecha: '2026-08-28' }),
  })
  check('transacción Decimal se serializa como number', movimiento.ok && typeof movimiento.json?.transaccion?.monto === 'number')
  const saldos = await ana.req('/api/carteras')
  const precisa = saldos.json?.carteras?.find(c => c.id === walletId)
  check('0.1 + 0.2 queda en 0.30', precisa?.saldos?.HNL === 0.3, `saldo=${precisa?.saldos?.HNL}`)

  // Un balance compartido no puede desaparecer al borrar una de las cuentas.
  await beto.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `beto-fase0-${sello}@test.local`, password: 'prueba123', nombre: 'Beto Fase 0' }),
  })
  await beto.db('profiles', 'upsert', {
    payload: { nombre: 'Beto Fase 0', moneda_default: 'HNL', onboarding_completado: true },
  })

  const grupoCreado = await ana.req('/api/grupos', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Grupo preservado', moneda: 'HNL' }),
  })
  const grupoId = grupoCreado.json?.grupo?.id
  const codigo = grupoCreado.json?.grupo?.codigo_invitacion
  await beto.req('/api/grupos/unirse', { method: 'POST', body: JSON.stringify({ codigo }) })
  const detalle = await ana.req(`/api/grupos/${grupoId}`)
  const anaId = detalle.json?.yo
  const betoId = detalle.json?.miembros?.find(m => m.user_id !== anaId)?.user_id

  const gasto = await ana.req(`/api/grupos/${grupoId}/gastos`, {
    method: 'POST',
    body: JSON.stringify({
      descripcion: 'Cena compartida',
      monto_total: 100,
      fecha: '2026-08-28',
      metodo_division: 'exacto',
      pagos: [{ user_id: anaId, monto: 100, wallet_id: walletId }],
      divisiones: [
        { user_id: anaId, valor: 50 },
        { user_id: betoId, valor: 50 },
      ],
    }),
  })
  check('prepara un saldo compartido pendiente', gasto.status === 200)

  const sinFrase = await ana.req('/api/perfil', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'segura456', confirmacion: 'otra cosa' }),
  })
  check('borrado exige la frase explícita', sinFrase.status === 400)
  const malPassword = await ana.req('/api/perfil', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'incorrecta', confirmacion: 'ELIMINAR' }),
  })
  check('borrado exige reautenticación', malPassword.status === 403)

  const borrar = await ana.req('/api/perfil', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'segura456', confirmacion: 'ELIMINAR' }),
  })
  check('elimina y anonimiza la cuenta', borrar.status === 200)
  check('la sesión eliminada ya no accede', (await ana.req('/api/perfil')).status === 401)

  const saldoBeto = await beto.req(`/api/grupos/${grupoId}/saldos`)
  const saldoAnonimo = saldoBeto.json?.saldos?.find(s => s.user_id === anaId)
  const saldoActivo = saldoBeto.json?.saldos?.find(s => s.user_id === betoId)
  check('preserva el balance del miembro eliminado', saldoAnonimo?.nombre === 'Usuario eliminado' && saldoAnonimo?.neto === 50)
  check('el balance del miembro activo sigue cuadrando', saldoActivo?.neto === -50)
  const grupoBeto = await beto.req(`/api/grupos/${grupoId}`)
  check('transfiere la administración al miembro activo', grupoBeto.json?.grupo?.creado_por === betoId)

  const loginBorrado = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'segura456' }),
  })
  check('las credenciales borradas dejan de existir', loginBorrado.status === 401)

  const registroNuevo = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'prueba123', nombre: 'Cuenta nueva' }),
  })
  check('el correo original puede volver a registrarse', registroNuevo.status === 200)

  console.log(log.join('\n'))
  console.log('\n' + (fallos === 0 ? `TODO OK — ${log.length} comprobaciones` : `${fallos} FALLAS de ${log.length} comprobaciones`))
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('ERROR FATAL:', error)
  process.exit(1)
})
