import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Documento de liquidación de repartos: el desglose de gastos del periodo, el
// total, lo que le toca a cada persona y quién le paga a quién.
//
// Está pensado para compartirse tal cual con el grupo, así que evita jerga y
// deja explícito de dónde sale cada número.

export interface LineaGastoDoc {
  fecha: string
  descripcion: string
  lugar: string
  monto: number
  moneda: string
  pagadoPor: string
  metodo: string
  reparto: string
  participantes: { nombre: string; monto: number; pagado: boolean }[]
}

export interface ReporteDoc {
  desde: string
  hasta: string
  // Presente cuando el documento es de un solo reparto.
  titulo?: string
  moneda: string
  gastos: LineaGastoDoc[]
  total: number
  saldos: { nombre: string; puso: number; leToca: number; neto: number }[]
  traspasos: { de: string; a: string; monto: number }[]
  yo: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fecha = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })

// Un solo reparto se identifica por su concepto y su fecha; un periodo, por el
// rango de fechas.
const periodo = (r: ReporteDoc) =>
  r.titulo ? `${r.titulo} · ${fecha(r.desde)}` : `Del ${fecha(r.desde)} al ${fecha(r.hasta)}`

const esUnico = (r: ReporteDoc) => !!r.titulo

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'reparto'

// "Le deben" / "Debe", que es como se lee de un vistazo.
const estado = (neto: number, simbolo: string) => {
  if (Math.abs(neto) < 0.005) return 'Al día'
  return neto > 0 ? `Le deben ${simbolo}${fmt(neto)}` : `Debe ${simbolo}${fmt(-neto)}`
}

const nombreArchivo = (r: ReporteDoc, ext: string) =>
  esUnico(r)
    ? `reparto-${slug(r.titulo!)}-${r.desde}.${ext}`
    : `liquidacion-${r.desde}-a-${r.hasta}.${ext}`

