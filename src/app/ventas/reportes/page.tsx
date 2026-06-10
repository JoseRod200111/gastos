'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type EmpresaRel = { nombre: string } | null
type DivisionRel = { nombre: string } | null
type ClienteRel = { nombre: string | null; nit: string | null } | null

type Venta = {
  id: number
  fecha: string
  cantidad: number
  observaciones: string | null
  empresa_id: number | null
  division_id: number | null
  cliente_id: number | null
  empresas?: EmpresaRel
  divisiones?: DivisionRel
  clientes?: ClienteRel
}

type Detalle = {
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  forma_pago_id: number | null
  forma_pago?: { metodo: string } | null
  documento?: string | null
}

type SaldoVenta = {
  credito: number
  abonado: number
  pagado: number
  saldo: number
}

type Catalogo = {
  id: number
  nombre: string
}

function asObj<T>(rel: unknown): T | null {
  if (rel == null) return null
  if (Array.isArray(rel)) return (rel[0] ?? null) as T | null
  return rel as T
}

function normalizeVenta(row: Record<string, unknown>): Venta {
  return {
    id: Number(row.id),
    fecha: String(row.fecha || ''),
    cantidad: Number(row.cantidad ?? 0),
    observaciones: (row.observaciones as string | null) ?? null,
    empresa_id: (row.empresa_id as number | null) ?? null,
    division_id: (row.division_id as number | null) ?? null,
    cliente_id: (row.cliente_id as number | null) ?? null,
    empresas: asObj<EmpresaRel>(row.empresas),
    divisiones: asObj<DivisionRel>(row.divisiones),
    clientes: asObj<ClienteRel>(row.clientes),
  }
}

function q(n: unknown) {
  return `Q${Number(n || 0).toFixed(2)}`
}

function safeText(v: unknown) {
  return (v ?? '').toString()
}

function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()

    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function getLastAutoTableY(doc: jsPDF, fallback: number) {
  return (
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || fallback
  )
}

