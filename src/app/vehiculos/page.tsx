'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Vehiculo = {
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

type ViajeGasto = {
  id: number
  viaje_id: number
  fecha: string | null
  descripcion: string | null
  monto: number | null
}

export default function VehiculosPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [viajes, setViajes] = useState<Viaje[]>([])
  const [viajeSel, setViajeSel] = useState<number | null>(null)
  const [gastos, setGastos] = useState<ViajeGasto[]>([])

  const [fVehiculo, setFVehiculo] = useState<string>('')
  const [fDesde, setFDesde] = useState<string>('')
  const [fHasta, setFHasta] = useState<string>('')
  const [fBuscar, setFBuscar] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [guardandoViaje, setGuardandoViaje] = useState(false)
  const [guardandoGasto, setGuardandoGasto] = useState(false)

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

  // Si el usuario edita manualmente "días" (ej. 1.5), no lo sobreescribimos con el cálculo automático
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

  const cargarVehiculos = useCallback(async () => {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa, alias')
      .order('placa', { ascending: true })

    if (!error) setVehiculos((data as Vehiculo[]) || [])
  }, [])

  const cargarViajes = useCallback(async () => {
    setLoading(true)

    let q = supabase
      .from('viajes')
      .select('*')
      .order('id', { ascending: false })

    if (fVehiculo) q = q.eq('vehiculo_id', Number(fVehiculo))

    if (fDesde) q = q.gte('fecha_inicio', fDesde)
    if (fHasta) q = q.lte('fecha_fin', fHasta)

    if (fBuscar.trim()) {
      const b = fBuscar.trim()
      q = q.or(`conductor.ilike.%${b}%,origen.ilike.%${b}%,destino.ilike.%${b}%`)
    }

    const { data, error } = await q
    if (!error) setViajes((data as Viaje[]) || [])

    setLoading(false)
  }, [fVehiculo, fDesde, fHasta, fBuscar])

  const cargarGastos = useCallback(async (viajeId: number) => {
    const { data, error } = await supabase
      .from('viaje_gastos')
      .select('id, viaje_id, fecha, descripcion, monto')
      .eq('viaje_id', viajeId)
      .order('fecha', { ascending: true })

    if (!error) setGastos((data as ViajeGasto[]) || [])
    else setGastos([])
  }, [])

  useEffect(() => {
    cargarVehiculos()
    cargarViajes()
  }, [cargarVehiculos, cargarViajes])

  // Auto-cálculo de días (solo si NO está en modo manual)
  useEffect(() => {
    // Si el usuario eligió editar manualmente los días, no lo recalculamos automáticamente.
    if (diasManual) return

    if (!form.fecha_inicio || !form.fecha_fin) {
      if (form.dias !== '') setForm((prev) => ({ ...prev, dias: '' }))
      return
    }

    const ini = new Date(form.fecha_inicio + 'T00:00:00')
    const fin = new Date(form.fecha_fin + 'T00:00:00')

    if (isNaN(ini.getTime()) || isNaN(fin.getTime())) return
    if (fin < ini) return

    const dias = Math.max(1, Math.round((fin.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    setForm((prev) => ({ ...prev, dias: String(dias) }))
  }, [form.fecha_inicio, form.fecha_fin, diasManual])

  const totales = useMemo(() => {
    // Nuevo cálculo: (inicial + despachado - final) * precio_galon
    const consumoGalRaw =
      Number(form.combustible_inicial || 0) +
      Number(form.combustible_despachado || 0) -
      Number(form.combustible_final || 0)
    const consumoGal = Math.max(0, consumoGalRaw)

    const fuel = (consumoGal * Number(form.precio_galon || 0)) || 0
    const salary = (Number(form.salario_diario || 0) * Number(form.dias || 0)) || 0
    const otros = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)
    const total = fuel + salary + otros
    return { consumoGal, fuel, salary, otros, total }
  }, [
    form.combustible_inicial,
    form.combustible_despachado,
    form.combustible_final,
    form.precio_galon,
    form.salario_diario,
    form.dias,
    gastos,
  ])

  const seleccionarViaje = async (v: Viaje) => {
    setViajeSel(v.id)
    setForm({
      id: v.id,
      vehiculo_id: v.vehiculo_id != null ? String(v.vehiculo_id) : '',
      fecha_inicio: v.fecha_inicio || '',
      fecha_fin: v.fecha_fin || '',
      origen: v.origen || '',
      destino: v.destino || '',
      conductor: v.conductor || '',
      combustible_inicial: v.combustible_inicial != null ? String(v.combustible_inicial) : '',
      combustible_final: v.combustible_final != null ? String(v.combustible_final) : '',
      combustible_despachado: v.combustible_despachado != null ? String(v.combustible_despachado) : '',
      precio_galon: v.precio_galon != null ? String(v.precio_galon) : '',
      salario_diario: v.salario_diario != null ? String(v.salario_diario) : '',
      dias: v.dias != null ? String(v.dias) : '',
      observaciones: v.observaciones || '',
      km_recorridos: v.km_recorridos != null ? String(v.km_recorridos) : '',
      consumo_por_galon: v.consumo_por_galon != null ? String(v.consumo_por_galon) : '',
    })

    // Si viene de DB, lo dejamos como manual (porque puede ser decimal)
    setDiasManual(true)

    await cargarGastos(v.id)
  }

  const guardarViaje = async () => {
    try {
      setGuardandoViaje(true)

      const payload = {
        vehiculo_id: form.vehiculo_id ? Number(form.vehiculo_id) : null,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
        origen: form.origen || null,
        destino: form.destino || null,
        conductor: form.conductor || null,
        combustible_inicial: form.combustible_inicial !== '' ? Number(form.combustible_inicial) : null,
        combustible_final: form.combustible_final !== '' ? Number(form.combustible_final) : null,
        combustible_despachado: form.combustible_despachado !== '' ? Number(form.combustible_despachado) : null,
        precio_galon: form.precio_galon !== '' ? Number(form.precio_galon) : null,
        salario_diario: form.salario_diario !== '' ? Number(form.salario_diario) : null,
        dias: form.dias !== '' ? Number(form.dias) : null,
        observaciones: form.observaciones || null,
        km_recorridos: form.km_recorridos !== '' ? Number(form.km_recorridos) : null,
        consumo_por_galon: form.consumo_por_galon !== '' ? Number(form.consumo_por_galon) : null,
      }

      if (form.id && form.id !== 0) {
        const { error } = await supabase.from('viajes').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('viajes').insert(payload).select('id').maybeSingle()
        if (error) throw error
        if (data?.id) setViajeSel(data.id)
      }

      alert('Viaje guardado.')
      resetForm()
      setViajeSel(null)
      setGastos([])
      await cargarViajes()
    } catch (e) {
      console.error(e)
      alert('No se pudo guardar el viaje.')
    } finally {
      setGuardandoViaje(false)
    }
  }

  const eliminarViaje = async (id: number) => {
    if (!confirm('¿Eliminar viaje? También se eliminarán sus gastos adicionales.')) return
    try {
      const { error: gErr } = await supabase.from('viaje_gastos').delete().eq('viaje_id', id)
      if (gErr) throw gErr

      const { error } = await supabase.from('viajes').delete().eq('id', id)
      if (error) throw error

      alert('Viaje eliminado.')
      if (viajeSel === id) {
        resetForm()
        setViajeSel(null)
        setGastos([])
      }
      await cargarViajes()
    } catch (e) {
      console.error(e)
      alert('No se pudo eliminar.')
    }
  }

  const irReporte = (id: number) => {
    window.location.href = `/vehiculos/reporte?id=${id}`
  }

  const [gastoForm, setGastoForm] = useState({
    fecha: '',
    descripcion: '',
    monto: '',
  })

  const guardarGasto = async () => {
    if (!viajeSel) return
    try {
      setGuardandoGasto(true)
      const payload = {
        viaje_id: viajeSel,
        fecha: gastoForm.fecha || null,
        descripcion: gastoForm.descripcion || null,
        monto: gastoForm.monto !== '' ? Number(gastoForm.monto) : null,
      }
      const { error } = await supabase.from('viaje_gastos').insert(payload)
      if (error) throw error

      setGastoForm({ fecha: '', descripcion: '', monto: '' })
      await cargarGastos(viajeSel)
    } catch (e) {
      console.error(e)
      alert('No se pudo guardar gasto.')
    } finally {
      setGuardandoGasto(false)
    }
  }

  const eliminarGasto = async (id: number) => {
    if (!confirm('¿Eliminar gasto?')) return
    try {
      const { error } = await supabase.from('viaje_gastos').delete().eq('id', id)
      if (error) throw error
      if (viajeSel) await cargarGastos(viajeSel)
    } catch (e) {
      console.error(e)
      alert('No se pudo eliminar gasto.')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <h1 className="text-2xl font-bold">🚚 Vehículos — Viajes</h1>

        <Link
          href="/menu"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded"
        >
          ⬅ Volver al Menú
        </Link>
      </div>

      {/* Filtros */}
      <div className="border rounded p-4 mb-4 bg-white shadow-sm">
        <div className="font-semibold mb-2">Viajes registrados</div>

        <div className="grid gap-2 md:grid-cols-4">
          <select
            className="border p-2 rounded"
            value={fVehiculo}
            onChange={(e) => setFVehiculo(e.target.value)}
          >
            <option value="">Todos los vehículos</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa || '—'}
                {v.alias ? ` · ${v.alias}` : ''}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="border p-2 rounded"
            value={fDesde}
            onChange={(e) => setFDesde(e.target.value)}
            placeholder="Desde"
          />

          <input
            type="date"
            className="border p-2 rounded"
            value={fHasta}
            onChange={(e) => setFHasta(e.target.value)}
            placeholder="Hasta"
          />

          <input
            className="border p-2 rounded"
            value={fBuscar}
            onChange={(e) => setFBuscar(e.target.value)}
            placeholder="Buscar (conductor, origen, destino)"
          />
        </div>

        <div className="flex gap-2 mt-3">
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            onClick={cargarViajes}
            disabled={loading}
          >
            Buscar
          </button>

          <button
            className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded"
            onClick={() => {
              setFVehiculo('')
              setFDesde('')
              setFHasta('')
              setFBuscar('')
              setTimeout(cargarViajes, 0)
            }}
            disabled={loading}
          >
            Limpiar
          </button>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">ID</th>
                <th className="border p-2">Vehículo</th>
                <th className="border p-2">Conductor</th>
                <th className="border p-2">Desde</th>
                <th className="border p-2">Hasta</th>
                <th className="border p-2">Origen</th>
                <th className="border p-2">Destino</th>
                <th className="border p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {viajes.length === 0 ? (
                <tr>
                  <td className="border p-2 text-center" colSpan={8}>
                    {loading ? 'Cargando…' : 'Sin registros.'}
                  </td>
                </tr>
              ) : (
                viajes.map((v) => {
                  const veh = vehiculos.find((x) => x.id === v.vehiculo_id)
                  return (
                    <tr key={v.id}>
                      <td className="border p-2">{v.id}</td>
                      <td className="border p-2">
                        {veh ? `${veh.placa || '—'}${veh.alias ? ' · ' + veh.alias : ''}` : v.vehiculo_id}
                      </td>
                      <td className="border p-2">{v.conductor || '—'}</td>
                      <td className="border p-2">{v.fecha_inicio || '—'}</td>
                      <td className="border p-2">{v.fecha_fin || '—'}</td>
                      <td className="border p-2">{v.origen || '—'}</td>
                      <td className="border p-2">{v.destino || '—'}</td>
                      <td className="border p-2">
                        <div className="flex gap-2">
                          <button
                            className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 rounded"
                            onClick={() => seleccionarViaje(v)}
                          >
                            Ver/Editar
                          </button>
                          <button
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
                            onClick={() => irReporte(v.id)}
                          >
                            Reporte
                          </button>
                          <button
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                            onClick={() => eliminarViaje(v.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form + Gastos */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Form viaje */}
        <div className="border rounded p-4 bg-white shadow-sm">
          <div className="font-semibold mb-2">{form.id ? `Editar viaje #${form.id}` : 'Nuevo viaje'}</div>

          <div className="grid gap-2">
            <select
              className="border p-2 rounded"
              value={form.vehiculo_id}
              onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}
            >
              <option value="">— Selecciona vehículo —</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa || '—'}
                  {v.alias ? ` · ${v.alias}` : ''}
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
                  setForm({ ...form, fecha_inicio: e.target.value })
                }}
              />
              <input
                type="date"
                className="border p-2 rounded"
                value={form.fecha_fin}
                onChange={(e) => {
                  setDiasManual(false)
                  setForm({ ...form, fecha_fin: e.target.value })
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                className="border p-2 rounded"
                value={form.origen}
                onChange={(e) => setForm({ ...form, origen: e.target.value })}
                placeholder="Origen"
              />
              <input
                className="border p-2 rounded"
                value={form.destino}
                onChange={(e) => setForm({ ...form, destino: e.target.value })}
                placeholder="Destino"
              />
            </div>

            <input
              className="border p-2 rounded"
              value={form.conductor}
              onChange={(e) => setForm({ ...form, conductor: e.target.value })}
              placeholder="Conductor"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className="border p-2 rounded"
                value={form.combustible_inicial}
                onChange={(e) => setForm({ ...form, combustible_inicial: e.target.value })}
                placeholder="Combustible inicial (gal)"
              />
              <input
                type="number"
                className="border p-2 rounded"
                value={form.combustible_final}
                onChange={(e) => setForm({ ...form, combustible_final: e.target.value })}
                placeholder="Combustible final (gal)"
              />
              <input
                type="number"
                className="border p-2 rounded"
                value={form.combustible_despachado}
                onChange={(e) => setForm({ ...form, combustible_despachado: e.target.value })}
                placeholder="Combustible despachado (gal)"
              />
              <input
                type="number"
                className="border p-2 rounded"
                value={form.precio_galon}
                onChange={(e) => setForm({ ...form, precio_galon: e.target.value })}
                placeholder="Precio galón"
              />

              <input
                type="number"
                className="border p-2 rounded"
                value={form.salario_diario}
                onChange={(e) => setForm({ ...form, salario_diario: e.target.value })}
                placeholder="Salario diario"
              />

              <input
                type="number"
                className="border p-2 rounded"
                placeholder="Días (editable)"
                value={form.dias}
                step="0.1"
                onChange={(e) => {
                  setDiasManual(true)
                  setForm({ ...form, dias: e.target.value })
                }}
              />

              <button
                type="button"
                className="border p-2 rounded bg-slate-100 hover:bg-slate-200 text-sm"
                onClick={() => setDiasManual(false)}
                title="Volver a calcular automáticamente según fecha inicio/fin"
              >
                Recalcular días
              </button>

              <input
                type="number"
                className="border p-2 rounded"
                value={form.km_recorridos}
                onChange={(e) => setForm({ ...form, km_recorridos: e.target.value })}
                placeholder="Km recorridos"
              />
              <input
                type="number"
                className="border p-2 rounded"
                value={form.consumo_por_galon}
                onChange={(e) => setForm({ ...form, consumo_por_galon: e.target.value })}
                placeholder="Consumo (km/gal)"
              />
            </div>

            <textarea
              className="border p-2 rounded"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              placeholder="Observaciones"
              rows={3}
            />

            <div className="flex gap-2">
              <button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                onClick={guardarViaje}
                disabled={guardandoViaje}
              >
                Guardar
              </button>
              <button
                className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded"
                onClick={() => {
                  resetForm()
                  setViajeSel(null)
                  setGastos([])
                }}
              >
                Cancelar
              </button>
            </div>

          </div>

          <div className="mt-4 text-sm bg-gray-50 border rounded p-3">
            <div className="font-semibold mb-1">Totales (pré-cálculo)</div>
            <div>Consumo estimado: {totales.consumoGal.toFixed(2)} gal</div>
            <div>Combustible: Q{totales.fuel.toFixed(2)}</div>
            <div>Salarios: Q{totales.salary.toFixed(2)}</div>
            <div>Otros gastos: Q{totales.otros.toFixed(2)}</div>
            <div className="font-semibold">Total: Q{totales.total.toFixed(2)}</div>
          </div>
        </div>

        {/* Gastos */}
        <div className="border rounded p-4 bg-white shadow-sm">
          <div className="font-semibold mb-2">Gastos adicionales</div>
          {!viajeSel ? (
            <div className="text-sm text-gray-600">
              Selecciona o guarda un viaje para agregar gastos.
            </div>
          ) : (
            <>
              <div className="grid gap-2 mb-3">
                <input
                  type="date"
                  className="border p-2 rounded"
                  value={gastoForm.fecha}
                  onChange={(e) => setGastoForm({ ...gastoForm, fecha: e.target.value })}
                />
                <input
                  className="border p-2 rounded"
                  value={gastoForm.descripcion}
                  onChange={(e) => setGastoForm({ ...gastoForm, descripcion: e.target.value })}
                  placeholder="Descripción"
                />
                <input
                  type="number"
                  className="border p-2 rounded"
                  value={gastoForm.monto}
                  onChange={(e) => setGastoForm({ ...gastoForm, monto: e.target.value })}
                  placeholder="Monto (Q)"
                />
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                  onClick={guardarGasto}
                  disabled={guardandoGasto}
                >
                  Registrar
                </button>
              </div>

              <div className="overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2">Fecha</th>
                      <th className="border p-2">Descripción</th>
                      <th className="border p-2">Monto</th>
                      <th className="border p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.length === 0 ? (
                      <tr>
                        <td className="border p-2 text-center" colSpan={4}>
                          Sin gastos.
                        </td>
                      </tr>
                    ) : (
                      gastos.map((g) => (
                        <tr key={g.id}>
                          <td className="border p-2">{g.fecha || '—'}</td>
                          <td className="border p-2">{g.descripcion || '—'}</td>
                          <td className="border p-2">
                            Q{Number(g.monto || 0).toFixed(2)}
                          </td>
                          <td className="border p-2">
                            <button
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                              onClick={() => eliminarGasto(g.id)}
                            >
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
