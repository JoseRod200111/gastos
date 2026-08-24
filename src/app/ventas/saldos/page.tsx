'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Cliente = {
  id: number
  nombre: string
  nit?: string | null
}

type SaldoItem = {
  cliente_id: number
  nombre: string
  nit: string | null
  credito: number
  abonado: number
  saldo: number
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const fmtQ = (n: number) => `Q${round2(toNum(n)).toFixed(2)}`

const PAGE_SIZE = 1000

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchAllDetalleVentaSaldos(selectedClienteId: string) {
  const all: any[] = []
  let from = 0

  while (true) {
    let q = supabase
      .from('detalle_venta')
      .select(
        `
        id,
        venta_id,
        importe,
        forma_pago_id,
        documento,
        forma_pago ( metodo ),
        ventas!inner ( id, cliente_id, fecha )
      `
      )
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (selectedClienteId) q = q.eq('ventas.cliente_id', Number(selectedClienteId))

    const { data, error } = await q
    if (error) return { data: all, error }

    all.push(...((data || []) as any[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}

async function fetchAllPagosVenta(ventaIds: number[]) {
  const all: any[] = []
  const ids = Array.from(new Set(ventaIds.filter((id) => Number.isFinite(id) && id > 0)))

  for (const chunk of chunkArray(ids, 300)) {
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('pagos_venta')
        .select('venta_id, monto')
        .in('venta_id', chunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) return { data: all, error }

      all.push(...((data || []) as any[]))
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return { data: all, error: null }
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

function nombreArchivo() {
  const now = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  return `reporte_saldos_clientes_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
}

export default function SaldosPorClientePage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedClienteId, setSelectedClienteId] = useState<string>('')
  const [rows, setRows] = useState<SaldoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const totals = useMemo(() => {
    const tCredito = rows.reduce((s, r) => s + toNum(r.credito), 0)
    const tAbonado = rows.reduce((s, r) => s + toNum(r.abonado), 0)
    const tSaldo = rows.reduce((s, r) => s + toNum(r.saldo), 0)

    return {
      tCredito: round2(tCredito),
      tAbonado: round2(tAbonado),
      tSaldo: round2(tSaldo),
    }
  }, [rows])

  const cargarClientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, nit')
      .order('nombre', { ascending: true })

    if (error) {
      console.error('Error cargando clientes:', error)
      setClientes([])
      return
    }

    setClientes((data as Cliente[]) || [])
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)

    try {
      const { data: metodosPendientes, error: mpErr } = await supabase
        .from('forma_pago')
        .select('id, metodo')
        .ilike('metodo', '%pendiente%')

      if (mpErr) {
        console.error('Error cargando métodos pendientes:', mpErr)
        setRows([])
        return
      }

      const idsPendientes = new Set(
        ((metodosPendientes || []) as { id: number }[]).map((m) => Number(m.id))
      )

      const { data: detallesRows, error: detErr } = await fetchAllDetalleVentaSaldos(selectedClienteId)

      if (detErr) {
        console.error('Error cargando detalle de saldos:', detErr)
        setRows([])
        return
      }

      type VentaAgg = {
        venta_id: number
        cliente_id: number
        credito: number
        abonado: number
        tienePendiente: boolean
        tienePago: boolean
      }

      const porVenta: Record<number, VentaAgg> = {}

      for (const raw of (detallesRows || []) as any[]) {
        const ventaId = Number(raw.venta_id)
        const ventaRel = Array.isArray(raw.ventas) ? raw.ventas[0] : raw.ventas
        const clienteId = Number(ventaRel?.cliente_id)
        const formaPagoId = raw.forma_pago_id == null ? null : Number(raw.forma_pago_id)
        const documento = String(raw.documento || '').toLowerCase()
        const formaPagoRel = Array.isArray(raw.forma_pago) ? raw.forma_pago[0] : raw.forma_pago
        const metodo = String(formaPagoRel?.metodo || '').toLowerCase()

        const esPendiente =
          (formaPagoId != null && idsPendientes.has(formaPagoId)) ||
          metodo.includes('pendiente') ||
          documento.includes('pend')

        if (!ventaId || !clienteId) continue

        if (!porVenta[ventaId]) {
          porVenta[ventaId] = {
            venta_id: ventaId,
            cliente_id: clienteId,
            credito: 0,
            abonado: 0,
            tienePendiente: false,
            tienePago: false,
          }
        }

        // El crédito de una deuda por venta debe calcularse con el total de la venta completa,
        // no solo con las líneas pendientes. Así soporta ventas mixtas: una parte pagada y otra pendiente.
        porVenta[ventaId].credito += toNum(raw.importe)
        porVenta[ventaId].tienePendiente = porVenta[ventaId].tienePendiente || esPendiente
      }

      const ventasIds = Object.keys(porVenta).map(Number)

      if (ventasIds.length > 0) {
        const { data: pagosRows, error: pagosErr } = await fetchAllPagosVenta(ventasIds)

        if (pagosErr) {
          console.error('Error cargando abonos:', pagosErr)
        } else {
          for (const pago of (pagosRows || []) as any[]) {
            const ventaId = Number(pago.venta_id)
            if (porVenta[ventaId]) {
              porVenta[ventaId].abonado += toNum(pago.monto)
              porVenta[ventaId].tienePago = true
            }
          }
        }
      }

      const clienteIds = Array.from(new Set(Object.values(porVenta).map((v) => v.cliente_id)))
      const clientesMap = new Map<number, Cliente>()

      if (clienteIds.length > 0) {
        const { data: clientesRows, error: clientesErr } = await supabase
          .from('clientes')
          .select('id, nombre, nit')
          .in('id', clienteIds)

        if (clientesErr) {
          console.error('Error cargando clientes de saldos:', clientesErr)
        } else {
          for (const c of (clientesRows || []) as Cliente[]) {
            clientesMap.set(Number(c.id), c)
          }
        }
      }

      const porCliente: Record<number, SaldoItem> = {}

      for (const venta of Object.values(porVenta)) {
        // Solo se considera deuda si la venta tiene al menos una línea pendiente
        // o si tiene abonos registrados. Esto evita que ventas pagadas al contado sin abonos
        // aparezcan como deuda.
        if (!venta.tienePendiente && !venta.tienePago) continue

        const credito = round2(venta.credito)
        const abonado = round2(venta.abonado)
        const saldoVenta = round2(credito - abonado)

        if (saldoVenta <= 0.000001) continue

        const c = clientesMap.get(venta.cliente_id)

        if (!porCliente[venta.cliente_id]) {
          porCliente[venta.cliente_id] = {
            cliente_id: venta.cliente_id,
            nombre: c?.nombre || `Cliente #${venta.cliente_id}`,
            nit: c?.nit || null,
            credito: 0,
            abonado: 0,
            saldo: 0,
          }
        }

        porCliente[venta.cliente_id].credito += credito
        porCliente[venta.cliente_id].abonado += Math.min(abonado, credito)
        porCliente[venta.cliente_id].saldo += saldoVenta
      }

      const normalizados = Object.values(porCliente)
        .map((r) => ({
          ...r,
          credito: round2(r.credito),
          abonado: round2(r.abonado),
          saldo: round2(r.saldo),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))

      setRows(normalizados)
    } finally {
      setLoading(false)
    }
  }, [selectedClienteId])

  useEffect(() => {
    cargarClientes()
  }, [cargarClientes])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function generarPDF() {
    setGenerando(true)

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 80, 8, 50, 18)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('Saldos de clientes', 14, 35)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)

      const clienteTxt = selectedClienteId
        ? `Cliente: ${
            clientes.find((c) => c.id === Number(selectedClienteId))?.nombre || 'Seleccionado'
          }`
        : 'Cliente: Todos los clientes con saldo pendiente'

      doc.text(clienteTxt, 14, 41)

      autoTable(doc, {
        startY: 47,
        head: [['Resumen', 'Valor']],
        body: [
          ['Total a crédito', fmtQ(totals.tCredito)],
          ['Total abonado', fmtQ(totals.tAbonado)],
          ['Saldo pendiente', fmtQ(totals.tSaldo)],
        ],
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [220, 225, 232],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        columnStyles: {
          1: { halign: 'right' },
        },
      })

      const y = ((doc as any).lastAutoTable?.finalY || 65) + 6

      autoTable(doc, {
        startY: y,
        head: [['Cliente', 'NIT', 'Crédito', 'Abonado', 'Saldo pendiente']],
        body: rows.map((r) => [
          r.nombre,
          r.nit || '—',
          fmtQ(r.credito),
          fmtQ(r.abonado),
          fmtQ(r.saldo),
        ]),
        theme: 'grid',
        styles: {
          fontSize: 8.5,
          cellPadding: 2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [220, 225, 232],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 30 },
          2: { halign: 'right', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 30 },
          4: { halign: 'right', cellWidth: 35 },
        },
        didDrawPage: () => {
          const pageWidth = doc.internal.pageSize.getWidth()
          const pageHeight = doc.internal.pageSize.getHeight()
          const page = doc.getCurrentPageInfo().pageNumber

          doc.setFontSize(8)
          doc.text('AGRO INDUSTRIAS RYB', 14, pageHeight - 8)
          doc.text(`Página ${page}`, pageWidth - 14, pageHeight - 8, {
            align: 'right',
          })
        },
      })

      doc.save(nombreArchivo())
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-3"> Saldos por Cliente</h1>

      <div className="mb-4 flex flex-col md:flex-row items-center gap-3">
        <select
          className="border p-2 text-sm w-full md:w-[440px]"
          value={selectedClienteId}
          onChange={(e) => setSelectedClienteId(e.target.value)}
        >
          <option value="">— Todos los clientes con saldo pendiente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.nit ? ` • NIT: ${c.nit}` : ''}
            </option>
          ))}
        </select>

        <button
          onClick={cargar}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
          disabled={loading}
        >
           Buscar
        </button>

        <button
          onClick={generarPDF}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
          disabled={generando || rows.length === 0}
        >
          {generando ? 'Generando…' : ' Reporte PDF'}
        </button>

        {selectedClienteId && (
          <button
            onClick={() => setSelectedClienteId('')}
            className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded text-sm"
          >
            Limpiar
          </button>
        )}

        <Link
          href="/ventas"
          className="md:ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver al Menú de Ventas
        </Link>
      </div>

      <div className="border rounded p-4 bg-white mb-4 text-sm">
        <div>Total a crédito: {fmtQ(totals.tCredito)}</div>
        <div>Total abonado: {fmtQ(totals.tAbonado)}</div>
        <div>
          <b>Saldo pendiente: {fmtQ(totals.tSaldo)}</b>
        </div>
      </div>

      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Cliente</th>
              <th className="p-2 text-left">NIT</th>
              <th className="p-2 text-right">Crédito</th>
              <th className="p-2 text-right">Abonado</th>
              <th className="p-2 text-right">Saldo pendiente</th>
              <th className="p-2 text-left">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  No hay clientes con saldo pendiente.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.cliente_id} className="border-t">
                  <td className="p-2">{r.nombre}</td>
                  <td className="p-2">{r.nit || '—'}</td>
                  <td className="p-2 text-right">{fmtQ(r.credito)}</td>
                  <td className="p-2 text-right">{fmtQ(r.abonado)}</td>
                  <td className="p-2 text-right font-semibold">{fmtQ(r.saldo)}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/ventas/saldos/vista?cliente_id=${r.cliente_id}&nombre=${encodeURIComponent(
                          r.nombre
                        )}`}
                        className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs"
                      >
                        Detalle / Registrar pago
                      </Link>

                      <Link
                        href={`/ventas/saldos/abonos?cliente_id=${r.cliente_id}&nombre=${encodeURIComponent(
                          r.nombre
                        )}`}
                        className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs"
                      >
                        Ver abonos
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