export default function ReportesVentas() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [saldos, setSaldos] = useState<Record<number, SaldoVenta>>({})

  const [empresas, setEmpresas] = useState<Catalogo[]>([])
  const [divisiones, setDivisiones] = useState<Catalogo[]>([])

  const [mostrarIncompletas] = useState(false)
  const [generandoReporte, setGenerandoReporte] = useState(false)
  const [generandoReciboId, setGenerandoReciboId] = useState<number | null>(null)

  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    desde: '',
    hasta: '',
    id: '',
    cliente_nombre: '',
    cliente_nit: '',
  })

  useEffect(() => {
    ;(async () => {
      const [emp, div] = await Promise.all([
        supabase.from('empresas').select('*').order('nombre', { ascending: true }),
        supabase.from('divisiones').select('*').order('nombre', { ascending: true }),
      ])

      setEmpresas((emp.data || []) as Catalogo[])
      setDivisiones((div.data || []) as Catalogo[])
    })()
  }, [])

  const cargarDatos = useCallback(async () => {
    const usaFiltroCliente =
      Boolean(filtros.cliente_nombre.trim()) ||
      Boolean(filtros.cliente_nit.trim())

    const selectString = `
      id, fecha, cantidad, observaciones,
      empresa_id, division_id, cliente_id,
      empresas ( nombre ),
      divisiones ( nombre )
      ${usaFiltroCliente ? `, clientes!inner ( nombre, nit )` : `, clientes ( nombre, nit )`}
    `.trim()

    let query = supabase
      .from('ventas')
      .select(selectString)
      .order('fecha', { ascending: false })

    if (filtros.id.trim()) query = query.eq('id', Number(filtros.id))
    if (filtros.empresa_id.trim()) {
      query = query.eq('empresa_id', Number(filtros.empresa_id))
    }
    if (filtros.division_id.trim()) {
      query = query.eq('division_id', Number(filtros.division_id))
    }
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    if (filtros.cliente_nombre.trim()) {
      query = query.ilike('clientes.nombre', `%${filtros.cliente_nombre.trim()}%`)
    }

    if (filtros.cliente_nit.trim()) {
      query = query.ilike('clientes.nit', `%${filtros.cliente_nit.trim()}%`)
    }

    const { data: cabeceras, error } = await query

    if (error) {
      console.error('Error cargando ventas:', error)
      setVentas([])
      setDetalles({})
      setSaldos({})
      alert(`Error cargando ventas: ${error.message}`)
      return
    }

    const norm = ((cabeceras || []) as Record<string, unknown>[]).map(normalizeVenta)
    const ids = norm.map((v) => v.id)

    if (ids.length === 0) {
      setVentas([])
      setDetalles({})
      setSaldos({})
      return
    }

    const { data: metodoPendiente } = await supabase
      .from('forma_pago')
      .select('id, metodo')
      .ilike('metodo', '%pendiente de pago%')
      .limit(1)
      .maybeSingle()

    const metodoPendienteId = metodoPendiente?.id
      ? Number(metodoPendiente.id)
      : null

    const { data: detAll, error: detErr } = await supabase
      .from('detalle_venta')
      .select(
        `
        venta_id, concepto, cantidad, precio_unitario, importe,
        forma_pago_id,
        forma_pago ( metodo ),
        documento
      `
      )
      .in('venta_id', ids)

    if (detErr) {
      console.error('Error cargando detalles:', detErr)
      setVentas(norm)
      setDetalles({})
      setSaldos({})
      alert(`Error cargando detalles: ${detErr.message}`)
      return
    }

    const grouped: Record<number, Detalle[]> = {}

    for (const d of detAll || []) {
      const row = d as Record<string, unknown>
      const key = Number(row.venta_id)

      ;(grouped[key] ||= []).push({
        concepto: safeText(row.concepto),
        cantidad: Number(row.cantidad ?? 0),
        precio_unitario: Number(row.precio_unitario ?? 0),
        importe: Number(row.importe ?? 0),
        forma_pago_id:
          row.forma_pago_id == null ? null : Number(row.forma_pago_id),
        forma_pago: asObj<{ metodo: string }>(row.forma_pago),
        documento: (row.documento as string | null) ?? null,
      })
    }

    const { data: pagosRows, error: pagosErr } = await supabase
      .from('pagos_venta')
      .select('venta_id, monto')
      .in('venta_id', ids)

    if (pagosErr) {
      console.error('Error cargando pagos:', pagosErr)
    }

    const pagosPorVenta: Record<number, number> = {}

    for (const p of pagosRows || []) {
      const row = p as Record<string, unknown>
      const ventaId = Number(row.venta_id)

      pagosPorVenta[ventaId] = round2(
        (pagosPorVenta[ventaId] || 0) + Number(row.monto || 0)
      )
    }

    const saldosCalc: Record<number, SaldoVenta> = {}

    for (const v of norm) {
      const totalVenta = Number(v.cantidad || 0)
      const det = grouped[v.id] || []

      const creditoOriginal = det.reduce((sum, d) => {
        const metodo = d.forma_pago?.metodo?.toLowerCase() || ''
        const esPendientePorId =
          metodoPendienteId !== null && d.forma_pago_id === metodoPendienteId
        const esPendientePorTexto = metodo.includes('pendiente de pago')

        return esPendientePorId || esPendientePorTexto
          ? sum + Number(d.importe || 0)
          : sum
      }, 0)

      const abonado = pagosPorVenta[v.id] || 0
      const saldoPendiente = Math.max(0, creditoOriginal - abonado)

      const pagadoInicial = Math.max(0, totalVenta - creditoOriginal)
      const pagadoTotal = Math.min(totalVenta, pagadoInicial + abonado)

      saldosCalc[v.id] = {
        credito: round2(creditoOriginal),
        abonado: round2(abonado),
        pagado: round2(pagadoTotal),
        saldo: round2(saldoPendiente),
      }
    }

    const filtradas = norm.filter((v) =>
      mostrarIncompletas ? true : (grouped[v.id]?.length ?? 0) > 0
    )

    setDetalles(grouped)
    setSaldos(saldosCalc)
    setVentas(filtradas)
  }, [filtros, mostrarIncompletas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFiltros((prev) => ({ ...prev, [name]: value }))
  }

  const limpiarFiltros = () =>
    setFiltros({
      empresa_id: '',
      division_id: '',
      desde: '',
      hasta: '',
      id: '',
      cliente_nombre: '',
      cliente_nit: '',
    })

  const resumen = useMemo(() => {
    const totalQ = ventas.reduce((acc, v) => acc + Number(v.cantidad || 0), 0)
    const pagadoQ = ventas.reduce(
      (acc, v) => acc + Number(saldos[v.id]?.pagado || 0),
      0
    )
    const pendienteQ = ventas.reduce(
      (acc, v) => acc + Number(saldos[v.id]?.saldo || 0),
      0
    )

    return {
      totalQ: round2(totalQ),
      pagadoQ: round2(pagadoQ),
      pendienteQ: round2(pendienteQ),
      totalVentas: ventas.length,
    }
  }, [ventas, saldos])

  const nombreEmpresaFiltro =
    empresas.find((e) => String(e.id) === String(filtros.empresa_id))?.nombre ||
    'Todas'

  const nombreDivisionFiltro =
    divisiones.find((d) => String(d.id) === String(filtros.division_id))
      ?.nombre || 'Todas'

  const agregarFooter = (doc: jsPDF) => {
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const totalPages = doc.getNumberOfPages()

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)

      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 12, pageHeight - 7, {
        align: 'right',
      })

      doc.text(`Generado: ${new Date().toLocaleString()}`, 12, pageHeight - 7)
    }
  }

  const dibujarEncabezadoReporte = (
    doc: jsPDF,
    logo: string | null,
    titulo: string,
    subtitulo?: string
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 8

    if (logo) {
      doc.addImage(logo, 'PNG', pageWidth / 2 - 19, y, 38, 15)
      y += 19
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(20, 20, 20)
    doc.text(titulo, pageWidth / 2, y, { align: 'center' })

    y += 6

    if (subtitulo) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(85, 85, 85)
      doc.text(subtitulo, pageWidth / 2, y, { align: 'center' })
      y += 4
    }

    return y + 4
  }

  const generarPDFReporte = async () => {
    if (ventas.length === 0) {
      alert('No hay ventas para generar el reporte.')
      return
    }

    setGenerandoReporte(true)

    try {
      const logo = await fetchLogoDataUrl()
      const doc = new jsPDF('l', 'mm', 'letter')
      const pageWidth = doc.internal.pageSize.getWidth()

      const yInicial = dibujarEncabezadoReporte(
        doc,
        logo,
        'REPORTE DE VENTAS',
        'Resumen general de ventas, pagos y saldos pendientes'
      )

      autoTable(doc, {
        startY: yInicial,
        theme: 'grid',
        margin: { left: 12, right: 12 },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [31, 41, 55],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        body: [
          [
            'Rango',
            `${filtros.desde || '—'} a ${filtros.hasta || '—'}`,
            'Empresa',
            nombreEmpresaFiltro,
          ],
          [
            'División',
            nombreDivisionFiltro,
            'Cliente',
            filtros.cliente_nombre || 'Todos',
          ],
          ['NIT', filtros.cliente_nit || 'Todos', 'ID', filtros.id || 'Todos'],
        ],
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 24 },
          1: { cellWidth: 84 },
          2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 24 },
          3: { cellWidth: 120 },
        },
      })

      let y = getLastAutoTableY(doc, yInicial) + 6

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: 12, right: pageWidth - 12 - 112 },
        styles: {
          fontSize: 9,
          cellPadding: 2.2,
          overflow: 'linebreak',
        },
        head: [['Resumen', 'Valor']],
        body: [
          ['Ventas', String(resumen.totalVentas)],
          ['Total vendido', q(resumen.totalQ)],
          ['Total pagado', q(resumen.pagadoQ)],
          ['Saldo pendiente', q(resumen.pendienteQ)],
        ],
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 58, fontStyle: 'bold' },
          1: { cellWidth: 54, halign: 'right' },
        },
      })

      y = getLastAutoTableY(doc, y) + 7

      const rows = ventas.map((v) => {
        const cli = v.clientes?.nombre || '—'
        const nit = v.clientes?.nit || '—'
        const emp = v.empresas?.nombre || '—'
        const div = v.divisiones?.nombre || '—'
        const s = saldos[v.id] || { pagado: 0, saldo: 0 }

        return [
          v.fecha,
          `#${v.id}`,
          cli,
          nit,
          emp,
          div,
          q(v.cantidad),
          q(s.pagado),
          q(s.saldo),
        ]
      })

      autoTable(doc, {
        startY: y,
        head: [
          [
            'Fecha',
            'ID',
            'Cliente',
            'NIT',
            'Empresa',
            'División',
            'Total',
            'Pagado',
            'Pendiente',
          ],
        ],
        body: rows,
        theme: 'striped',
        margin: { left: 12, right: 12, bottom: 14 },
        styles: {
          fontSize: 7.2,
          cellPadding: 1.8,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 21 },
          1: { cellWidth: 13 },
          2: { cellWidth: 47 },
          3: { cellWidth: 21 },
          4: { cellWidth: 43 },
          5: { cellWidth: 31 },
          6: { cellWidth: 24, halign: 'right' },
          7: { cellWidth: 24, halign: 'right' },
          8: { cellWidth: 27, halign: 'right' },
        },
      })

      agregarFooter(doc)

      const ts = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15)

      doc.save(`reporte_ventas_${ts}.pdf`)
    } finally {
      setGenerandoReporte(false)
    }
  }

  const generarReciboVenta = async (venta: Venta) => {
    setGenerandoReciboId(venta.id)

    try {
      const logo = await fetchLogoDataUrl()
      const doc = new jsPDF('p', 'mm', 'letter')
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 12
      const contentWidth = pageWidth - margin * 2
      const s = saldos[venta.id] || { pagado: 0, saldo: 0 }

      let y = 8

      if (logo) {
        doc.addImage(logo, 'PNG', pageWidth / 2 - 22, y, 44, 18)
        y += 23
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.setTextColor(20, 20, 20)
      doc.text('RECIBO DE VENTA', pageWidth / 2, y, { align: 'center' })

      y += 7

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(90, 90, 90)
      doc.text(`No. Recibo: V-${venta.id}`, margin, y)
      doc.text(`Fecha: ${venta.fecha}`, pageWidth - margin, y, {
        align: 'right',
      })

      y += 8

      const cli = venta.clientes?.nombre || '—'
      const nit = venta.clientes?.nit || '—'
      const emp = venta.empresas?.nombre || '—'
      const div = venta.divisiones?.nombre || '—'
      const observaciones = venta.observaciones?.trim() || '—'

      doc.setDrawColor(180, 180, 180)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(margin, y, contentWidth, 46, 2, 2, 'FD')

      doc.setFillColor(31, 41, 55)
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      doc.text(`Venta #${venta.id}`, margin + 4, y + 6.5)
      doc.text(q(venta.cantidad), pageWidth - margin - 4, y + 6.5, {
        align: 'right',
      })

      let bodyY = y + 16
      const leftX = margin + 4
      const midX = margin + contentWidth / 2 + 2

      doc.setTextColor(20, 20, 20)
      doc.setFontSize(9)

      doc.setFont('helvetica', 'bold')
      doc.text('Cliente:', leftX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(cli, contentWidth / 2 - 18), leftX + 16, bodyY)

      doc.setFont('helvetica', 'bold')
      doc.text('NIT:', midX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(nit, midX + 9, bodyY)

      bodyY += 5

      doc.setFont('helvetica', 'bold')
      doc.text('Empresa:', leftX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(emp, contentWidth / 2 - 18), leftX + 18, bodyY)

      doc.setFont('helvetica', 'bold')
      doc.text('División:', midX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(div, contentWidth / 2 - 18), midX + 17, bodyY)

      bodyY += 5

      doc.setFont('helvetica', 'bold')
      doc.text('Pagado:', leftX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(q(s.pagado), leftX + 16, bodyY)

      doc.setFont('helvetica', 'bold')
      doc.text('Pendiente:', midX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(q(s.saldo), midX + 21, bodyY)

      bodyY += 5

      doc.setFont('helvetica', 'bold')
      doc.text('Observaciones:', leftX, bodyY)
      doc.setFont('helvetica', 'normal')
      doc.text(
        doc.splitTextToSize(observaciones, contentWidth - 34),
        leftX + 28,
        bodyY
      )

      y += 52

      const det = detalles[venta.id] || []

      autoTable(doc, {
        startY: y,
        head: [['Concepto', 'Cant.', 'P.Unit', 'Importe', 'Pago', 'Doc.']],
        body:
          det.length > 0
            ? det.map((d) => [
                d.concepto,
                String(d.cantidad),
                q(d.precio_unitario),
                q(d.importe),
                d.forma_pago?.metodo || '—',
                d.documento || '—',
              ])
            : [['Sin detalle', '', '', '', '', '']],
        theme: 'grid',
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        styles: {
          fontSize: 8,
          cellPadding: 1.8,
          overflow: 'linebreak',
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 66 },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: 22, halign: 'right' },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 36 },
          5: { cellWidth: 24 },
        },
        margin: { left: margin, right: margin, bottom: 14 },
      })

      y = getLastAutoTableY(doc, y) + 7

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: pageWidth - margin - 78, right: margin },
        styles: {
          fontSize: 9,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [31, 41, 55],
          textColor: 255,
          fontStyle: 'bold',
        },
        body: [
          ['Total venta', q(venta.cantidad)],
          ['Pagado', q(s.pagado)],
          ['Saldo pendiente', q(s.saldo)],
        ],
        columnStyles: {
          0: { cellWidth: 38, fontStyle: 'bold' },
          1: { cellWidth: 40, halign: 'right' },
        },
      })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text(`Generado: ${new Date().toLocaleString()}`, margin, pageHeight - 7)
      doc.text('Página 1 de 1', pageWidth - margin, pageHeight - 7, {
        align: 'right',
      })

      doc.save(`recibo_venta_${venta.id}.pdf`)
    } finally {
      setGenerandoReciboId(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-1">Reporte de Ventas</h1>

      <p className="text-sm text-gray-600 mb-5">
        Usa filtros, genera PDF general de monitoreo o recibo individual por venta.
      </p>

      <div className="border rounded-lg bg-white p-4 shadow-sm mb-5">
        <h2 className="font-semibold mb-3">Filtros</h2>

        <div className="grid grid-cols-1 md:grid-cols-8 gap-4">
          <select
            name="empresa_id"
            value={filtros.empresa_id}
            onChange={handleChange}
            className="border p-2 rounded"
          >
            <option value="">Todas las Empresas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>

          <select
            name="division_id"
            value={filtros.division_id}
            onChange={handleChange}
            className="border p-2 rounded"
          >
            <option value="">Todas las Divisiones</option>
            {divisiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>

          <input
            type="date"
            name="desde"
            value={filtros.desde}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="hasta"
            value={filtros.hasta}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="text"
            name="cliente_nombre"
            placeholder="Cliente"
            value={filtros.cliente_nombre}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="text"
            name="cliente_nit"
            placeholder="NIT"
            value={filtros.cliente_nit}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="text"
            name="id"
            placeholder="ID"
            value={filtros.id}
            onChange={handleChange}
            className="border p-2 rounded"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button
            onClick={cargarDatos}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            🔍 Aplicar filtros
          </button>

          <button
            onClick={limpiarFiltros}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Limpiar
          </button>

          <button
            onClick={generarPDFReporte}
            disabled={generandoReporte || ventas.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {generandoReporte ? 'Generando PDF...' : '📄 Generar PDF'}
          </button>

          <a
            href="/menu"
            className="ml-auto inline-block bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded"
          >
            ⬅ Volver al Menú de Ventas
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="border rounded p-3 bg-white shadow-sm">
          <div className="text-xs text-gray-500">Ventas</div>
          <div className="text-lg font-semibold">{resumen.totalVentas}</div>
        </div>

        <div className="border rounded p-3 bg-white shadow-sm">
          <div className="text-xs text-gray-500">Total vendido</div>
          <div className="text-lg font-semibold">{q(resumen.totalQ)}</div>
        </div>

        <div className="border rounded p-3 bg-white shadow-sm">
          <div className="text-xs text-gray-500">Pagado</div>
          <div className="text-lg font-semibold text-green-700">
            {q(resumen.pagadoQ)}
          </div>
        </div>

        <div className="border rounded p-3 bg-white shadow-sm">
          <div className="text-xs text-gray-500">Saldo pendiente</div>
          <div className="text-lg font-semibold text-red-700">
            {q(resumen.pendienteQ)}
          </div>
        </div>
      </div>

      {ventas.length === 0 ? (
        <div className="text-center text-gray-500 border rounded p-6 bg-white">
          No hay datos con esos filtros.
        </div>
      ) : (
        ventas.map((v) => {
          const s = saldos[v.id] || { pagado: 0, saldo: 0 }

          return (
            <div
              key={v.id}
              className="border rounded-xl bg-white shadow-sm overflow-hidden mb-4"
            >
              <div className="bg-slate-800 text-white px-4 py-3 flex flex-wrap gap-3 items-center">
                <div className="font-semibold">
                  Venta #{v.id} — {v.fecha}
                </div>

                <div className="ml-auto font-semibold">{q(v.cantidad)}</div>

                <button
                  onClick={() => generarReciboVenta(v)}
                  disabled={generandoReciboId === v.id}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-1.5 rounded text-xs"
                >
                  {generandoReciboId === v.id ? 'Generando...' : 'Recibo PDF'}
                </button>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-semibold">Empresa:</span>{' '}
                  {v.empresas?.nombre || '—'}
                </div>

                <div>
                  <span className="font-semibold">División:</span>{' '}
                  {v.divisiones?.nombre || '—'}
                </div>

                <div>
                  <span className="font-semibold">Cliente:</span>{' '}
                  {v.clientes?.nombre || '—'}
                </div>

                <div>
                  <span className="font-semibold">NIT:</span>{' '}
                  {v.clientes?.nit || '—'}
                </div>

                <div>
                  <span className="font-semibold">Total:</span> {q(v.cantidad)}
                </div>

                <div>
                  <span className="font-semibold">Pagado:</span>{' '}
                  <span className="text-green-700 font-semibold">
                    {q(s.pagado)}
                  </span>
                </div>

                <div>
                  <span className="font-semibold">Saldo pendiente:</span>{' '}
                  <span className="text-red-700 font-semibold">{q(s.saldo)}</span>
                </div>

                <div className="md:col-span-2">
                  <span className="font-semibold">Observaciones:</span>{' '}
                  {v.observaciones || '—'}
                </div>
              </div>

              <div className="px-4 pb-4 overflow-auto">
                <table className="w-full border text-sm">
                  <thead className="bg-blue-600 text-white">
                    <tr>
                      <th className="p-2 text-left">Concepto</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">P.Unit</th>
                      <th className="p-2 text-right">Importe</th>
                      <th className="p-2 text-left">Pago</th>
                      <th className="p-2 text-left">Doc.</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(detalles[v.id] || []).map((d, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{d.concepto}</td>
                        <td className="p-2 text-right">{d.cantidad}</td>
                        <td className="p-2 text-right">{q(d.precio_unitario)}</td>
                        <td className="p-2 text-right">{q(d.importe)}</td>
                        <td className="p-2">{d.forma_pago?.metodo || '—'}</td>
                        <td className="p-2">{d.documento || '—'}</td>
                      </tr>
                    ))}

                    {(detalles[v.id] || []).length === 0 ? (
                      <tr className="border-t">
                        <td className="p-2 text-gray-500" colSpan={6}>
                          Sin detalle.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
