'use client'

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

type VentaRow = {
  venta_id: number
  fecha: string
  credito: number
  abonado: number
  saldo: number
}

type ProductoObj = {
  nombre: string | null
  sku: string | null
  unidad: string | null
  control_inventario: boolean | null
} | null

type FormaPagoObj = {
  metodo: string | null
} | null

type Detalle = {
  id: number
  venta_id: number
  producto_id: number | null
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  documento: string | null
  productos?: ProductoObj
  forma_pago?: FormaPagoObj
}

type MetodoPago = {
  id: number
  metodo: string
}

type ClienteInfo = {
  nombre: string
  nit: string | null
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const formatoQ = (n: number | null | undefined) => `Q${round2(toNum(n)).toFixed(2)}`

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

  return `deudas_cliente_${clienteId}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
}

function VistaDeudasClienteInner() {
  const sp = useSearchParams()
  const clienteId = Number(sp.get('cliente_id') || 0)
  const nombreParam = sp.get('nombre') || ''

  const [cliente, setCliente] = useState<ClienteInfo>({
    nombre: nombreParam || '',
    nit: null,
  })

  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [metodos, setMetodos] = useState<MetodoPago[]>([])

  const [loading, setLoading] = useState(false)
  const [loadingPago, setLoadingPago] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [pago, setPago] = useState({
    modo: 'auto' as 'auto' | 'venta',
    venta_id: '' as string | number,
    fecha: new Date().toISOString().slice(0, 10),
    metodo_pago_id: '' as string | number,
    monto: '' as string,
    documento: '',
    observaciones: '',
  })

  const totales = useMemo(() => {
    const tCred = ventas.reduce((s, v) => s + toNum(v.credito), 0)
    const tAbo = ventas.reduce((s, v) => s + toNum(v.abonado), 0)
    const tSal = ventas.reduce((s, v) => s + toNum(v.saldo), 0)

    return {
      tCred: round2(tCred),
      tAbo: round2(tAbo),
      tSal: round2(tSal),
    }
  }, [ventas])

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

  const cargarMetodosPago = useCallback(async () => {
    const { data, error } = await supabase
      .from('forma_pago')
      .select('id, metodo')
      .order('metodo', { ascending: true })

    if (error) return

    const all = (data || []) as MetodoPago[]
    const pendiente = all.find((m) => m.metodo.toLowerCase().includes('pendiente de pago'))

    setMetodos(all.filter((m) => m.id !== pendiente?.id))
  }, [])

  const cargarVentasCredito = useCallback(async (id: number) => {
    setLoading(true)

    try {
      const { data: mp } = await supabase
        .from('forma_pago')
        .select('id')
        .ilike('metodo', '%pendiente de pago%')
        .limit(1)
        .maybeSingle()

      const metodoPendienteId = mp?.id as number | undefined

      const { data: rowsDV, error: dvErr } = await supabase
        .from('detalle_venta')
        .select('venta_id, importe, forma_pago_id, ventas!inner(id, cliente_id, fecha)')
        .eq('ventas.cliente_id', id)

      if (dvErr) {
        console.error(dvErr)
        setVentas([])
        return
      }

      type Tmp = {
        [k: number]: {
          fecha: string
          credito: number
          abonado: number
        }
      }

      const agg: Tmp = {}

      for (const r of (rowsDV || []) as any[]) {
        const vId = Number(r.venta_id)
        const fecha = r.ventas?.fecha as string
        const fpId = r.forma_pago_id as number | null
        const imp = toNum(r.importe)

        if (!agg[vId]) agg[vId] = { fecha, credito: 0, abonado: 0 }

        if (metodoPendienteId && fpId === metodoPendienteId) {
          agg[vId].credito += imp
        }
      }

      const vIds = Object.keys(agg).map(Number)

      if (vIds.length > 0) {
        const { data: pagosRows, error: pErr } = await supabase
          .from('pagos_venta')
          .select('venta_id, monto')
          .in('venta_id', vIds)

        if (!pErr) {
          for (const pr of pagosRows || []) {
            const m = toNum((pr as any).monto)
            if (agg[(pr as any).venta_id]) agg[(pr as any).venta_id].abonado += m
          }
        }
      }

      const final: VentaRow[] = Object.entries(agg)
        .map(([venta_id, v]) => ({
          venta_id: Number(venta_id),
          fecha: v.fecha,
          credito: round2(v.credito),
          abonado: round2(v.abonado),
          saldo: round2(v.credito - v.abonado),
        }))
        .filter((v) => v.saldo > 0.000001)

      final.sort((a, b) => {
        const fa = new Date(a.fecha).getTime()
        const fb = new Date(b.fecha).getTime()
        if (fa !== fb) return fa - fb
        return a.venta_id - b.venta_id
      })

      setVentas(final)
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarDetalles = useCallback(async (ids: number[]) => {
    if (ids.length === 0) {
      setDetalles({})
      return
    }

    const { data, error } = await supabase
      .from('detalle_venta')
      .select(`
        id,
        venta_id,
        producto_id,
        concepto,
        cantidad,
        precio_unitario,
        importe,
        documento,
        productos (
          nombre,
          sku,
          unidad,
          control_inventario
        ),
        forma_pago (
          metodo
        )
      `)
      .in('venta_id', ids)

    if (error) {
      console.error('Error cargando detalles:', error)
      setDetalles({})
      return
    }

    const normalizeRel = <T,>(r: T | T[] | null | undefined): T | null => {
      if (!r) return null
      return Array.isArray(r) ? (r[0] ?? null) : r
    }

    const byVenta: Record<number, Detalle[]> = {}

    for (const raw of (data || []) as any[]) {
      const d: Detalle = {
        id: raw.id,
        venta_id: raw.venta_id,
        producto_id: raw.producto_id,
        concepto: raw.concepto,
        cantidad: toNum(raw.cantidad),
        precio_unitario: toNum(raw.precio_unitario),
        importe: toNum(raw.importe),
        documento: raw.documento || null,
        productos: normalizeRel(raw.productos) as ProductoObj,
        forma_pago: normalizeRel(raw.forma_pago) as FormaPagoObj,
      }

      ;(byVenta[d.venta_id] ||= []).push(d)
    }

    Object.values(byVenta).forEach((arr) => arr.sort((a, b) => a.id - b.id))
    setDetalles(byVenta)
  }, [])

  useEffect(() => {
    if (!clienteId) return

    cargarCliente(clienteId)
    cargarMetodosPago()
    cargarVentasCredito(clienteId)
  }, [clienteId, cargarCliente, cargarMetodosPago, cargarVentasCredito])

  useEffect(() => {
    const ids = ventas.map((v) => v.venta_id)
    cargarDetalles(ids)
  }, [ventas, cargarDetalles])

  async function registrarPago() {
    if (!clienteId) return

    const monto = toNum(pago.monto)

    if (!monto || monto <= 0) {
      alert('Ingresa un monto válido.')
      return
    }

    if (!pago.metodo_pago_id) {
      alert('Selecciona un método de pago.')
      return
    }

    setLoadingPago(true)

    try {
      const { data: auth } = await supabase.auth.getUser()
      const user_id = auth?.user?.id || null

      const fecha = pago.fecha
      const metodo_pago_id = Number(pago.metodo_pago_id)
      const documento = pago.documento || null
      const observaciones = pago.observaciones || null

      const ventasConSaldo = ventas.filter((v) => v.saldo > 0)

      if (ventasConSaldo.length === 0) {
        alert('No hay ventas con saldo para este cliente.')
        return
      }

      const inserts: any[] = []
      let restante = monto

      if (pago.modo === 'venta') {
        const vId = Number(pago.venta_id)

        if (!vId) {
          alert('Selecciona una venta para aplicar el abono.')
          return
        }

        const v = ventasConSaldo.find((x) => x.venta_id === vId)

        if (!v) {
          alert('La venta seleccionada no tiene saldo.')
          return
        }

        const aplicar = Math.min(v.saldo, restante)

        inserts.push({
          cliente_id: clienteId,
          venta_id: v.venta_id,
          fecha,
          metodo_pago_id,
          monto: aplicar,
          documento,
          observaciones,
          user_id,
        })
      } else {
        for (const v of ventasConSaldo) {
          if (restante <= 0) break

          const aplicar = Math.min(v.saldo, restante)

          inserts.push({
            cliente_id: clienteId,
            venta_id: v.venta_id,
            fecha,
            metodo_pago_id,
            monto: aplicar,
            documento,
            observaciones,
            user_id,
          })

          restante -= aplicar
        }
      }

      if (inserts.length === 0) {
        alert('No fue posible aplicar el abono al saldo.')
        return
      }

      const { error: insErr } = await supabase.from('pagos_venta').insert(inserts)
      if (insErr) throw insErr

      alert('Pago registrado correctamente.')

      setPago((p) => ({
        ...p,
        monto: '',
        documento: '',
        observaciones: '',
        venta_id: '',
      }))

      await cargarVentasCredito(clienteId)
    } catch (e: any) {
      console.error(e)
      alert(`Error al registrar el pago: ${e?.message ?? e}`)
    } finally {
      setLoadingPago(false)
    }
  }

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
      doc.text('Deudas por Venta', 14, 35)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(`Cliente: ${cliente.nombre || `Cliente #${clienteId}`}`, 14, 41)
      doc.text(`NIT: ${cliente.nit || '—'}`, 14, 46)

      autoTable(doc, {
        startY: 52,
        head: [['Resumen', 'Valor']],
        body: [
          ['Total crédito', formatoQ(totales.tCred)],
          ['Total abonado', formatoQ(totales.tAbo)],
          ['Total saldo', formatoQ(totales.tSal)],
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

      const y = ((doc as any).lastAutoTable?.finalY || 70) + 6

      autoTable(doc, {
        startY: y,
        head: [['Venta', 'Fecha', 'Crédito', 'Abonado', 'Saldo']],
        body: ventas.map((v) => [
          `#${v.venta_id}`,
          v.fecha,
          formatoQ(v.credito),
          formatoQ(v.abonado),
          formatoQ(v.saldo),
        ]),
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
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
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

      doc.save(nombreArchivo(clienteId))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-1">📄 Deudas por Venta</h1>

      <p className="text-sm text-gray-600 mb-3">
        Cliente: <b>{cliente.nombre || `Cliente #${clienteId || '—'}`}</b>
        {cliente.nit ? ` · NIT: ${cliente.nit}` : ''}
      </p>

      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/ventas/saldos"
          className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver a Saldos
        </Link>

        <button
          onClick={generarPDF}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
          disabled={generando || ventas.length === 0}
        >
          {generando ? 'Generando…' : '📄 Reporte PDF'}
        </button>
      </div>

      <div className="border rounded p-4 bg-white mb-4">
        <div className="font-semibold mb-3">➕ Registrar pago</div>

        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold mb-1">Modo</div>

            <label className="mr-4">
              <input
                type="radio"
                checked={pago.modo === 'auto'}
                onChange={() => setPago((p) => ({ ...p, modo: 'auto' }))}
              />{' '}
              Automático (deuda más antigua primero)
            </label>

            <label>
              <input
                type="radio"
                checked={pago.modo === 'venta'}
                onChange={() => setPago((p) => ({ ...p, modo: 'venta' }))}
              />{' '}
              Sólo una venta
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">Fecha</div>
            <input
              type="date"
              className="border p-2 w-full"
              value={pago.fecha}
              onChange={(e) => setPago((p) => ({ ...p, fecha: e.target.value }))}
            />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">Método</div>
            <select
              className="border p-2 w-full"
              value={pago.metodo_pago_id}
              onChange={(e) => setPago((p) => ({ ...p, metodo_pago_id: e.target.value }))}
            >
              <option value="">— Selecciona —</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.metodo}
                </option>
              ))}
            </select>
          </div>

          {pago.modo === 'venta' && (
            <div className="md:col-span-2">
              <div className="text-xs font-semibold mb-1">Venta</div>
              <select
                className="border p-2 w-full"
                value={pago.venta_id}
                onChange={(e) => setPago((p) => ({ ...p, venta_id: e.target.value }))}
              >
                <option value="">— Selecciona una venta —</option>
                {ventas.map((v) => (
                  <option key={v.venta_id} value={v.venta_id}>
                    #{v.venta_id} | {v.fecha} | saldo {formatoQ(v.saldo)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold mb-1">Monto</div>
            <input
              className="border p-2 w-full"
              value={pago.monto}
              onChange={(e) => setPago((p) => ({ ...p, monto: e.target.value }))}
              inputMode="decimal"
              placeholder="0.00"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold mb-1">Documento</div>
            <input
              className="border p-2 w-full"
              value={pago.documento}
              onChange={(e) => setPago((p) => ({ ...p, documento: e.target.value }))}
            />
          </div>

          <div className="md:col-span-4">
            <div className="text-xs font-semibold mb-1">Observaciones</div>
            <input
              className="border p-2 w-full"
              value={pago.observaciones}
              onChange={(e) => setPago((p) => ({ ...p, observaciones: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-3">
          <button
            disabled={loadingPago || loading}
            onClick={registrarPago}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {loadingPago ? 'Guardando…' : '💾 Registrar pago'}
          </button>
        </div>

        <div className="mt-4 border rounded p-3 bg-gray-50 text-sm">
          <div>Total crédito: {formatoQ(totales.tCred)}</div>
          <div>Total abonado: {formatoQ(totales.tAbo)}</div>
          <div>
            <b>Total saldo: {formatoQ(totales.tSal)}</b>
          </div>
        </div>
      </div>

      <div className="border rounded bg-white overflow-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Venta</th>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-right">Crédito</th>
              <th className="p-2 text-right">Abonado</th>
              <th className="p-2 text-right">Saldo</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            ) : ventas.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={5}>
                  Este cliente no tiene ventas con saldo pendiente.
                </td>
              </tr>
            ) : (
              ventas.map((v) => (
                <tr key={v.venta_id} className="border-t">
                  <td className="p-2">#{v.venta_id}</td>
                  <td className="p-2">{v.fecha}</td>
                  <td className="p-2 text-right">{formatoQ(v.credito)}</td>
                  <td className="p-2 text-right">{formatoQ(v.abonado)}</td>
                  <td className="p-2 text-right font-semibold">{formatoQ(v.saldo)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {ventas.length > 0 && (
        <div className="space-y-4">
          {ventas.map((v) => (
            <div key={`det-${v.venta_id}`} className="border rounded bg-gray-50 p-3">
              <h3 className="font-semibold mb-2 text-sm">Detalles de la venta #{v.venta_id}</h3>

              <div className="overflow-auto">
                <table className="w-full text-xs border bg-white">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Producto</th>
                      <th className="p-2 text-left">Concepto</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">P. Unit</th>
                      <th className="p-2 text-right">Importe</th>
                      <th className="p-2 text-left">Pago</th>
                      <th className="p-2 text-left">Doc.</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(detalles[v.venta_id] || []).map((d) => {
                      const prod = d.productos
                      const fp = d.forma_pago

                      return (
                        <tr key={d.id} className="border-t">
                          <td className="p-2">
                            {prod?.nombre ? (
                              <>
                                <div className="font-medium inline-flex items-center">
                                  {prod.nombre}
                                  {prod.control_inventario ? (
                                    <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                                      inv
                                    </span>
                                  ) : null}
                                </div>

                                <div className="text-[11px] text-gray-600">
                                  {(prod.sku ? `SKU: ${prod.sku}` : '') +
                                    (prod.sku && prod.unidad ? ' · ' : '') +
                                    (prod.unidad ? `Unidad: ${prod.unidad}` : '')}
                                </div>
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          <td className="p-2">{d.concepto || '—'}</td>
                          <td className="p-2 text-right">{toNum(d.cantidad)}</td>
                          <td className="p-2 text-right">{formatoQ(d.precio_unitario)}</td>
                          <td className="p-2 text-right">{formatoQ(d.importe)}</td>
                          <td className="p-2">{fp?.metodo || '—'}</td>
                          <td className="p-2">{d.documento || '—'}</td>
                        </tr>
                      )
                    })}

                    {(!detalles[v.venta_id] || detalles[v.venta_id].length === 0) && (
                      <tr>
                        <td className="p-2 text-center text-gray-500" colSpan={7}>
                          No hay renglones de detalle para esta venta.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VistaDeudasClientePage() {
  return (
    <Suspense fallback={<div className="p-6 max-w-6xl mx-auto text-sm text-gray-600">Cargando…</div>}>
      <VistaDeudasClienteInner />
    </Suspense>
  )
}
