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

    autoTable(doc, {
      startY: 46,
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

    const yAfterResumen = (doc as any).lastAutoTable.finalY + 6
    autoTable(doc, {
      startY: yAfterResumen,
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
      columnStyles: { 2: { cellWidth: 30 } },
    })

    const now = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const name = `reporte_ventas_cerdos_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
    doc.save(name)
  }

  // ✅ RECIBO / FACTURA agrupando multi-tramo de verdad
  const generarReciboPDF = async (ventaId: number) => {
    setGenerandoReciboId(ventaId)
    try {
      // 1) venta base
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

      // 2) filas a imprimir
      let filas: VentaRow[] = [baseRow]

      if (multi) {
        // 👇 robusto: trae TODAS las filas que tengan ese MULTI, sin depender de fecha
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
          .ilike('observaciones', `%MULTI:${multi}%`)
          .order('id', { ascending: true })

        if (multiErr) {
          console.error(multiErr)
          alert('No se pudo cargar el grupo MULTI para el recibo.')
          return
        }

        const all = (multiRows as any as VentaRow[]) || []
        // filtra por mismo cliente (y prioriza misma fecha si existen)
        const sameClient = all.filter(r => r.cliente_id === baseRow.cliente_id)

        const sameFecha = sameClient.filter(r => r.fecha === baseRow.fecha)
        filas = sameFecha.length > 0 ? sameFecha : (sameClient.length > 0 ? sameClient : [baseRow])

        // orden por ubicación para que se vea “juntito”
        filas = [...filas].sort((a, b) => {
          const ca = a.granja_ubicaciones?.codigo || ''
          const cb = b.granja_ubicaciones?.codigo || ''
          return ca.localeCompare(cb, 'es')
        })
      }

      // 3) totales
      const totalCant = filas.reduce((a, r) => a + toNum(r.cantidad), 0)
      const totalPeso = filas.reduce((a, r) => a + toNum(r.peso_total_lb), 0)
      const totalQ = filas.reduce((a, r) => a + toNum(r.total), 0)
      const totalPagado = filas.reduce((a, r) => a + toNum(r.pagado), 0)
      const totalDeuda = filas.reduce((a, r) => a + toNum(r.deuda), 0)

      const reciboNo = multi ? `MULTI-${multi.slice(0, 8).toUpperCase()}` : `V-${baseRow.id}`

      // 4) PDF tipo factura
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

      // ✅ tabla de líneas (todas juntas)
      autoTable(doc, {
        startY: yInfo,
        head: [[ 'Ubicación', 'Lote', 'Cant.', 'Peso(lb)', 'Q/lb', 'Subtotal (Q)' ]],
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
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
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
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 120 },
      })

      const yObs = (doc as any).lastAutoTable.finalY + 6
      doc.setFontSize(9)

      // limpiamos MULTI:xxx y (i/n)
      const obs = (baseRow.observaciones || '')
        .replace(/MULTI:[a-zA-Z0-9_-]+/g, '')
        .replace(/\(\d+\/\d+\)/g, '')
        .trim()

      if (obs) {
        doc.text('Observaciones:', 14, yObs)
        doc.setFontSize(8)
        doc.text(doc.splitTextToSize(obs, 180), 14, yObs + 4)
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
        Incluye recibos (factura) por venta normal o agrupado por MULTI para multi-tramo.
      </p>

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

      <div className="mb-6 flex items-center gap-3">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar filtros
        </button>

        <button
          onClick={generarPDFReporte}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={ventas.length === 0}
        >
          📄 Generar PDF (reporte)
        </button>

        <Link href="/granja/reportes" className="ml-auto bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded">
          ⬅ Volver
        </Link>
      </div>

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
                    <td className="p-2">{v.granja_ubicaciones?.codigo || '—'}</td>
                    <td className="p-2">{v.granja_lotes?.codigo || '—'}</td>
                    <td className="p-2 text-right">{toNum(v.cantidad)}</td>
                    <td className="p-2 text-right">{toNum(v.peso_total_lb)}</td>
                    <td className="p-2 text-right">{toNum(v.precio_por_libra)}</td>
                    <td className="p-2 text-right">{fmtQ(toNum(v.total))}</td>
                    <td className="p-2 text-right">{fmtQ(toNum(v.pagado))}</td>
                    <td className="p-2 text-right">{fmtQ(toNum(v.deuda))}</td>
                    <td className="p-2">{multi ? `MULTI-${multi.slice(0, 8).toUpperCase()}` : '—'}</td>
                    <td className="p-2">
                      <button
                        onClick={() => generarReciboPDF(v.id)}
                        disabled={generandoReciboId === v.id}
                        className={`px-3 py-1 rounded text-xs text-white ${
                          generandoReciboId === v.id ? 'bg-gray-500' : 'bg-slate-800 hover:bg-slate-900'
                        }`}
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
    </div>
  )
}