export async function liquidacionExcel(r: ReporteDoc, simbolo = 'L') {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Caudal'
  wb.created = new Date()

  // --- Hoja 1: los gastos, uno por fila ---
  const hoja = wb.addWorksheet('Gastos')
  hoja.columns = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Concepto', key: 'desc', width: 28 },
    { header: 'Lugar', key: 'lugar', width: 22 },
    { header: 'Pagó', key: 'pago', width: 18 },
    { header: 'Método', key: 'metodo', width: 26 },
    { header: 'Reparto', key: 'reparto', width: 18 },
    { header: `Monto (${r.moneda})`, key: 'monto', width: 16 },
  ]

  r.gastos.forEach(g => {
    hoja.addRow({
      fecha: fecha(g.fecha),
      desc: g.descripcion,
      lugar: g.lugar,
      pago: g.pagadoPor,
      metodo: g.metodo,
      reparto: g.reparto,
      monto: g.monto,
    })
  })

  hoja.addRow({})
  const fTotal = hoja.addRow({ reparto: 'TOTAL', monto: r.total })
  fTotal.font = { bold: true }

  hoja.getRow(1).font = { bold: true }
  hoja.getColumn('monto').numFmt = '#,##0.00'

  // --- Hoja 2: el detalle por persona de cada gasto (sobra si es uno solo) ---
  if (!esUnico(r)) {
  const det = wb.addWorksheet('Detalle por persona')
  det.columns = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Concepto', key: 'desc', width: 32 },
    { header: 'Persona', key: 'quien', width: 20 },
    { header: `Le toca (${r.moneda})`, key: 'monto', width: 16 },
    { header: 'Saldado', key: 'pagado', width: 12 },
  ]
  r.gastos.forEach(g => {
    g.participantes.forEach(p => {
      det.addRow({
        fecha: fecha(g.fecha),
        desc: g.descripcion,
        quien: p.nombre,
        monto: p.monto,
        pagado: p.pagado ? 'Sí' : 'No',
      })
    })
  })
  det.getRow(1).font = { bold: true }
  det.getColumn('monto').numFmt = '#,##0.00'
  }

  // --- Hoja 3: el resumen que se comparte ---
  const res = wb.addWorksheet('Resumen')
  res.columns = [
    { header: 'Persona', key: 'quien', width: 22 },
    { header: `Puso (${r.moneda})`, key: 'puso', width: 16 },
    { header: `Le toca (${r.moneda})`, key: 'toca', width: 16 },
    { header: 'Situación', key: 'estado', width: 26 },
  ]
  r.saldos.forEach(s => {
    res.addRow({ quien: s.nombre, puso: s.puso, toca: s.leToca, estado: estado(s.neto, simbolo) })
  })
  res.getRow(1).font = { bold: true }
  res.getColumn('puso').numFmt = '#,##0.00'
  res.getColumn('toca').numFmt = '#,##0.00'

  if (r.traspasos.length > 0) {
    res.addRow({})
    const t = res.addRow({ quien: 'Para quedar a mano' })
    t.font = { bold: true }
    r.traspasos.forEach(x => {
      res.addRow({ quien: `${x.de} → ${x.a}`, puso: x.monto })
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo(r, 'xlsx'))
}

export function liquidacionPdf(r: ReporteDoc, simbolo = 'L') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.text(esUnico(r) ? 'Detalle del reparto' : 'Liquidación de gastos compartidos', 40, 48)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(periodo(r), 40, 66)
  doc.text(`${r.gastos.length} ${r.gastos.length === 1 ? 'gasto' : 'gastos'} · Total ${simbolo}${fmt(r.total)}`, 40, 80)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 100,
    head: [['Fecha', 'Concepto', 'Lugar', 'Pagó', 'Método', `Monto (${r.moneda})`]],
    body: r.gastos.map(g => [fecha(g.fecha), g.descripcion, g.lugar || '—', g.pagadoPor, g.metodo, fmt(g.monto)]),
    foot: [['', '', '', '', 'TOTAL', fmt(r.total)]],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [44, 110, 73] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 5: { halign: 'right' } },
  })

  // Resumen por persona
  let y = (doc as any).lastAutoTable.finalY + 28
  if (y > doc.internal.pageSize.getHeight() - 160) {
    doc.addPage()
    y = 48
  }
  doc.setFontSize(12)
  doc.text('Lo que le toca a cada quien', 40, y)

  autoTable(doc, {
    startY: y + 12,
    head: [['Persona', `Puso (${r.moneda})`, `Le toca (${r.moneda})`, 'Situación']],
    body: r.saldos.map(s => [s.nombre, fmt(s.puso), fmt(s.leToca), estado(s.neto, simbolo)]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [44, 110, 73] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })

  if (r.traspasos.length > 0) {
    let y2 = (doc as any).lastAutoTable.finalY + 28
    if (y2 > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage()
      y2 = 48
    }
    doc.setFontSize(12)
    doc.text('Para quedar a mano', 40, y2)
    autoTable(doc, {
      startY: y2 + 12,
      head: [['Paga', 'Recibe', `Monto (${r.moneda})`]],
      body: r.traspasos.map(t => [t.de, t.a, fmt(t.monto)]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [44, 110, 73] },
      columnStyles: { 2: { halign: 'right' } },
    })
  }

  // Con un solo reparto, el resumen por persona ya contiene todo: repetir el
  // detalle sería decir lo mismo dos veces.
  if (!esUnico(r)) {
  // Desglose de quién participa en cada gasto, al final para no romper la
  // lectura del resumen.
  doc.addPage()
  doc.setFontSize(12)
  doc.text('Detalle de cada gasto', 40, 48)
  autoTable(doc, {
    startY: 62,
    head: [['Fecha', 'Concepto', 'Persona', `Le toca (${r.moneda})`, 'Saldado']],
    body: r.gastos.flatMap(g =>
      g.participantes.map(p => [fecha(g.fecha), g.descripcion, p.nombre, fmt(p.monto), p.pagado ? 'Sí' : 'No'])
    ),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [44, 110, 73] },
    columnStyles: { 3: { halign: 'right' } },
  })
  }

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(`Generado con Caudal · ${i} de ${paginas}`, ancho - 40, doc.internal.pageSize.getHeight() - 24, { align: 'right' })
  }

  doc.save(nombreArchivo(r, 'pdf'))
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
