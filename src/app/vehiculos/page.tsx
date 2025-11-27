'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Viaje = {
  id: number
  vehiculo_id: number | null
  fecha_inicio: string
  fecha_fin: string
  origen: string | null
  destino: string | null
  conductor: string | null
  combustible_inicial: number | null
  combustible_final: number | null
  combustible_despachado: number | null
  precio_galon: number | null
  salario_diario: number | null
  dias: number | null
  observaciones: string | null
  vehiculos?: { placa: string | null; alias: string | null } | null
}
type Gasto = { id: number; viaje_id: number; concepto: string | null; monto: number | null }

export default function ReporteViaje() {
  const params = useSearchParams()
  const idParam = params.get('id')
  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])

  useEffect(() => {
    if (!idParam) return
    ;(async () => {
      const { data, error } = await supabase
        .from('viajes')
        .select(
          `
          id, vehiculo_id, fecha_inicio, fecha_fin, origen, destino, conductor,
          combustible_inicial, combustible_final, combustible_despachado, precio_galon,
          salario_diario, dias, observaciones,
          vehiculos ( placa, alias )
        `
        )
        .eq('id', idParam)
        .single()
      if (!error) setViaje((data as Viaje) || null)

      const { data: g, error: errG } = await supabase
        .from('viaje_gastos')
        .select('id, viaje_id, concepto, monto')
        .eq('viaje_id', idParam)
        .order('id')
      if (!errG) setGastos((g as Gasto[]) || [])
    })()
  }, [idParam])

  const resumen = useMemo(() => {
    if (!viaje) return null
    const fuelUsed =
      Number(viaje.combustible_inicial || 0) +
      Number(viaje.combustible_despachado || 0) -
      Number(viaje.combustible_final || 0)
    const costoComb = fuelUsed * Number(viaje.precio_galon || 0)
    const costoConductor = Number(viaje.salario_diario || 0) * Number(viaje.dias || 0)
    const otros = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)
    const total = costoComb + costoConductor + otros
    return { fuelUsed, costoComb, costoConductor, otros, total }
  }, [viaje, gastos])

  if (!viaje) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p>Cargando…</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold">Reporte del Viaje #{viaje.id}</h1>
        <div className="space-x-2">
          <button
            onClick={() => window.print()}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded"
          >
            🖨️ Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="border rounded p-3 mb-3 bg-gray-50 text-sm">
        <div><b>Vehículo:</b> {viaje.vehiculos?.placa || '—'} {viaje.vehiculos?.alias ? `(${viaje.vehiculos?.alias})` : ''}</div>
        <div><b>Conductor:</b> {viaje.conductor || '—'}</div>
        <div><b>Periodo:</b> {viaje.fecha_inicio?.slice(0,10)} — {viaje.fecha_fin?.slice(0,10)}</div>
        <div><b>Ruta:</b> {viaje.origen || '—'} → {viaje.destino || '—'}</div>
        {viaje.observaciones ? <div><b>Observaciones:</b> {viaje.observaciones}</div> : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="border rounded p-3">
          <h3 className="font-semibold mb-2">⛽ Combustible</h3>
          <div>Inicial: <b>{Number(viaje.combustible_inicial || 0).toFixed(2)} gal</b></div>
          <div>Despachado: <b>{Number(viaje.combustible_despachado || 0).toFixed(2)} gal</b></div>
          <div>Final: <b>{Number(viaje.combustible_final || 0).toFixed(2)} gal</b></div>
          <div className="mt-1">Precio por galón: <b>Q{Number(viaje.precio_galon || 0).toFixed(2)}</b></div>
          <div className="mt-2">Galones usados: <b>{resumen?.fuelUsed.toFixed(2)} gal</b></div>
          <div>Costo combustible: <b>Q{resumen?.costoComb.toFixed(2)}</b></div>
        </div>

        <div className="border rounded p-3">
          <h3 className="font-semibold mb-2">👷 Mano de Obra</h3>
          <div>Salario diario: <b>Q{Number(viaje.salario_diario || 0).toFixed(2)}</b></div>
          <div>Días: <b>{Number(viaje.dias || 0)}</b></div>
          <div className="mt-2">Costo conductor: <b>Q{resumen?.costoConductor.toFixed(2)}</b></div>
        </div>
      </div>

      <h3 className="font-semibold mb-2">🧾 Gastos adicionales</h3>
      <table className="w-full text-sm border mb-3">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2 text-left">Concepto</th>
            <th className="p-2 text-left">Monto (Q)</th>
          </tr>
        </thead>
        <tbody>
          {gastos.length === 0 ? (
            <tr><td colSpan={2} className="p-3 text-center text-gray-500">Sin gastos</td></tr>
          ) : gastos.map((g) => (
            <tr key={g.id} className="border-t">
              <td className="p-2">{g.concepto || '—'}</td>
              <td className="p-2">Q{Number(g.monto || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50">
            <td className="p-2 text-right font-semibold">Total otros gastos:</td>
            <td className="p-2 font-semibold">Q{resumen?.otros.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="border rounded p-3 bg-gray-100">
        <div className="text-lg">
          <b>Total del viaje:</b> Q{resumen?.total.toFixed(2)}
        </div>
      </div>

      <div className="mt-6">
        <a href="/vehiculos" className="inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver a Vehículos
        </a>
      </div>
    </div>
  )
}
