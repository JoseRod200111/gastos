'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type VentaRow = {
  id: number
  fecha: string
  cliente_id: number
  ubicacion_id: number
  lote_id: number | null
  cantidad: number
  peso_total_lb: number
  precio_por_libra: number
  total: number
  pagado: number
  deuda: number
  observaciones: string | null
  created_at: string | null
  clientes?: { nombre?: string; nit?: string } | null
  granja_ubicaciones?: { codigo?: string; nombre?: string } | null
  granja_lotes?: { codigo?: string } | null
}

type Filtros = {
  desde: string
  hasta: string
  id: string
  cliente_nombre: string
  cliente_nit: string
  ubicacion: string
  lote: string
  solo_multi: boolean
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round(n * 100) / 100

const extraerMulti = (obs: string | null | undefined) => {
  if (!obs) return null
  const m = obs.match(/MULTI:([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
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

const fmtQ = (n: number) => `Q${round2(n).toFixed(2)}`
const fmtN = (n: number) => `${round2(n).toFixed(2)}`

export default function ReporteVentasGranjaPage() {
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generandoReciboId, setGenerandoReciboId] = useState<number | null>(null)

  const [filtros, setFiltros] = useState<Filtros>({
    desde: '',
    hasta: '',
    id: '',
    cliente_nombre: '',
    cliente_nit: '',
    ubicacion: '',
    lote: '',
    solo_multi: false,
  })

  useEffect(() => {
    const hoy = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const f = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`
    setFiltros(prev => ({ ...prev, desde: f, hasta: f }))
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('granja_ventas_cerdos')
        .select(`
          id, fecha, cliente_id, ubicacion_id, lote_id,
          cantidad, peso_total_lb, precio_por_libra, total, pagado, deuda,
          observaciones, created_at,
          clientes ( nombre, nit ),
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (filtros.id.trim()) query = query.eq('id', filtros.id.trim())
      if (filtros.desde) query = query.gte('fecha', filtros.desde)
      if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

      const { data, error } = await query
      if (error) {
        console.error('Error cargando ventas de granja', error)
        setVentas([])
        return
      }

      let rows = ((data || []) as any as VentaRow[])

      const cn = filtros.cliente_nombre.trim().toLowerCase()
      const cnit = filtros.cliente_nit.trim().toLowerCase()
      const ub = filtros.ubicacion.trim().toLowerCase()
      const lt = filtros.lote.trim().toLowerCase()

      if (cn) rows = rows.filter(r => (r.clientes?.nombre || '').toLowerCase().includes(cn))
      if (cnit) rows = rows.filter(r => (r.clientes?.nit || '').toLowerCase().includes(cnit))
      if (ub) rows = rows.filter(r => (r.granja_ubicaciones?.codigo || '').toLowerCase().includes(ub))
      if (lt) rows = rows.filter(r => (r.granja_lotes?.codigo || '').toLowerCase().includes(lt))

      if (filtros.solo_multi) rows = rows.filter(r => !!extraerMulti(r.observaciones))

      setVentas(rows)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const resumen = useMemo(() => {
    const totalCerdos = ventas.reduce((a, v) => a + toNum(v.cantidad), 0)
    const totalPeso = ventas.reduce((a, v) => a + toNum(v.peso_total_lb), 0)
    const totalQ = ventas.reduce((a, v) => a + toNum(v.total), 0)
    const pagadoQ = ventas.reduce((a, v) => a + toNum(v.pagado), 0)
    const deudaQ = ventas.reduce((a, v) => a + toNum(v.deuda), 0)

    const porUbic: Record<string, number> = {}
    ventas.forEach(v => {
      const key = v.granja_ubicaciones?.codigo || `UBI#${v.ubicacion_id}`
      porUbic[key] = (porUbic[key] || 0) + toNum(v.cantidad)
    })

    const ubicArr = Object.entries(porUbic)
      .map(([codigo, cant]) => ({ codigo, cant }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo))

    return {
      totalCerdos,
      totalPeso: round2(totalPeso),
      totalQ: round2(totalQ),
      pagadoQ: round2(pagadoQ),
      deudaQ: round2(deudaQ),
      ubicArr,
    }
  }, [ventas])

  const generarPDFReporte = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    const logo = await fetchLogoDataUrl()
    if (logo) doc.addImage(logo, 'PNG', 80, 10, 50, 18)

    doc.setFontSize(14)
    doc.text('Reporte de Ventas de Cerdos', 14, 35)

    doc.setFontSize(10)
    const rango = `${filtros.desde || '—'}  a  ${filtros.hasta || '—'}`
    doc.text(`Rango: ${rango}`, 14, 41)

    const filtrosTxt = [
      filtros.id ? `ID: ${filtros.id}` : null,
      filtros.cliente_nombre ? `Cliente: ${filtros.cliente_nombre}` : null,
      filtros.cliente_nit ? `NIT: ${filtros.cliente_nit}` : null,
      filtros.ubicacion ? `Ubicación: ${filtros.ubicacion}` : null,
      filtros.lote ? `Lote: ${filtros.lote}` : null,
      filtros.solo_multi ? `Solo multi-tramo` : null,
    ].filter(Boolean) as string[]

    if (filtrosTxt.length) doc.text(`Filtros: ${filtrosTxt.join(' | ')}`, 14, 46)

    autoTable(doc, {
      startY: 52,
      head: [['Resumen', 'Valor']],
      body: [
        ['Total cerdos vendidos', String(resumen.totalCerdos)],
        ['Peso total (lb)', String(resumen.totalPeso)],
        ['Total (Q)', String(resumen.totalQ)],
        ['Pagado (Q)', String(resumen.pagadoQ)],
        ['Deuda (Q)', String(resumen.deudaQ)],
      ],
      styles: { fontSize: 9 },
    })

    const yAfterResumen = (doc as any).lastAutoTable.finalY + 4
    autoTable(doc, {
      startY: yAfterResumen,
      head: [['Ubicación', 'Cerdos vendidos']],
      body: resumen.ubicArr.map(u => [u.codigo, String(u.cant)]),
      styles: { fontSize: 9 },
    })

    const yAfterUbic = (doc as any).lastAutoTable.finalY + 6
    autoTable(doc, {
      startY: yAfterUbic,
      head: [[
        'Fecha', 'ID', 'Cliente', 'NIT', 'Ubicación', 'Lote',
        'Cant.', 'Peso(lb)', 'Q/lb', 'Total(Q)', 'Pagado(Q)', 'Deuda(Q)', 'MULTI'
      ]],
      body: ventas.map(v => [
        v.fecha,
        String(v.id),
        v.clientes?.nombre || '—',
        v.clientes?.nit || '—',
        v.granja_ubicaciones?.codigo || '—',
        v.granja_lotes?.codigo || '—',
        String(toNum(v.cantidad)),
        String(toNum(v.peso_total_lb)),
        String(toNum(v.precio_por_libra)),
        String(round2(toNum(v.total))),
        String(round2(toNum(v.pagado))),
        String(round2(toNum(v.deuda))),
        extraerMulti(v.observaciones) || '—',
      ]),
      styles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 10 },
        2: { cellWidth: 26 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 12 },
      },
    })

    const now = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const name = `reporte_ventas_cerdos_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
    doc.save(name)
  }

  // ✅ RECIBO / FACTURA (por venta o por grupo MULTI)
  const generarReciboPDF = async (ventaId: number) => {
    setGenerandoReciboId(ventaId)
    try {
      // 1) obtener venta base
      const { data: base, error: baseErr } = await supabase
        .from('granja_ventas_cerdos')
        .select(`
          id, fecha, cliente_id, ubicacion_id, lote_id,
          cantidad, peso_total_lb, precio_por_libra, total, pagado, deuda,
          observaciones, created_at,
          clientes ( nombre, nit ),
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `)
        .eq('id', ventaId)
        .single()

      if (baseErr || !base) {
        console.error(baseErr)
        alert('No se pudo cargar la venta para generar recibo.')
        return
      }

      const baseRow = base as any as VentaRow
      const multi = extraerMulti(baseRow.observaciones)

      // 2) si es MULTI, traer todas las filas del mismo cliente+fecha con ese MULTI
      let filas: VentaRow[] = [baseRow]

      if (multi) {
        const { data: multiRows, error: multiErr } = await supabase
          .from('granja_ventas_cerdos')
          .select(`
            id, fecha, cliente_id, ubicacion_id, lote_id,
            cantidad, peso_total_lb, precio_por_libra, total, pagado, deuda,
            observaciones, created_at,
            clientes ( nombre, nit ),
            granja_ubicaciones ( codigo, nombre ),
            granja_lotes ( codigo )
          `)
          .eq('cliente_id', baseRow.cliente_id)
          .eq('fecha', baseRow.fecha)
          .ilike('observaciones', `%MULTI:${multi}%`)
          .order('id', { ascending: true })

        if (multiErr) {
          console.error(multiErr)
          alert('No se pudo cargar el grupo MULTI para el recibo.')
          return
        }

        filas = (multiRows as any as VentaRow[]) || [baseRow]
        if (filas.length === 0) filas = [baseRow]
      }

      // 3) Totales del recibo (si multi, sumado)
      const totalCant = filas.reduce((a, r) => a + toNum(r.cantidad), 0)
      const totalPeso = filas.reduce((a, r) => a + toNum(r.peso_total_lb), 0)
      const totalQ = filas.reduce((a, r) => a + toNum(r.total), 0)
      const totalPagado = filas.reduce((a, r) => a + toNum(r.pagado), 0)
      const totalDeuda = filas.reduce((a, r) => a + toNum(r.deuda), 0)

      // 4) Número de recibo
      // - si multi: se usa MULTI-XXXXXXXX (más corto)
      // - si no: V-<id>
      const reciboNo = multi ? `MULTI-${multi.slice(0, 8).toUpperCase()}` : `V-${baseRow.id}`

      // 5) PDF “tipo factura”
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 14, 10, 35, 14)

      doc.setFontSize(14)
      doc.text('RECIBO DE VENTA', 105, 16, { align: 'center' })

      doc.setFontSize(10)
      doc.text(`No. Recibo: ${reciboNo}`, 160, 12)
      doc.text(`Fecha: ${baseRow.fecha}`, 160, 17)

      const clienteNom = baseRow.clientes?.nombre || '—'
      const clienteNit = baseRow.clientes?.nit || '—'

      autoTable(doc, {
        startY: 28,
        head: [['Cliente', 'NIT', 'Tipo', 'Referencia']],
        body: [[
          clienteNom,
          clienteNit,
          multi ? 'Multi-tramo' : 'Normal',
          multi ? `MULTI:${multi}` : `ID:${baseRow.id}`,
        ]],
        styles: { fontSize: 9 },
      })

      const yInfo = (doc as any).lastAutoTable.finalY + 4

      // Detalle
      autoTable(doc, {
        startY: yInfo,
        head: [[
          'Ubicación', 'Lote', 'Cant.', 'Peso(lb)', 'Q/lb', 'Subtotal (Q)'
        ]],
        body: filas.map(r => [
          r.granja_ubicaciones?.codigo || `#${r.ubicacion_id}`,
          r.granja_lotes?.codigo || '—',
          String(toNum(r.cantidad)),
          fmtN(toNum(r.peso_total_lb)),
          fmtN(toNum(r.precio_por_libra)),
          fmtQ(toNum(r.total)),
        ]),
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 22 },
          2: { cellWidth: 16, halign: 'right' },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 16, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
        },
      })

      const yTot = (doc as any).lastAutoTable.finalY + 4

      autoTable(doc, {
        startY: yTot,
        head: [['Totales', 'Valor']],
        body: [
          ['Cantidad total', String(totalCant)],
          ['Peso total (lb)', fmtN(totalPeso)],
          ['Total (Q)', fmtQ(totalQ)],
          ['Pagado (Q)', fmtQ(totalPagado)],
          ['Deuda (Q)', fmtQ(totalDeuda)],
        ],
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 40, halign: 'right' },
        },
        margin: { left: 120 },
      })

      const yObs = (doc as any).lastAutoTable.finalY + 6
      doc.setFontSize(9)
      const obs = baseRow.observaciones ? baseRow.observaciones : ''
      const obsClean = obs.replace(/MULTI:[a-zA-Z0-9_-]+/g, '').trim()
      if (obsClean) {
        doc.text('Observaciones:', 14, yObs)
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(obsClean, 180)
        doc.text(lines, 14, yObs + 4)
      }

      doc.setFontSize(8)
      doc.text('Este recibo corresponde a una venta registrada en el sistema.', 14, 285)

      const now = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      const name = `recibo_venta_${reciboNo}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
      doc.save(name)
    } finally {
      setGenerandoReciboId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-2">📄 Reporte de ventas de cerdos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Reporte con filtros + PDF profesional. Incluye recibos (tipo factura) por venta o por grupo multi-tramo.
      </p>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-3 mb-4">
        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input name="cliente_nombre" placeholder="Cliente" value={filtros.cliente_nombre} onChange={handleChange} className="border p-2" />
        <input name="cliente_nit" placeholder="NIT" value={filtros.cliente_nit} onChange={handleChange} className="border p-2" />

        <input name="ubicacion" placeholder="Ubicación (TR13...)" value={filtros.ubicacion} onChange={handleChange} className="border p-2" />
        <input name="lote" placeholder="Lote" value={filtros.lote} onChange={handleChange} className="border p-2" />

        <input name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />

        <label className="flex items-center gap-2 text-sm border p-2">
          <input
            type="checkbox"
            checked={filtros.solo_multi}
            onChange={(e) => setFiltros(prev => ({ ...prev, solo_multi: e.target.checked }))}
          />
          Solo multi-tramo
        </label>
      </div>

      {/* Botones */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar filtros
        </button>

        <button
          onClick={generarPDFReporte}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={ventas.length === 0}
          title={ventas.length === 0 ? 'No hay datos para generar PDF' : ''}
        >
          📄 Generar PDF (reporte)
        </button>

        <Link href="/granja/reportes" className="ml-auto bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded">
          ⬅ Volver
        </Link>
      </div>

      {/* Resumen */}
      <div className="grid md:grid-cols-5 gap-3 mb-6">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total cerdos vendidos</div>
          <div className="text-lg font-bold">{resumen.totalCerdos}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Peso total (lb)</div>
          <div className="text-lg font-bold">{resumen.totalPeso}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total (Q)</div>
          <div className="text-lg font-bold">Q{resumen.totalQ.toFixed(2)}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Pagado (Q)</div>
          <div className="text-lg font-bold">Q{resumen.pagadoQ.toFixed(2)}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Deuda (Q)</div>
          <div className="text-lg font-bold">Q{resumen.deudaQ.toFixed(2)}</div>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200 sticky top-0">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Cliente</th>
              <th className="p-2 text-left">NIT</th>
              <th className="p-2 text-left">Ubicación</th>
              <th className="p-2 text-left">Lote</th>
              <th className="p-2 text-right">Cant.</th>
              <th className="p-2 text-right">Peso(lb)</th>
              <th className="p-2 text-right">Q/lb</th>
              <th className="p-2 text-right">Total(Q)</th>
              <th className="p-2 text-right">Pagado</th>
              <th className="p-2 text-right">Deuda</th>
              <th className="p-2 text-left">MULTI</th>
              <th className="p-2 text-left">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-gray-500" colSpan={14}>Cargando…</td></tr>
            ) : ventas.length === 0 ? (
              <tr><td className="p-4 text-gray-500" colSpan={14}>No hay datos con esos filtros.</td></tr>
            ) : (
              ventas.map(v => {
                const multi = extraerMulti(v.observaciones)
                return (
                  <tr key={v.id} className="border-t">
                    <td className="p-2">{v.fecha}</td>
                    <td className="p-2">{v.id}</td>
                    <td className="p-2">{v.clientes?.nombre || '—'}</td>
                    <td className="p-2">{v.clientes?.nit || '—'}</td>
                    <td className="p-2">
                      <div className="font-medium">{v.granja_ubicaciones?.codigo || '—'}</div>
                      <div className="text-[11px] text-gray-500">{v.granja_ubicaciones?.nombre || ''}</div>
                    </td>
                    <td className="p-2">{v.granja_lotes?.codigo || '—'}</td>
                    <td className="p-2 text-right">{toNum(v.cantidad)}</td>
                    <td className="p-2 text-right">{toNum(v.peso_total_lb)}</td>
                    <td className="p-2 text-right">{toNum(v.precio_por_libra)}</td>
                    <td className="p-2 text-right">Q{round2(toNum(v.total)).toFixed(2)}</td>
                    <td className="p-2 text-right">Q{round2(toNum(v.pagado)).toFixed(2)}</td>
                    <td className="p-2 text-right">Q{round2(toNum(v.deuda)).toFixed(2)}</td>
                    <td className="p-2">{multi ? `MULTI-${multi.slice(0, 8).toUpperCase()}` : '—'}</td>
                    <td className="p-2">
                      <button
                        onClick={() => generarReciboPDF(v.id)}
                        disabled={generandoReciboId === v.id}
                        className={`px-3 py-1 rounded text-xs text-white ${generandoReciboId === v.id ? 'bg-gray-500' : 'bg-slate-800 hover:bg-slate-900'}`}
                        title={multi ? 'Genera recibo del grupo multi-tramo (mismo cliente y fecha)' : 'Genera recibo de esta venta'}
                      >
                        {generandoReciboId === v.id ? 'Generando…' : 'Recibo PDF'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Resumen por ubicación */}
      {resumen.ubicArr.length > 0 && (
        <div className="mt-6 border rounded bg-white p-4">
          <h2 className="font-semibold mb-2">Resumen por ubicación (cerdos vendidos)</h2>
          <div className="grid md:grid-cols-3 gap-2">
            {resumen.ubicArr.map(u => (
              <div key={u.codigo} className="border rounded p-2 flex justify-between text-sm">
                <span className="font-medium">{u.codigo}</span>
                <span>{u.cant}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
