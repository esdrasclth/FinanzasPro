import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { esAjusteSaldo, esMovimientoReal, esSaldoInicial, esTransferencia, montoNormalizado } from './finanzas'

// Reportes descargables de movimientos (PDF y Excel).
//
// Los totales se calculan con las mismas reglas que el resto de la app
// (app/lib/finanzas.ts): las transferencias y los saldos de apertura no son
// ingresos ni gastos, y los montos se expresan en la moneda principal usando la
// tasa sellada en cada movimiento. Antes el reporte sumaba el monto en crudo,
// así que un gasto en dólares se sumaba como si fueran lempiras y el balance no
// cuadraba con el que muestra el Dashboard.

export interface TransaccionExport {
  fecha: string
  tipo: string
  monto: number | string
  moneda?: string | null
  tasa_cambio?: number | string | null
  descripcion?: string | null
  wallet_destino_id?: string | null
  category_id?: string | null
  categories?: { nombre?: string | null } | null
  wallets?: { nombre?: string | null } | null
}

export interface OpcionesReporte {
  desde: string
  hasta: string
  // Cómo se nombra el periodo en portada y nombre de archivo ('Julio 2026').
  etiqueta: string
  moneda: string
  simbolo: string
  tasa: number | null
  // Una línea por filtro activo; van impresas para que el documento se explique solo.
  filtros?: string[]
  autor?: string
  // Cuando la consulta se topó con el tope de resultados.
  truncado?: { mostrados: number; total: number } | null
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function nombreMes(mes: string): string {
  const [anio, m] = mes.split('-')
  return `${MESES[parseInt(m) - 1]} ${anio}`
}

const fmtMonto = (n: number) =>
  new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtFecha = (fecha: string) =>
  new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

const fmtFechaLarga = (fecha: string) =>
  new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Un movimiento puede ser un traspaso entre carteras, la apertura de una
// cartera o un ajuste de saldo; en la tabla se marcan como tales en vez de
// como gasto o ingreso.
const etiquetaTipo = (t: TransaccionExport): string => {
  if (esTransferencia(t)) return 'Transferencia'
  if (esSaldoInicial(t)) return 'Saldo inicial'
  if (esAjusteSaldo(t)) return 'Ajuste de saldo'
  return capitalizar(t.tipo || '')
}

const esReal = esMovimientoReal

export interface LineaAgrupada {
  nombre: string
  ingresos: number
  gastos: number
  cantidad: number
  // Porcentaje sobre el gasto total del periodo.
  pctGasto: number
}

export interface ResumenReporte {
  ingresos: number
  gastos: number
  balance: number
  cantidad: number
  reales: number
  transferencias: number
  gastoPromedio: number
  diaMasCaro: { fecha: string; monto: number } | null
  porCategoria: LineaAgrupada[]
  porCartera: LineaAgrupada[]
  porMes: LineaAgrupada[]
  // Hay movimientos en una moneda distinta a la principal.
  multimoneda: boolean
}

// Agrupa por una clave y ordena por gasto (y luego ingreso) descendente.
function agrupar(
  trans: TransaccionExport[],
  clave: (t: TransaccionExport) => string,
  opts: OpcionesReporte,
  totalGastos: number
): LineaAgrupada[] {
  const mapa = new Map<string, LineaAgrupada>()
  for (const t of trans) {
    const k = clave(t)
    const linea = mapa.get(k) || { nombre: k, ingresos: 0, gastos: 0, cantidad: 0, pctGasto: 0 }
    const monto = montoNormalizado(t, opts.moneda, opts.tasa)
    if (t.tipo === 'ingreso') linea.ingresos += monto
    else linea.gastos += monto
    linea.cantidad++
    mapa.set(k, linea)
  }
  return [...mapa.values()]
    .map(l => ({ ...l, pctGasto: totalGastos > 0 ? (l.gastos / totalGastos) * 100 : 0 }))
    .sort((a, b) => (b.gastos - a.gastos) || (b.ingresos - a.ingresos))
}

export function calcularResumen(trans: TransaccionExport[], opts: OpcionesReporte): ResumenReporte {
  const reales = trans.filter(esReal)
  const monto = (t: TransaccionExport) => montoNormalizado(t, opts.moneda, opts.tasa)

  const ingresos = reales.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + monto(t), 0)
  const soloGastos = reales.filter(t => t.tipo === 'gasto')
  const gastos = soloGastos.reduce((s, t) => s + monto(t), 0)

