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

export default function InventarioPage() {
  // UI state
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string>('')

  // Nuevo producto
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoSku, setNuevoSku] = useState('')
  const [nuevaUnidad, setNuevaUnidad] = useState('')
  const [nuevoCtrlInv, setNuevoCtrlInv] = useState(true)

  // Movimiento manual
  const [selProductoId, setSelProductoId] = useState<number | ''>('')
  const [tipoMov, setTipoMov] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA')
  const [cantMov, setCantMov] = useState<string>('')

  // Listado
  const [productos, setProductos] = useState<Producto[]>([])
  const [existencias, setExistencias] = useState<Existencia[]>([])
  const [busqueda, setBusqueda] = useState('')

  // --- helpers
  const existenciaDe = (productoId: number) =>
    existencias.find((e) => e.producto_id === productoId)?.existencia ?? 0

  const productosFiltrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return productos
    return productos.filter(
      (p) => p.nombre?.toLowerCase().includes(t) || (p.sku ?? '').toLowerCase().includes(t)
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
          'Aviso: la vista public.inventario_existencias no existe o no es accesible. Ejecuta el SQL de creación de la vista.'
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

  // ─────────── crear producto ───────────
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

  // ─────────── movimiento manual ───────────
  async function registrarMovimiento() {
    if (!selProductoId) {
      setMsg('Selecciona un producto')
      return
    }
    const cantidad = Number(cantMov)
    if (!cantidad || cantidad <= 0) {
      setMsg('Cantidad inválida')
      return
    }

    const prod = productos.find((p) => p.id === selProductoId)
    if (!prod) {
      setMsg('Producto inválido')
      return
    }
    if (!prod.control_inventario) {
      setMsg('Este producto no tiene control de inventario activado.')
      return
    }

    setLoading(true)
    setMsg('')
    try {
      const { error } = await supabase.from('inventario_movimientos').insert({
        producto_id: selProductoId,
        tipo: tipoMov,
        cantidad: cantidad,
        erogacion_detalle_id: null, // ajuste manual
      })
      if (error) throw error

      setCantMov('')
      await cargarDatos()
      setMsg('Movimiento registrado.')
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al registrar el movimiento')
    } finally {
      setLoading(false)
    }
  }

  // ─────────── edición inline ───────────
  const actualizarCampo = (id: number, campo: keyof Producto, valor: any) => {
    setProductos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [campo]: campo === 'control_inventario' ? !!valor : valor } : p))
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
      const { error } = await supabase.from('productos').update(payload).eq('id', p.id)
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
        // casi seguro que el error es por FK (en movimientos o detalle_compra)
        setMsg('No se puede eliminar: el producto está en uso (movimientos/erogaciones).')
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-10" />
          <h1 className="text-2xl font-bold">Inventario</h1>
        </div>
        <Link href="/menu" className="inline-flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded">
          ⟵ Volver al Menú Principal
        </Link>
      </div>

      {msg && (
        <div className="mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded">{msg}</div>
      )}

      {/* Nuevo Producto */}
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
            <input type="checkbox" checked={nuevoCtrlInv} onChange={(e) => setNuevoCtrlInv(e.target.checked)} />
            Control de inventario
          </label>
        </div>
        <div className="mt-3">
          <button
            onClick={crearProducto}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* Movimiento manual */}
      <section className="border rounded p-4 mb-6">
        <h2 className="font-semibold mb-3">⚡ Movimiento Manual</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <select
            value={selProductoId}
            onChange={(e) => setSelProductoId(e.target.value ? Number(e.target.value) : '')}
            className="border p-2 rounded"
          >
            <option value="">Selecciona producto</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>

          <select
            value={tipoMov}
            onChange={(e) => setTipoMov(e.target.value as 'ENTRADA' | 'SALIDA')}
            className="border p-2 rounded"
          >
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
          </select>

          <input
            value={cantMov}
            onChange={(e) => setCantMov(e.target.value)}
            placeholder="Cantidad"
            className="border p-2 rounded"
            inputMode="decimal"
          />

          <button
            onClick={registrarMovimiento}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Registrar
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          * Este movimiento se guarda en <code>inventario_movimientos</code> como ajuste manual (sin
          <code> erogacion_detalle_id</code>).
        </p>
      </section>

      {/* Listado con edición/eliminación */}
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
                        onChange={(e) => actualizarCampo(p.id, 'nombre', e.target.value)}
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        className="border p-1 w-full"
                        value={p.sku || ''}
                        onChange={(e) => actualizarCampo(p.id, 'sku', e.target.value)}
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        className="border p-1 w-full"
                        value={p.unidad || ''}
                        onChange={(e) => actualizarCampo(p.id, 'unidad', e.target.value)}
                      />
                    </td>
                    <td className="p-2 border">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!p.control_inventario}
                          onChange={(e) => actualizarCampo(p.id, 'control_inventario', e.target.checked)}
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
