'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type VentaDetalleCredito = {
  venta_id: number
  fecha: string
  credito: number
}

type VentaLinea = {
  venta_id: number
  fecha: string
  credito: number
  abonado: number
  saldo: number
}

export default function VistaSaldosCliente() {
  const router = useRouter()
  const sp = useSearchParams()

  const clienteId = useMemo(() => {
    const v = sp.get('cliente_id')
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }, [sp])

  const clienteNombre = sp.get('nombre') || ''

  const [rows, setRows] = useState<VentaLinea[]>([])
  const [loading, setLoading] = useState(false)

  const totals = useMemo(() => {
    const credito = rows.reduce((s, r) => s + (r.credito || 0), 0)
    const abonado = rows.reduce((s, r) => s + (r.abonado || 0), 0)
    const saldo = rows.reduce((s, r) => s + (r.saldo || 0), 0)
    return { credito, abonado, saldo }
  }, [rows])

  useEffect(() => {
    (async () => {
      if (!clienteId) {
        setRows([])
        return
      }
      setLoading(true)
      try {
        // 1) ID del método "Pendiente de pago"
        const { data: mpRow, error: mpErr } = await supabase
          .from('forma_pago')
          .select('id')
          .ilike('metodo', '%pendiente de pago%')
          .limit(1)
          .maybeSingle()

        if (mpErr) throw mpErr
        const pendienteId = mpRow?.id
        if (!pendienteId) {
          setRows([])
          setLoading(false)
          return
        }

        // 2) Traer líneas de crédito (detalle_venta) de este cliente
        //    Nos traemos venta_id, importe, y la fecha desde ventas
        const { data: det, error: detErr } = await supabase
          .from('detalle_venta')
          .select(`
            venta_id,
            importe,
            ventas!inner (
              id,
              fecha,
              cliente_id
            )
          `)
          .eq('forma_pago_id', pendienteId)
          .eq('ventas.cliente_id', clienteId)

        if (detErr) throw detErr

        // Agrupar en JS por venta_id
        const creditoPorVenta = new Map<number, VentaDetalleCredito>()
        for (const r of det as any[]) {
          const vid = Number(r.venta_id)
          const fecha = r.ventas?.fecha as string
          const imp = Number(r.importe || 0)
          const prev = creditoPorVenta.get(vid)
          if (!prev) {
            creditoPorVenta.set(vid, { venta_id: vid, fecha, credito: imp })
          } else {
            prev.credito += imp
          }
        }

        const ventasBase = Array.from(creditoPorVenta.values())

        // 3) (Opcional) Traer abonos si tienes tabla pagos_venta
        let abonosPorVenta = new Map<number, number>()
        const ventaIds = ventasBase.map(v => v.venta_id)
        if (ventaIds.length > 0) {
          const { data: ab, error: abErr } = await supabase
            .from('pagos_venta')
            .select('venta_id, monto')
            .in('venta_id', ventaIds)

          if (!abErr && Array.isArray(ab)) {
            abonosPorVenta = ab.reduce((map, r: any) => {
              const vid = Number(r.venta_id)
              const monto = Number(r.monto || 0)
              map.set(vid, (map.get(vid) || 0) + monto)
              return map
            }, new Map<number, number>())
          }
          // si hay error/tabla no existe, se deja en 0 sin romper
        }

        // 4) Construir filas finales
        const filas: VentaLinea[] = ventasBase.map(v => {
          const abonado = abonosPorVenta.get(v.venta_id) || 0
          return {
            venta_id: v.venta_id,
            fecha: v.fecha,
            credito: Number(v.credito.toFixed(2)),
            abonado: Number(abonado.toFixed(2)),
            saldo: Number((v.credito - abonado).toFixed(2)),
          }
        }).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)) // más reciente primero

        setRows(filas)
      } catch (e) {
        console.error(e)
        setRows([])
      } finally {
        setLoading(false)
      }
    })()
  }, [clienteId])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-2">🧾 Deudas por Venta</h1>
      <p className="mb-4 text-gray-700">
        Cliente: <span className="font-semibold">{clienteNombre || `(ID ${clienteId ?? '—'})`}</span>
      </p>

      <button
        onClick={() => router.push('/ventas/saldos')}
        className="mb-4 bg-slate-700 text-white px-4 py-2 rounded"
      >
        ⬅ Volver a Saldos
      </button>

      <div className="border rounded p-3 mb-3 text-sm bg-gray-50">
        <div><span className="font-semibold">Total crédito:</span> Q{totals.credito.toFixed(2)}</div>
        <div><span className="font-semibold">Total abonado:</span> Q{totals.abonado.toFixed(2)}</div>
        <div><span className="font-semibold">Total saldo:</span> Q{totals.saldo.toFixed(2)}</div>
      </div>

      {loading ? (
        <p className="text-gray-600">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-600">Este cliente no tiene ventas a crédito.</p>
      ) : (
        <table className="w-full border text-sm">
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
            {rows.map((r) => (
              <tr key={r.venta_id} className="border-t">
                <td className="p-2">#{r.venta_id}</td>
                <td className="p-2">{r.fecha}</td>
                <td className="p-2 text-right">Q{r.credito.toFixed(2)}</td>
                <td className="p-2 text-right">Q{r.abonado.toFixed(2)}</td>
                <td className="p-2 text-right font-semibold">Q{r.saldo.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
