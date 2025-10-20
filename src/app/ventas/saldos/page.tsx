'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Cliente = { id: number; nombre: string; nit?: string | null }
type SaldoItem = {
  cliente_id: number
  nombre: string
  nit: string | null
  credito: number
  abonado: number
  saldo: number
}

export default function SaldosPorClientePage() {
  const router = useRouter()

  // catálogo para el <select>
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null)

  // datos de la vista de saldos
  const [rows, setRows] = useState<SaldoItem[]>([])

  // totales
  const totals = useMemo(() => {
    const tCredito = rows.reduce((s, r) => s + Number(r.credito || 0), 0)
    const tAbonado = rows.reduce((s, r) => s + Number(r.abonado || 0), 0)
    const tSaldo = rows.reduce((s, r) => s + Number(r.saldo || 0), 0)
    return { tCredito, tAbonado, tSaldo }
  }, [rows])

  // Cargar lista de clientes para la drop list
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

  // Cargar saldos (vista v_saldos_clientes)
  const cargar = useCallback(async () => {
    let q = supabase.from('v_saldos_clientes').select('*')
    if (selectedClienteId) q = q.eq('cliente_id', selectedClienteId)

    const { data, error } = await q.order('nombre', { ascending: true })

    if (error) {
      console.error('Error cargando saldos:', error)
      setRows([])
      return
    }
    setRows((data as SaldoItem[]) || [])
  }, [selectedClienteId])

  useEffect(() => {
    cargarClientes()
  }, [cargarClientes])

  useEffect(() => {
    cargar()
  }, [cargar])

  // acciones
  const verDetalleVentas = (clienteId: number) => {
    router.push(`/ventas/ver?cliente_id=${clienteId}`)
  }

  const verHistorialPagos = (clienteId: number) => {
    router.push(`/ventas/ver?cliente_id=${clienteId}&tab=pagos`)
  }

  const registrarPago = (clienteId: number) => {
    router.push(`/ventas/nueva?registrarPago=1&cliente_id=${clienteId}`)
  }

  // 👉 nuevo: abre tu página /ventas/saldos/vista
  const verVistaDetalleCliente = (clienteId: number) => {
    router.push(`/ventas/saldos/vista?cliente_id=${clienteId}`)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Logo con next/image para evitar warnings */}
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">💰 Saldos por Cliente</h1>

      {/* Buscador con lista desplegable */}
      <div className="flex flex-col md:flex-row items-center gap-2 mb-4">
        <select
          className="border p-2 w-full md:w-[28rem]"
          value={selectedClienteId ?? ''}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : null
            setSelectedClienteId(val)
          }}
        >
          <option value="">— Selecciona un cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.nit ? ` • NIT: ${c.nit}` : ''}
            </option>
          ))}
        </select>

        <button onClick={cargar} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔎 Buscar
        </button>

        {selectedClienteId && (
          <button
            onClick={() => {
              setSelectedClienteId(null)
              cargar()
            }}
            className="bg-slate-600 text-white px-4 py-2 rounded"
          >
            ✖ Limpiar selección
          </button>
        )}

        <button
          onClick={() => router.push('/ventas')}
          className="ml-auto bg-gray-700 text-white px-4 py-2 rounded"
        >
          ⬅ Volver al Menú de Ventas
        </button>
      </div>

      {/* Resumen */}
      <div className="border rounded p-3 mb-3 text-sm bg-gray-50">
        <div> <span className="font-semibold">Total a crédito:</span> Q{totals.tCredito.toFixed(2)}</div>
        <div> <span className="font-semibold">Total abonado:</span> Q{totals.tAbonado.toFixed(2)}</div>
        <div> <span className="font-semibold">Saldo total:</span> Q{totals.tSaldo.toFixed(2)}</div>
      </div>

      {/* Tabla */}
      <table className="w-full border text-sm">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2 text-left">Cliente</th>
            <th className="p-2 text-left">NIT</th>
            <th className="p-2 text-right">Crédito</th>
            <th className="p-2 text-right">Abonado</th>
            <th className="p-2 text-right">Saldo</th>
            <th className="p-2 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-6 text-gray-500">
                No hay registros.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.cliente_id} className="border-t">
                <td className="p-2">{r.nombre}</td>
                <td className="p-2">{r.nit || '—'}</td>
                <td className="p-2 text-right">Q{Number(r.credito || 0).toFixed(2)}</td>
                <td className="p-2 text-right">Q{Number(r.abonado || 0).toFixed(2)}</td>
                <td className="p-2 text-right font-semibold">
                  Q{Number(r.saldo || 0).toFixed(2)}
                </td>
                <td className="p-2 text-center">
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={() => verDetalleVentas(r.cliente_id)}
                      className="px-2 py-1 rounded text-xs bg-amber-600 text-white"
                    >
                      Ver ventas
                    </button>
                    <button
                      onClick={() => verHistorialPagos(r.cliente_id)}
                      className="px-2 py-1 rounded text-xs bg-sky-600 text-white"
                    >
                      Historial
                    </button>
                    <button
                      onClick={() => registrarPago(r.cliente_id)}
                      className="px-2 py-1 rounded text-xs bg-emerald-600 text-white"
                    >
                      Registrar pago
                    </button>

                    {/* 👉 botón nuevo que lleva a /ventas/saldos/vista */}
                    <button
                      onClick={() => verVistaDetalleCliente(r.cliente_id)}
                      className="px-2 py-1 rounded text-xs bg-indigo-600 text-white"
                    >
                      Detalle
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
