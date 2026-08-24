'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

type ClienteInfo = {
  nombre: string
  nit: string | null
}

type FormaPagoRel = {
  metodo: string | null
} | null

type VentaRel = {
  id: number
  fecha: string | null
  cantidad: number | null
} | null

type PagoRow = {
  id: number
  cliente_id: number
  venta_id: number | null
  fecha: string
  monto: number
  metodo_pago_id: number | null
  documento: string | null
  observaciones: string | null
  user_id: string | null
  created_at: string | null
  forma_pago?: FormaPagoRel
  ventas?: VentaRel
}

type ProfileRow = {
  id: string
  email: string | null
}

const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const formatoQ = (n: number | null | undefined) => `Q${round2(toNum(n)).toFixed(2)}`

const PAGE_SIZE = 1000

async function fetchAllPagosCliente(clienteId: number) {
  const all: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('pagos_venta')
      .select(
        `
        id,
        cliente_id,
        venta_id,
        fecha,
        monto,
        metodo_pago_id,
        documento,
        observaciones,
        user_id,
        created_at,
        forma_pago ( metodo ),
        ventas ( id, fecha, cantidad )
      `
      )
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: all, error }

    all.push(...((data || []) as any[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}


function asObj<T>(rel: unknown): T | null {
  if (rel == null) return null
  if (Array.isArray(rel)) return (rel[0] ?? null) as T | null
  return rel as T
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return value.slice(0, 10)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value

  return d.toLocaleString('es-GT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
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

function nombreArchivo(clienteId: number) {
  const now = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  return `abonos_cliente_${clienteId}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
}

function AbonosClienteInner() {
  const sp = useSearchParams()
  const clienteId = Number(sp.get('cliente_id') || 0)
  const nombreParam = sp.get('nombre') || ''

  const [cliente, setCliente] = useState<ClienteInfo>({
    nombre: nombreParam || '',
    nit: null,
  })

  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    venta_id: '',
  })

  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      if (filtros.desde && p.fecha < filtros.desde) return false
      if (filtros.hasta && p.fecha > filtros.hasta) return false
      if (filtros.venta_id.trim()) {
        const filtroVenta = filtros.venta_id.trim().toLowerCase()

        // Si el pago está amarrado a una venta específica, filtra por esa venta.
        if (p.venta_id != null) return String(p.venta_id).includes(filtroVenta)

        // Los abonos generales no tienen venta_id. Se muestran también cuando se filtra por venta,
        // porque pueden ser pagos del cliente que todavía no fueron vinculados a una venta específica.
        return 'general'.includes(filtroVenta) || filtroVenta !== ''
      }

      return true
    })
  }, [pagos, filtros])

  const totalAbonado = useMemo(
    () => round2(pagosFiltrados.reduce((s, p) => s + toNum(p.monto), 0)),
    [pagosFiltrados]
  )

  const cargarCliente = useCallback(async (id: number) => {
    const { data, error } = await supabase
      .from('clientes')
      .select('nombre, nit')
      .eq('id', id)
      .single()

    if (!error && data) {
      setCliente({
        nombre: data.nombre || `Cliente #${id}`,
        nit: data.nit || null,
      })
    }
  }, [])

  const cargarPagos = useCallback(async (id: number) => {
    setLoading(true)

    try {
      const { data, error } = await fetchAllPagosCliente(id)

      if (error) {
        console.error('Error cargando abonos:', error)
        setPagos([])
        setUsuarios({})
        alert(`Error cargando abonos: ${error.message}`)
        return
      }

      const normalizados = ((data || []) as unknown as Record<string, unknown>[]).map((raw) => ({
        id: Number(raw.id),
        cliente_id: Number(raw.cliente_id),
        venta_id: raw.venta_id == null ? null : Number(raw.venta_id),
        fecha: String(raw.fecha || ''),
        monto: toNum(raw.monto),
        metodo_pago_id: raw.metodo_pago_id == null ? null : Number(raw.metodo_pago_id),
        documento: (raw.documento as string | null) ?? null,
        observaciones: (raw.observaciones as string | null) ?? null,
        user_id: (raw.user_id as string | null) ?? null,
        created_at: (raw.created_at as string | null) ?? null,
        forma_pago: asObj<FormaPagoRel>(raw.forma_pago),
        ventas: asObj<VentaRel>(raw.ventas),
      }))

      setPagos(normalizados)

      const userIds = Array.from(
        new Set(
          normalizados
            .map((p) => p.user_id)
            .filter((u): u is string => Boolean(u))
        )
      )

      if (userIds.length === 0) {
        setUsuarios({})
        return
      }

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds)

      if (profErr) {
        console.warn('No se pudo cargar profiles para usuarios:', profErr)
        setUsuarios({})
        return
      }

      const map: Record<string, string> = {}
      for (const p of (profiles || []) as ProfileRow[]) {
        map[p.id] = p.email || p.id
      }

      setUsuarios(map)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!clienteId) return

    cargarCliente(clienteId)
    cargarPagos(clienteId)
  }, [clienteId, cargarCliente, cargarPagos])

  function limpiarFiltros() {
    setFiltros({ desde: '', hasta: '', venta_id: '' })
  }

  async function generarPDF() {
    setGenerando(true)

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()

      if (logo) doc.addImage(logo, 'PNG', pageWidth / 2 - 22, 8, 44, 18)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text('Historial de abonos por cliente', 14, 35)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Cliente: ${cliente.nombre || `Cliente #${clienteId}`}`, 14, 41)
      doc.text(`NIT: ${cliente.nit || '—'}`, 14, 46)
      doc.text(`Total abonado mostrado: ${formatoQ(totalAbonado)}`, 14, 51)

      autoTable(doc, {
        startY: 57,
        head: [[
          'ID',
          'Fecha pago',
          'Hora registro',
          'Venta',
          'Fecha venta',
          'Monto',
          'Método',
          'Documento',
          'Registró',
          'Observaciones',
        ]],
        body: pagosFiltrados.map((p) => [
          String(p.id),
          formatDate(p.fecha),
          formatDateTime(p.created_at),
          p.venta_id == null ? 'Abono general' : `#${p.venta_id}`,
          formatDate(p.ventas?.fecha),
          formatoQ(p.monto),
          p.forma_pago?.metodo || '—',
          p.documento || '—',
          p.user_id ? usuarios[p.user_id] || p.user_id : '—',
          p.observaciones || '—',
        ]),
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
        headStyles: {
          fillColor: [31, 41, 55],
          textColor: 255,
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 22 },
          2: { cellWidth: 32 },
          3: { cellWidth: 24 },
          4: { cellWidth: 22 },
          5: { cellWidth: 24, halign: 'right' },
          6: { cellWidth: 32 },
          7: { cellWidth: 32 },
          8: { cellWidth: 42 },
          9: { cellWidth: 42 },
        },
        didDrawPage: () => {
          const page = doc.getCurrentPageInfo().pageNumber
          doc.setFontSize(8)
          doc.text('AGRO INDUSTRIAS RYB', 14, pageHeight - 8)
          doc.text(`Página ${page}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
        },
      })

      doc.save(nombreArchivo(clienteId))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-1">Historial de abonos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Cliente: <b>{cliente.nombre || `Cliente #${clienteId || '—'}`}</b>
        {cliente.nit ? ` · NIT: ${cliente.nit}` : ''}
      </p>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <Link
          href="/ventas/saldos"
          className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Volver a Saldos
        </Link>

        <button
          onClick={() => cargarPagos(clienteId)}
          disabled={loading || !clienteId}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {loading ? 'Cargando…' : 'Recargar'}
        </button>

        <button
          onClick={generarPDF}
          disabled={generando || pagosFiltrados.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {generando ? 'Generando…' : 'Reporte PDF'}
        </button>
      </div>

      <div className="border rounded p-4 bg-white mb-4">
        <div className="font-semibold mb-3">Filtros</div>

        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs font-semibold mb-1">Desde</div>
            <input
              type="date"
              className="border p-2 w-full"
              value={filtros.desde}
              onChange={(e) => setFiltros((p) => ({ ...p, desde: e.target.value }))}
            />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">Hasta</div>
            <input
              type="date"
              className="border p-2 w-full"
              value={filtros.hasta}
              onChange={(e) => setFiltros((p) => ({ ...p, hasta: e.target.value }))}
            />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">Venta</div>
            <input
              className="border p-2 w-full"
              value={filtros.venta_id}
              onChange={(e) => setFiltros((p) => ({ ...p, venta_id: e.target.value }))}
              placeholder="Ej. 2441 o general"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={limpiarFiltros}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Abonos mostrados</div>
          <div className="text-lg font-semibold">{pagosFiltrados.length}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total abonado mostrado</div>
          <div className="text-lg font-semibold text-emerald-700">{formatoQ(totalAbonado)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Cliente</div>
          <div className="text-lg font-semibold">{cliente.nombre || '—'}</div>
        </div>
      </div>

      {filtros.venta_id.trim() && pagosFiltrados.some((p) => p.venta_id == null) && (
        <div className="border rounded p-3 bg-yellow-50 text-yellow-900 text-sm mb-4">
          También se muestran abonos generales del cliente porque no tienen venta específica asignada.
          Si uno de esos abonos corresponde a la venta filtrada, debe vincularse a esa venta para que el reporte individual lo tome como pagado.
        </div>
      )}

      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Fecha pago</th>
              <th className="p-2 text-left">Hora registro</th>
              <th className="p-2 text-left">Venta</th>
              <th className="p-2 text-left">Fecha venta</th>
              <th className="p-2 text-right">Monto</th>
              <th className="p-2 text-left">Método</th>
              <th className="p-2 text-left">Documento</th>
              <th className="p-2 text-left">Registró</th>
              <th className="p-2 text-left">Observaciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={10}>
                  Cargando abonos…
                </td>
              </tr>
            ) : pagosFiltrados.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={10}>
                  No hay abonos para este cliente con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              pagosFiltrados.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{p.id}</td>
                  <td className="p-2">{formatDate(p.fecha)}</td>
                  <td className="p-2">{formatDateTime(p.created_at)}</td>
                  <td className="p-2">
                    {p.venta_id == null ? 'Abono general' : `#${p.venta_id}`}
                  </td>
                  <td className="p-2">{formatDate(p.ventas?.fecha)}</td>
                  <td className="p-2 text-right font-semibold text-emerald-700">
                    {formatoQ(p.monto)}
                  </td>
                  <td className="p-2">{p.forma_pago?.metodo || '—'}</td>
                  <td className="p-2">{p.documento || '—'}</td>
                  <td className="p-2">{p.user_id ? usuarios[p.user_id] || p.user_id : '—'}</td>
                  <td className="p-2">{p.observaciones || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AbonosClientePage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <AbonosClienteInner />
    </Suspense>
  )
}