  // El día con más gasto del periodo: ubica de un vistazo el pico del mes.
  const porDia = new Map<string, number>()
  for (const t of soloGastos) porDia.set(t.fecha, (porDia.get(t.fecha) || 0) + monto(t))
  let diaMasCaro: { fecha: string; monto: number } | null = null
  for (const [fecha, m] of porDia) {
    if (!diaMasCaro || m > diaMasCaro.monto) diaMasCaro = { fecha, monto: m }
  }

  return {
    ingresos,
    gastos,
    balance: ingresos - gastos,
    cantidad: trans.length,
    reales: reales.length,
    transferencias: trans.length - reales.length,
    gastoPromedio: soloGastos.length > 0 ? gastos / soloGastos.length : 0,
    diaMasCaro,
    porCategoria: agrupar(reales, t => t.categories?.nombre || 'Sin categoría', opts, gastos),
    porCartera: agrupar(reales, t => t.wallets?.nombre || 'Sin cartera', opts, gastos),
    // Se agrupa por 'YYYY-MM', que ordena cronológicamente, y solo al final se
    // cambia por el nombre del mes: por nombre quedaba Agosto, Julio, Junio.
    porMes: agrupar(reales, t => t.fecha.slice(0, 7), opts, gastos)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(l => ({ ...l, nombre: nombreMes(l.nombre) })),
    multimoneda: trans.some(t => (t.moneda || opts.moneda) !== opts.moneda),
  }
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'periodo'

const nombreArchivo = (opts: OpcionesReporte, ext: string) =>
  `Caudal-movimientos-${slug(opts.etiqueta)}.${ext}`

/* ─────────────────────────────  EXCEL  ───────────────────────────── */

const VERDE = 'FF2C6E49'
const OBSIDIANA = 'FF09090B'
const GRIS_TEXTO = 'FF71717A'
const VERDE_MONTO = 'FF059669'
const ROJO_MONTO = 'FFEF4444'
const ZEBRA = 'FFFAFAFA'
const BORDE = 'FFECECEE'

const bordeFino = {
  top: { style: 'thin' as const, color: { argb: BORDE } },
  left: { style: 'thin' as const, color: { argb: BORDE } },
  bottom: { style: 'thin' as const, color: { argb: BORDE } },
  right: { style: 'thin' as const, color: { argb: BORDE } },
}

// Encabezado de tabla con el verde de la marca.
function estilarCabecera(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    cell.alignment = { vertical: 'middle' }
    cell.border = bordeFino
  })
  row.height = 22
}

