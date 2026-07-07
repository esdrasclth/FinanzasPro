import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface TransaccionExport {
  fecha: string
  tipo: string
  monto: number | string
  descripcion?: string | null
  categories?: { nombre?: string | null } | null
  wallets?: { nombre?: string | null } | null
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function nombreMes(mes: string): string {
  const [anio, m] = mes.split('-')
  return `${MESES[parseInt(m) - 1]} ${anio}`
}

function fmtMonto(n: number): string {
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

interface Resumen {
  ingresos: number
  gastos: number
  balance: number
  cantidad: number
}

function calcularResumen(trans: TransaccionExport[]): Resumen {
  const ingresos = trans
    .filter(t => t.tipo === 'ingreso')
    .reduce((s, t) => s + Number(t.monto), 0)
  const gastos = trans
    .filter(t => t.tipo === 'gasto')
    .reduce((s, t) => s + Number(t.monto), 0)
  return { ingresos, gastos, balance: ingresos - gastos, cantidad: trans.length }
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

export async function exportarExcel(trans: TransaccionExport[], mes: string, filtrosTexto?: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Caudal'
  wb.created = new Date()
  const r = calcularResumen(trans)

  const ws = wb.addWorksheet(nombreMes(mes), {
    views: [{ state: 'frozen', ySplit: 8 }],
  })

  ws.columns = [
    { key: 'fecha', width: 14 },
    { key: 'tipo', width: 14 },
    { key: 'categoria', width: 22 },
    { key: 'descripcion', width: 34 },
    { key: 'cartera', width: 20 },
    { key: 'monto', width: 16 },
  ]

  // Título
  ws.mergeCells('A1:F1')
  const titulo = ws.getCell('A1')
  titulo.value = `Caudal · Reporte de ${nombreMes(mes)}`
  titulo.font = { size: 16, bold: true, color: { argb: 'FF09090B' } }
  titulo.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26

  ws.mergeCells('A2:F2')
  const sub = ws.getCell('A2')
  sub.value = `Generado el ${new Date().toLocaleDateString('es-HN')} · ${r.cantidad} movimientos${filtrosTexto ? ` · ${filtrosTexto}` : ''}`
  sub.font = { size: 10, color: { argb: 'FF71717A' } }

  // Resumen
  const resumenFilas: [string, number, string][] = [
    ['Ingresos', r.ingresos, 'FF059669'],
    ['Gastos', r.gastos, 'FFEF4444'],
    ['Balance', r.balance, r.balance >= 0 ? 'FF059669' : 'FFEF4444'],
  ]
  resumenFilas.forEach(([label, valor, color], i) => {
    const fila = 4 + i
    const lc = ws.getCell(`A${fila}`)
    lc.value = label
    lc.font = { bold: true, color: { argb: 'FF3F3F46' } }
    const vc = ws.getCell(`B${fila}`)
    vc.value = valor
    vc.numFmt = '"L" #,##0.00'
    vc.font = { bold: true, color: { argb: color } }
  })

  // Encabezado de la tabla
  const headerRow = ws.getRow(8)
  headerRow.values = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Cartera', 'Monto']
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF09090B' } }
    cell.alignment = { vertical: 'middle' }
  })
  headerRow.height = 20

  // Detalle
  trans.forEach(t => {
    const monto = Number(t.monto)
    const signo = t.tipo === 'gasto' ? -1 : 1
    const row = ws.addRow({
      fecha: fmtFecha(t.fecha),
      tipo: capitalizar(t.tipo),
      categoria: t.categories?.nombre || '—',
      descripcion: t.descripcion || '—',
      cartera: t.wallets?.nombre || '—',
      monto: signo * monto,
    })
    const mc = row.getCell('monto')
    mc.numFmt = '"L" #,##0.00'
    mc.font = {
      color: { argb: t.tipo === 'ingreso' ? 'FF059669' : t.tipo === 'gasto' ? 'FFEF4444' : 'FF3F3F46' },
    }
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  descargarBlob(blob, `Caudal_${mes}.xlsx`)
}

export function exportarPdf(trans: TransaccionExport[], mes: string, filtrosTexto?: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const r = calcularResumen(trans)
  const ancho = doc.internal.pageSize.getWidth()
  const altoHeader = filtrosTexto ? 104 : 90

  // Encabezado
  doc.setFillColor(9, 9, 11)
  doc.rect(0, 0, ancho, altoHeader, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Caudal', 40, 42)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Reporte de ${nombreMes(mes)}`, 40, 64)
  doc.setFontSize(9)
  doc.setTextColor(180, 180, 185)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-HN')}`, ancho - 40, 42, { align: 'right' })
  if (filtrosTexto) {
    doc.setFontSize(9)
    doc.setTextColor(160, 160, 170)
    doc.text(filtrosTexto, 40, 84)
  }

  // Resumen
  let y = altoHeader + 30
  const box = (x: number, label: string, valor: string, color: [number, number, number]) => {
    const w = (ancho - 80 - 20) / 3
    doc.setDrawColor(236, 236, 238)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, w, 60, 6, 6, 'FD')
    doc.setFontSize(9)
    doc.setTextColor(113, 113, 122)
    doc.text(label, x + 12, y + 22)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...color)
    doc.text(`L ${fmtMonto(valor === '' ? 0 : Number(valor))}`, x + 12, y + 44)
    doc.setFont('helvetica', 'normal')
  }
  const w = (ancho - 80 - 20) / 3
  box(40, 'Ingresos', String(r.ingresos), [5, 150, 105])
  box(40 + w + 10, 'Gastos', String(r.gastos), [239, 68, 68])
  box(40 + (w + 10) * 2, 'Balance', String(r.balance), r.balance >= 0 ? [5, 150, 105] : [239, 68, 68])

  // Tabla de detalle
  autoTable(doc, {
    startY: y + 84,
    head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Cartera', 'Monto']],
    body: trans.map(t => {
      const signo = t.tipo === 'gasto' ? '-' : '+'
      return [
        fmtFecha(t.fecha),
        capitalizar(t.tipo),
        t.categories?.nombre || '—',
        t.descripcion || '—',
        t.wallets?.nombre || '—',
        `${signo}L ${fmtMonto(Number(t.monto))}`,
      ]
    }),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [9, 9, 11], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [244, 244, 245] },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(160, 160, 170)
      doc.text(
        `Página ${page}`,
        ancho - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: 'right' }
      )
    },
  })

  doc.save(`Caudal_${mes}.pdf`)
}
