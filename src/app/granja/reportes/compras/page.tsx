'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type CompraRow = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  es_compra: boolean
  proveedor_id: number | null
  cantidad: number
  hembras: number | null
  machos: number | null
  peso_total_kg: number | null
  precio_total: number | null
  observaciones: string | null
  created_at: string | null

  proveedores?: { nombre?: string; nit?: string } | null
  granja_ubicaciones?: { codigo?: string; nombre?: string } | null
  granja_lotes?: { codigo?: string } | null
}

type Filtros = {
  desde: string
  hasta: string
  id: string
  proveedor_nombre: string
  proveedor_nit: string
  ubicacion: string
  lote: string
  incluir_no_compra: boolean // si quieres ver registros con es_compra=false
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100
const fmtQ = (n: number) => `Q${round2(n).toFixed(2)}`
const fmtN = (n: number) => `${round2(n).toFixed(2)}`

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

export default function ReporteComprasGranjaPage() {
  const [compras, setCompras] = useState<CompraRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generandoReciboId, setGenerandoReciboId] = useState<number | null>(null)

  const [filtros, setFiltros] = useState<Filtros>({
    desde: '',
    hasta: '',
    id: '',
    proveedor_nombre: '',
    proveedor_nit: '',
    ubicacion: '',
    lote: '',
    incluir_no_compra: false,
  })

  useEffect(() => {
    const hoy = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const f = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`
    setFiltros((prev) => ({ ...prev, desde: f, hasta: f }))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('granja_compras_cerdos')
        .select(`
          id, fecha, ubicacion_id, lote_id, es_compra, proveedor_id,
          cantidad, hembras, machos, peso_total_kg, precio_total,
          observaciones, created_at,
          proveedores ( nombre, nit ),
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (!filtros.incluir_no_compra) {
        query = query.eq('es_compra', true)
      }

      if (filtros.id.trim()) query = query.eq('id', filtros.id.trim())
      if (filtros.desde) query = query.gte('fecha', filtros.desde)
      if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

      const { data, error } = await query
      if (error) {
        console.error('Error cargando compras de granja', error)
        setCompras([])
        return
      }

      let rows = ((data || []) as any as CompraRow[])

      // filtros “texto” client-side (evita líos con joins)
      const pn = filtros.proveedor_nombre.trim().toLowerCase()
      const pnit = filtros.proveedor_nit.trim().toLowerCase()
      const ub = filtros.ubicacion.trim().toLowerCase()
      const lt = filtros.lote.trim().toLowerCase()

      if (pn) rows = rows.filter(r => (r.proveedores?.nombre || '').toLowerCase().includes(pn))
      if (pnit) rows = rows.filter(r => (r.proveedores?.nit || '').toLowerCase().includes(pnit))
      if (ub) rows = rows.filter(r => (r.granja_ubicaciones?.codigo || '').toLowerCase().includes(ub))
      if (lt) rows = rows.filter(r => (r.granja_lotes?.codigo || '').toLowerCase().includes(lt))

      setCompras(rows)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const resumen = useMemo(() => {
    const totalCerdos = compras.reduce((a, r) => a + toNum(r.cantidad), 0)
    const totalH = compras.reduce((a, r) => a + toNum(r.hembras), 0)
    const totalM = compras.reduce((a, r) => a + toNum(r.machos), 0)
    const totalKg = compras.reduce((a, r) => a + toNum(r.peso_total_kg), 0)
    const totalQ = compras.reduce((a, r) => a + toNum(r.precio_total), 0)

    const porUbic: Record<string, number> = {}
    compras.forEach(r => {
      const key = r.granja_ubicaciones?.codigo || `UBI#${r.ubicacion_id}`
      porUbic[key] = (porUbic[key] || 0) + toNum(r.cantidad)
    })

    const ubicArr = Object.entries(porUbic)
      .map(([codigo, cant]) => ({ codigo, cant }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))

    return {
      totalCerdos,
      totalH,
      totalM,
      totalKg: round2(totalKg),
      totalQ: round2(totalQ),
      ubicArr,
    }
  }, [compras])

  const generarPDFReporte = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const logo = await fetchLogoDataUrl()
    if (logo) doc.addImage(logo, 'PNG', 80, 10, 50, 18)

    doc.setFontSize(14)
    doc.text('Reporte de Compras de Cerdos', 14, 35)

    doc.setFontSize(10)
    const rango = `${filtros.desde || '—'}  a  ${filtros.hasta || '—'}`
    doc.text(`Rango: ${rango}`, 14, 41)

    const filtrosTxt = [
      filtros.id ? `ID: ${filtros.id}` : null,
      filtros.proveedor_nombre ? `Proveedor: ${filtros.proveedor_nombre}` : null,
      filtros.proveedor_nit ? `NIT: ${filtros.proveedor_nit}` : null,
      filtros.ubicacion ? `Ubicación: ${filtros.ubicacion}` : null,
      filtros.lote ? `Lote: ${filtros.lote}` : null,
      filtros.incluir_no_compra ? 'Incluye es_compra=false' : null,
    ].filter(Boolean) as string[]

    if (filtrosTxt.length) doc.text(`Filtros: ${filtrosTxt.join(' | ')}`, 14, 46)

    autoTable(doc, {
      startY: 52,
      head: [['Resumen', 'Valor']],
      body: [
        ['Total cerdos comprados', String(resumen.totalCerdos)],
        ['Hembras', String(resumen.totalH)],
        ['Machos', String(resumen.totalM)],
        ['Peso total (kg)', String(resumen.totalKg)],
        ['Total (Q)', fmtQ(resumen.totalQ)],
      ],
      styles: { fontSize: 9 },
    })

    const yAfterResumen = (doc as any).lastAutoTable.finalY + 4
    autoTable(doc, {
      startY: yAfterResumen,
      head: [['Ubicación', 'Cerdos comprados']],
      body: resumen.ubicArr.map(u => [u.codigo, String(u.cant)]),
      styles: { fontSize: 9 },
    })

    const yAfterUbic = (doc as any).lastAutoTable.finalY + 6
    autoTable(doc, {
      startY: yAfterUbic,
      head: [[
        'Fecha', 'ID', 'Proveedor', 'NIT', 'Ubicación', 'Lote',
        'Cant.', 'H', 'M', 'Peso(kg)', 'Total(Q)', 'Tipo'
      ]],
      body: compras.map(r => [
        r.fecha,
        String(r.id),
        r.proveedores?.nombre || '—',
        r.proveedores?.nit || '—',
        r.granja_ubicaciones?.codigo || '—',
        r.granja_lotes?.codigo || '—',
        String(toNum(r.cantidad)),
        String(toNum(r.hembras)),
        String(toNum(r.machos)),
        fmtN(toNum(r.peso_total_kg)),
        fmtQ(toNum(r.precio_total)),
        r.es_compra ? 'COMPRA' : 'OTRO',
      ]),
      styles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 10 },
        2: { cellWidth: 30 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 12 },
      },
    })

    const now = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const name = `reporte_compras_cerdos_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
    doc.save(name)
  }

  const generarReciboPDF = async (compraId: number) => {
    setGenerandoReciboId(compraId)
    try {
      const { data: base, error } = await supabase
        .from('granja_compras_cerdos')
        .select(`
          id, fecha, ubicacion_id, lote_id, es_compra, proveedor_id,
          cantidad, hembras, machos, peso_total_kg, precio_total,
          observaciones, created_at,
          proveedores ( nombre, nit, direccion, contacto_nombre, telefono ),
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `)
        .eq('id', compraId)
        .single()

      if (error || !base) {
        console.error(error)
        alert('No se pudo cargar la compra para generar recibo.')
        return
      }

      const r = base as any as CompraRow & {
        proveedores?: { nombre?: string; nit?: string; direccion?: string; contacto_nombre?: string; telefono?: string } | null
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 14, 10, 35, 14)

      doc.setFontSize(14)
      doc.text('RECIBO DE COMPRA', 105, 16, { align: 'center' })

      doc.setFontSize(10)
      doc.text(`No. Recibo: C-${r.id}`, 150, 12)
      doc.text(`Fecha: ${r.fecha}`, 150, 17)

      const provNom = r.proveedores?.nombre || '—'
      const provNit = r.proveedores?.nit || '—'

      autoTable(doc, {
        startY: 28,
        head: [['Proveedor', 'NIT', 'Ubicación', 'Lote']],
        body: [[
          provNom,
          provNit,
          r.granja_ubicaciones?.codigo || `#${r.ubicacion_id}`,
          r.granja_lotes?.codigo || '—',
        ]],
        styles: { fontSize: 9 },
      })

      const yInfo = (doc as any).lastAutoTable.finalY + 4

      autoTable(doc, {
        startY: yInfo,
        head: [[ 'Detalle', 'Valor' ]],
        body: [
          ['Tipo', r.es_compra ? 'COMPRA' : 'OTRO'],
          ['Cantidad', String(toNum(r.cantidad))],
          ['Hembras', String(toNum(r.hembras))],
          ['Machos', String(toNum(r.machos))],
          ['Peso total (kg)', fmtN(toNum(r.peso_total_kg))],
          ['Total (Q)', fmtQ(toNum(r.precio_total))],
        ],
        styles: { fontSize: 9 },
        columnStyles: { 1: { halign: 'right' } },
      })

      const yObs = (doc as any).lastAutoTable.finalY + 8
      const obs = (r.observaciones || '').trim()
      if (obs) {
        doc.setFontSize(9)
        doc.text('Observaciones:', 14, yObs)
        doc.setFontSize(8)
        doc.text(doc.splitTextToSize(obs, 180), 14, yObs + 4)
      }

      doc.setFontSize(8)
      doc.text('Este recibo corresponde a una compra registrada en el sistema.', 14, 285)

      const now = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      const name = `recibo_compra_C-${r.id}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
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

      <h1 className="text-2xl font-bold mb-2">📄 Reporte de compras de cerdos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Reporte PDF + recibo individual por compra.
      </p>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-3 mb-4">
        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input name="proveedor_nombre" placeholder="Proveedor" value={filtros.proveedor_nombre} onChange={handleChange} className="border p-2" />
        <input name="proveedor_nit" placeholder="NIT proveedor" value={filtros.proveedor_nit} onChange={handleChange} className="border p-2" />

        <input name="ubicacion" placeholder="Ubicación (TR...)" value={filtros.ubicacion} onChange={handleChange} className="border p-2" />
        <input name="lote" placeholder="Lote" value={filtros.lote} onChange={handleChange} className="border p-2" />

        <input name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />

        <label className="flex items-center gap-2 text-sm border p-2">
          <input
            type="checkbox"
            checked={filtros.incluir_no_compra}
            onChange={(e) => setFiltros(prev => ({ ...prev, incluir_no_compra: e.target.checked }))}
          />
          Incluir no-compra
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
          disabled={compras.length === 0}
          title={compras.length === 0 ? 'No hay datos para generar PDF' : ''}
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
          <div className="text-xs text-gray-500">Total cerdos comprados</div>
          <div className="text-lg font-bold">{resumen.totalCerdos}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Hembras</div>
          <div className="text-lg font-bold">{resumen.totalH}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Machos</div>
          <div className="text-lg font-bold">{resumen.totalM}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Peso total (kg)</div>
          <div className="text-lg font-bold">{resumen.totalKg}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total (Q)</div>
          <div className="text-lg font-bold">{fmtQ(resumen.totalQ)}</div>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200 sticky top-0">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Proveedor</th>
              <th className="p-2 text-left">NIT</th>
              <th className="p-2 text-left">Ubicación</th>
              <th className="p-2 text-left">Lote</th>
              <th className="p-2 text-right">Cant.</th>
              <th className="p-2 text-right">H</th>
              <th className="p-2 text-right">M</th>
              <th className="p-2 text-right">Peso(kg)</th>
              <th className="p-2 text-right">Total(Q)</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-gray-500" colSpan={13}>Cargando…</td></tr>
            ) : compras.length === 0 ? (
              <tr><td className="p-4 text-gray-500" colSpan={13}>No hay datos con esos filtros.</td></tr>
            ) : (
              compras.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.fecha}</td>
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">{r.proveedores?.nombre || '—'}</td>
                  <td className="p-2">{r.proveedores?.nit || '—'}</td>
                  <td className="p-2">{r.granja_ubicaciones?.codigo || '—'}</td>
                  <td className="p-2">{r.granja_lotes?.codigo || '—'}</td>
                  <td className="p-2 text-right">{toNum(r.cantidad)}</td>
                  <td className="p-2 text-right">{toNum(r.hembras)}</td>
                  <td className="p-2 text-right">{toNum(r.machos)}</td>
                  <td className="p-2 text-right">{fmtN(toNum(r.peso_total_kg))}</td>
                  <td className="p-2 text-right">{fmtQ(toNum(r.precio_total))}</td>
                  <td className="p-2">{r.es_compra ? 'COMPRA' : 'OTRO'}</td>
                  <td className="p-2">
                    <button
                      onClick={() => generarReciboPDF(r.id)}
                      disabled={generandoReciboId === r.id}
                      className={`px-3 py-1 rounded text-xs text-white ${
                        generandoReciboId === r.id ? 'bg-gray-500' : 'bg-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      {generandoReciboId === r.id ? 'Generando…' : 'Recibo PDF'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Resumen por ubicación */}
      {resumen.ubicArr.length > 0 && (
        <div className="mt-6 border rounded bg-white p-4">
          <h2 className="font-semibold mb-2">Resumen por ubicación (cerdos comprados)</h2>
          <div className="grid md:grid-cols-3 gap-2">
            {resumen.ubicArr.map((u) => (
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