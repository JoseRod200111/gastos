'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Producto = {
  id: number
  nombre: string
  sku: string | null
  unidad: string | null
  control_inventario: boolean
}

type Existencia = {
  producto_id: number
  existencia: number
}

type MovimientoManual = {
  producto_id: number | ''
  tipo: 'ENTRADA' | 'SALIDA'
  cantidad: string
  observaciones: string
}

const movimientoVacio = (): MovimientoManual => ({
  producto_id: '',
  tipo: 'ENTRADA',
  cantidad: '',
  observaciones: '',
})

export default function InventarioPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string>('')

  // Nuevo producto
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoSku, setNuevoSku] = useState('')
  const [nuevaUnidad, setNuevaUnidad] = useState('')
  const [nuevoCtrlInv, setNuevoCtrlInv] = useState(true)

  // Movimientos manuales múltiples
  const [movimientos, setMovimientos] = useState<MovimientoManual[]>([movimientoVacio()])
  const [observacionesGrupo, setObservacionesGrupo] = useState('')

  // Listado
  const [productos, setProductos] = useState<Producto[]>([])
  const [existencias, setExistencias] = useState<Existencia[]>([])
  const [busqueda, setBusqueda] = useState('')

  const existenciaDe = (productoId: number) =>
    existencias.find((e) => e.producto_id === productoId)?.existencia ?? 0

  const productosControlados = useMemo(
    () => productos.filter((p) => p.control_inventario),
    [productos]
  )

  const productosFiltrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return productos

    return productos.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(t) ||
        (p.sku ?? '').toLowerCase().includes(t)
    )
  }, [busqueda, productos])

  async function cargarDatos() {
    setLoading(true)
    setMsg('')

    try {
      const { data: prods, error: e1 } = await supabase
        .from('productos')
        .select('id,nombre,sku,unidad,control_inventario')
        .order('nombre', { ascending: true })

      if (e1) throw e1
      setProductos(prods ?? [])

      const { data: exis, error: e2 } = await supabase
        .from('inventario_existencias')
        .select('producto_id, existencia')

      if (e2) {
        setMsg(
          'Aviso: la vista public.inventario_existencias no existe o no es accesible.'
        )
        setExistencias([])
      } else {
        setExistencias(exis ?? [])
      }
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function crearProducto() {
    if (!nuevoNombre.trim()) {
      setMsg('El nombre es obligatorio')
      return
    }

    setLoading(true)
    setMsg('')

    try {
      const payload: any = {
        nombre: nuevoNombre.trim().toUpperCase(),
        control_inventario: nuevoCtrlInv,
      }

      if (nuevoSku.trim()) payload.sku = nuevoSku.trim().toUpperCase()
      if (nuevaUnidad.trim()) payload.unidad = nuevaUnidad.trim()

      const { error } = await supabase.from('productos').insert(payload)
      if (error) throw error

      setNuevoNombre('')
      setNuevoSku('')
      setNuevaUnidad('')
      setNuevoCtrlInv(true)

      await cargarDatos()
      setMsg('Producto guardado.')
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al guardar el producto')
    } finally {
      setLoading(false)
    }
  }

  function actualizarMovimiento(
    index: number,
    campo: keyof MovimientoManual,
    valor: any
  ) {
    setMovimientos((prev) =>
      prev.map((m, i) =>
        i === index
          ? {
              ...m,
              [campo]:
                campo === 'producto_id'
                  ? valor
                    ? Number(valor)
                    : ''
                  : valor,
            }
          : m
      )
    )
  }

  function agregarFilaMovimiento() {
    setMovimientos((prev) => [...prev, movimientoVacio()])
  }

  function eliminarFilaMovimiento(index: number) {
    setMovimientos((prev) => {
      if (prev.length === 1) return [movimientoVacio()]
      return prev.filter((_, i) => i !== index)
    })
  }

  function limpiarMovimientos() {
    setMovimientos([movimientoVacio()])
    setObservacionesGrupo('')
  }

  async function registrarMovimientos() {
    const filasValidas = movimientos
      .map((m, index) => ({
        ...m,
        index,
        cantidadNumero: Number(m.cantidad),
      }))
      .filter((m) => m.producto_id && m.cantidadNumero > 0)

    if (filasValidas.length === 0) {
      setMsg('Agrega al menos un movimiento válido.')
      return
    }

    for (const mov of filasValidas) {
      const prod = productos.find((p) => p.id === mov.producto_id)

      if (!prod) {
        setMsg(`Producto inválido en la fila ${mov.index + 1}.`)
        return
      }

      if (!prod.control_inventario) {
        setMsg(
          `El producto "${prod.nombre}" no tiene control de inventario activado.`
        )
        return
      }
    }

    setLoading(true)
    setMsg('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data: grupo, error: grupoErr } = await supabase
        .from('inventario_movimiento_grupos')
        .insert({
          user_id: user?.id ?? null,
          observaciones: observacionesGrupo.trim() || null,
        })
        .select('id')
        .single()

      if (grupoErr) throw grupoErr

      const grupoId = Number(grupo.id)

      const payload = filasValidas.map((m) => ({
        producto_id: Number(m.producto_id),
        tipo: m.tipo,
        cantidad: m.cantidadNumero,
        erogacion_detalle_id: null,
        venta_detalle_id: null,
        grupo_manual_id: grupoId,
        observaciones: m.observaciones.trim() || null,
        user_id: user?.id ?? null,
      }))

      const { data: insertados, error } = await supabase
        .from('inventario_movimientos')
        .insert(payload)
        .select('id')

      if (error) throw error

      limpiarMovimientos()
      await cargarDatos()

      const ids = (insertados || []).map((m: any) => m.id).join(', ')
      setMsg(
        `Movimientos registrados correctamente. Grupo manual #${grupoId}. IDs: ${ids || '—'}`
      )
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al registrar los movimientos')
    } finally {
      setLoading(false)
    }
  }

  const actualizarCampo = (id: number, campo: keyof Producto, valor: any) => {
    setProductos((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              [campo]: campo === 'control_inventario' ? !!valor : valor,
            }
          : p
      )
    )
  }

  async function guardarProducto(p: Producto) {
    setLoading(true)
    setMsg('')

    try {
      const payload = {
        nombre: p.nombre?.trim() ? p.nombre.trim().toUpperCase() : null,
        sku: p.sku?.trim() ? p.sku.trim().toUpperCase() : null,
        unidad: p.unidad?.trim() ? p.unidad.trim() : null,
        control_inventario: !!p.control_inventario,
      }

      const { error } = await supabase
        .from('productos')
        .update(payload)
        .eq('id', p.id)

      if (error) throw error

      await cargarDatos()
      setMsg('Cambios guardados.')
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al guardar cambios')
    } finally {
      setLoading(false)
    }
  }

  async function eliminarProducto(id: number) {
    if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return

    setLoading(true)
    setMsg('')

    try {
      const { error } = await supabase.from('productos').delete().eq('id', id)

      if (error) {
        setMsg('No se puede eliminar: el producto está en uso.')
      } else {
        await cargarDatos()
        setMsg('Producto eliminado.')
      }
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-10" />
          <h1 className="text-2xl font-bold">Inventario</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventario/reportes/manuales"
            className="inline-flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded"
          >
            📄 Reporte ingresos manuales
          </Link>

          <Link
            href="/menu"
            className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded"
          >
            ⟵ Volver al Menú Principal
          </Link>
        </div>
      </div>

      {msg && (
        <div className="mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded">
          {msg}
        </div>
      )}

      <section className="border rounded p-4 mb-6">
        <h2 className="font-semibold mb-3">➕ Nuevo Producto</h2>

        <div className="grid md:grid-cols-5 gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del producto"
            className="border p-2 rounded md:col-span-2"
          />

          <input
            value={nuevoSku}
            onChange={(e) => setNuevoSku(e.target.value)}
            placeholder="SKU / Código"
            className="border p-2 rounded"
          />

          <input
            value={nuevaUnidad}
            onChange={(e) => setNuevaUnidad(e.target.value)}
            placeholder="Unidad (ej. kg, lt, unidad)"
            className="border p-2 rounded"
          />

          <label className="inline-flex items-center gap-2 border rounded p-2">
            <input
              type="checkbox"
              checked={nuevoCtrlInv}
              onChange={(e) => setNuevoCtrlInv(e.target.checked)}
            />
            
            Control de inventario
          </label>
        </div>

        <div className="mt-3">
          <button
            onClick={crearProducto}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      </section>

      <section className="border rounded p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">⚡ Movimientos Manuales</h2>
            <p className="text-xs text-gray-500 mt-1">
              Puedes registrar varios movimientos al mismo tiempo. Cada fila tendrá su propio ID y todas quedarán asociadas a un grupo manual.
            </p>
          </div>

          <button
            onClick={agregarFilaMovimiento}
            type="button"
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm"
          >
            + Agregar fila
          </button>
        </div>

        <div className="mb-3">
          <textarea
            value={observacionesGrupo}
            onChange={(e) => setObservacionesGrupo(e.target.value)}
            placeholder="Observaciones generales del grupo de movimientos manuales"
            className="border p-2 rounded w-full"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          {movimientos.map((mov, index) => (
            <div
              key={index}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 border rounded p-2 bg-gray-50"
            >
              <select
                value={mov.producto_id}
                onChange={(e) =>
                  actualizarMovimiento(index, 'producto_id', e.target.value)
                }
                className="border p-2 rounded md:col-span-4 bg-white"
              >
                <option value="">Selecciona producto</option>
                {productosControlados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.sku ? `(${p.sku})` : ''}
                  </option>
                ))}
              </select>

              <select
                value={mov.tipo}
                onChange={(e) =>
                  actualizarMovimiento(
                    index,
                    'tipo',
                    e.target.value as 'ENTRADA' | 'SALIDA'
                  )
                }
                className="border p-2 rounded md:col-span-2 bg-white"
              >
                <option value="ENTRADA">ENTRADA</option>
                <option value="SALIDA">SALIDA</option>
              </select>

              <input
                value={mov.cantidad}
                onChange={(e) =>
                  actualizarMovimiento(index, 'cantidad', e.target.value)
                }
                placeholder="Cantidad"
                className="border p-2 rounded md:col-span-2 bg-white"
                inputMode="decimal"
              />

              <input
                value={mov.observaciones}
                onChange={(e) =>
                  actualizarMovimiento(index, 'observaciones', e.target.value)
                }
                placeholder="Observación de la fila"
                className="border p-2 rounded md:col-span-3 bg-white"
              />

              <button
                onClick={() => eliminarFilaMovimiento(index)}
                type="button"
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded md:col-span-1 disabled:opacity-60"
              >
                X
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={registrarMovimientos}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Registrar movimientos
          </button>

          <button
            onClick={limpiarMovimientos}
            disabled={loading}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Limpiar movimientos
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-2">
         
        </p>
      </section>

      <section className="border rounded p-4">
        <h2 className="font-semibold mb-3">📦 Productos</h2>

        <div className="flex justify-end mb-3">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="border p-2 rounded w-full md:w-80"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Nombre</th>
                <th className="p-2 border">SKU</th>
                <th className="p-2 border">Unidad</th>
                <th className="p-2 border">Control</th>
                <th className="p-2 border">Existencia</th>
                <th className="p-2 border">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td className="p-3 text-center text-gray-500" colSpan={6}>
                    No hay productos.
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 border">
                      <input
                        className="border p-1 w-full"
                        value={p.nombre || ''}
                        onChange={(e) =>
                          actualizarCampo(p.id, 'nombre', e.target.value)
                        }
                      />
                    </td>

                    <td className="p-2 border">
                      <input
                        className="border p-1 w-full"
                        value={p.sku || ''}
                        onChange={(e) =>
                          actualizarCampo(p.id, 'sku', e.target.value)
                        }
                      />
                    </td>

                    <td className="p-2 border">
                      <input
                        className="border p-1 w-full"
                        value={p.unidad || ''}
                        onChange={(e) =>
                          actualizarCampo(p.id, 'unidad', e.target.value)
                        }
                      />
                    </td>

                    <td className="p-2 border">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!p.control_inventario}
                          onChange={(e) =>
                            actualizarCampo(
                              p.id,
                              'control_inventario',
                              e.target.checked
                            )
                          }
                        />
                        <span>{p.control_inventario ? 'Sí' : 'No'}</span>
                      </label>
                    </td>

                    <td className="p-2 border text-right">
                      {p.control_inventario ? existenciaDe(p.id) : '—'}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      <button
                        onClick={() => guardarProducto(p)}
                        className="bg-green-600 text-white px-2 py-1 rounded mr-2 text-xs"
                        disabled={loading}
                      >
                        Guardar
                      </button>

                      <button
                        onClick={() => eliminarProducto(p.id)}
                        className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                        disabled={loading}
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
      </section>
    </div>
  )
}
