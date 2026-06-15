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

type Proveedor = {
  id: number
  nombre: string
}

type Compra = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  cantidad: number
  hembras: number | null
  machos: number | null
  peso_total_kg: number | null
}

const toNumberOrNull = (value: string) => {
  if (value.trim() === '') return null

  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const toNumberOrZero = (value: string) => {
  if (value.trim() === '') return 0

  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const fechaCompraToTimestamp = (fecha: string) => {
  return new Date(`${fecha}T12:00:00`).toISOString()
}

export default function GranjaEntradaCompraPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [comprasRecientes, setComprasRecientes] = useState<Compra[]>([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [form, setForm] = useState({
    fecha: '',
    ubicacion_id: '',
    lote_id: '',
    nuevo_lote_codigo: '',
    proveedor_id: '',
    cantidad: '',
    hembras: '',
    machos: '',
    peso_total_kg: '',
    precio_total: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      fecha: '',
      ubicacion_id: '',
      lote_id: '',
      nuevo_lote_codigo: '',
      proveedor_id: '',
      cantidad: '',
      hembras: '',
      machos: '',
      peso_total_kg: '',
      precio_total: '',
      observaciones: '',
    })

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      const [
        { data: ubicData, error: ubicError },
        { data: loteData, error: loteError },
        { data: provData, error: provError },
        { data: compData, error: compError },
      ] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .eq('tipo_origen', 'COMPRA')
          .order('fecha', { ascending: false })
          .limit(50),

        supabase
          .from('proveedores')
          .select('id, nombre')
          .order('nombre', { ascending: true }),

        supabase
          .from('granja_compras_cerdos')
          .select('id, fecha, ubicacion_id, lote_id, cantidad, hembras, machos, peso_total_kg')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .limit(20),
      ])

      if (ubicError) console.error('Error cargando ubicaciones', ubicError)
      if (loteError) console.error('Error cargando lotes', loteError)
      if (provError) console.error('Error cargando proveedores', provError)
      if (compError) console.error('Error cargando compras', compError)

      setUbicaciones((ubicData || []) as Ubicacion[])
      setLotes((loteData || []) as Lote[])
      setProveedores((provData || []) as Proveedor[])
      setComprasRecientes((compData || []) as Compra[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const findUbicacion = (id: number) => ubicaciones.find((u) => u.id === id)

  const findLote = (id: number | null) => lotes.find((l) => l.id === id)

  const guardarCompra = async () => {
    if (!form.fecha || !form.ubicacion_id || !form.cantidad) {
      alert('Fecha, ubicación y cantidad son obligatorios.')
      return
    }

    const cantidad = toNumberOrZero(form.cantidad)
    const hembras = toNumberOrZero(form.hembras)
    const machos = toNumberOrZero(form.machos)
    const pesoTotalKg = toNumberOrNull(form.peso_total_kg)
    const precioTotal = toNumberOrNull(form.precio_total)

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      alert('La cantidad debe ser mayor que 0.')
      return
    }

    if (hembras < 0 || machos < 0) {
      alert('Hembras y machos no pueden ser negativos.')
      return
    }

    if (hembras + machos > cantidad) {
      const ok = confirm(
        'La suma de hembras y machos es mayor que la cantidad total. ¿Deseas guardar de todos modos?'
      )

      if (!ok) return
    }

    setGuardando(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      let loteId: number | null = form.lote_id ? Number(form.lote_id) : null

      if (!loteId) {
        const codigoBase =
          form.nuevo_lote_codigo.trim() || `C-${form.fecha.replace(/-/g, '')}`

        const { data: loteInsertado, error: loteErr } = await supabase
          .from('granja_lotes')
          .insert({
            codigo: codigoBase,
            tipo_origen: 'COMPRA',
            fecha: form.fecha,
            observaciones: form.observaciones || null,
          })
          .select('id')
          .single()

        if (loteErr || !loteInsertado) {
          console.error('Error creando lote', loteErr)
          alert(
            loteErr?.message
              ? `No se pudo crear el lote: ${loteErr.message}`
              : 'No se pudo crear el lote.'
          )
          return
        }

        loteId = Number(loteInsertado.id)
      }

      const payloadCompra = {
        fecha: form.fecha,
        ubicacion_id: Number(form.ubicacion_id),
        lote_id: loteId,
        es_compra: true,
        proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
        cantidad,
        hembras,
        machos,
        peso_total_kg: pesoTotalKg,
        precio_total: precioTotal,
        observaciones: form.observaciones || null,
        user_id: userId,
      }

      const { data: compraInsertada, error: compraErr } = await supabase
        .from('granja_compras_cerdos')
        .insert(payloadCompra)
        .select('id')
        .single()

      if (compraErr || !compraInsertada) {
        console.error('Error guardando compra', compraErr)
        alert(
          compraErr?.message
            ? `No se pudo guardar la compra: ${compraErr.message}`
            : 'No se pudo guardar la compra.'
        )
        return
      }

      const compraId = Number(compraInsertada.id)

      const payloadMovimiento = {
        fecha: fechaCompraToTimestamp(form.fecha),
        ubicacion_id: Number(form.ubicacion_id),
        tipo: 'ENTRADA_COMPRA',
        lote_id: loteId,
        cantidad,
        hembras,
        machos,
        peso_total_kg: pesoTotalKg,
        referencia_tabla: 'granja_compras_cerdos',
        referencia_id: compraId,
        user_id: userId,
        observaciones: form.observaciones || 'Entrada de cerdos por compra',
      }

      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .insert(payloadMovimiento)

      if (movErr) {
        console.error('Error registrando movimiento', movErr)

        alert(
          `Compra #${compraId} guardada, pero hubo un error registrando el movimiento de inventario: ${movErr.message}`
        )

        return
      }

      alert(`Compra #${compraId} registrada correctamente. Inventario actualizado.`)

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />

        <div>
          <h1 className="text-2xl font-bold">Granja — Entrada por compra</h1>
          <p className="text-xs text-gray-600">
            Registrar ingresos de cerdos comprados y actualizar inventario por ubicación.
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
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nueva compra de cerdos</h2>

          {loading && (
            <p className="text-xs text-gray-500 mb-2">Cargando catálogos…</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Fecha</label>
              <input
                type="date"
                className="border rounded w-full p-2 text-sm"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Ubicación (tramo / jaula)
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

            <div>
              <label className="block text-xs font-semibold mb-1">
                Lote existente
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.lote_id}
                onChange={(e) => setForm({ ...form, lote_id: e.target.value })}
              >
                <option value="">— Crear nuevo lote —</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} ({l.fecha})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Código nuevo lote
              </label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Si no selecciona uno"
                value={form.nuevo_lote_codigo}
                onChange={(e) =>
                  setForm({ ...form, nuevo_lote_codigo: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Proveedor</label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.proveedor_id}
                onChange={(e) =>
                  setForm({ ...form, proveedor_id: e.target.value })
                }
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Cantidad total
              </label>
              <input
                type="number"
                min="1"
                className="border rounded w-full p-2 text-sm"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Hembras</label>
              <input
                type="number"
                min="0"
                className="border rounded w-full p-2 text-sm"
                value={form.hembras}
                onChange={(e) => setForm({ ...form, hembras: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Machos</label>
              <input
                type="number"
                min="0"
                className="border rounded w-full p-2 text-sm"
                value={form.machos}
                onChange={(e) => setForm({ ...form, machos: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Peso total (kg)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="border rounded w-full p-2 text-sm"
                value={form.peso_total_kg}
                onChange={(e) =>
                  setForm({ ...form, peso_total_kg: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Precio total (Q)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="border rounded w-full p-2 text-sm"
                value={form.precio_total}
                onChange={(e) =>
                  setForm({ ...form, precio_total: e.target.value })
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
                  setForm({ ...form, observaciones: e.target.value })
                }
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarCompra}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {guardando ? 'Guardando…' : 'Guardar compra'}
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

        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Compras recientes</h2>

          {comprasRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aún no hay compras registradas.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Ubicación</th>
                    <th className="p-2 text-left">Lote</th>
                    <th className="p-2 text-right">Cantidad</th>
                    <th className="p-2 text-right">H</th>
                    <th className="p-2 text-right">M</th>
                    <th className="p-2 text-right">Peso kg</th>
                  </tr>
                </thead>

                <tbody>
                  {comprasRecientes.map((c) => {
                    const u = findUbicacion(c.ubicacion_id)
                    const l = findLote(c.lote_id)

                    return (
                      <tr key={c.id} className="border-t">
                        <td className="p-2">{c.id}</td>

                        <td className="p-2">{c.fecha || '—'}</td>

                        <td className="p-2">
                          {u
                            ? `${u.codigo}${u.nombre ? ` — ${u.nombre}` : ''}`
                            : c.ubicacion_id}
                        </td>

                        <td className="p-2">{l ? l.codigo : '—'}</td>

                        <td className="p-2 text-right">{c.cantidad}</td>

                        <td className="p-2 text-right">{c.hembras ?? 0}</td>

                        <td className="p-2 text-right">{c.machos ?? 0}</td>

                        <td className="p-2 text-right">
                          {c.peso_total_kg != null
                            ? Number(c.peso_total_kg).toFixed(2)
                            : '—'}
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
