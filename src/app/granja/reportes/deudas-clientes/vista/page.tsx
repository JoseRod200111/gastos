'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// (Opcional pero recomendado para evitar pre-render raro en Vercel)
export const dynamic = 'force-dynamic'

type Venta = {
  id: number
  fecha: string
  cliente_id: number
  total: number
  pagado: number
  deuda: number
  observaciones: string | null
  clientes?: { nombre: string | null; nit: string | null } | null
}

type FormaPago = { id: number; metodo: string }

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100
const fmtQ = (n: number) => `Q${round2(n).toFixed(2)}`

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

function VistaDeudasClienteInner() {
  const sp = useSearchParams()
  const clienteId = Number(sp.get('cliente_id') || 0)

  const [ventas, setVentas] = useState<Venta[]>([])
  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [loading, setLoading] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [generando, setGenerando] = useState(false)

  // Form abono
  const [modo, setModo] = useState<'AUTO' | 'UNA'>('AUTO')
  const [ventaId, setVentaId] = useState<string>('') // modo UNA
  const [fecha, setFecha] = useState<string>('')
  const [metodoPagoId, setMetodoPagoId] = useState<string>('')
  const [monto, setMonto] = useState<string>('0')
  const [documento, setDocumento] = useState<string>('')
  const [observaciones, setObservaciones] = useState<string>('')

  useEffect(() => {
    const hoy = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    setFecha(`${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`)
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('forma_pago')
        .select('id, metodo')
        .order('id', { ascending: true })
      setFormasPago((data || []) as FormaPago[])
    })()
  }, [])

  const cargar = useCallback(async () => {
    if (!clienteId) {
      setVentas([])
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('granja_ventas_cerdos')
        .select('id, fecha, cliente_id, total, pagado, deuda, observaciones, clientes ( nombre, nit )')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: true })
        .order('id', { ascending: true })

      if (error) {
        console.error(error)
        setVentas([])
        return
      }

      const list = ((data || []) as any as Venta[]).filter((v) => toNum(v.deuda) > 0.000001)
      setVentas(list)
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const clienteNombre = ventas[0]?.clientes?.nombre || (clienteId ? `Cliente #${clienteId}` : '—')
  const clienteNit = ventas[0]?.clientes?.nit || '—'

  const totales = useMemo(() => {
    const credito = ventas.reduce((a, v) => a + toNum(v.total), 0)
    const abonado = ventas.reduce((a, v) => a + toNum(v.pagado), 0)
    const saldo = ventas.reduce((a, v) => a + toNum(v.deuda), 0)
    return { credito: round2(credito), abonado: round2(abonado), saldo: round2(saldo) }
  }, [ventas])

  const aplicarPagoAVenta = async (v: Venta, pago: number) => {
    const nuevoPagado = round2(toNum(v.pagado) + pago)
    const nuevaDeuda = round2(Math.max(0, toNum(v.total) - nuevoPagado))

    const { error } = await supabase
      .from('granja_ventas_cerdos')
      .update({ pagado: nuevoPagado, deuda: nuevaDeuda })
      .eq('id', v.id)

    if (error) throw error
  }

  const registrarAbono = async () => {
    if (!clienteId) {
      alert('Cliente inválido.')
      return
    }

    const m = toNum(monto)
    if (m <= 0) {
      alert('Monto inválido.')
      return
    }
    if (!metodoPagoId) {
      alert('Selecciona un método de pago.')
      return
    }
    if (ventas.length === 0) {
      alert('Este cliente no tiene deudas pendientes.')
      return
    }

    setRegistrando(true)
    try {
      let restante = m

      if (modo === 'UNA') {
        const vid = Number(ventaId || 0)
        if (!vid) {
          alert('Selecciona una venta.')
          return
        }

        const v = ventas.find((x) => x.id === vid)
        if (!v) {
          alert('No se encontró la venta.')
          return
        }

        const pagar = Math.min(restante, toNum(v.deuda))
        if (pagar <= 0) {
          alert('Esa venta no tiene saldo.')
          return
        }

        await aplicarPagoAVenta(v, pagar)
        restante -= pagar
      } else {
        // AUTO: deuda más antigua primero
        for (const v of ventas) {
          if (restante <= 0) break
          const d = toNum(v.deuda)
          if (d <= 0) continue
          const pagar = Math.min(restante, d)
          await aplicarPagoAVenta(v, pagar)
          restante -= pagar
        }
      }

      alert('Abono registrado.')
      setMonto('0')
      setDocumento('')
      setObservaciones('')
      setVentaId('')
      await cargar()
    } catch (e: any) {
      console.error(e)
      alert('Error registrando abono.')
    } finally {
      setRegistrando(false)
    }
  }

  const generarPDF = async () => {
    setGenerando(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 80, 10, 50, 18)

      doc.setFontSize(14)
      doc.text('Deudas por Venta — Granja', 14, 35)

      doc.setFontSize(10)
      doc.text(`Cliente: ${clienteNombre}`, 14, 41)
      doc.text(`NIT: ${clienteNit}`, 14, 46)

      autoTable(doc, {
        startY: 52,
        head: [['Resumen', 'Valor']],
        body: [
          ['Total crédito', fmtQ(totales.credito)],
          ['Total abonado', fmtQ(totales.abonado)],
          ['Saldo total', fmtQ(totales.saldo)],
        ],
        styles: { fontSize: 9 },
      })

      const y = (doc as any).lastAutoTable.finalY + 6

      autoTable(doc, {
        startY: y,
        head: [['Venta', 'Fecha', 'Crédito', 'Abonado', 'Saldo']],
        body: ventas.map((v) => [
          `#${v.id}`,
          v.fecha,
          fmtQ(toNum(v.total)),
          fmtQ(toNum(v.pagado)),
          fmtQ(toNum(v.deuda)),
        ]),
        styles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      })

      const now = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      const name = `deudas_cliente_granja_${clienteId}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
      doc.save(name)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-1">📄 Deudas por Venta — Granja</h1>
      <p className="text-sm text-gray-600 mb-3">
        Cliente: <b>{clienteNombre}</b>
      </p>

      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/granja/reportes/deudas-clientes"
          className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver a Deudas
        </Link>

        <button
          onClick={generarPDF}
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm"
          disabled={generando || ventas.length === 0}
        >
          {generando ? 'Generando…' : '📄 Reporte PDF'}
        </button>
      </div>

      {/* Registrar abono */}
      <div className="border rounded p-4 bg-white mb-4">
        <div className="font-semibold mb-3">➕ Registrar abono</div>

        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold mb-1">Modo</div>
            <label className="mr-4">
              <input type="radio" checked={modo === 'AUTO'} onChange={() => setModo('AUTO')} />{' '}
              Automático (deuda más antigua primero)
            </label>
            <label>
              <input type="radio" checked={modo === 'UNA'} onChange={() => setModo('UNA')} /> Sólo una venta
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">Fecha</div>
            <input
              type="date"
              className="border p-2 w-full"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">Método</div>
            <select className="border p-2 w-full" value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {formasPago.map((fp) => (
                <option key={fp.id} value={fp.id}>
                  {fp.metodo}
                </option>
              ))}
            </select>
          </div>

          {modo === 'UNA' && (
            <div className="md:col-span-2">
              <div className="text-xs font-semibold mb-1">Venta</div>
              <select className="border p-2 w-full" value={ventaId} onChange={(e) => setVentaId(e.target.value)}>
                <option value="">— Selecciona una venta —</option>
                {ventas.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.id} | {v.fecha} | saldo {fmtQ(toNum(v.deuda))}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold mb-1">Monto</div>
            <input className="border p-2 w-full" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold mb-1">Documento</div>
            <input className="border p-2 w-full" value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </div>

          <div className="md:col-span-4">
            <div className="text-xs font-semibold mb-1">Observaciones</div>
            <input className="border p-2 w-full" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={registrarAbono}
            disabled={registrando || loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {registrando ? 'Registrando…' : '💾 Registrar abono'}
          </button>
        </div>

        <div className="mt-4 border rounded p-3 bg-gray-50 text-sm">
          <div>Total crédito: {fmtQ(totales.credito)}</div>
          <div>Total abonado: {fmtQ(totales.abonado)}</div>
          <div>
            <b>Total saldo: {fmtQ(totales.saldo)}</b>
          </div>
        </div>
      </div>

      {/* Tabla deudas */}
      <div className="border rounded bg-white overflow-auto">
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
                  Este cliente no tiene deudas pendientes.
                </td>
              </tr>
            ) : (
              ventas.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="p-2">#{v.id}</td>
                  <td className="p-2">{v.fecha}</td>
                  <td className="p-2 text-right">{fmtQ(toNum(v.total))}</td>
                  <td className="p-2 text-right">{fmtQ(toNum(v.pagado))}</td>
                  <td className="p-2 text-right font-semibold">{fmtQ(toNum(v.deuda))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GranjaDeudasClienteVistaPage() {
  // ✅ aquí está el fix: useSearchParams vive dentro del Inner, y está envuelto en Suspense
  return (
    <Suspense fallback={<div className="p-6 max-w-6xl mx-auto text-sm text-gray-600">Cargando…</div>}>
      <VistaDeudasClienteInner />
    </Suspense>
  )
}
