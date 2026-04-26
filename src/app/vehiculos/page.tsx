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
  km_recorridos: number | null
  consumo_por_galon: number | null
}

type GastoAdicional = {
  id: number
  viaje_id: number
  fecha: string | null
  descripcion: string | null
  monto: number | null
}

/* ========================= Helpers ========================= */

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round(n * 100) / 100

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

  const [filters, setFilters] = useState({
    vehiculoId: '',
    desde: '',
    hasta: '',
    texto: '',
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
    km_recorridos: '',
    consumo_por_galon: '',
  })

  const [diasManual, setDiasManual] = useState(false)

  const resetForm = () => {
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
      km_recorridos: '',
      consumo_por_galon: '',
    })
    setDiasManual(false)
  }

  /* ========================= Catálogo de vehículos ========================= */

  const cargarVehiculos = useCallback(async () => {
    const { data, error } = await supabase.from('vehiculos').select('id, placa, alias').order('placa', { ascending: true })

    if (error) {
      console.error('Error cargando vehículos', error)
      setVehiculos([])
      return
    }

    setVehiculos((data as VehiculoOption[]) || [])
  }, [])

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
      const { data, error } = await supabase.from('viajes').select('*').order('id', { ascending: false })

      if (error) {
        console.error('Error cargando viajes', error)
        setViajes([])
        return
      }

      setViajes(((data as any[]) || []) as Viaje[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarViajes()
    cargarVehiculos()
  }, [cargarViajes, cargarVehiculos])

  /* ========================= Calcular días automáticamente (pero editable) ========================= */

  useEffect(() => {
    if (diasManual) return

    if (!form.fecha_inicio || !form.fecha_fin) {
      if (form.dias !== '') setForm((prev) => ({ ...prev, dias: '' }))
      return
    }

    const inicio = new Date(form.fecha_inicio)
    const fin = new Date(form.fecha_fin)
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return

    const diffMs = fin.getTime() - inicio.getTime()
    const msPerDay = 1000 * 60 * 60 * 24
    const rawDays = diffMs / msPerDay

    const diasCalc = diffMs >= 0 ? Math.floor(rawDays) + 1 : 0
    setForm((prev) => ({ ...prev, dias: diasCalc ? String(diasCalc) : '' }))
  }, [form.fecha_inicio, form.fecha_fin, diasManual])

  /* ========================= Filtrado UI (lista) ========================= */

  const viajesFiltrados = useMemo(() => {
    return viajes.filter((v) => {
      if (filters.vehiculoId && String(v.vehiculo_id || '') !== filters.vehiculoId) return false

      if (filters.desde) {
        const f = v.fecha_inicio || ''
        if (f && f < filters.desde) return false
      }
      if (filters.hasta) {
        const f = v.fecha_fin || v.fecha_inicio || ''
        if (f && f > filters.hasta) return false
      }

      const t = filters.texto.trim().toLowerCase()
      if (t) {
        const fields = [v.conductor, v.origen, v.destino]
        const match = fields.some((x) => (x || '').toLowerCase().includes(t))
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

  /* ========================= Seleccionar / editar ========================= */

  const seleccionarViaje = async (v: Viaje) => {
    setSelected(v)
    setDiasManual(true) // respetar lo guardado (editable)
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
      km_recorridos: v.km_recorridos != null ? String(v.km_recorridos) : '',
      consumo_por_galon: v.consumo_por_galon != null ? String(v.consumo_por_galon) : '',
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
      km_recorridos: form.km_recorridos ? Number(form.km_recorridos) : null,
      consumo_por_galon: form.consumo_por_galon ? Number(form.consumo_por_galon) : null,
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
      resetForm()
      setSelected(null)
      setGastos([])
    }

    await cargarViajes()
    alert('Viaje eliminado.')
  }

  /* ========================= Gastos adicionales ========================= */

  const agregarGasto = async () => {
    if (!selected) return

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
    const ini = toNum(form.combustible_inicial)
    const desp = toNum(form.combustible_despachado)
    const fin = toNum(form.combustible_final)
    const precio = toNum(form.precio_galon)

    // ✅ NUEVO: (inicial + despachado - final) * precio
    const galConsumidosRaw = ini + desp - fin
    const galConsumidos = galConsumidosRaw < 0 ? 0 : galConsumidosRaw
    const fuel = round2(galConsumidos * precio)

    const salary = round2(toNum(form.salario_diario) * toNum(form.dias))
    const otros = round2(gastos.reduce((s, g) => s + toNum(g.monto), 0))
    const total = round2(fuel + salary + otros)

    // opcional (si querés coherencia con el nuevo consumo)
    const km = toNum(form.km_recorridos)
    const consumoPorGal = galConsumidos > 0 ? round2(km / galConsumidos) : 0

    return { fuel, salary, otros, total, galConsumidos, consumoPorGal }
  }, [
    form.combustible_inicial,
    form.combustible_despachado,
    form.combustible_final,
    form.precio_galon,
    form.salario_diario,
    form.dias,
    form.km_recorridos,
    gastos,
  ])

  /* ========================= UI ========================= */

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <h1 className="text-2xl font-bold">🚚 Vehículos — Viajes</h1>
        <Link href="/menu" className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded">
          ⬅ Volver al Menú
        </Link>
      </div>

      {/* Lista + filtros */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Viajes registrados</h2>
          <button
            onClick={() => {
              setSelected(null)
              resetForm()
              setGastos([])
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded"
          >
            + Nuevo viaje
          </button>
        </div>

        <div className="mb-2 grid md:grid-cols-4 gap-2 text-sm">
          <select className="border p-2 rounded" value={filters.vehiculoId} onChange={(e) => setFilters((f) => ({ ...f, vehiculoId: e.target.value }))}>
            <option value="">Todos los vehículos</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {(v.placa || `ID ${v.id}`) + (v.alias ? ` · ${v.alias}` : '')}
              </option>
            ))}
          </select>

          <input type="date" className="border p-2 rounded" value={filters.desde} onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))} />
          <input type="date" className="border p-2 rounded" value={filters.hasta} onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))} />

          <input
            className="border p-2 rounded"
            placeholder="Buscar (conductor, origen, destino)"
            value={filters.texto}
            onChange={(e) => setFilters((f) => ({ ...f, texto: e.target.value }))}
          />
        </div>

        <div className="border rounded bg-white">
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
                <tr>
                  <td className="p-3" colSpan={8}>
                    Cargando…
                  </td>
                </tr>
              ) : viajesFiltrados.length === 0 ? (
                <tr>
                  <td className="p-3" colSpan={8}>
                    Sin registros.
                  </td>
                </tr>
              ) : (
                viajesFiltrados.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="p-2">{v.id}</td>
                    <td className="p-2">{v.vehiculo_id ? vehiculoMap.get(v.vehiculo_id) || `ID ${v.vehiculo_id}` : '—'}</td>
                    <td className="p-2">{v.conductor || '—'}</td>
                    <td className="p-2">{v.fecha_inicio || '—'}</td>
                    <td className="p-2">{v.fecha_fin || '—'}</td>
                    <td className="p-2">{v.origen || '—'}</td>
                    <td className="p-2">{v.destino || '—'}</td>
                    <td className="p-2 flex gap-2">
                      <button onClick={() => seleccionarViaje(v)} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white">
                        Ver/Editar
                      </button>
                      <Link href={`/vehiculos/reporte?id=${v.id}`} className="px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-800 text-white">
                        Reporte
                      </Link>
                      <button onClick={() => eliminarViaje(v.id)} className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulario + gastos */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">{selected ? `Editar viaje #${selected.id}` : 'Nuevo viaje'}</h2>

          <div className="grid gap-2 text-sm">
            <select className="border p-2 rounded" value={form.vehiculo_id} onChange={(e) => setForm((p) => ({ ...p, vehiculo_id: e.target.value }))}>
              <option value="">— Selecciona vehículo —</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {(v.placa || `ID ${v.id}`) + (v.alias ? ` · ${v.alias}` : '')}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="border p-2 rounded"
                value={form.fecha_inicio}
                onChange={(e) => {
                  setDiasManual(false)
                  setForm((p) => ({ ...p, fecha_inicio: e.target.value }))
                }}
              />
              <input
                type="date"
                className="border p-2 rounded"
                value={form.fecha_fin}
                onChange={(e) => {
                  setDiasManual(false)
                  setForm((p) => ({ ...p, fecha_fin: e.target.value }))
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input className="border p-2 rounded" placeholder="Origen" value={form.origen} onChange={(e) => setForm((p) => ({ ...p, origen: e.target.value }))} />
              <input className="border p-2 rounded" placeholder="Destino" value={form.destino} onChange={(e) => setForm((p) => ({ ...p, destino: e.target.value }))} />
            </div>

            <input className="border p-2 rounded" placeholder="Conductor" value={form.conductor} onChange={(e) => setForm((p) => ({ ...p, conductor: e.target.value }))} />

            <div className="grid grid-cols-2 gap-2">
              <input
                className="border p-2 rounded"
                placeholder="Combustible inicial (gal)"
                value={form.combustible_inicial}
                onChange={(e) => setForm((p) => ({ ...p, combustible_inicial: e.target.value }))}
              />
              <input
                className="border p-2 rounded"
                placeholder="Combustible final (gal)"
                value={form.combustible_final}
                onChange={(e) => setForm((p) => ({ ...p, combustible_final: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                className="border p-2 rounded"
                placeholder="Combustible despachado (gal)"
                value={form.combustible_despachado}
                onChange={(e) => setForm((p) => ({ ...p, combustible_despachado: e.target.value }))}
              />
              <input
                className="border p-2 rounded"
                placeholder="Precio galón (Q)"
                value={form.precio_galon}
                onChange={(e) => setForm((p) => ({ ...p, precio_galon: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                className="border p-2 rounded"
                placeholder="Salario diario (Q)"
                value={form.salario_diario}
                onChange={(e) => setForm((p) => ({ ...p, salario_diario: e.target.value }))}
              />
              {/* ✅ editable, soporta 1.5 */}
              <input
                type="number"
                step="0.5"
                className="border p-2 rounded"
                placeholder="Días"
                value={form.dias}
                onChange={(e) => {
                  setDiasManual(true)
                  setForm((p) => ({ ...p, dias: e.target.value }))
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input className="border p-2 rounded" placeholder="Km recorridos" value={form.km_recorridos} onChange={(e) => setForm((p) => ({ ...p, km_recorridos: e.target.value }))} />
              <input
                className="border p-2 rounded"
                placeholder="Consumo por galón (km/gal)"
                value={form.consumo_por_galon || (totales.consumoPorGal ? String(totales.consumoPorGal) : '')}
                onChange={(e) => setForm((p) => ({ ...p, consumo_por_galon: e.target.value }))}
              />
            </div>

            <textarea className="border p-2 rounded" placeholder="Observaciones" value={form.observaciones} onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))} />

            <div className="flex gap-2">
              <button onClick={guardarViaje} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded">
                Guardar
              </button>
              <button
                onClick={() => {
                  setSelected(null)
                  resetForm()
                  setGastos([])
                }}
                className="bg-gray-200 hover:bg-gray-300 text-black px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>

            <div className="border rounded p-3 bg-white mt-2">
              <div className="font-semibold mb-1">Totales (pre-cálculo)</div>
              <div className="text-sm">Consumo estimado: {totales.galConsumidos.toFixed(2)} gal</div>
              <div className="text-sm">Combustible: Q{totales.fuel.toFixed(2)}</div>
              <div className="text-sm">Salarios: Q{totales.salary.toFixed(2)}</div>
              <div className="text-sm">Otros gastos: Q{totales.otros.toFixed(2)}</div>
              <div className="text-sm font-semibold">Total: Q{totales.total.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="border rounded p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-2">Gastos adicionales</h2>
          {!selected ? (
            <p className="text-sm text-gray-600">Selecciona o guarda un viaje para agregar gastos.</p>
          ) : (
            <>
              <div className="grid gap-2 text-sm mb-3">
                <input type="date" className="border p-2 rounded" value={gastoNuevo.fecha} onChange={(e) => setGastoNuevo((p) => ({ ...p, fecha: e.target.value }))} />
                <input className="border p-2 rounded" placeholder="Descripción" value={gastoNuevo.descripcion} onChange={(e) => setGastoNuevo((p) => ({ ...p, descripcion: e.target.value }))} />
                <input className="border p-2 rounded" placeholder="Monto (Q)" value={gastoNuevo.monto} onChange={(e) => setGastoNuevo((p) => ({ ...p, monto: e.target.value }))} />
                <button onClick={agregarGasto} className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded">
                  Agregar gasto
                </button>
              </div>

              <div className="border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-left">Descripción</th>
                      <th className="p-2 text-right">Monto</th>
                      <th className="p-2 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.length === 0 ? (
                      <tr>
                        <td className="p-3" colSpan={4}>
                          Sin gastos.
                        </td>
                      </tr>
                    ) : (
                      gastos.map((g) => (
                        <tr key={g.id} className="border-t">
                          <td className="p-2">{g.fecha || '—'}</td>
                          <td className="p-2">{g.descripcion || '—'}</td>
                          <td className="p-2 text-right">Q{toNum(g.monto).toFixed(2)}</td>
                          <td className="p-2">
                            <button onClick={() => eliminarGasto(g.id)} className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white">
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
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
