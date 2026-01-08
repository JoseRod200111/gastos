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

type Cliente = {
  id: number
  nombre: string
}

type Venta = {
  id: number
  fecha: string
  cliente_id: number
  ubicacion_id: number
  lote_id: number | null
  cantidad: number
  peso_total_lb: number
  total: number
  pagado: number
  deuda: number
}

export default function GranjaSalidaVentaPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ventasRecientes, setVentasRecientes] = useState<Venta[]>([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [form, setForm] = useState({
    fecha: '',
    ubicacion_id: '',
    cliente_id: '',
    lote_id: '',
    cantidad: '',
    peso_total_lb: '',
    precio_por_libra: '',
    pagado: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      fecha: '',
      ubicacion_id: '',
      cliente_id: '',
      lote_id: '',
      cantidad: '',
      peso_total_lb: '',
      precio_por_libra: '',
      pagado: '',
      observaciones: '',
    })

  // ---------- helpers de búsqueda ----------
  const findUbicacion = (id: number) =>
    ubicaciones.find((u) => u.id === id)

  const findLote = (id: number | null) =>
    lotes.find((l) => l.id === id)

  const findCliente = (id: number) =>
    clientes.find((c) => c.id === id)

  // ---------- cálculos derivados ----------
  const totalCalculado = (() => {
    const peso = parseFloat(form.peso_total_lb || '0')
    const precio = parseFloat(form.precio_por_libra || '0')
    if (!Number.isFinite(peso) || !Number.isFinite(precio)) return 0
    return peso * precio
  })()

  const deudaCalculada = (() => {
    const pagado = parseFloat(form.pagado || '0')
    if (!Number.isFinite(pagado)) return totalCalculado
    const d = totalCalculado - pagado
    return d < 0 ? 0 : d
  })()

  // ---------- carga de catálogos + ventas ----------
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: ubicData, error: ubicError },
        { data: loteData, error: loteError },
        { data: cliData, error: cliError },
        { data: venData, error: venError },
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
          .from('clientes')
          .select('id, nombre')
          .order('nombre', { ascending: true }),
        supabase
          .from('granja_ventas_cerdos')
          .select(
            'id, fecha, cliente_id, ubicacion_id, lote_id, cantidad, peso_total_lb, total, pagado, deuda'
          )
          .order('fecha', { ascending: false })
          .limit(20),
      ])

      if (ubicError) console.error('Error cargando ubicaciones', ubicError)
      if (loteError) console.error('Error cargando lotes', loteError)
      if (cliError) console.error('Error cargando clientes', cliError)
      if (venError) console.error('Error cargando ventas', venError)

      if (ubicData) setUbicaciones(ubicData as Ubicacion[])
      if (loteData) setLotes(loteData as Lote[])
      if (cliData) setClientes(cliData as Cliente[])
      if (venData) setVentasRecientes(venData as Venta[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // ---------- guardar venta ----------
  const guardarVenta = async () => {
    if (
      !form.fecha ||
      !form.ubicacion_id ||
      !form.cliente_id ||
      !form.cantidad ||
      !form.peso_total_lb ||
      !form.precio_por_libra
    ) {
      alert(
        'Fecha, ubicación, cliente, cantidad, peso total y precio por libra son obligatorios.'
      )
      return
    }

    const cantidad = Number(form.cantidad)
    const pesoTotalLb = Number(form.peso_total_lb)
    const precioPorLibra = Number(form.precio_por_libra)
    const total = pesoTotalLb * precioPorLibra
    const pagado = form.pagado ? Number(form.pagado) : 0
    const deuda = Math.max(0, total - pagado)

    if (
      Number.isNaN(cantidad) ||
      Number.isNaN(pesoTotalLb) ||
      Number.isNaN(precioPorLibra)
    ) {
      alert('Revise que cantidad, peso y precio sean números válidos.')
      return
    }

    setGuardando(true)
    try {
      // 1) insertar venta
      const { data: ventaInsertada, error: ventaErr } = await supabase
        .from('granja_ventas_cerdos')
        .insert({
          fecha: form.fecha,
          cliente_id: Number(form.cliente_id),
          ubicacion_id: Number(form.ubicacion_id),
          lote_id: form.lote_id ? Number(form.lote_id) : null,
          cantidad,
          peso_total_lb: pesoTotalLb,
          precio_por_libra: precioPorLibra,
          total,
          pagado,
          deuda,
          observaciones: form.observaciones || null,
        })
        .select('id')
        .single()

      if (ventaErr || !ventaInsertada) {
        console.error('Error guardando venta', ventaErr)
        alert('No se pudo guardar la venta.')
        return
      }

      // 2) movimiento de inventario (salida por venta)
      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .insert({
          ubicacion_id: Number(form.ubicacion_id),
          tipo: 'SALIDA_VENTA',
          lote_id: form.lote_id ? Number(form.lote_id) : null,
          // cantidad negativa para debitar inventario
          cantidad: -cantidad,
          referencia_tabla: 'granja_ventas_cerdos',
          referencia_id: ventaInsertada.id,
          observaciones: 'Salida de cerdos por venta',
        })

      if (movErr) {
        console.error('Error registrando movimiento', movErr)
        alert(
          'Venta guardada, pero hubo un problema al registrar el movimiento de inventario.'
        )
      } else {
        alert('Venta registrada correctamente.')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // ---------- UI ----------
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* encabezado */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Salida por venta</h1>
          <p className="text-xs text-gray-600">
            Registrar ventas de cerdos y debitar el inventario por
            ubicación.
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
          <h2 className="font-semibold mb-3">Nueva venta de cerdos</h2>

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
                Cliente
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.cliente_id}
                onChange={(e) =>
                  setForm({ ...form, cliente_id: e.target.value })
                }
              >
                <option value="">Seleccione un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
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
                Peso total (lb)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.peso_total_lb}
                onChange={(e) =>
                  setForm({ ...form, peso_total_lb: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Precio por libra (Q)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.precio_por_libra}
                onChange={(e) =>
                  setForm({
                    ...form,
                    precio_por_libra: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Total venta (Q)
              </label>
              <input
                readOnly
                className="border rounded w-full p-2 text-sm bg-gray-50"
                value={
                  totalCalculado ? totalCalculado.toFixed(2) : ''
                }
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Se calcula como peso total por precio por libra.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Pagado (Q)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.pagado}
                onChange={(e) =>
                  setForm({ ...form, pagado: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Deuda (Q)
              </label>
              <input
                readOnly
                className="border rounded w-full p-2 text-sm bg-gray-50"
                value={
                  deudaCalculada ? deudaCalculada.toFixed(2) : ''
                }
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Total menos pagado. Se guarda junto con la venta.
              </p>
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
              onClick={guardarVenta}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {guardando ? 'Guardando…' : 'Guardar venta'}
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

        {/* -------- ventas recientes -------- */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Ventas recientes</h2>
          {ventasRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aún no hay ventas registradas.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Ubicación</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Lote</th>
                    <th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">Peso lb</th>
                    <th className="p-2 text-right">Total Q</th>
                    <th className="p-2 text-right">Deuda Q</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasRecientes.map((v) => {
                    const u = findUbicacion(v.ubicacion_id)
                    const l = findLote(v.lote_id)
                    const c = findCliente(v.cliente_id)
                    return (
                      <tr key={v.id} className="border-t">
                        <td className="p-2">{v.fecha}</td>
                        <td className="p-2">
                          {u
                            ? `${u.codigo}${
                                u.nombre ? ` — ${u.nombre}` : ''
                              }`
                            : v.ubicacion_id}
                        </td>
                        <td className="p-2">
                          {c ? c.nombre : v.cliente_id}
                        </td>
                        <td className="p-2">
                          {l ? l.codigo : '—'}
                        </td>
                        <td className="p-2 text-right">
                          {v.cantidad}
                        </td>
                        <td className="p-2 text-right">
                          {v.peso_total_lb}
                        </td>
                        <td className="p-2 text-right">
                          {v.total?.toFixed
                            ? v.total.toFixed(2)
                            : v.total}
                        </td>
                        <td className="p-2 text-right">
                          {v.deuda?.toFixed
                            ? v.deuda.toFixed(2)
                            : v.deuda}
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