export async function exportarExcel(
  trans: TransaccionExport[],
  opts: OpcionesReporte
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Caudal'
  wb.lastModifiedBy = opts.autor || 'Caudal'
  wb.created = new Date()
  wb.title = `Movimientos · ${opts.etiqueta}`

  const r = calcularResumen(trans, opts)
  // Sin `[Red]`: ese código de formato pisaría el color de la fuente, y aquí el
  // color lo decide el tipo de movimiento (gris para los traspasos).
  const fmtM = `"${opts.simbolo}"#,##0.00;-"${opts.simbolo}"#,##0.00`

  /* --- Hoja 1: Resumen --- */
  const res = wb.addWorksheet('Resumen', {
    properties: { defaultRowHeight: 16 },
    views: [{ showGridLines: false }],
  })
  res.columns = [
    { key: 'a', width: 30 }, { key: 'b', width: 18 }, { key: 'c', width: 18 },
    { key: 'd', width: 14 }, { key: 'e', width: 12 },
  ]

  res.mergeCells('A1:E1')
  const tit = res.getCell('A1')
  tit.value = 'Caudal · Reporte de movimientos'
  tit.font = { size: 18, bold: true, color: { argb: OBSIDIANA } }
  res.getRow(1).height = 30

  res.mergeCells('A2:E2')
  const sub = res.getCell('A2')
  sub.value = `${opts.etiqueta}  ·  ${fmtFechaLarga(opts.desde)} — ${fmtFechaLarga(opts.hasta)}`
  sub.font = { size: 11, color: { argb: GRIS_TEXTO } }

  res.mergeCells('A3:E3')
  const gen = res.getCell('A3')
  gen.value = `Generado el ${new Date().toLocaleDateString('es-HN')}${opts.autor ? ` · ${opts.autor}` : ''} · Moneda: ${opts.moneda}`
  gen.font = { size: 10, color: { argb: GRIS_TEXTO } }

  let fila = 5
  if (opts.filtros?.length) {
    res.getCell(`A${fila}`).value = 'Filtros aplicados'
    res.getCell(`A${fila}`).font = { bold: true, size: 10, color: { argb: OBSIDIANA } }
    fila++
    for (const f of opts.filtros) {
      res.getCell(`A${fila}`).value = `• ${f}`
      res.getCell(`A${fila}`).font = { size: 10, color: { argb: GRIS_TEXTO } }
      fila++
    }
    fila++
  }
  if (opts.truncado) {
    res.mergeCells(`A${fila}:E${fila}`)
    const av = res.getCell(`A${fila}`)
    av.value = `Atención: el periodo tiene ${opts.truncado.total} movimientos y el reporte incluye los ${opts.truncado.mostrados} más recientes.`
    av.font = { size: 10, bold: true, color: { argb: 'FFB45309' } }
    fila += 2
  }

  // Indicadores
  const kpis: [string, number, string][] = [
    ['Ingresos', r.ingresos, VERDE_MONTO],
    ['Gastos', r.gastos, ROJO_MONTO],
    ['Balance', r.balance, r.balance >= 0 ? VERDE_MONTO : ROJO_MONTO],
    ['Gasto promedio', r.gastoPromedio, GRIS_TEXTO],
  ]
  for (const [label, valor, color] of kpis) {
    const lc = res.getCell(`A${fila}`)
    lc.value = label
    lc.font = { bold: true, color: { argb: 'FF3F3F46' }, size: 11 }
    const vc = res.getCell(`B${fila}`)
    vc.value = valor
    vc.numFmt = fmtM
    vc.font = { bold: true, size: 12, color: { argb: color } }
    fila++
  }

  const conteos: [string, string | number][] = [
    ['Movimientos exportados', r.cantidad],
    ['Ingresos y gastos', r.reales],
    ['Transferencias y aperturas', r.transferencias],
  ]
  if (r.diaMasCaro) {
    conteos.push(['Día de mayor gasto', `${fmtFecha(r.diaMasCaro.fecha)} · ${opts.simbolo}${fmtMonto(r.diaMasCaro.monto)}`])
  }
  fila++
  for (const [label, valor] of conteos) {
    res.getCell(`A${fila}`).value = label
    res.getCell(`A${fila}`).font = { color: { argb: GRIS_TEXTO }, size: 10 }
    res.getCell(`B${fila}`).value = valor
    res.getCell(`B${fila}`).font = { bold: true, size: 10 }
    fila++
  }

  /* --- Hoja 2: Movimientos --- */
  const ws = wb.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] })
  const columnas: Partial<ExcelJS.Column>[] = [
    { header: 'Fecha', key: 'fecha', width: 13 },
    { header: 'Tipo', key: 'tipo', width: 15 },
    { header: 'Categoría', key: 'categoria', width: 22 },
    { header: 'Descripción', key: 'descripcion', width: 38 },
    { header: 'Cartera', key: 'cartera', width: 20 },
  ]
  if (r.multimoneda) {
    columnas.push(
      { header: 'Moneda', key: 'monedaOrig', width: 10 },
      { header: 'Monto original', key: 'montoOrig', width: 16 },
    )
  }
  columnas.push({ header: `Monto (${opts.moneda})`, key: 'monto', width: 17 })
  ws.columns = columnas

  estilarCabecera(ws.getRow(1))

  trans.forEach((t, i) => {
    const normalizado = montoNormalizado(t, opts.moneda, opts.tasa)
    const signo = t.tipo === 'gasto' ? -1 : 1
    const row = ws.addRow({
      // Fecha real, no texto: así Excel la ordena y filtra como fecha.
      fecha: new Date(t.fecha + 'T12:00:00'),
      tipo: etiquetaTipo(t),
      categoria: t.categories?.nombre || '—',
      descripcion: t.descripcion || '—',
      cartera: t.wallets?.nombre || '—',
      monedaOrig: t.moneda || opts.moneda,
      montoOrig: signo * Number(t.monto),
      monto: signo * normalizado,
    })
    row.getCell('fecha').numFmt = 'dd/mm/yyyy'
    const mc = row.getCell('monto')
    mc.numFmt = fmtM
    // Un traspaso mueve dinero entre carteras: lleva signo porque indica la
    // dirección, pero en gris, porque no es un ingreso ni un gasto.
    mc.font = {
      bold: true,
      color: {
        argb: !esReal(t) ? 'FF71717A' : t.tipo === 'ingreso' ? VERDE_MONTO : ROJO_MONTO,
      },
    }
    if (r.multimoneda) row.getCell('montoOrig').numFmt = '#,##0.00'
    if (i % 2 === 1) {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } } })
    }
    row.eachCell(c => { c.border = bordeFino; c.alignment = { vertical: 'middle', wrapText: false } })
  })

  // Totales al pie, con fórmula: si se filtra en Excel el número sigue vivo.
  const ultima = ws.rowCount
  if (trans.length > 0) {
    const colMonto = ws.getColumn('monto').letter
    const total = ws.addRow({})
    total.getCell(1).value = 'TOTAL'
    total.getCell(ws.getColumn('monto').number).value = {
      formula: `SUM(${colMonto}2:${colMonto}${ultima})`,
    } as ExcelJS.CellFormulaValue
    total.getCell(ws.getColumn('monto').number).numFmt = fmtM
    total.eachCell(c => {
      c.font = { bold: true, size: 11 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } }
      c.border = bordeFino
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ultima, column: ws.columnCount } }
  }

  /* --- Hojas 3 y 4: los agregados --- */
  const hojaAgrupada = (nombre: string, etiqueta: string, lineas: LineaAgrupada[]) => {
    if (lineas.length === 0) return
    const h = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
    h.columns = [
      { header: etiqueta, key: 'nombre', width: 30 },
      { header: `Gastos (${opts.moneda})`, key: 'gastos', width: 17 },
      { header: `Ingresos (${opts.moneda})`, key: 'ingresos', width: 17 },
      { header: '% del gasto', key: 'pct', width: 13 },
      { header: 'Movimientos', key: 'cantidad', width: 14 },
    ]
    estilarCabecera(h.getRow(1))
    lineas.forEach((l, i) => {
      const row = h.addRow({
        nombre: l.nombre,
        gastos: l.gastos,
        ingresos: l.ingresos,
        pct: l.pctGasto / 100,
        cantidad: l.cantidad,
      })
      row.getCell('gastos').numFmt = fmtM
      row.getCell('ingresos').numFmt = fmtM
      row.getCell('pct').numFmt = '0.0%'
      if (i % 2 === 1) {
        row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } } })
      }
      row.eachCell(c => { c.border = bordeFino })
    })
    const total = h.addRow({
      nombre: 'TOTAL',
      gastos: lineas.reduce((s, l) => s + l.gastos, 0),
      ingresos: lineas.reduce((s, l) => s + l.ingresos, 0),
      cantidad: lineas.reduce((s, l) => s + l.cantidad, 0),
    })
    total.getCell('gastos').numFmt = fmtM
    total.getCell('ingresos').numFmt = fmtM
    total.eachCell(c => {
      c.font = { bold: true }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } }
      c.border = bordeFino
    })
  }
  hojaAgrupada('Por categoría', 'Categoría', r.porCategoria)
  hojaAgrupada('Por cartera', 'Cartera', r.porCartera)
  if (r.porMes.length > 1) hojaAgrupada('Por mes', 'Mes', r.porMes)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  descargarBlob(blob, nombreArchivo(opts, 'xlsx'))
}

