/* Repara movimientos guardados en una moneda distinta a la de su cartera.
 *
 * Hasta el arreglo de `montoParaCartera`, un reparto o un gasto de grupo en otra
 * moneda se registraba en la moneda de origen cuando no había tasa de cambio.
 * La cartera acababa con, por ejemplo, dólares dentro de una cuenta en lempiras,
 * y Carteras los sumaba como disponibles. Eso ya no puede pasar, pero lo que se
 * registró así sigue en la base y hay que convertirlo.
 *
 * Cómo usarlo: abre la app con tu sesión iniciada, abre la consola del navegador
 * (F12 -> Console) y pega este archivo entero. Después:
 *
 *   await reparar.revisar()                  // solo mira, no cambia nada
 *   await reparar.aplicar()                  // convierte con la tasa vigente
 *   await reparar.aplicar({ tasa: 26.9275 }) // o con la que le indiques
 *
 * Deja fuera a propósito:
 *   - Las tarjetas de crédito. Llevan deuda en lempiras y en dólares a la vez
 *     por diseño, así que su saldo en otra moneda es correcto.
 *   - Las transferencias. Son dos filas ligadas y convertir una sola las
 *     descuadra; esas se corrigen desde la app.
 *   - Los pares que la app no sabe convertir (solo hace lempiras <-> dólares).
 */
window.reparar = (() => {
  const api = async (body) => {
    const r = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await r.json()
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error))
    return j.data
  }

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
  const soportado = (a, b) => (a === 'USD' && b === 'HNL') || (a === 'HNL' && b === 'USD')
  const convertir = (monto, origen, destino, tasa) =>
    origen === 'USD' && destino === 'HNL' ? round2(monto * tasa) : round2(monto / tasa)

  async function analizar() {
    const { carteras, archivadas } = await (await fetch('/api/carteras')).json()
    const porId = new Map([...(carteras || []), ...(archivadas || [])].map((c) => [c.id, c]))
    const movimientos = await api({ table: 'transactions', op: 'select' })

    const convertibles = []
    const revisar = []

    for (const t of movimientos) {
      const w = porId.get(t.wallet_id)
      if (!w) continue
      const monedaCartera = w.moneda || 'HNL'
      const monedaMov = t.moneda || monedaCartera
      if (monedaMov === monedaCartera) continue

      const fila = {
        id: t.id,
        fecha: t.fecha,
        descripcion: t.descripcion,
        cartera: w.nombre,
        monedaCartera,
        monedaMov,
        monto: Number(t.monto),
      }

      if (w.tipo === 'credito') {
        revisar.push({ ...fila, motivo: 'tarjeta: su saldo en otra moneda es correcto' })
      } else if (t.transfer_id) {
        revisar.push({ ...fila, motivo: 'parte de una transferencia; corrígela desde la app' })
      } else if (!soportado(monedaMov, monedaCartera)) {
        revisar.push({ ...fila, motivo: `la app no convierte de ${monedaMov} a ${monedaCartera}` })
      } else {
        convertibles.push(fila)
      }
    }
    return { convertibles, revisar }
  }

  async function tasaVigente() {
    const r = await fetch('/api/tipo-cambio')
    if (!r.ok) return null
    return Number((await r.json()).tasa) || null
  }

  return {
    async revisar() {
      const { convertibles, revisar } = await analizar()
      const tasa = await tasaVigente()
      console.log(`Tasa vigente: ${tasa ?? 'NINGUNA — tendrás que indicarla a mano'}`)

      console.log(`\n${convertibles.length} movimiento(s) que se convertirían:`)
      if (convertibles.length) {
        console.table(convertibles.map((c) => ({
          fecha: c.fecha,
          descripcion: c.descripcion,
          cartera: c.cartera,
          actual: `${c.monedaMov} ${c.monto}`,
          quedaría: tasa
            ? `${c.monedaCartera} ${convertir(c.monto, c.monedaMov, c.monedaCartera, tasa)}`
            : '(falta tasa)',
        })))
      }

      if (revisar.length) {
        console.log(`\n${revisar.length} que NO se tocan:`)
        console.table(revisar.map((c) => ({
          fecha: c.fecha,
          descripcion: c.descripcion,
          cartera: c.cartera,
          monto: `${c.monedaMov} ${c.monto}`,
          motivo: c.motivo,
        })))
      }

      if (!convertibles.length && !revisar.length) console.log('Nada que corregir.')
      else if (convertibles.length) console.log('\nSi la primera tabla está bien: await reparar.aplicar()')
      return { convertibles, revisar }
    },

    async aplicar(opts = {}) {
      const { convertibles } = await analizar()
      const tasa = Number(opts.tasa) || (await tasaVigente())
      if (!(tasa > 0)) {
        console.error('No hay tasa. Fija una en la app o pásala: reparar.aplicar({ tasa: 26.93 })')
        return
      }
      if (!convertibles.length) {
        console.log('Nada que convertir.')
        return
      }

      console.log(`Convirtiendo ${convertibles.length} movimiento(s) con tasa ${tasa}...`)
      for (const c of convertibles) {
        const nuevo = convertir(c.monto, c.monedaMov, c.monedaCartera, tasa)
        await api({
          table: 'transactions',
          op: 'update',
          filters: [{ type: 'eq', column: 'id', value: c.id }],
          // Queda constancia de en qué moneda y por cuánto entró de verdad.
          payload: {
            monto: nuevo,
            moneda: c.monedaCartera,
            monto_original: c.monto,
            tasa_cambio: tasa,
          },
        })
        console.log(`  ${c.descripcion}: ${c.monedaMov} ${c.monto} -> ${c.monedaCartera} ${nuevo}`)
      }
      console.log(`\nListo. Recarga Carteras para verlo.`)
      return convertibles.length
    },
  }
})()
console.log('Cargado. Empieza con: await reparar.revisar()')
