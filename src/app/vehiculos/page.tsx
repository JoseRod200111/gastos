'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

/* ========================= Tipos ========================= */

type VehiculoOption = {
  id: number
  placa: string | null
  alias: string | null
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
}

type GastoAdicional = {
  id: number
  viaje_id: number
  fecha: string | null
  descripcion: string | null
  monto: number | null
}

/* ========================= Página ========================= */

export default function VehiculosPage() {
  const [viajes, setViajes] = useState<Viaje[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Viaje | null>(null)

  const [vehiculos, setVehiculos] = useState<VehiculoOption[]>([])

  const [gastos, setGastos] = useState<GastoAdicional[]>([])
  const [gastoNuevo, setGastoNuevo] = useState<{ fecha: string; descripcion: string; monto: string }>({
    fecha: '',
    descripcion: '',
    monto: '',
  })

  const [form, setForm] = useState({
    id: 0,
    vehiculo_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    origen: '',
    destino: '',
    conductor: '',
    combustible_inicial: '',
    combustible_final: '',
    combustible_despachado: '',
    precio_galon: '',
    salario_diario: '',
    dias: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      id: 0,
      vehiculo_id: '',
      fecha_inicio: '',
      fecha_fin: '',
      origen: '',
      destino: '',
      conductor: '',
      combustible_inicial: '',
      combustible_final: '',
      combustible_despachado: '',
      precio_galon: '',
      salario_diario: '',
      dias: '',
      observaciones: '',
    })

  /* ========================= Catálogo de vehículos ========================= */

  const Vehiculos = useCallback(async () => {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa, alias')
      .order('placa', { ascending: true })

    if (error) {
      console.error('Error cargando vehículos', error)
      setVehiculos([])
      return
    }

    setVehiculos((data as VehiculoOption[]) || [])
  }, [])

  // Mapa id -> etiqueta para mostrar placa/alias sin hacer join en viajes
  const vehiculoMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const v of vehiculos) {
      const etiqueta = (v.placa || `ID ${v.id}`) + (v.alias ? ` · ${v.alias}` : '')
      map.set(v.id, etiqueta)
    }
    return map
  }, [vehiculos])

  /* ========================= Carga de viajes ========================= */

 const cargarViajes = useCallback(async () => {
  setLoading(true)
  try {
    const { data, error } = await supabase
      .from('viajes')
      .select('*') // nada de columnas específicas ni order para descartar causas
    // .order('id', { ascending: false }) // lo podemos volver a activar después

    if (error) {
      console.error('Error cargando viajes', error)

      // Mostrar mensaje completo para que lo puedas leer:
      alert(
        'Error cargando viajes:\n' +
        (error.message || '') +
        (error.details ? '\nDetalles: ' + error.details : '') +
        (error.hint ? '\nHint: ' + error.hint : '')
      )

      setViajes([])
      return
    }

    setViajes(((data as any[]) || []) as Viaje[])
  } finally {
    setLoading(false)
  }
}, [])


  /* ========================= Calcular días automáticamente ========================= */

  useEffect(() => {
    if (!form.fecha_inicio || !form.fecha_fin) {
      if (form.dias !== '') {
        setForm((prev) => ({ ...prev, dias: '' }))
      }
      return
    }

    const inicio = new Date(form.fecha_inicio)
    const fin = new Date(form.fecha_fin)
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return

    const diffMs = fin.getTime() - inicio.getTime()
    const msPerDay = 1000 * 60 * 60 * 24
    const rawDays = diffMs / msPerDay

    const diasCalc = diffMs >= 0 ? Math.floor(rawDays) + 1 : 0
    const diasStr = diasCalc > 0 ? String(diasCalc) : ''

    if (form.dias !== diasStr) {
      setForm((prev) => ({ ...prev, dias: diasStr }))
    }
  }, [form.fecha_inicio, form.fecha_fin, form.dias])

  /* ========================= Filtros de la tabla ========================= */

  const [filters, setFilters] = useState({
    vehiculoId: '',
    desde: '',
    hasta: '',
    texto: '',
  })

  const viajesFiltrados = useMemo(() => {
    return viajes.filter((v) => {
      if (filters.vehiculoId && String(v.vehiculo_id ?? '') !== filters.vehiculoId) {
        return false
      }

      if (filters.desde && v.fecha_inicio && v.fecha_inicio < filters.desde) {
        return false
      }
      if (filters.hasta && v.fecha_inicio && v.fecha_inicio > filters.hasta) {
        return false
      }

      const t = filters.texto.trim().toLowerCase()
      if (t) {
        const fields = [v.conductor, v.origen, v.destino]
        const match = fields.some((f) => (f || '').toLowerCase().includes(t))
        if (!match) return false
      }

      return true
    })
  }, [viajes, filters])

  /* ========================= Gastos ========================= */

  const cargarGastos = useCallback(async (viajeId: number) => {
    const { data, error } = await supabase
      .from('viaje_gastos')
      .select('id, viaje_id, fecha, descripcion, monto')
      .eq('viaje_id', viajeId)
      .order('fecha', { ascending: true })

    if (error) {
      console.error('Error cargando gastos', error)
      setGastos([])
      return
    }
    setGastos((data as GastoAdicional[]) ?? [])
  }, [])

  /* ========================= Seleccionar / editar viaje ========================= */

  const seleccionarViaje = async (v: Viaje) => {
    setSelected(v)
    setForm({
      id: v.id,
      vehiculo_id: v.vehiculo_id ? String(v.vehiculo_id) : '',
      fecha_inicio: v.fecha_inicio ?? '',
      fecha_fin: v.fecha_fin ?? '',
      origen: v.origen ?? '',
      destino: v.destino ?? '',
      conductor: v.conductor ?? '',
      combustible_inicial: v.combustible_inicial != null ? String(v.combustible_inicial) : '',
      combustible_final: v.combustible_final != null ? String(v.combustible_final) : '',
      combustible_despachado: v.combustible_despachado != null ? String(v.combustible_despachado) : '',
      precio_galon: v.precio_galon != null ? String(v.precio_galon) : '',
      salario_diario: v.salario_diario != null ? String(v.salario_diario) : '',
      dias: v.dias != null ? String(v.dias) : '',
      observaciones: v.observaciones ?? '',
    })
    await cargarGastos(v.id)
  }

  /* ========================= Guardar viaje ========================= */

  const guardarViaje = async () => {
    const payload = {
      vehiculo_id: form.vehiculo_id ? Number(form.vehiculo_id) : null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      origen: form.origen || null,
      destino: form.destino || null,
      conductor: form.conductor || null,
      combustible_inicial: form.combustible_inicial ? Number(form.combustible_inicial) : null,
      combustible_final: form.combustible_final ? Number(form.combustible_final) : null,
      combustible_despachado: form.combustible_despachado ? Number(form.combustible_despachado) : null,
      precio_galon: form.precio_galon ? Number(form.precio_galon) : null,
      salario_diario: form.salario_diario ? Number(form.salario_diario) : null,
      dias: form.dias ? Number(form.dias) : null,
      observaciones: form.observaciones || null,
    }

    if (form.id) {
      const { error } = await supabase.from('viajes').update(payload).eq('id', form.id)
      if (error) {
        alert('No se pudo actualizar el viaje.')
        console.error(error)
        return
      }
      alert('Viaje actualizado.')
    } else {
      const { error } = await supabase.from('viajes').insert(payload)
      if (error) {
        alert('No se pudo crear el viaje.')
        console.error(error)
        return
      }
      alert('Viaje creado.')
    }

    resetForm()
    setSelected(null)
    setGastos([])
    await cargarViajes()
  }

  const eliminarViaje = async (id: number) => {
    if (!confirm('¿Eliminar este viaje y sus gastos?')) return

    const { error: gErr } = await supabase.from('viaje_gastos').delete().eq('viaje_id', id)
    if (gErr) {
      alert('No se pudieron borrar los gastos del viaje.')
      console.error(gErr)
      return
    }

    const { error } = await supabase.from('viajes').delete().eq('id', id)
    if (error) {
      alert('No se pudo eliminar el viaje.')
      console.error(error)
      return
    }

    if (selected?.id === id) {
      setSelected(null)
      resetForm()
      setGastos([])
    }

    await cargarViajes()
  }

  /* ========================= Gastos adicionales ========================= */

  const agregarGasto = async () => {
    if (!selected) {
      alert('Primero selecciona/crea un viaje.')
      return
    }
    const payload = {
      viaje_id: selected.id,
      fecha: gastoNuevo.fecha || null,
      descripcion: gastoNuevo.descripcion || null,
      monto: gastoNuevo.monto ? Number(gastoNuevo.monto) : null,
    }
    const { error } = await supabase.from('viaje_gastos').insert(payload)
    if (error) {
      alert('No se pudo agregar el gasto.')
      console.error(error)
      return
    }
    setGastoNuevo({ fecha: '', descripcion: '', monto: '' })
    await cargarGastos(selected.id)
  }

  const eliminarGasto = async (id: number) => {
    if (!selected) return
    const { error } = await supabase.from('viaje_gastos').delete().eq('id', id)
    if (error) {
      alert('No se pudo eliminar el gasto.')
      console.error(error)
      return
    }
    await cargarGastos(selected.id)
  }

  /* ========================= Totales (preview) ========================= */

  const totales = useMemo(() => {
    const fuel = (Number(form.combustible_despachado || 0) * Number(form.precio_galon || 0)) || 0
    const salary = (Number(form.salario_diario || 0) * Number(form.dias || 0)) || 0
    const otros = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)
    const total = fuel + salary + otros
    return { fuel, salary, otros, total }
  }, [form.combustible_despachado, form.precio_galon, form.salario_diario, form.dias, gastos])

  /* ========================= UI ========================= */

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <h1 className="text-2xl font-bold">🚚 Vehículos — Viajes</h1>
        <Link
          href="/menu"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded"
        >
          ⬅ Volver al Menú
        </Link>
      </div>

      {/* Lista + filtros */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Viajes registrados</h2>
          <button
            onClick={() => { setSelected(null); resetForm(); setGastos([]) }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded"
          >
            + Nuevo viaje
          </button>
        </div>

        {/* Filtros */}
        <div className="mb-2 grid md:grid-cols-4 gap-2 text-sm">
          <select
            className="border p-2 rounded"
            value={filters.vehiculoId}
            onChange={(e) => setFilters((f) => ({ ...f, vehiculoId: e.target.value }))}
          >
            <option value="">Todos los vehículos</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {(v.placa || `ID ${v.id}`) + (v.alias ? ` · ${v.alias}` : '')}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="border p-2 rounded"
            value={filters.desde}
            onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))}
          />
          <input
            type="date"
            className="border p-2 rounded"
            value={filters.hasta}
            onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Buscar (conductor, origen, destino)"
            value={filters.texto}
            onChange={(e) => setFilters((f) => ({ ...f, texto: e.target.value }))}
          />
        </div>

        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Vehículo</th>
                <th className="p-2 text-left">Conductor</th>
                <th className="p-2 text-left">Desde</th>
                <th className="p-2 text-left">Hasta</th>
                <th className="p-2 text-left">Origen</th>
                <th className="p-2 text-left">Destino</th>
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-3" colSpan={8}>Cargando…</td></tr>
              ) : viajesFiltrados.length === 0 ? (
                <tr><td className="p-3" colSpan={8}>Sin registros.</td></tr>
              ) : viajesFiltrados.map(v => (
                <tr key={v.id} className="border-t">
                  <td className="p-2">{v.id}</td>
                  <td className="p-2">
                    {v.vehiculo_id != null
                      ? (vehiculoMap.get(v.vehiculo_id) || `ID ${v.vehiculo_id}`)
                      : '—'}
                  </td>
                  <td className="p-2">{v.conductor || '—'}</td>
                  <td className="p-2">{v.fecha_inicio || '—'}</td>
                  <td className="p-2">{v.fecha_fin || '—'}</td>
                  <td className="p-2">{v.origen || '—'}</td>
                  <td className="p-2">{v.destino || '—'}</td>
                  <td className="p-2 space-x-2">
                    <button
                      onClick={() => seleccionarViaje(v)}
                      className="px-2 py-1 text-xs rounded bg-sky-600 text-white"
                    >
                      Editar
                    </button>
                    <Link
                      href={`/vehiculos/reporte?id=${v.id}`}
                      className="px-2 py-1 text-xs rounded bg-amber-600 text-white"
                    >
                      Reporte
                    </Link>
                    <button
                      onClick={() => eliminarViaje(v.id)}
                      className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form + gastos */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Formulario */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3">
            {form.id ? `Editar viaje #${form.id}` : 'Nuevo viaje'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {/* Select de vehículo */}
            <select
              className="border p-2 rounded col-span-2"
              value={form.vehiculo_id}
              onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}
            >
              <option value="">Seleccione un vehículo</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {(v.placa || `ID ${v.id}`) + (v.alias ? ` · ${v.alias}` : '')}
                </option>
              ))}
            </select>

            <input
              type="date"
              className="border p-2 rounded"
              value={form.fecha_inicio}
              onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
            />
            <input
              type="date"
              className="border p-2 rounded"
              value={form.fecha_fin}
              onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
            />
            <input
              className="border p-2 rounded"
              placeholder="Origen"
              value={form.origen}
              onChange={(e) => setForm({ ...form, origen: e.target.value })}
            />
            <input
              className="border p-2 rounded"
              placeholder="Destino"
              value={form.destino}
              onChange={(e) => setForm({ ...form, destino: e.target.value })}
            />
            <input
              className="border p-2 rounded col-span-2"
              placeholder="Conductor"
              value={form.conductor}
              onChange={(e) => setForm({ ...form, conductor: e.target.value })}
            />

            <input
              type="number"
              className="border p-2 rounded"
              placeholder="Combustible inicial (gal)"
              value={form.combustible_inicial}
              onChange={(e) => setForm({ ...form, combustible_inicial: e.target.value })}
            />
            <input
              type="number"
              className="border p-2 rounded"
              placeholder="Combustible final (gal)"
              value={form.combustible_final}
              onChange={(e) => setForm({ ...form, combustible_final: e.target.value })}
            />
            <input
              type="number"
              className="border p-2 rounded"
              placeholder="Despachado (gal)"
              value={form.combustible_despachado}
              onChange={(e) => setForm({ ...form, combustible_despachado: e.target.value })}
            />
            <input
              type="number"
              className="border p-2 rounded"
              placeholder="Precio por galón"
              value={form.precio_galon}
              onChange={(e) => setForm({ ...form, precio_galon: e.target.value })}
            />
            <input
              type="number"
              className="border p-2 rounded"
              placeholder="Salario diario"
              value={form.salario_diario}
              onChange={(e) => setForm({ ...form, salario_diario: e.target.value })}
            />
            <input
              type="number"
              className="border p-2 rounded"
              placeholder="Días (calculado)"
              value={form.dias}
              readOnly
            />

            <textarea
              className="border p-2 rounded col-span-2"
              placeholder="Observaciones"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={guardarViaje}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
            >
              {form.id ? 'Actualizar' : 'Guardar'}
            </button>
            <button
              onClick={() => { resetForm(); setSelected(null); setGastos([]) }}
              className="bg-gray-200 px-4 py-2 rounded"
            >
              Cancelar
            </button>
            {form.id ? (
              <Link
                href={`/vehiculos/reporte?id=${form.id}`}
                className="ml-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
              >
                Ver Reporte
              </Link>
            ) : null}
          </div>

          <div className="mt-4 text-sm bg-gray-50 border rounded p-3">
            <div className="font-semibold mb-1">Totales (pré-cálculo)</div>
            <div>Combustible: Q{totales.fuel.toFixed(2)}</div>
            <div>Salarios: Q{totales.salary.toFixed(2)}</div>
            <div>Otros gastos: Q{totales.otros.toFixed(2)}</div>
            <div className="font-semibold">Total: Q{totales.total.toFixed(2)}</div>
          </div>
        </div>

        {/* Gastos */}
        <div className="border rounded p-4">
          <div className="flex items-center justify_between mb-3">
            <h3 className="font-semibold">Gastos adicionales</h3>
            {selected ? (
              <div className="text-xs text-gray-600">Viaje seleccionado: #{selected.id}</div>
            ) : null}
          </div>

          {!selected ? (
            <div className="text-sm text-gray-600">
              Selecciona o guarda un viaje para agregar gastos.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2 mb-3">
                <input
                  type="date"
                  className="border p-2 rounded"
                  value={gastoNuevo.fecha}
                  onChange={(e) => setGastoNuevo({ ...gastoNuevo, fecha: e.target.value })}
                />
                <input
                  className="border p-2 rounded col-span-3"
                  placeholder="Descripción"
                  value={gastoNuevo.descripcion}
                  onChange={(e) => setGastoNuevo({ ...gastoNuevo, descripcion: e.target.value })}
                />
                <input
                  type="number"
                  className="border p-2 rounded"
                  placeholder="Monto"
                  value={gastoNuevo.monto}
                  onChange={(e) => setGastoNuevo({ ...gastoNuevo, monto: e.target.value })}
                />
              </div>
              <button
                onClick={agregarGasto}
                className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 rounded mb-3"
              >
                + Agregar gasto
              </button>

              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-left">Descripción</th>
                      <th className="p-2 text-right">Monto</th>
                      <th className="p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.length === 0 ? (
                      <tr><td className="p-3" colSpan={4}>Sin gastos.</td></tr>
                    ) : gastos.map(g => (
                      <tr key={g.id} className="border-t">
                        <td className="p-2">{g.fecha || '—'}</td>
                        <td className="p-2">{g.descripcion || '—'}</td>
                        <td className="p-2 text-right">
                          Q{Number(g.monto || 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => eliminarGasto(g.id)}
                            className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

