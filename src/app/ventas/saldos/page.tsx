'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type SaldoRow = {
  cliente_id: number
  nombre: string
  nit: string | null
  credito: number
  abonado: number
  saldo: number
}

export default function SaldosDeClientes() {
  const [rows, setRows] = useState<SaldoRow[]>([])
  const [filtros, setFiltros] = useState({ q: '' })

  const cargar = useCallback(async () => {
    // Traemos todo y filtramos en cliente (si tu vista crece mucho, podemos pasar filtros con RPC)
    const { data, error } = await supabase
      .from('v_saldos_clientes')
      .select('cliente_id, nombre, nit, credito, abonado, saldo')
      .order('nombre', { ascending: true })

    if (error) {
      console.error(error)
      setRows([])
      return
    }

    const q = filtros.q.trim().toLowerCase()
    const filtradas = (data || []).filter(r => {
      if (!q) return true
      const hay = `${r.nombre ?? ''} ${r.nit ?? ''}`.toLowerCase()
      return hay.includes(q)
    }) as SaldoRow[]

    setRows(filtradas)
  }, [filtros.q])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totales = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.credito += Number(r.credito || 0)
        acc.abonado += Number(r.abonado || 0)
        acc.saldo += Number(r.saldo || 0)
        return acc
      },
      { credito: 0, abonado: 0, saldo: 0 }
    )
  }, [rows])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">💰 Saldos por Cliente</h1>

      {/* Filtro */}
      <div className="flex items-center gap-3 mb-4">
        <input
          className="border p-2 w-full md:w-96"
          placeholder="Buscar por nombre o NIT…"
          value={filtros.q}
          onChange={(e) => setFiltros({ q: e.target.value })}
        />
        <button onClick={cargar} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Buscar
        </button>
        <a href="/ventas" className="ml-auto inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú de Ventas
        </a>
      </div>

      {/* Totales */}
      <div className="border rounded p-3 bg-gray-50 mb-4 text-sm">
        <div><b>Total a crédito:</b> Q{totales.credito.toFixed(2)}</div>
        <div><b>Total abonado:</b> Q{totales.abonado.toFixed(2)}</div>
        <div><b>Saldo total:</b> Q{totales.saldo.toFixed(2)}</div>
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
              <td className="p-4 text-center text-gray-500" colSpan={6}>
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
                  {/* Enlaza a ver ventas filtrando por cliente (si lo implementaste) */}
                  <a
                    href={`/ventas/ver?cliente=${encodeURIComponent(r.nombre)}`}
                    className="text-blue-700 underline"
                  >
                    Ver ventas
                  </a>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
