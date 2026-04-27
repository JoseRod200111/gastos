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
  forma_pago?: { metodo: string } | null
  documento?: string | null
}

/** Normaliza relaciones que pueden venir como arrays desde Supabase */
function asObj<T>(rel: any): T | null {
  if (rel == null) return null
  if (Array.isArray(rel)) return (rel[0] ?? null) as T | null
  return rel as T
}
function normalizeVenta(row: any): Venta {
  return {
    id: Number(row.id),
    fecha: row.fecha,
    cantidad: Number(row.cantidad ?? 0),
    observaciones: row.observaciones ?? null,
    empresa_id: row.empresa_id ?? null,
    division_id: row.division_id ?? null,
    cliente_id: row.cliente_id ?? null,
    empresas: asObj<EmpresaRel>(row.empresas),
    divisiones: asObj<DivisionRel>(row.divisiones),
    clientes: asObj<ClienteRel>(row.clientes),
  }
}

function q(n: any) {
  return `Q${Number(n || 0).toFixed(2)}`
}
function safeText(v: any) {
  return (v ?? '').toString()
}

export default function ReportesVentas() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})

  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])

  // Si quisieras ver ventas sin detalle, cambia a true
  const [mostrarIncompletas] = useState(false)

  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    desde: '',
    hasta: '',
    id: '',
    cliente_nombre: '',
    cliente_nit: '',
  })

  /* ─────────────────────── catálogos ─────────────────────── */
  useEffect(() => {
    ;(async () => {
      const [emp, div] = await Promise.all([
        supabase.from('empresas').select('*').order('nombre', { ascending: true }),
        supabase.from('divisiones').select('*').order('nombre', { ascending: true }),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
    })()
  }, [])

  /* ─────────────────────── datos ─────────────────────── */
  const cargarDatos = useCallback(async () => {
    const usaFiltroCliente =
      Boolean(filtros.cliente_nombre.trim()) || Boolean(filtros.cliente_nit.trim())

    // IMPORTANTE: inner join solo cuando filtras por cliente
    const selectString = `
      id, fecha, cantidad, observaciones,
      empresa_id, division_id, cliente_id,
      empresas ( nombre ),
      divisiones ( nombre )
      ${usaFiltroCliente ? `, clientes!inner ( nombre, nit )` : `, clientes ( nombre, nit )`}
    `.trim()

    let query = supabase.from('ventas').select(selectString).order('fecha', { ascending: false })

    // Filtros
    if (filtros.id.trim()) query = query.eq('id', Number(filtros.id))
    if (filtros.empresa_id.trim()) query = query.eq('empresa_id', Number(filtros.empresa_id))
    if (filtros.division_id.trim()) query = query.eq('division_id', Number(filtros.division_id))
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
      return
    }

    const norm = (cabeceras || []).map(normalizeVenta)
    const ids = norm.map(v => v.id)

    if (ids.length === 0) {
      setVentas([])
      setDetalles({})
      return
    }

    const { data: detAll, error: detErr } = await supabase
      .from('detalle_venta')
      .select(
        `
        venta_id, concepto, cantidad, precio_unitario, importe,
        forma_pago ( metodo ),
        documento
      `
      )
      .in('venta_id', ids)

    if (detErr) {
      console.error('Error cargando detalles:', detErr)
      setVentas(norm)
      setDetalles({})
      return
    }

    const grouped: Record<number, Detalle[]> = {}
    for (const d of detAll || []) {
      const key = Number((d as any).venta_id)
      ;(grouped[key] ||= []).push({
        concepto: safeText((d as any).concepto),
        cantidad: Number((d as any).cantidad ?? 0),
        precio_unitario: Number((d as any).precio_unitario ?? 0),
        importe: Number((d as any).importe ?? 0),
        forma_pago: asObj<{ metodo: string }>((d as any).forma_pago),
        documento: (d as any).documento ?? null,
      })
    }
    setDetalles(grouped)

    const filtradas = norm.filter(v =>
      mostrarIncompletas ? true : (grouped[v.id]?.length ?? 0) > 0
    )
    setVentas(filtradas)
  }, [filtros, mostrarIncompletas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  /* ─────────────────────── handlers ─────────────────────── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFiltros(prev => ({ ...prev, [name]: value }))
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

  /* ─────────────────────── resumen ─────────────────────── */
  const resumen = useMemo(() => {
    const totalQ = ventas.reduce((acc, v) => acc + Number(v.cantidad || 0), 0)
    const cantLineas = ventas.reduce((acc, v) => acc + (detalles[v.id]?.length ?? 0), 0)
    return { totalQ, cantLineas, totalVentas: ventas.length }
  }, [ventas, detalles])

  /* ─────────────────────── PDF general ─────────────────────── */
  const generarPDFReporte = async () => {
    const doc = new jsPDF('p', 'mm', 'letter')
    const pageWidth = doc.internal.pageSize.getWidth()

    // Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('REPORTE DE VENTAS', pageWidth / 2, 18, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const rango = `Rango: ${filtros.desde || '—'} a ${filtros.hasta || '—'}`
    const fEmp = filtros.empresa_id ? `Empresa ID: ${filtros.empresa_id}` : 'Empresa: Todas'
    const fDiv = filtros.division_id ? `División ID: ${filtros.division_id}` : 'División: Todas'
    doc.text(`${rango}   |   ${fEmp}   |   ${fDiv}`, 12, 26)

    // Resumen (tipo “reporte de cerdos”)
    autoTable(doc, {
      startY: 32,
      head: [['Resumen', 'Valor']],
      body: [
        ['Ventas', String(resumen.totalVentas)],
        ['Líneas (detalle)', String(resumen.cantLineas)],
        ['Total (Q)', q(resumen.totalQ)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [27, 115, 160] },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 40, halign: 'right' } },
      margin: { left: 12, right: 12 },
    })

    let y = (doc as any).lastAutoTable?.finalY ?? 50
    y += 6

    // Tabla de resumen por venta (compacta)
    const rows = ventas.map(v => {
      const cli = v.clientes?.nombre || '—'
      const nit = v.clientes?.nit || '—'
      const emp = v.empresas?.nombre || '—'
      const div = v.divisiones?.nombre || '—'
      return [
        v.fecha,
        `#${v.id}`,
        cli,
        nit,
        emp,
        div,
        q(v.cantidad),
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'ID', 'Cliente', 'NIT', 'Empresa', 'División', 'Total(Q)']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [27, 115, 160] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 14 },
        2: { cellWidth: 40 },
        3: { cellWidth: 18 },
        4: { cellWidth: 36 },
        5: { cellWidth: 22 },
        6: { cellWidth: 18, halign: 'right' },
      },
      margin: { left: 12, right: 12 },
      didDrawPage: () => {
        doc.setFontSize(8)
        doc.text('AGRO INDUSTRIAS RYB', 12, 10)
      },
    })

    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15)

    doc.save(`reporte_ventas_${ts}.pdf`)
  }

  /* ─────────────────────── Recibo PDF por venta ─────────────────────── */
  const generarReciboVenta = (venta: Venta) => {
    const doc = new jsPDF('p', 'mm', 'letter')
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('RECIBO DE VENTA', pageWidth / 2, 18, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    doc.text(`No. Recibo: V-${venta.id}`, pageWidth - 12, 14, { align: 'right' })
    doc.text(`Fecha: ${venta.fecha}`, pageWidth - 12, 20, { align: 'right' })

    const cli = venta.clientes?.nombre || '—'
    const nit = venta.clientes?.nit || '—'
    const emp = venta.empresas?.nombre || '—'
    const div = venta.divisiones?.nombre || '—'

    autoTable(doc, {
      startY: 28,
      head: [['Cliente', 'NIT', 'Empresa', 'División']],
      body: [[cli, nit, emp, div]],
      theme: 'striped',
      headStyles: { fillColor: [27, 115, 160] },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 12, right: 12 },
    })

    const det = detalles[venta.id] || []

    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 6,
      head: [['Concepto', 'Cant.', 'P.Unit', 'Importe', 'Pago', 'Doc.']],
      body: det.map(d => [
        d.concepto,
        String(d.cantidad),
        q(d.precio_unitario),
        q(d.importe),
        d.forma_pago?.metodo || '—',
        d.documento || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [27, 115, 160] },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 14, halign: 'right' },
        2: { cellWidth: 22, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 30 },
        5: { cellWidth: 22 },
      },
      margin: { left: 12, right: 12 },
    })

    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 8,
      head: [['Totales', 'Valor']],
      body: [
        ['Total (Q)', q(venta.cantidad)],
        ['Observaciones', venta.observaciones || '—'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [27, 115, 160] },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 120 } },
      margin: { left: 12, right: 12 },
    })

    doc.save(`recibo_venta_${venta.id}.pdf`)
  }

  /* ─────────────────────── UI ─────────────────────── */
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-1">Reporte de Ventas</h1>
      <p className="text-sm text-gray-600 mb-5">
        Usa filtros, genera PDF general (monitoreo) o recibo individual por venta.
      </p>

      {/* filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-5">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input
          type="text"
          name="cliente_nombre"
          placeholder="Cliente"
          value={filtros.cliente_nombre}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="text"
          name="cliente_nit"
          placeholder="NIT"
          value={filtros.cliente_nit}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="text"
          name="id"
          placeholder="ID"
          value={filtros.id}
          onChange={handleChange}
          className="border p-2"
        />
      </div>

      {/* botones */}
      <div className="mb-6 flex flex-wrap gap-2 items-center">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar filtros
        </button>
        <button onClick={limpiarFiltros} className="bg-gray-500 text-white px-4 py-2 rounded">
          Limpiar
        </button>
        <button onClick={generarPDFReporte} className="bg-green-600 text-white px-4 py-2 rounded">
          📄 Generar PDF (reporte)
        </button>

        <a href="/menu" className="ml-auto inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú de Ventas
        </a>
      </div>

      {/* resumen rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Ventas</div>
          <div className="text-lg font-semibold">{resumen.totalVentas}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Líneas (detalle)</div>
          <div className="text-lg font-semibold">{resumen.cantLineas}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total (Q)</div>
          <div className="text-lg font-semibold">{q(resumen.totalQ)}</div>
        </div>
      </div>

      {/* vista */}
      {ventas.length === 0 ? (
        <div className="text-center text-gray-500 border rounded p-6 bg-white">
          No hay datos con esos filtros.
        </div>
      ) : (
        ventas.map(v => (
          <div key={v.id} className="border rounded bg-white p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="font-semibold text-sm">
                Venta #{v.id} — {v.fecha}
              </div>

              <button
                onClick={() => generarReciboVenta(v)}
                className="ml-auto bg-slate-800 text-white px-3 py-1.5 rounded text-xs"
              >
                Recibo PDF
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
              <div><span className="font-semibold">Empresa:</span> {v.empresas?.nombre || '—'}</div>
              <div><span className="font-semibold">División:</span> {v.divisiones?.nombre || '—'}</div>
              <div><span className="font-semibold">Cliente:</span> {v.clientes?.nombre || '—'}</div>
              <div><span className="font-semibold">NIT:</span> {v.clientes?.nit || '—'}</div>
              <div><span className="font-semibold">Total:</span> {q(v.cantidad)}</div>
              <div className="md:col-span-2">
                <span className="font-semibold">Observaciones:</span> {v.observaciones || '—'}
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full border text-sm">
                <thead className="bg-gray-200">
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
        ))
      )}
    </div>
  )
}
