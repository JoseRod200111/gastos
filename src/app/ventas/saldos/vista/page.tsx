'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type VentaSaldo = {
  cliente_id: number
  venta_id: number
  fecha: string
  credito: number
  abonado: number
  saldo: number
}

type Renglon = {
  venta_id: number
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
}

export default function DetalleSaldosClientePage() {
  const router = useRouter()
  const params = useParams() as { clienteId?: string }

  const clienteId = useMemo(
    () => (params?.clienteId ? Number(params.clienteId) : NaN),
    [params]
  )

  const [ventas, setVentas] = useState<VentaSaldo[]>([])
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [cargando, setCargando] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')

  useEffect(() => {
    if (!clienteId || Number.isNaN(clienteId)) return

    const cargar = async () => {
      setCargando(true)

      // 1) Nombre del cliente (opcional, para el encabezado)
      const { data: cli } = await supabase
        .from('clientes')
        .select('nombre')
        .eq('id', clienteId)
        .single()
      setClienteNombre(cli?.nombre || `Cliente #${clienteId}`)

      // 2) Ventas con saldo (vista v_saldos_por_venta)
      const { data: vs, error: errVs } = await supabase
        .from('v_saldos_por_venta')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .order('venta_id', { ascending: false })

      if (errVs) {
        console.error(errVs)
        alert('No se pudieron cargar las ventas del cliente')
        setCargando(false)
        return
      }

      setVentas(vs || [])

      // 3) Renglones a crédito de esas ventas
      const ventaIds = (vs || []).map(v => v.venta_id)
      if (ventaIds.length > 0) {
        // obtener mp.id de “Pendiente de pago”
        const { data: mp } = await supabase
          .from('forma_pago')
          .select('id')
          .ilike('metodo', '%pendiente de pago%')
          .limit(1)
          .single()

        const mpId = mp?.id
        if (!mpId) {
          setRenglones([])
          setCargando(false)
          return
        }

        const { data: det, error: errDet } = await supabase
          .from('detalle_venta')
          .select('venta_id, concepto, cantidad, precio_unitario, importe')
          .in('venta_id', ventaIds)
          .eq('forma_pago_id', mpId)
          .order('venta_id', { ascending: true })
          .order('id', { ascending: true })

        if (errDet) {
          console.error(errDet)
          alert('No se pudieron cargar los renglones de las ventas')
        }

        setRenglones(det || [])
      } else {
        setRenglones([])
      }

      setCargando(false)
    }

    cargar()
  }, [clienteId])

  const totalCredito = ventas.reduce((s, v) => s + Number(v.credito || 0), 0)
  const totalAbonado = ventas.reduce((s, v) => s + Number(v.abonado || 0), 0)
  const totalSaldo = ventas.reduce((s, v) => s + Number(v.saldo || 0), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Logo */}
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-1">🧾 Deudas por Venta</h1>
      <p className="text-gray-600 mb-4">
        Cliente: <span className="font-semibold">{clienteNombre}</span> (ID {clienteId})
      </p>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => router.push('/ventas/saldos')}
          className="bg-slate-700 text-white px-4 py-2 rounded"
        >
          ⬅ Volver a Saldos
        </button>
      </div>

      {/* Totales */}
      <div className="border p-3 rounded mb-4 text-sm bg-gray-50">
        <div><strong>Total crédito:</strong> Q{totalCredito.toFixed(2)}</div>
        <div><strong>Total abonado:</strong> Q{totalAbonado.toFixed(2)}</div>
        <div><strong>Total saldo:</strong> Q{totalSaldo.toFixed(2)}</div>
      </div>

      {cargando ? (
        <div className="text-gray-500">Cargando…</div>
      ) : ventas.length === 0 ? (
        <div className="text-gray-500">Este cliente no tiene ventas a crédito.</div>
      ) : (
        ventas.map(v => (
          <div key={v.venta_id} className="mb-6 border rounded">
            <div className="px-3 py-2 bg-gray-100 flex flex-wrap gap-4 items-center">
              <div><span className="font-semibold">Venta:</span> #{v.venta_id}</div>
              <div><span className="font-semibold">Fecha:</span> {v.fecha}</div>
              <div><span className="font-semibold">Crédito:</span> Q{Number(v.credito).toFixed(2)}</div>
              <div><span className="font-semibold">Abonado:</span> Q{Number(v.abonado).toFixed(2)}</div>
              <div><span className="font-semibold">Saldo:</span> Q{Number(v.saldo).toFixed(2)}</div>
            </div>

            {/* Renglones de esa venta */}
            <div className="p-3">
              <h3 className="font-semibold mb-2">Renglones a crédito</h3>
              <table className="w-full text-sm border">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="p-2 text-left">Concepto</th>
                    <th className="p-2 text-right">Cantidad</th>
                    <th className="p-2 text-right">P. Unit</th>
                    <th className="p-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(renglones.filter(r => r.venta_id === v.venta_id) || []).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.concepto}</td>
                      <td className="p-2 text-right">{Number(r.cantidad).toFixed(2)}</td>
                      <td className="p-2 text-right">Q{Number(r.precio_unitario).toFixed(2)}</td>
                      <td className="p-2 text-right">Q{Number(r.importe).toFixed(2)}</td>
                    </tr>
                  ))}
                  {renglones.filter(r => r.venta_id === v.venta_id).length === 0 && (
                    <tr><td colSpan={4} className="p-2 text-gray-500">Sin renglones a crédito en esta venta.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
