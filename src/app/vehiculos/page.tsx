'use client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

type VehiculoRel = { placa: string | null; alias: string | null } | null
type Viaje = {
  id: number
  vehiculo_id: number | null
  fecha_inicio: string | null
  fecha_fin: string | null
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
  vehiculos?: VehiculoRel
}
type GastoAdicional = { id: number; viaje_id: number; fecha: string | null; descripcion: string | null; monto: number | null }

function ReporteInner() {
  const params = useSearchParams()
  const idParam = Number(params.get('id') || 0)
  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [gastos, setGastos] = useState<GastoAdicional[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!idParam) return
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('viajes')
          .select(`
            id, vehiculo_id, fecha_inicio, fecha_fin, origen, destino, conductor,
            combustible_inicial, combustible_final, combustible_despachado, precio_galon,
            salario_diario, dias, observaciones,
            vehiculos ( placa, alias )
          `)
          .eq('id', idParam)
          .single()

        if (!error) {
          const row: any = data || null
          const fixed: Viaje | null = row
            ? { ...row, vehiculos: Array.isArray(row?.vehiculos) ? (row.vehiculos[0] ?? null) : (row.vehiculos ?? null) }
            : null
          setViaje(fixed)
        }

        const { data: g, error: errG } = await supabase
          .from('viaje_gastos')
          .select('id, viaje_id, fecha, descripcion, monto')
          .eq('viaje_id', idParam)
          .order('fecha', { ascending: true })
        if (!errG) setGastos((g as GastoAdicional[]) ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [idParam])

  const totales = useMemo(() => {
    const fuel = (Number(viaje?.combustible_despachado || 0) * Number(viaje?.precio_galon || 0)) || 0
    const salary = (Number(viaje?.salario_diario || 0) * Number(viaje?.dias || 0)) || 0
    const otros = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)
    const total = fuel + salary + otros
    return { fuel, salary, otros, total }
  }, [viaje, gastos])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <h1 className="text-2xl font-bold">📄 Reporte de Viaje</h1>
        <Link href="/vehiculos" className="ml-auto bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded">
          ⬅ Volver
        </Link>
        <button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded">
          Imprimir / PDF
        </button>
      </div>

      {loading ? (
        <div>Cargando…</div>
      ) : !viaje ? (
        <div>No se encontró el viaje solicitado.</div>
      ) : (
        <div className="border rounded p-4 print:border-none print:p-0">
          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
            <div><span className="font-semibold">ID:</span> {viaje.id}</div>
            <div><span className="font-semibold">Vehículo:</span> {viaje.vehiculos?.placa || '—'}{viaje.vehiculos?.alias ? ` · ${viaje.vehiculos.alias}` : ''}</div>
            <div><span className="font-semibold">Conductor:</span> {viaje.conductor || '—'}</div>
            <div><span className="font-semibold">Fecha (inicio/fin):</span> {viaje.fecha_inicio || '—'} — {viaje.fecha_fin || '—'}</div>
            <div><span className="font-semibold">Origen:</span> {viaje.origen || '—'}</div>
            <div><span className="font-semibold">Destino:</span> {viaje.destino || '—'}</div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm mb-4">
            <div className="bg-gray-50 border rounded p-3">
              <div className="font-semibold mb-1">Combustible</div>
              <div>Inicial: {viaje.combustible_inicial ?? 0} gal</div>
              <div>Final: {viaje.combustible_final ?? 0} gal</div>
              <div>Despachado: {viaje.combustible_despachado ?? 0} gal</div>
              <div>Precio/galón: Q{Number(viaje.precio_galon || 0).toFixed(2)}</div>
              <div className="mt-1 font-semibold">Costo combustible: Q{totales.fuel.toFixed(2)}</div>
            </div>

            <div className="bg-gray-50 border rounded p-3">
              <div className="font-semibold mb-1">Mano de obra</div>
              <div>Salario diario: Q{Number(viaje.salario_diario || 0).toFixed(2)}</div>
              <div>Días: {viaje.dias ?? 0}</div>
              <div className="mt-1 font-semibold">Total salarios: Q{totales.salary.toFixed(2)}</div>
            </div>

            <div className="bg-gray-50 border rounded p-3">
              <div className="font-semibold mb-1">Observaciones</div>
              <div className="whitespace-pre-wrap">{viaje.observaciones || '—'}</div>
            </div>
          </div>

          <div className="mb-3 font-semibold">Gastos adicionales</div>
          <div className="overflow-x-auto border rounded mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Descripción</th>
                  <th className="p-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.length === 0 ? (
                  <tr><td className="p-3" colSpan={3}>Sin gastos registrados.</td></tr>
                ) : gastos.map(g => (
                  <tr key={g.id} className="border-t">
                    <td className="p-2">{g.fecha || '—'}</td>
                    <td className="p-2">{g.descripcion || '—'}</td>
                    <td className="p-2 text-right">Q{Number(g.monto || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-right text-sm">
            <div>Combustible: <span className="font-semibold">Q{totales.fuel.toFixed(2)}</span></div>
            <div>Salarios: <span className="font-semibold">Q{totales.salary.toFixed(2)}</span></div>
            <div>Otros gastos: <span className="font-semibold">Q{totales.otros.toFixed(2)}</span></div>
            <div className="mt-1 text-lg font-bold">Total del viaje: Q{totales.total.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReporteWrapper() {
  return (
    <Suspense fallback={<div className="p-6">Cargando reporte…</div>}>
      <ReporteInner />
    </Suspense>
  )
}