/* ──────────────────────────────  PDF  ────────────────────────────── */

const C_OBSIDIANA: [number, number, number] = [9, 9, 11]
const C_VERDE: [number, number, number] = [44, 110, 73]
const C_INGRESO: [number, number, number] = [5, 150, 105]
const C_GASTO: [number, number, number] = [239, 68, 68]
const C_GRIS: [number, number, number] = [113, 113, 122]
const C_BORDE: [number, number, number] = [230, 230, 233]
const C_ZEBRA: [number, number, number] = [250, 250, 251]

export function exportarPdf(trans: TransaccionExport[], opts: OpcionesReporte) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const r = calcularResumen(trans, opts)
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const M = 40

  doc.setProperties({
    title: `Caudal · Movimientos ${opts.etiqueta}`,
    subject: `Reporte de movimientos del ${opts.desde} al ${opts.hasta}`,
    author: opts.autor || 'Caudal',
    creator: 'Caudal',
  })

  const dinero = (n: number) => `${opts.simbolo}${fmtMonto(n)}`

  /* --- Portada del reporte --- */
  const altoBanda = 118
  doc.setFillColor(...C_OBSIDIANA)
  doc.rect(0, 0, ancho, altoBanda, 'F')
  // Filo verde de la marca al pie de la banda.
  doc.setFillColor(...C_VERDE)
  doc.rect(0, altoBanda - 4, ancho, 4, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('Caudal', M, 46)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 158)
  doc.text('Reporte de movimientos', M, 62)

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(opts.etiqueta, M, 92)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(160, 160, 170)
  doc.text(`${fmtFechaLarga(opts.desde)} — ${fmtFechaLarga(opts.hasta)}`, M, 106)

  doc.setFontSize(9)
  doc.setTextColor(180, 180, 188)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-HN')}`, ancho - M, 46, { align: 'right' })
  if (opts.autor) doc.text(opts.autor, ancho - M, 60, { align: 'right' })
  doc.text(`${r.cantidad} ${r.cantidad === 1 ? 'movimiento' : 'movimientos'}`, ancho - M, 92, { align: 'right' })
  doc.text(`Moneda: ${opts.moneda}`, ancho - M, 106, { align: 'right' })

  let y = altoBanda + 26

  /* --- Indicadores --- */
  const anchoUtil = ancho - M * 2
  const hueco = 10
  const wCaja = (anchoUtil - hueco * 3) / 4
  const caja = (i: number, label: string, valor: string, color: [number, number, number], nota?: string) => {
    const x = M + (wCaja + hueco) * i
    doc.setDrawColor(...C_BORDE)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, wCaja, 66, 7, 7, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C_GRIS)
    doc.text(label.toUpperCase(), x + 11, y + 19)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...color)
    doc.text(valor, x + 11, y + 40)
    if (nota) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...C_GRIS)
      doc.text(nota, x + 11, y + 55)
    }
  }
  caja(0, 'Ingresos', dinero(r.ingresos), C_INGRESO, `${r.porCategoria.filter(c => c.ingresos > 0).length} categorías`)
  caja(1, 'Gastos', dinero(r.gastos), C_GASTO, `${r.porCategoria.filter(c => c.gastos > 0).length} categorías`)
  caja(2, 'Balance', dinero(r.balance), r.balance >= 0 ? C_INGRESO : C_GASTO, r.balance >= 0 ? 'Ahorro del periodo' : 'Déficit del periodo')
  caja(3, 'Gasto promedio', dinero(r.gastoPromedio), C_OBSIDIANA, `${r.reales} movimientos reales`)
  y += 66 + 22

  /* --- Filtros y avisos --- */
  const notas: string[] = []
  if (opts.filtros?.length) notas.push(`Filtros: ${opts.filtros.join(' · ')}`)
  if (r.transferencias > 0) {
    notas.push(`${r.transferencias} ${r.transferencias === 1 ? 'traspaso o apertura no cuenta' : 'traspasos o aperturas no cuentan'} como ingreso ni gasto.`)
  }
  if (r.diaMasCaro) notas.push(`Día de mayor gasto: ${fmtFechaLarga(r.diaMasCaro.fecha)} (${dinero(r.diaMasCaro.monto)}).`)
  if (opts.truncado) {
    notas.push(`El periodo tiene ${opts.truncado.total} movimientos; el reporte incluye los ${opts.truncado.mostrados} más recientes.`)
  }
  if (notas.length > 0) {
    const lineas = notas.flatMap(n => doc.splitTextToSize(n, anchoUtil - 24) as string[])
    const hCaja = 14 + lineas.length * 11
    doc.setFillColor(249, 250, 251)
    doc.setDrawColor(...C_BORDE)
    doc.roundedRect(M, y, anchoUtil, hCaja, 6, 6, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C_GRIS)
    lineas.forEach((l, i) => doc.text(l, M + 12, y + 16 + i * 11))
    y += hCaja + 20
  }

  /* --- Tablas de resumen --- */
  const comunes = {
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: C_BORDE, lineWidth: 0.5 },
    headStyles: { fillColor: C_VERDE, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: C_ZEBRA },
    margin: { left: M, right: M },
  }

  const titulo = (texto: string, yy: number) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...C_OBSIDIANA)
    doc.text(texto, M, yy)
  }

  // Con pocas categorías la tabla completa cabe; con muchas se agrupa la cola
  // para que el resumen siga siendo legible de un vistazo.
  const TOPE = 12
  const catsVisibles = r.porCategoria.slice(0, TOPE)
  const catsResto = r.porCategoria.slice(TOPE)
  const filaResto = catsResto.reduce(
    (a, c) => ({
      nombre: `Otras ${catsResto.length} categorías`,
      gastos: a.gastos + c.gastos,
      ingresos: a.ingresos + c.ingresos,
      cantidad: a.cantidad + c.cantidad,
      pctGasto: a.pctGasto + c.pctGasto,
    }),
    { nombre: '', gastos: 0, ingresos: 0, cantidad: 0, pctGasto: 0 }
  )

  if (r.porCategoria.length > 0) {
    titulo('Resumen por categoría', y)
    autoTable(doc, {
      ...comunes,
      startY: y + 10,
      head: [['Categoría', 'Movs.', `Gastos (${opts.moneda})`, `Ingresos (${opts.moneda})`, '% del gasto']],
      body: [...catsVisibles, ...(catsResto.length > 0 ? [filaResto] : [])].map(c => [
        c.nombre,
        String(c.cantidad),
        c.gastos > 0 ? fmtMonto(c.gastos) : '—',
        c.ingresos > 0 ? fmtMonto(c.ingresos) : '—',
        c.gastos > 0 ? `${c.pctGasto.toFixed(1)} %` : '—',
      ]),
      foot: [['Total', String(r.reales), fmtMonto(r.gastos), fmtMonto(r.ingresos), '100.0 %']],
      footStyles: { fillColor: [244, 244, 245], textColor: C_OBSIDIANA, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right', cellWidth: 44 },
        2: { halign: 'right', cellWidth: 82 },
        3: { halign: 'right', cellWidth: 82 },
        4: { halign: 'right', cellWidth: 66 },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 24
  }

  const espacio = (necesario: number) => {
    if (y + necesario > alto - 60) {
      doc.addPage()
      y = 52
    }
  }

  if (r.porCartera.length > 0) {
    espacio(120)
    titulo('Resumen por cartera', y)
    autoTable(doc, {
      ...comunes,
      startY: y + 10,
      head: [['Cartera', 'Movs.', `Gastos (${opts.moneda})`, `Ingresos (${opts.moneda})`, `Neto (${opts.moneda})`]],
      body: r.porCartera.map(c => [
        c.nombre,
        String(c.cantidad),
        c.gastos > 0 ? fmtMonto(c.gastos) : '—',
        c.ingresos > 0 ? fmtMonto(c.ingresos) : '—',
        fmtMonto(c.ingresos - c.gastos),
      ]),
      columnStyles: {
        1: { halign: 'right', cellWidth: 44 },
        2: { halign: 'right', cellWidth: 82 },
        3: { halign: 'right', cellWidth: 82 },
        4: { halign: 'right', cellWidth: 82 },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 24
  }

  // Solo aporta cuando el periodo abarca más de un mes.
  if (r.porMes.length > 1) {
    espacio(120)
    titulo('Evolución por mes', y)
    autoTable(doc, {
      ...comunes,
      startY: y + 10,
      head: [['Mes', 'Movs.', `Ingresos (${opts.moneda})`, `Gastos (${opts.moneda})`, `Balance (${opts.moneda})`]],
      body: r.porMes
        .map(m => [
          m.nombre,
          String(m.cantidad),
          fmtMonto(m.ingresos),
          fmtMonto(m.gastos),
          fmtMonto(m.ingresos - m.gastos),
        ]),
      columnStyles: {
        1: { halign: 'right', cellWidth: 44 },
        2: { halign: 'right', cellWidth: 82 },
        3: { halign: 'right', cellWidth: 82 },
        4: { halign: 'right', cellWidth: 82 },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 24
  }

  /* --- Detalle --- */
  espacio(140)
  titulo('Detalle de movimientos', y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C_GRIS)
  doc.text('Los importes en negativo son salidas de dinero.', M, y + 12)

  const cabecera = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Cartera']
  if (r.multimoneda) cabecera.push('Original')
  cabecera.push(`Monto (${opts.moneda})`)

  autoTable(doc, {
    ...comunes,
    startY: y + 22,
    head: [cabecera],
    body: trans.map(t => {
      const normalizado = montoNormalizado(t, opts.moneda, opts.tasa)
      const signo = t.tipo === 'gasto' ? '-' : '+'
      const fila = [
        fmtFecha(t.fecha),
        etiquetaTipo(t),
        t.categories?.nombre || '—',
        t.descripcion || '—',
        t.wallets?.nombre || '—',
      ]
      if (r.multimoneda) {
        fila.push((t.moneda || opts.moneda) === opts.moneda ? '—' : `${t.moneda} ${fmtMonto(Number(t.monto))}`)
      }
      fila.push(`${signo}${opts.simbolo}${fmtMonto(normalizado)}`)
      return fila
    }),
    styles: { ...comunes.styles, fontSize: 8, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 54 },
      1: { cellWidth: 60 },
      2: { cellWidth: 76 },
      4: { cellWidth: 68 },
      [cabecera.length - 1]: { halign: 'right', cellWidth: 76, fontStyle: 'bold' },
    },
    // Verde para lo que entra, rojo para lo que sale y gris para lo que solo
    // cambia de cartera, que es lo que dice la nota de la portada.
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== cabecera.length - 1) return
      const t = trans[data.row.index]
      if (!t) return
      if (!esReal(t)) data.cell.styles.textColor = C_GRIS
      else if (t.tipo === 'ingreso') data.cell.styles.textColor = C_INGRESO
      else if (t.tipo === 'gasto') data.cell.styles.textColor = C_GASTO
    },
  })

  /* --- Pie en todas las páginas --- */
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...C_BORDE)
    doc.line(M, alto - 34, ancho - M, alto - 34)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C_GRIS)
    doc.text(`Caudal · ${opts.etiqueta}`, M, alto - 20)
    doc.text(`Página ${i} de ${paginas}`, ancho - M, alto - 20, { align: 'right' })
  }

  doc.save(nombreArchivo(opts, 'pdf'))
}
