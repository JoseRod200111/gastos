'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Empresa = {
  id: number
  nombre: string
}

type Division = {
  id: number
  nombre: string
}

type Categoria = {
  id: number
  nombre: string
}

type Proveedor = {
  nombre?: string | null
  nit?: string | null
} | null

type ErogacionRow = {
  id: number
  fecha: string
  cantidad: number | null
  observaciones: string | null
  editado_en: string | null
  editado_por: string | null
  empresa_id: number | null
  division_id: number | null
  categoria_id: number | null
  proveedor_id: number | null
  empresas?: { nombre?: string | null } | null
  divisiones?: { nombre?: string | null } | null
  categorias?: { nombre?: string | null } | null
  proveedores?: Proveedor
}

type DetalleCompraRow = {
  erogacion_id: number
  concepto: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
  documento: string | null
  forma_pago?: { metodo?: string | null } | null
}

type Filtros = {
  empresa_id: string
  division_id: string
  categoria_id: string
  desde: string
  hasta: string
  id: string
  proveedor_nombre: string
  proveedor_nit: string
}

const fmtQ = (n: number) => `Q${n.toFixed(2)}`
const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const hoyStr = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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

export default function ReportesPage() {
  const [erogaciones, setErogaciones] = useState<ErogacionRow[]>([])
  const [detalles, setDetalles] = useState<Record<number, DetalleCompraRow[]>>({})

  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [filtros, setFiltros] = useState<Filtros>({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: '',
    id: '',
    proveedor_nombre: '',
    proveedor_nit: '',
  })

  useEffect(() => {
    const hoy = hoyStr()
    setFiltros((prev) => ({
      ...prev,
      desde: hoy,
      hasta: hoy,
    }))
  }, [])

  useEffect(() => {
    cargarOpciones()
  }, [])

  const cargarOpciones = async () => {
    const [emp, div, cat] = await Promise.all([
      supabase.from('empresas').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('divisiones').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('categorias').select('id,nombre').order('nombre', { ascending: true }),
    ])

    setEmpresas((emp.data || []) as Empresa[])
    setDivisiones((div.data || []) as Division[])
    setCategorias((cat.data || []) as Categoria[])
  }

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      let query = supabase
        .from('erogaciones')
        .select(`
          id,
          fecha,
          cantidad,
          observaciones,
          editado_en,
          editado_por,
          empresa_id,
          division_id,
          categoria_id,
          proveedor_id,
          empresas(nombre),
          divisiones(nombre),
          categorias(nombre),
          proveedores(nombre,nit)
        `)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (filtros.id.trim()) {
        query = query.eq('id', filtros.id.trim())
      }
      if (filtros.empresa_id) {
        query = query.eq('empresa_id', filtros.empresa_id)
      }
      if (filtros.division_id) {
        query = query.eq('division_id', filtros.division_id)
      }
      if (filtros.categoria_id) {
        query = query.eq('categoria_id', filtros.categoria_id)
      }
      if (filtros.desde) {
        query = query.gte('fecha', filtros.desde)
      }
      if (filtros.hasta) {
        query = query.lte('fecha', filtros.hasta)
      }
      if (filtros.proveedor_nombre.trim()) {
        query = query.ilike('proveedores.nombre', `%${filtros.proveedor_nombre.trim()}%`)
      }
      if (filtros.proveedor_nit.trim()) {
        query = query.ilike('proveedores.nit', `%${filtros.proveedor_nit.trim()}%`)
      }

      const { data, error } = await query

      if (error) {
        console.error(error)
        alert(`No se pudieron cargar las erogaciones: ${error.message}`)
        return
      }

      const rows = (data || []) as ErogacionRow[]
      setErogaciones(rows)

      const ids = rows.map((r) => r.id)
      if (ids.length === 0) {
        setDetalles({})
        return
      }

      const { data: detallesData, error: detallesError } = await supabase
        .from('detalle_compra')
        .select(`
          erogacion_id,
          concepto,
          cantidad,
          precio_unitario,
          importe,
          documento,
          forma_pago(metodo)
        `)
        .in('erogacion_id', ids)
        .order('erogacion_id', { ascending: true })

      if (detallesError) {
        console.error(detallesError)
        alert(`No se pudieron cargar los detalles: ${detallesError.message}`)
        return
      }

      const grouped: Record<number, DetalleCompraRow[]> = {}
      ;((detallesData || []) as DetalleCompraRow[]).forEach((item) => {
        if (!grouped[item.erogacion_id]) grouped[item.erogacion_id] = []
        grouped[item.erogacion_id].push(item)
      })

      setDetalles(grouped)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    if (filtros.desde && filtros.hasta) {
      cargarDatos()
    }
  }, [cargarDatos, filtros.desde, filtros.hasta])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const resumen = useMemo(() => {
    const totalRegistros = erogaciones.length
    const totalMonto = erogaciones.reduce((acc, row) => acc + toNum(row.cantidad), 0)
    const totalDetalles = Object.values(detalles).reduce((acc, arr) => acc + arr.length, 0)

    return {
      totalRegistros,
      totalMonto,
      totalDetalles,
    }
  }, [erogaciones, detalles])

  const generarPDF = async () => {
    if (erogaciones.length === 0) {
      alert('No hay erogaciones para generar el reporte.')
      return
    }

    setGenerando(true)

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 12
      const contentWidth = pageWidth - margin * 2
      const logo = await fetchLogoDataUrl()

      const drawHeader = (showFilters = false) => {
        let y = 10

        if (logo) {
          doc.addImage(logo, 'PNG', pageWidth / 2 - 22, y, 44, 18)
          y += 22
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        doc.setTextColor(20, 20, 20)
        doc.text('Reporte de Erogaciones', pageWidth / 2, y, { align: 'center' })
        y += 6

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(90, 90, 90)
        doc.text(`Generado: ${new Date().toLocaleString()}`, pageWidth / 2, y, {
          align: 'center',
        })
        y += 7

        if (showFilters) {
          autoTable(doc, {
            startY: y,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: {
              fillColor: [31, 41, 55],
              textColor: 255,
              halign: 'center',
            },
            body: [
              ['Desde', filtros.desde || '—', 'Hasta', filtros.hasta || '—'],
              ['Empresa', empresas.find((e) => String(e.id) === filtros.empresa_id)?.nombre || 'Todas', 'División', divisiones.find((d) => String(d.id) === filtros.division_id)?.nombre || 'Todas'],
              ['Categoría', categorias.find((c) => String(c.id) === filtros.categoria_id)?.nombre || 'Todas', 'ID', filtros.id || 'Todos'],
              ['Proveedor', filtros.proveedor_nombre || 'Todos', 'NIT', filtros.proveedor_nit || 'Todos'],
            ],
            margin: { left: margin, right: margin },
            columnStyles: {
              0: { fontStyle: 'bold', fillColor: [245, 245, 245] },
              2: { fontStyle: 'bold', fillColor: [245, 245, 245] },
            },
          })

          y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 5

          autoTable(doc, {
            startY: y,
            theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 2 },
            headStyles: {
              fillColor: [16, 185, 129],
              textColor: 255,
              halign: 'center',
            },
            body: [
              ['Registros', String(resumen.totalRegistros), 'Total', fmtQ(resumen.totalMonto)],
              ['Líneas de detalle', String(resumen.totalDetalles), 'Página', '1'],
            ],
            margin: { left: margin, right: margin },
            columnStyles: {
              0: { fontStyle: 'bold', fillColor: [245, 245, 245] },
              2: { fontStyle: 'bold', fillColor: [245, 245, 245] },
            },
          })

          return ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 6
        }

        return y + 2
      }

      let y = drawHeader(true)

      for (let index = 0; index < erogaciones.length; index++) {
        const e = erogaciones[index]
        const detalleRows = detalles[e.id] || []

        const empresa = e.empresas?.nombre || '—'
        const division = e.divisiones?.nombre || '—'
        const categoria = e.categorias?.nombre || '—'
        const proveedor = e.proveedores?.nombre || '—'
        const nit = e.proveedores?.nit || '—'
        const observaciones = e.observaciones?.trim() || 'N/A'

        const obsLines = doc.splitTextToSize(observaciones, contentWidth - 8)
        const tableHeightEstimate = 16 + detalleRows.length * 7
        const footerHeight = e.editado_en && e.editado_por ? 8 : 3
        const headerBlockHeight = 36 + obsLines.length * 4
        const estimatedCardHeight = headerBlockHeight + tableHeightEstimate + footerHeight + 8

        if (y + estimatedCardHeight > pageHeight - 12) {
          doc.addPage()
          y = drawHeader(false)
        }

        doc.setDrawColor(180, 180, 180)
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(margin, y, contentWidth, estimatedCardHeight, 2, 2, 'FD')

        doc.setFillColor(31, 41, 55)
        doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(10.5)
        doc.text(`Erogación #${e.id}`, margin + 4, y + 6.5)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.text(`Fecha: ${e.fecha}`, pageWidth - margin - 4, y + 6.5, { align: 'right' })

        let bodyY = y + 15
        doc.setTextColor(20, 20, 20)
        doc.setFontSize(9)

        const lineGap = 4.4
        const leftX = margin + 4
        const midX = margin + contentWidth / 2 + 2

        doc.setFont('helvetica', 'bold')
        doc.text('Empresa:', leftX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(doc.splitTextToSize(empresa, contentWidth / 2 - 15), leftX + 18, bodyY)

        doc.setFont('helvetica', 'bold')
        doc.text('División:', midX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(doc.splitTextToSize(division, contentWidth / 2 - 18), midX + 17, bodyY)
        bodyY += lineGap

        doc.setFont('helvetica', 'bold')
        doc.text('Categoría:', leftX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(doc.splitTextToSize(categoria, contentWidth / 2 - 20), leftX + 21, bodyY)

        doc.setFont('helvetica', 'bold')
        doc.text('Proveedor:', midX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(doc.splitTextToSize(proveedor, contentWidth / 2 - 20), midX + 19, bodyY)
        bodyY += lineGap

        doc.setFont('helvetica', 'bold')
        doc.text('NIT:', leftX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(doc.splitTextToSize(nit, contentWidth / 2 - 12), leftX + 9, bodyY)

        doc.setFont('helvetica', 'bold')
        doc.text('Total:', midX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(fmtQ(toNum(e.cantidad)), midX + 11, bodyY)
        bodyY += lineGap + 0.5

        doc.setFont('helvetica', 'bold')
        doc.text('Observaciones:', leftX, bodyY)
        doc.setFont('helvetica', 'normal')
        doc.text(obsLines, leftX + 26, bodyY)
        bodyY += Math.max(1, obsLines.length) * 4.1 + 2

        autoTable(doc, {
          startY: bodyY,
          theme: 'grid',
          margin: { left: margin + 3, right: margin + 3 },
          styles: {
            fontSize: 8,
            cellPadding: 1.8,
            overflow: 'linebreak',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            halign: 'center',
            fontStyle: 'bold',
          },
          columnStyles: {
            0: { cellWidth: 62 },
            1: { cellWidth: 12, halign: 'center' },
            2: { cellWidth: 19, halign: 'right' },
            3: { cellWidth: 19, halign: 'right' },
            4: { cellWidth: 28, halign: 'center' },
            5: { cellWidth: 20, halign: 'center' },
          },
          head: [['Concepto', 'Cant.', 'P.Unit', 'Importe', 'Pago', 'Doc.']],
          body:
            detalleRows.length > 0
              ? detalleRows.map((d) => [
                  d.concepto || '—',
                  String(toNum(d.cantidad)),
                  fmtQ(toNum(d.precio_unitario)),
                  fmtQ(toNum(d.importe)),
                  d.forma_pago?.metodo || '—',
                  d.documento || 'N/A',
                ])
              : [['Sin detalles', '', '', '', '', '']],
        })

        bodyY =
          ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ||
            bodyY) + 4

        if (e.editado_en && e.editado_por) {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(8)
          doc.setTextColor(95, 95, 95)
          doc.text(
            `Editado: ${new Date(e.editado_en).toLocaleString()} por ${e.editado_por}`,
            pageWidth - margin - 4,
            bodyY,
            { align: 'right' }
          )
          bodyY += 3
        }

        y = bodyY + 5
      }

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - 12, pageHeight - 6, {
          align: 'right',
        })
      }

      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const filename = `reporte_erogaciones_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`

      doc.save(filename)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo Empresa" width={150} height={70} />
      </div>

      <div className="flex flex-wrap items-start gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Reporte de Erogaciones</h1>
          <p className="text-sm text-gray-600">
            Consulta erogaciones y genera un PDF con mejor presentación.
          </p>
        </div>

        <div className="ml-auto flex gap-2">
          <Link
            href="/dashboard"
            className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
          >
            ← Volver
          </Link>
        </div>
      </div>

      <div className="border rounded-lg bg-white p-4 shadow-sm mb-5">
        <h2 className="font-semibold mb-3">Filtros</h2>

        <div className="grid md:grid-cols-4 gap-3">
          <select
            name="empresa_id"
            value={filtros.empresa_id}
            onChange={handleChange}
            className="border rounded p-2"
          >
            <option value="">Todas las empresas</option>
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
            className="border rounded p-2"
          >
            <option value="">Todas las divisiones</option>
            {divisiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>

          <select
            name="categoria_id"
            value={filtros.categoria_id}
            onChange={handleChange}
            className="border rounded p-2"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <input
            type="text"
            name="id"
            placeholder="ID"
            value={filtros.id}
            onChange={handleChange}
            className="border rounded p-2"
          />

          <input
            type="date"
            name="desde"
            value={filtros.desde}
            onChange={handleChange}
            className="border rounded p-2"
          />

          <input
            type="date"
            name="hasta"
            value={filtros.hasta}
            onChange={handleChange}
            className="border rounded p-2"
          />

          <input
            type="text"
            name="proveedor_nombre"
            placeholder="Proveedor"
            value={filtros.proveedor_nombre}
            onChange={handleChange}
            className="border rounded p-2"
          />

          <input
            type="text"
            name="proveedor_nit"
            placeholder="NIT proveedor"
            value={filtros.proveedor_nit}
            onChange={handleChange}
            className="border rounded p-2"
          />
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {loading ? 'Cargando...' : 'Buscar'}
          </button>

          <button
            onClick={generarPDF}
            disabled={generando || erogaciones.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {generando ? 'Generando PDF...' : 'Generar PDF'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Erogaciones encontradas</div>
          <div className="text-2xl font-bold">{resumen.totalRegistros}</div>
        </div>

        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Monto total</div>
          <div className="text-2xl font-bold">{fmtQ(resumen.totalMonto)}</div>
        </div>

        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Líneas de detalle</div>
          <div className="text-2xl font-bold">{resumen.totalDetalles}</div>
        </div>
      </div>

      <div className="grid gap-4">
        {erogaciones.length === 0 ? (
          <div className="border rounded-lg bg-white p-8 text-center text-gray-500 shadow-sm">
            No se encontraron erogaciones.
          </div>
        ) : (
          erogaciones.map((e) => {
            const det = detalles[e.id] || []

            return (
              <div key={e.id} className="border rounded-xl bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-800 text-white px-4 py-3 flex flex-wrap gap-3 items-center">
                  <div className="font-bold">Erogación #{e.id}</div>
                  <div className="text-sm opacity-90">Fecha: {e.fecha}</div>
                  <div className="ml-auto font-semibold">{fmtQ(toNum(e.cantidad))}</div>
                </div>

                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-semibold">Empresa:</span> {e.empresas?.nombre || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">División:</span> {e.divisiones?.nombre || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">Categoría:</span> {e.categorias?.nombre || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">Proveedor:</span> {e.proveedores?.nombre || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">NIT:</span> {e.proveedores?.nit || '—'}
                  </div>
                  <div className="md:col-span-2">
                    <span className="font-semibold">Observaciones:</span>{' '}
                    {e.observaciones?.trim() || 'N/A'}
                  </div>
                </div>

                <div className="px-4 pb-4">
                  <div className="overflow-auto border rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-600 text-white">
                        <tr>
                          <th className="p-2 text-left">Concepto</th>
                          <th className="p-2 text-center">Cant.</th>
                          <th className="p-2 text-right">P.Unit</th>
                          <th className="p-2 text-right">Importe</th>
                          <th className="p-2 text-center">Pago</th>
                          <th className="p-2 text-center">Doc.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-3 text-center text-gray-500">
                              Sin detalles
                            </td>
                          </tr>
                        ) : (
                          det.map((d, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="p-2">{d.concepto || '—'}</td>
                              <td className="p-2 text-center">{toNum(d.cantidad)}</td>
                              <td className="p-2 text-right">{fmtQ(toNum(d.precio_unitario))}</td>
                              <td className="p-2 text-right">{fmtQ(toNum(d.importe))}</td>
                              <td className="p-2 text-center">{d.forma_pago?.metodo || '—'}</td>
                              <td className="p-2 text-center">{d.documento || 'N/A'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {e.editado_en && e.editado_por ? (
                    <div className="text-xs text-gray-500 text-right mt-3">
                      Editado: {new Date(e.editado_en).toLocaleString()} por {e.editado_por}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
