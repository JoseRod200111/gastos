'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

// misma librería que en otros reportes
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import jsPDF from 'jspdf'

type Vehiculo = {
  id: number
  placa: string | null
  alias: string | null
  marca: string | null
  modelo: string | null
  anio: number | null
}

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
  km_recorridos: number | null
  consumo_por_galon: number | null
}

type Gasto = {
  id: number
  fecha: string | null
  descripcion: string | null
  monto: number | null
}

export default function ReporteViajePage() {
  const searchParams = useSearchParams()
  const idParam = searchParams.get('id')

  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ========================= Carga de datos ========================= */

  const cargar = useCallback(
    async (id: number) => {
      setLoading(true)
      setError(null)

      // 1) Viaje
      const { data: viajeData, error: vErr } = await supabase
        .from('viajes')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (vErr || !viajeData) {
        console.error('Error cargando viaje', vErr)
        setError('No se pudo cargar el viaje.')
        setLoading(false)
        return
      }

      const v = viajeData as Viaje
      setViaje(v)

      // 2) Vehículo
      if (v.vehiculo_id != null) {
        const { data: vehiculoData, error: veErr } = await supabase
          .from('vehiculos')
          .select('id, placa, alias, marca, modelo, anio')
          .eq('id', v.vehiculo_id)
          .maybeSingle()

        if (!veErr && vehiculoData) {
          setVehiculo(vehiculoData as Vehiculo)
        }
      }

      // 3) Gastos adicionales
      const { data: gastosData, error: gErr } = await supabase
        .from('viaje_gastos')
        .select('id, fecha, descripcion, monto')
        .eq('viaje_id', id)
        .order('fecha', { ascending: true })

      if (gErr) {
        console.error('Error cargando gastos', gErr)
        setGastos([])
      } else {
        setGastos((gastosData as Gasto[]) ?? [])
      }

      setLoading(false)
    },
    []
  )

  useEffect(() => {
    const id = idParam ? Number(idParam) : NaN
    if (!idParam || Number.isNaN(id)) {
      setError('ID de viaje inválido.')
      setLoading(false)
      return
    }
    cargar(id)
  }, [idParam, cargar])

  /* ========================= Totales ========================= */

  const totales = useMemo(() => {
    if (!viaje) {
      return { fuel: 0, salary: 0, otros: 0, total: 0 }
    }
    const fuel =
      Number(viaje.combustible_despachado || 0) *
      Number(viaje.precio_galon || 0)
    const salary =
      Number(viaje.salario_diario || 0) * Number(viaje.dias || 0)
    const otros = gastos.reduce(
      (s, g) => s + Number(g.monto || 0),
      0
    )
    const total = fuel + salary + otros
    return { fuel, salary, otros, total }
  }, [viaje, gastos])

  /* ========================= Generar PDF ========================= */

  const generarPDF = () => {
    if (!viaje) return

    const doc = new jsPDF()

    let y = 15

    // Encabezado
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Reporte de Viaje', 105, y, { align: 'center' })
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const fechaGen = new Date().toLocaleString()
    doc.text(`Generado: ${fechaGen}`, 14, y)
    y += 6

    // Info vehículo
    doc.setFont('helvetica', 'bold')
    doc.text('Vehículo', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')

    const placaAlias = vehiculo
      ? `${vehiculo.placa || ''}${vehiculo.alias ? ' · ' + vehiculo.alias : ''}`
      : viaje.vehiculo_id != null
      ? `ID ${viaje.vehiculo_id}`
      : 'No registrado'

    const lineaVehiculo = [
      `Placa/Alias: ${placaAlias}`,
      vehiculo?.marca ? `Marca: ${vehiculo.marca}` : '',
      vehiculo?.modelo ? `Modelo: ${vehiculo.modelo}` : '',
      vehiculo?.anio ? `Año: ${vehiculo.anio}` : '',
    ]
      .filter(Boolean)
      .join('   |   ')

    doc.text(lineaVehiculo, 14, y)
    y += 6

    // Datos principales del viaje
    doc.setFont('helvetica', 'bold')
    doc.text('Datos del viaje', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')

    const fechaInicio = viaje.fecha_inicio || '—'
    const fechaFin = viaje.fecha_fin || '—'
    const dias = viaje.dias != null ? String(viaje.dias) : '—'
    const conductor = viaje.conductor || '—'

    doc.text(`Conductor: ${conductor}`, 14, y)
    y += 5
    doc.text(`Desde: ${fechaInicio}   Hasta: ${fechaFin}   Días: ${dias}`, 14, y)
    y += 5
    doc.text(`Origen: ${viaje.origen || '—'}`, 14, y)
    y += 5
    doc.text(`Destino: ${viaje.destino || '—'}`, 14, y)
    y += 6

    // Distancia y consumo
    doc.setFont('helvetica', 'bold')
    doc.text('Distancia y consumo', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')

    const km =
      viaje.km_recorridos != null
        ? Number(viaje.km_recorridos).toFixed(2)
        : '—'
    const consumo =
      viaje.consumo_por_galon != null
        ? Number(viaje.consumo_por_galon).toFixed(2)
        : '—'

    doc.text(`Km recorridos: ${km} km`, 14, y)
    y += 5
    doc.text(`Consumo promedio: ${consumo} km/galón`, 14, y)
    y += 6

    // Combustible y salarios
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen de costos principales', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')

    const desp = Number(viaje.combustible_despachado || 0).toFixed(2)
    const precio = Number(viaje.precio_galon || 0).toFixed(2)
    const fuelQ = totales.fuel.toFixed(2)
    const salDia = Number(viaje.salario_diario || 0).toFixed(2)
    const salarioQ = totales.salary.toFixed(2)

    doc.text(`Combustible despachado: ${desp} gal`, 14, y)
    y += 5
    doc.text(`Precio por galón: Q${precio}`, 14, y)
    y += 5
    doc.text(`Costo de combustible: Q${fuelQ}`, 14, y)
    y += 5
    doc.text(`Salario diario: Q${salDia}   Días: ${dias}`, 14, y)
    y += 5
    doc.text(`Total salarios: Q${salarioQ}`, 14, y)
    y += 6

    // Gastos adicionales
    doc.setFont('helvetica', 'bold')
    doc.text('Gastos adicionales', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')

    if (gastos.length === 0) {
      doc.text('Sin gastos adicionales registrados.', 14, y)
      y += 6
    } else {
      doc.text(
        'Fecha         Descripción                                      Monto (Q)',
        14,
        y
      )
      y += 4
      doc.line(14, y, 196, y)
      y += 3

      gastos.forEach((g) => {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        const fecha = g.fecha ? g.fecha.substring(0, 10) : '—'
        const desc = (g.descripcion || '').substring(0, 40)
        const monto = Number(g.monto || 0).toFixed(2)

        doc.text(fecha, 14, y)
        doc.text(desc, 40, y)
        doc.text(`Q${monto}`, 180, y, { align: 'right' })
        y += 5
      })

      y += 3
      const otrosQ = totales.otros.toFixed(2)
      doc.setFont('helvetica', 'bold')
      doc.text(`Subtotal gastos adicionales: Q${otrosQ}`, 14, y)
      y += 6
      doc.setFont('helvetica', 'normal')
    }

    // Observaciones
    if (viaje.observaciones) {
      doc.setFont('helvetica', 'bold')
      doc.text('Observaciones', 14, y)
      y += 5
      doc.setFont('helvetica', 'normal')

      const obsLines = doc.splitTextToSize(viaje.observaciones, 180)
      doc.text(obsLines, 14, y)
      y += obsLines.length * 5 + 4
    }

    // Total general
    const totalQ = totales.total.toFixed(2)
    doc.setFont('helvetica', 'bold')
    doc.text(`TOTAL GENERAL DEL VIAJE: Q${totalQ}`, 14, y)

    const nombre = `reporte_viaje_${viaje.id}.pdf`
    doc.save(nombre)
  }

  /* ========================= UI ========================= */

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <h1 className="text-2xl font-bold">🚚 Reporte de viaje</h1>
        <Link
          href="/vehiculos"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded"
        >
          ⬅ Volver
        </Link>
      </div>

      {loading ? (
        <div>Cargando datos del viaje…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : !viaje ? (
        <div>No se encontró el viaje.</div>
      ) : (
        <>
          <div className="border rounded p-4 mb-4 text-sm space-y-2">
            <div className="font-semibold">Viaje #{viaje.id}</div>
            <div>
              <span className="font-semibold">Vehículo:</span>{' '}
              {vehiculo
                ? `${vehiculo.placa || ''}${
                    vehiculo.alias ? ' · ' + vehiculo.alias : ''
                  }`
                : viaje.vehiculo_id != null
                ? `ID ${viaje.vehiculo_id}`
                : 'No registrado'}
            </div>
            <div>
              <span className="font-semibold">Conductor:</span>{' '}
              {viaje.conductor || '—'}
            </div>
            <div>
              <span className="font-semibold">Desde:</span>{' '}
              {viaje.fecha_inicio || '—'}{' '}
              <span className="font-semibold ml-2">Hasta:</span>{' '}
              {viaje.fecha_fin || '—'}{' '}
              <span className="font-semibold ml-2">Días:</span>{' '}
              {viaje.dias != null ? viaje.dias : '—'}
            </div>
            <div>
              <span className="font-semibold">Origen:</span>{' '}
              {viaje.origen || '—'}{' '}
              <span className="font-semibold ml-2">Destino:</span>{' '}
              {viaje.destino || '—'}
            </div>
            <div>
              <span className="font-semibold">Km recorridos:</span>{' '}
              {viaje.km_recorridos != null ? viaje.km_recorridos : '—'} km{' '}
              <span className="font-semibold ml-2">Consumo:</span>{' '}
              {viaje.consumo_por_galon != null
                ? `${viaje.consumo_por_galon} km/galón`
                : '—'}
            </div>
            <div>
              <span className="font-semibold">Combustible despachado:</span>{' '}
              {viaje.combustible_despachado != null
                ? viaje.combustible_despachado
                : 0}{' '}
              gal · <span className="font-semibold">Precio galón:</span> Q
              {viaje.precio_galon != null ? viaje.precio_galon : 0}
            </div>
            <div>
              <span className="font-semibold">Costo combustible:</span> Q
              {totales.fuel.toFixed(2)}{' '}
              · <span className="font-semibold">Salarios:</span> Q
              {totales.salary.toFixed(2)}{' '}
              · <span className="font-semibold">Otros gastos:</span> Q
              {totales.otros.toFixed(2)}
            </div>
            <div className="font-semibold">
              TOTAL GENERAL: Q{totales.total.toFixed(2)}
            </div>
          </div>

          <button
            onClick={generarPDF}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
          >
            Descargar PDF
          </button>
        </>
      )}
    </div>
  )
}
