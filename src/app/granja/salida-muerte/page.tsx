'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
  fecha: string
  tipo_origen: string
}

type Baja = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  cantidad: number
  hembras: number | null
  machos: number | null
  motivo: string | null
  foto_url: string | null
}

export default function GranjaSalidaMuertePage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [bajasRecientes, setBajasRecientes] = useState<Baja[]>([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [form, setForm] = useState({
    fecha: '',
    ubicacion_id: '',
    lote_id: '',
    cantidad: '',
    hembras: '',
    machos: '',
    motivo: '',
    foto_url: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      fecha: '',
      ubicacion_id: '',
      lote_id: '',
      cantidad: '',
      hembras: '',
      machos: '',
      motivo: '',
      foto_url: '',
      observaciones: '',
    })

  const findUbicacion = (id: number) =>
    ubicaciones.find((u) => u.id === id)

  const findLote = (id: number | null) =>
    lotes.find((l) => l.id === id)

  // --------- carga de datos ---------
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: ubicData, error: ubicError },
        { data: loteData, error: loteError },
        { data: bajasData, error: bajasError },
      ] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .order('fecha', { ascending: false })
          .limit(100),
        supabase
          .from('granja_bajas_muerte')
          .select(
            'id, fecha, ubicacion_id, lote_id, cantidad, hembras, machos, motivo, foto_url'
          )
          .order('fecha', { ascending: false })
          .limit(20),
      ])

      if (ubicError) console.error('Error cargando ubicaciones', ubicError)
      if (loteError) console.error('Error cargando lotes', loteError)
      if (bajasError) console.error('Error cargando bajas', bajasError)

      if (ubicData) setUbicaciones(ubicData as Ubicacion[])
      if (loteData) setLotes(loteData as Lote[])
      if (bajasData) setBajasRecientes(bajasData as Baja[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // --------- guardar baja por muerte ---------
  const guardarBaja = async () => {
    if (!form.fecha || !form.ubicacion_id || !form.cantidad) {
      alert('Fecha, ubicación y cantidad son obligatorios.')
      return
    }

    const cantidad = Number(form.cantidad)
    const hembrasNum = form.hembras ? Number(form.hembras) : null
    const machosNum = form.machos ? Number(form.machos) : null

    if (Number.isNaN(cantidad) || cantidad <= 0) {
      alert('La cantidad debe ser un número mayor que cero.')
      return
    }

    setGuardando(true)
    try {
      // 1) insertar baja
      const { data: bajaInsertada, error: bajaErr } = await supabase
        .from('granja_bajas_muerte')
        .insert({
          fecha: form.fecha,
          ubicacion_id: Number(form.ubicacion_id),
          lote_id: form.lote_id ? Number(form.lote_id) : null,
          cantidad,
          hembras: hembrasNum,
          machos: machosNum,
          motivo: form.motivo || null,
          foto_url: form.foto_url || null,
          observaciones: form.observaciones || null,
          // reportado_por se deja nulo por ahora (sin login de empleados)
        })
        .select('id')
        .single()

      if (bajaErr || !bajaInsertada) {
        console.error('Error guardando baja', bajaErr)
        alert('No se pudo guardar la baja por muerte.')
        return
      }

      // 2) movimiento en inventario (salida por muerte)
      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .insert({
          ubicacion_id: Number(form.ubicacion_id),
          tipo: 'SALIDA_MUERTE',
          lote_id: form.lote_id ? Number(form.lote_id) : null,
          cantidad: -cantidad, // negativo para debitar
          hembras: hembrasNum,
          machos: machosNum,
          referencia_tabla: 'granja_bajas_muerte',
          referencia_id: bajaInsertada.id,
          observaciones: 'Salida de cerdos por muerte',
        })

      if (movErr) {
        console.error('Error registrando movimiento', movErr)
        alert(
          'Baja guardada, pero hubo un problema al registrar el movimiento de inventario.'
        )
      } else {
        alert('Baja por muerte registrada correctamente.')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // --------- UI ---------
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* encabezado */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Salida por muerte</h1>
          <p className="text-xs text-gray-600">
            Registrar bajas por muerte y debitar el inventario por ubicación.
          </p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* -------- formulario -------- */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nueva baja por muerte</h2>

          {loading && (
            <p className="text-xs text-gray-500 mb-2">
              Cargando catálogos…
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Fecha
              </label>
              <input
                type="date"
                className="border rounded w-full p-2 text-sm"
                value={form.fecha}
                onChange={(e) =>
                  setForm({ ...form, fecha: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Ubicación (tramo o jaula)
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.ubicacion_id}
                onChange={(e) =>
                  setForm({ ...form, ubicacion_id: e.target.value })
                }
              >
                <option value="">Seleccione una ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Lote (opcional)
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.lote_id}
                onChange={(e) =>
                  setForm({ ...form, lote_id: e.target.value })
                }
              >
                <option value="">Sin lote específico</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} ({l.fecha})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Cantidad de cerdos
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.cantidad}
                onChange={(e) =>
                  setForm({ ...form, cantidad: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Hembras (opcional)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.hembras}
                onChange={(e) =>
                  setForm({ ...form, hembras: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Machos (opcional)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.machos}
                onChange={(e) =>
                  setForm({ ...form, machos: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Motivo
              </label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Ejemplo: aplastado, enfermedad, accidente"
                value={form.motivo}
                onChange={(e) =>
                  setForm({ ...form, motivo: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                URL de foto (opcional)
              </label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Pegue aquí la URL de la foto si existe"
                value={form.foto_url}
                onChange={(e) =>
                  setForm({ ...form, foto_url: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Observaciones
              </label>
              <textarea
                className="border rounded w-full p-2 text-sm"
                rows={3}
                value={form.observaciones}
                onChange={(e) =>
                  setForm({
                    ...form,
                    observaciones: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarBaja}
              disabled={guardando}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {guardando ? 'Guardando…' : 'Guardar baja'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 px-4 py-2 rounded text-sm"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* -------- bajas recientes -------- */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Bajas recientes</h2>
          {bajasRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aún no hay bajas registradas.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Ubicación</th>
                    <th className="p-2 text-left">Lote</th>
                    <th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">Hembras</th>
                    <th className="p-2 text-right">Machos</th>
                    <th className="p-2 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {bajasRecientes.map((b) => {
                    const u = findUbicacion(b.ubicacion_id)
                    const l = findLote(b.lote_id)
                    return (
                      <tr key={b.id} className="border-t">
                        <td className="p-2">{b.fecha}</td>
                        <td className="p-2">
                          {u
                            ? `${u.codigo}${
                                u.nombre ? ` — ${u.nombre}` : ''
                              }`
                            : b.ubicacion_id}
                        </td>
                        <td className="p-2">
                          {l ? l.codigo : '—'}
                        </td>
                        <td className="p-2 text-right">
                          {b.cantidad}
                        </td>
                        <td className="p-2 text-right">
                          {b.hembras != null ? b.hembras : '—'}
                        </td>
                        <td className="p-2 text-right">
                          {b.machos != null ? b.machos : '—'}
                        </td>
                        <td className="p-2">
                          {b.motivo || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
