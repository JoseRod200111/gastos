'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

type ProveedorInfo = {
  nombre: string
  nit: string | null
  telefono: string | null
}

type FormaPagoRel = {
  metodo: string | null
} | null

type ErogacionRel = {
  id: number
  fecha: string | null
  cantidad: number | null
} | null

type PagoRow = {
  id: number
  proveedor_id: number
  erogacion_id: number | null
  fecha: string
  monto: number
  metodo_pago_id: number | null
  documento: string | null
  observaciones: string | null
  user_id: string | null
  created_at: string | null
  forma_pago?: FormaPagoRel | FormaPagoRel[]
  erogaciones?: ErogacionRel | ErogacionRel[]
}

type ProfileRow = {
  id: string
  email: string | null
}

const PAGE_SIZE = 1000

const toNum = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const money = (value: unknown) => `Q${round2(toNum(value)).toFixed(2)}`

function asObj<T>(rel: unknown): T | null {
  if (rel == null) return null
  if (Array.isArray(rel)) return (rel[0] ?? null) as T | null
  return rel as T
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const only = value.slice(0, 10)
  const parts = only.split('-')
  if (parts.length !== 3) return value
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value

  return d.toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function todayISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function firstDayMonthISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}-01`
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

async function fetchAllPagosProveedor(proveedorId: number) {
  const all: PagoRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('pagos_erogacion')
      .select(
        `
        id,
        proveedor_id,
        erogacion_id,
        fecha,
        monto,
        metodo_pago_id,
        documento,
        observaciones,
        user_id,
        created_at,
        forma_pago ( metodo ),
        erogaciones ( id, fecha, cantidad )
      `
      )
      .eq('proveedor_id', proveedorId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: all, error }

    all.push(...(((data || []) as unknown[]) as PagoRow[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}

function AbonosProveedorInner() {
  const sp = useSearchParams()
  const proveedorId = Number(sp.get('proveedor_id') || 0)
  const nombreParam = sp.get('nombre') || ''

  const [proveedor, setProveedor] = useState<ProveedorInfo>({ nombre: nombreParam, nit: null, telefono: null })
  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [filtros, setFiltros] = useState({
    desde: firstDayMonthISO(),
    hasta: todayISO(),
    erogacion_id: '',
    busqueda: '',
  })

  const cargarProveedor = useCallback(async () => {
    if (!proveedorId) return

    const { data, error } = await supabase
      .from('proveedores')
      .select('nombre,nit,telefono')
      .eq('id', proveedorId)
      .single()

    if (!error && data) {
      setProveedor({
        nombre: data.nombre || `Proveedor #${proveedorId}`,
        nit: data.nit || null,
        telefono: data.telefono || null,
      })
    }
  }, [proveedorId])

  const cargarPagos = useCallback(async () => {
    if (!proveedorId) {
      setMensaje('No se recibió proveedor_id.')
      return
    }

    setLoading(true)
    setMensaje('')

    try {
      const { data, error } = await fetchAllPagosProveedor(proveedorId)

      if (error) {
        console.error(error)
        setPagos([])
        setMensaje(`No se pudieron cargar abonos. Verificá que ya ejecutaste sql/erogaciones_saldos_proveedores.sql. Detalle: ${error.message}`)
        return
      }

      const normalizados = (data || []).map((p) => ({ ...p, monto: toNum(p.monto) }))
      setPagos(normalizados)

      const userIds = Array.from(new Set(normalizados.map((p) => p.user_id).filter((id): id is string => Boolean(id))))
      if (userIds.length === 0) {
        setUsuarios({})
        return
      }

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id,email')
        .in('id', userIds)

      if (profileError) {
        console.warn(profileError)
        setUsuarios({})
        return
      }

      const map: Record<string, string> = {}
      ;((profiles || []) as ProfileRow[]).forEach((profile) => {
        if (profile.id) map[profile.id] = profile.email || profile.id
      })
      setUsuarios(map)
    } finally {
      setLoading(false)
    }
  }, [proveedorId])

  useEffect(() => {
    cargarProveedor()
    cargarPagos()
  }, [cargarProveedor, cargarPagos])

  const pagosFiltrados = useMemo(() => {
    const q = filtros.busqueda.trim().toLowerCase()

    return pagos.filter((p) => {
      if (filtros.desde && p.fecha < filtros.desde) return false
      if (filtros.hasta && p.fecha > filtros.hasta) return false
      if (filtros.erogacion_id.trim()) {
        const erog = p.erogacion_id == null ? 'general' : String(p.erogacion_id)
        if (!erog.includes(filtros.erogacion_id.trim().toLowerCase())) return false
      }
      if (q) {
        const fp = asObj<FormaPagoRel>(p.forma_pago)
        const texto = `${p.id} ${p.erogacion_id || ''} ${p.documento || ''} ${p.observaciones || ''} ${fp?.metodo || ''} ${usuarios[p.user_id || ''] || p.user_id || ''}`.toLowerCase()
        if (!texto.includes(q)) return false
      }
      return true
    })
  }, [pagos, filtros, usuarios])

  const resumen = useMemo(() => {
    return {
      movimientos: pagosFiltrados.length,
      total: round2(pagosFiltrados.reduce((acc, p) => acc + toNum(p.monto), 0)),
    }
  }, [pagosFiltrados])

  const generarPDF = async () => {
    if (pagosFiltrados.length === 0) {
      setMensaje('No hay abonos para generar PDF con los filtros actuales.')
      return
    }

    setGenerandoPdf(true)
    setMensaje('')

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const logo = await fetchLogoDataUrl()

      if (logo) doc.addImage(logo, 'PNG', pageWidth / 2 - 22, 9, 44, 18)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text('Historial de abonos a proveedor', pageWidth / 2, 34, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Proveedor: ${proveedor.nombre || `#${proveedorId}`}`, 14, 42)
      doc.text(`NIT: ${proveedor.nit || 'CF'}`, 14, 47)
      doc.text(`Rango pago: ${filtros.desde || 'sin inicio'} a ${filtros.hasta || 'sin fin'}`, 14, 52)

      autoTable(doc, {
        startY: 58,
        head: [['Resumen', 'Valor']],
        body: [
          ['Abonos mostrados', String(resumen.movimientos)],
          ['Total abonado', money(resumen.total)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 118, 110] },
      })

      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 75

      autoTable(doc, {
        startY: finalY + 8,
        head: [['ID', 'Fecha pago', 'Hora registro', 'Erogación', 'Fecha erog.', 'Monto', 'Método', 'Documento', 'Registró']],
        body: pagosFiltrados.map((p) => {
          const fp = asObj<FormaPagoRel>(p.forma_pago)
          const erog = asObj<ErogacionRel>(p.erogaciones)
          return [
            String(p.id),
            formatDate(p.fecha),
            formatDateTime(p.created_at),
            p.erogacion_id ? `#${p.erogacion_id}` : 'General',
            formatDate(erog?.fecha || null),
            money(p.monto),
            fp?.metodo || '—',
            p.documento || '—',
            usuarios[p.user_id || ''] || p.user_id || '—',
          ]
        }),
        styles: { fontSize: 6.8, cellPadding: 1.3 },
        headStyles: { fillColor: [15, 118, 110] },
        columnStyles: {
          5: { halign: 'right' },
        },
      })

      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.text('AGRO INDUSTRIAS RYB', 14, pageHeight - 8)
        doc.text(`Página ${i} de ${pages}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
      }

      doc.save(`abonos_proveedor_${proveedorId}_${fileStamp()}.pdf`)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error generando PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4"><img src="/logo.png" alt="Logo Empresa" className="h-16" /></div>

      <h1 className="text-2xl font-bold mb-1">Historial de abonos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Proveedor: <strong>{proveedor.nombre || `#${proveedorId}`}</strong> · NIT: {proveedor.nit || 'CF'}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/erogacion/saldos" className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">Volver a saldos</Link>
        <Link href={`/erogacion/saldos/vista?proveedor_id=${proveedorId}&nombre=${encodeURIComponent(proveedor.nombre || '')}`} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm">Detalle / Registrar pago</Link>
        <button type="button" onClick={cargarPagos} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white px-3 py-2 rounded text-sm">{loading ? 'Cargando...' : 'Recargar'}</button>
        <button type="button" onClick={generarPDF} disabled={loading || generandoPdf} className="bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white px-3 py-2 rounded text-sm">{generandoPdf ? 'Generando...' : 'Reporte PDF'}</button>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-yellow-50">{mensaje}</div>}

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">Pago desde
            <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
          <label className="text-sm">Pago hasta
            <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
          <label className="text-sm">Erogación
            <input value={filtros.erogacion_id} onChange={(e) => setFiltros({ ...filtros, erogacion_id: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" placeholder="ID o general" />
          </label>
          <label className="text-sm">Buscar
            <input value={filtros.busqueda} onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" placeholder="Documento, método, usuario..." />
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 mb-4">
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Abonos mostrados</div><div className="text-xl font-bold">{resumen.movimientos}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Total abonado</div><div className="text-xl font-bold text-green-700">{money(resumen.total)}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Rango de pago</div><div className="text-sm font-semibold">{filtros.desde || 'sin inicio'} a {filtros.hasta || 'sin fin'}</div></div>
      </section>

      <section className="border rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-200">
            <tr>
              <th className="border px-2 py-2 text-left">ID</th>
              <th className="border px-2 py-2 text-left">Fecha pago</th>
              <th className="border px-2 py-2 text-left">Hora registro</th>
              <th className="border px-2 py-2 text-left">Erogación</th>
              <th className="border px-2 py-2 text-left">Fecha erogación</th>
              <th className="border px-2 py-2 text-right">Monto</th>
              <th className="border px-2 py-2 text-left">Método</th>
              <th className="border px-2 py-2 text-left">Documento</th>
              <th className="border px-2 py-2 text-left">Registró</th>
              <th className="border px-2 py-2 text-left">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.map((p) => {
              const fp = asObj<FormaPagoRel>(p.forma_pago)
              const erog = asObj<ErogacionRel>(p.erogaciones)
              return (
                <tr key={p.id}>
                  <td className="border px-2 py-2">{p.id}</td>
                  <td className="border px-2 py-2">{formatDate(p.fecha)}</td>
                  <td className="border px-2 py-2">{formatDateTime(p.created_at)}</td>
                  <td className="border px-2 py-2">{p.erogacion_id ? `#${p.erogacion_id}` : 'General'}</td>
                  <td className="border px-2 py-2">{formatDate(erog?.fecha || null)}</td>
                  <td className="border px-2 py-2 text-right font-semibold">{money(p.monto)}</td>
                  <td className="border px-2 py-2">{fp?.metodo || '—'}</td>
                  <td className="border px-2 py-2">{p.documento || '—'}</td>
                  <td className="border px-2 py-2">{usuarios[p.user_id || ''] || p.user_id || '—'}</td>
                  <td className="border px-2 py-2">{p.observaciones || '—'}</td>
                </tr>
              )
            })}
            {pagosFiltrados.length === 0 && <tr><td colSpan={10} className="border px-3 py-6 text-center text-gray-500">No hay abonos con los filtros seleccionados.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default function AbonosProveedorPage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando...</div>}>
      <AbonosProveedorInner />
    </Suspense>
  )
}
