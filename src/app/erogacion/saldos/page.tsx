'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Proveedor = {
  id: number
  nombre: string
  nit: string | null
  telefono?: string | null
}

type SaldoVista = {
  erogacion_id: number
  fecha: string
  proveedor_id: number | null
  proveedor: string | null
  nit: string | null
  empresa: string | null
  division: string | null
  categoria: string | null
  credito: number
  abonado: number
  saldo: number
  estado_saldo: string
}

type SaldoProveedor = {
  proveedor_id: number
  proveedor: string
  nit: string | null
  credito: number
  abonado: number
  saldo: number
  erogaciones: number
  pendientes: number
  pagadas: number
  ultima_fecha: string
}

const PAGE_SIZE = 1000

const toNum = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const money = (value: unknown) => `Q${round2(toNum(value)).toFixed(2)}`

function todayISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function fileStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
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

async function fetchAllSaldos() {
  const all: SaldoVista[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('v_erogaciones_saldos')
      .select('*')
      .order('fecha', { ascending: false })
      .order('erogacion_id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: all, error }

    all.push(...(((data || []) as unknown[]) as SaldoVista[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}

export default function SaldosProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [rowsBase, setRowsBase] = useState<SaldoVista[]>([])
  const [loading, setLoading] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const [filtros, setFiltros] = useState({
    proveedor_id: '',
    busqueda: '',
    estado: 'PENDIENTES',
    desde: '',
    hasta: todayISO(),
  })

  const cargarProveedores = useCallback(async () => {
    const { data, error } = await supabase
      .from('proveedores')
      .select('id,nombre,nit,telefono')
      .order('nombre', { ascending: true })

    if (error) {
      console.error(error)
      setMensaje(`Error cargando proveedores: ${error.message}`)
      return
    }

    setProveedores((data || []) as Proveedor[])
  }, [])

  const cargarSaldos = useCallback(async () => {
    setLoading(true)
    setMensaje('')

    try {
      const { data, error } = await fetchAllSaldos()

      if (error) {
        console.error(error)
        setRowsBase([])
        setMensaje(
          `No se pudieron cargar saldos. Verificá que ya ejecutaste sql/erogaciones_saldos_proveedores.sql. Detalle: ${error.message}`
        )
        return
      }

      setRowsBase(data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarProveedores()
    cargarSaldos()
  }, [cargarProveedores, cargarSaldos])

  const rowsFiltradas = useMemo(() => {
    const q = filtros.busqueda.trim().toLowerCase()

    return rowsBase.filter((row) => {
      if (filtros.proveedor_id && String(row.proveedor_id || '') !== filtros.proveedor_id) return false
      if (filtros.desde && row.fecha < filtros.desde) return false
      if (filtros.hasta && row.fecha > filtros.hasta) return false

      if (q) {
        const texto = `${row.proveedor || ''} ${row.nit || ''} ${row.erogacion_id} ${row.empresa || ''} ${row.division || ''} ${row.categoria || ''}`.toLowerCase()
        if (!texto.includes(q)) return false
      }

      return true
    })
  }, [rowsBase, filtros])

  const saldosProveedor = useMemo(() => {
    const map = new Map<number, SaldoProveedor>()

    rowsFiltradas.forEach((row) => {
      const proveedorId = Number(row.proveedor_id || 0)
      if (!proveedorId) return

      const actual = map.get(proveedorId) || {
        proveedor_id: proveedorId,
        proveedor: row.proveedor || `Proveedor #${proveedorId}`,
        nit: row.nit || null,
        credito: 0,
        abonado: 0,
        saldo: 0,
        erogaciones: 0,
        pendientes: 0,
        pagadas: 0,
        ultima_fecha: row.fecha,
      }

      actual.credito += toNum(row.credito)
      actual.abonado += toNum(row.abonado)
      actual.saldo += toNum(row.saldo)
      actual.erogaciones += 1
      if (toNum(row.saldo) > 0.009) actual.pendientes += 1
      if (toNum(row.credito) > 0 && toNum(row.saldo) <= 0.009) actual.pagadas += 1
      if (row.fecha > actual.ultima_fecha) actual.ultima_fecha = row.fecha

      map.set(proveedorId, actual)
    })

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        credito: round2(row.credito),
        abonado: round2(row.abonado),
        saldo: round2(row.saldo),
      }))
      .filter((row) => {
        if (filtros.estado === 'PENDIENTES') return row.saldo > 0.009
        if (filtros.estado === 'PAGADAS') return row.saldo <= 0.009 && row.credito > 0
        return row.credito > 0 || row.abonado > 0
      })
      .sort((a, b) => b.saldo - a.saldo || a.proveedor.localeCompare(b.proveedor))
  }, [rowsFiltradas, filtros.estado])

  const resumen = useMemo(() => {
    return saldosProveedor.reduce(
      (acc, row) => {
        acc.proveedores += 1
        acc.credito += row.credito
        acc.abonado += row.abonado
        acc.saldo += row.saldo
        acc.erogaciones += row.erogaciones
        return acc
      },
      { proveedores: 0, credito: 0, abonado: 0, saldo: 0, erogaciones: 0 }
    )
  }, [saldosProveedor])

  const generarPDF = async () => {
    if (saldosProveedor.length === 0) {
      setMensaje('No hay información para generar PDF con los filtros actuales.')
      return
    }

    setGenerandoPdf(true)
    setMensaje('')

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const logo = await fetchLogoDataUrl()

      if (logo) doc.addImage(logo, 'PNG', pageWidth / 2 - 22, 9, 44, 18)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text('Saldos por Proveedor', pageWidth / 2, 34, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 14, 42)
      doc.text(`Estado: ${filtros.estado}`, 14, 47)
      doc.text(`Rango erogación: ${filtros.desde || 'sin inicio'} a ${filtros.hasta || 'sin fin'}`, 14, 52)

      autoTable(doc, {
        startY: 58,
        head: [['Resumen', 'Valor']],
        body: [
          ['Proveedores', String(resumen.proveedores)],
          ['Erogaciones con crédito/historial', String(resumen.erogaciones)],
          ['Crédito histórico', money(resumen.credito)],
          ['Abonado', money(resumen.abonado)],
          ['Saldo pendiente', money(resumen.saldo)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 65, 85] },
      })

      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 85

      autoTable(doc, {
        startY: finalY + 8,
        head: [['Proveedor', 'NIT', 'Crédito', 'Abonado', 'Saldo', 'Erog.', 'Pend.', 'Pagadas']],
        body: saldosProveedor.map((row) => [
          row.proveedor,
          row.nit || 'CF',
          money(row.credito),
          money(row.abonado),
          money(row.saldo),
          String(row.erogaciones),
          String(row.pendientes),
          String(row.pagadas),
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.6 },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'center' },
        },
      })

      const pageCount = doc.getNumberOfPages()
      const pageHeight = doc.internal.pageSize.getHeight()
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.text('AGRO INDUSTRIAS RYB', 14, pageHeight - 8)
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
      }

      doc.save(`saldos_proveedores_${fileStamp()}.pdf`)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error generando PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-1">Saldos por Proveedor</h1>
      <p className="text-sm text-gray-600 mb-4">
        Control de deudas por erogaciones, abonos parciales o totales y compras ya pagadas.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/dashboard" className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">Volver a Erogaciones</Link>
        <Link href="/erogacion/nueva" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm">Nueva erogación</Link>
        <button type="button" onClick={cargarSaldos} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white px-3 py-2 rounded text-sm">
          {loading ? 'Cargando...' : 'Recargar'}
        </button>
        <button type="button" onClick={generarPDF} disabled={loading || generandoPdf} className="bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white px-3 py-2 rounded text-sm">
          {generandoPdf ? 'Generando...' : 'Reporte PDF'}
        </button>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 bg-yellow-50 text-sm">{mensaje}</div>}

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm">
            Proveedor
            <select value={filtros.proveedor_id} onChange={(e) => setFiltros({ ...filtros, proveedor_id: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Buscar
            <input value={filtros.busqueda} onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" placeholder="Proveedor, NIT, ID..." />
          </label>

          <label className="text-sm">
            Estado
            <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="PENDIENTES">Con saldo pendiente</option>
              <option value="PAGADAS">Ya pagadas</option>
              <option value="TODAS">Todas con crédito/historial</option>
            </select>
          </label>

          <label className="text-sm">
            Erogación desde
            <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Erogación hasta
            <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5 mb-4">
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Proveedores</div><div className="text-lg font-bold">{resumen.proveedores}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Erogaciones</div><div className="text-lg font-bold">{resumen.erogaciones}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Crédito</div><div className="text-lg font-bold">{money(resumen.credito)}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Abonado</div><div className="text-lg font-bold text-green-700">{money(resumen.abonado)}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Saldo</div><div className="text-lg font-bold text-red-700">{money(resumen.saldo)}</div></div>
      </section>

      <section className="border rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-200">
            <tr>
              <th className="border px-2 py-2 text-left">Proveedor</th>
              <th className="border px-2 py-2 text-left">NIT</th>
              <th className="border px-2 py-2 text-right">Crédito</th>
              <th className="border px-2 py-2 text-right">Abonado</th>
              <th className="border px-2 py-2 text-right">Saldo pendiente</th>
              <th className="border px-2 py-2 text-center">Erogaciones</th>
              <th className="border px-2 py-2 text-center">Pendientes</th>
              <th className="border px-2 py-2 text-center">Pagadas</th>
              <th className="border px-2 py-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {saldosProveedor.map((row) => (
              <tr key={row.proveedor_id}>
                <td className="border px-2 py-2 font-semibold">{row.proveedor}</td>
                <td className="border px-2 py-2">{row.nit || 'CF'}</td>
                <td className="border px-2 py-2 text-right">{money(row.credito)}</td>
                <td className="border px-2 py-2 text-right text-green-700">{money(row.abonado)}</td>
                <td className="border px-2 py-2 text-right font-bold text-red-700">{money(row.saldo)}</td>
                <td className="border px-2 py-2 text-center">{row.erogaciones}</td>
                <td className="border px-2 py-2 text-center">{row.pendientes}</td>
                <td className="border px-2 py-2 text-center">{row.pagadas}</td>
                <td className="border px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Link href={`/erogacion/saldos/vista?proveedor_id=${row.proveedor_id}&nombre=${encodeURIComponent(row.proveedor)}`} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs">
                      Detalle / Registrar pago
                    </Link>
                    <Link href={`/erogacion/saldos/abonos?proveedor_id=${row.proveedor_id}&nombre=${encodeURIComponent(row.proveedor)}`} className="bg-teal-700 hover:bg-teal-800 text-white px-2 py-1 rounded text-xs">
                      Ver abonos
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {saldosProveedor.length === 0 && (
              <tr>
                <td colSpan={9} className="border px-3 py-6 text-center text-gray-500">
                  No hay proveedores con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
