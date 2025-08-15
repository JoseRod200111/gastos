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
  stock?: number
}

type Existencia = { producto_id: number; stock: number }

export default function InventarioPage() {
  // ───────────────────────────── state ─────────────────────────────
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [msg, setMsg] = useState<string>('')

  // Nuevo producto
  const [nuevo, setNuevo] = useState({
    nombre: '',
    sku: '',
    unidad: '',
    control_inventario: true,
  })

  // Movimiento rápido
  const [mov, setMov] = useState({
    producto_id: '',
    tipo: 'ENTRADA', // 'ENTRADA' | 'SALIDA'
    cantidad: '',
  })

  // ─────────────────────────── efectos ────────────────────────────
  useEffect(() => {
    cargarProductos()
  }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
    )
  }, [busqueda, productos])

  // ──────────────────────────── datos ─────────────────────────────
  async function cargarProductos() {
    setCargando(true)
    setMsg('')
    try {
      // 1) productos
      const { data: prods, error: e1 } = await supabase
        .from('productos')
        .select('id, nombre, sku, unidad, control_inventario')
        .order('nombre', { ascending: true })
      if (e1) throw e1

      // 2) existencias (vista creada en el SQL previo)
      const { data: exist, error: e2 } = await supabase
        .from('inventario_existencias')
        .select('producto_id, stock')
      if (e2) throw e2

      const stockMap = new Map<number, number>(
        (exist as Existencia[]).map((x) => [x.producto_id, Number(x.stock) || 0])
      )

      const merged: Producto[] =
        (prods || []).map((p) => ({
          ...p,
          stock: stockMap.get(p.id) ?? 0,
        })) as Producto[]

      setProductos(merged)
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al cargar inventario')
    } finally {
      setCargando(false)
    }
  }

  // ─────────────────────────── acciones ───────────────────────────
  async function guardarProducto() {
    setMsg('')
    if (!nuevo.nombre.trim()) {
      setMsg('El nombre es obligatorio.')
      return
    }
    try {
      const { error } = await supabase.from('productos').insert([
        {
          nombre: nuevo.nombre.trim().toUpperCase(),
          sku: nuevo.sku.trim() || null,
          unidad: nuevo.unidad.trim() || null,
          control_inventario: nuevo.control_inventario,
        },
      ])
      if (error) throw error

      setNuevo({ nombre: '', sku: '', unidad: '', control_inventario: true })
      await cargarProductos()
      setMsg('✅ Producto creado.')
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al crear producto')
    }
  }

  async function registrarMovimiento() {
    setMsg('')
    const prodId = Number(mov.producto_id)
    const cantidad = Number(mov.cantidad)

    if (!prodId) {
      setMsg('Selecciona un producto.')
      return
    }
    if (!cantidad || cantidad <= 0) {
      setMsg('La cantidad debe ser mayor a 0.')
      return
    }

    // Validar control_inventario / stock suficiente en SALIDA
    const prod = productos.find((p) => p.id === prodId)
    if (!prod) {
      setMsg('Producto inválido.')
      return
    }
    if (!prod.control_inventario) {
      setMsg('Este producto no está marcado para control de inventario.')
      return
    }
    if (mov.tipo === 'SALIDA' && (prod.stock ?? 0) < cantidad) {
      setMsg('No hay stock suficiente para la salida.')
      return
    }

    try {
      const { error } = await supabase.from('inventario_movimientos').insert([
        {
          producto_id: prodId,
          tipo: mov.tipo,
          cantidad,
          erogacion_detalle_id: null, // ajuste manual
        },
      ])
      if (error) throw error

      setMov({ producto_id: '', tipo: 'ENTRADA', cantidad: '' })
      await cargarProductos()
      setMsg('✅ Movimiento registrado.')
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al registrar movimiento')
    }
  }

  // ───────────────────────────── UI ───────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-12" />
          <h1 className="text-2xl font-bold">Inventario</h1>
        </div>

        <Link
          href="/menu"
          className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded"
        >
          ⬅ Volver al Menú Principal
        </Link>
      </div>

      {/* Mensajes */}
      {msg && (
        <div className="mb-4 rounded border p-3 text-sm bg-yellow-50 border-yellow-200">
          {msg}
        </div>
      )}

      {/* Sección: Nuevo producto */}
      <section className="mb-8 border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">➕ Nuevo Producto</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            className="border p-2"
            placeholder="Nombre *"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <input
            className="border p-2"
            placeholder="SKU"
            value={nuevo.sku}
            onChange={(e) => setNuevo({ ...nuevo, sku: e.target.value })}
          />
          <input
            className="border p-2"
            placeholder="Unidad (ej. kg, unid)"
            value={nuevo.unidad}
            onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}
          />
          <label className="flex items-center gap-2 border p-2 rounded">
            <input
              type="checkbox"
              checked={nuevo.control_inventario}
              onChange={(e) =>
                setNuevo({ ...nuevo, control_inventario: e.target.checked })
              }
            />
            Control de inventario
          </label>
          <button
            onClick={guardarProducto}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* Sección: Movimiento rápido */}
      <section className="mb-8 border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">⚡ Movimiento Manual</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            className="border p-2"
            value={mov.producto_id}
            onChange={(e) => setMov({ ...mov, producto_id: e.target.value })}
          >
            <option value="">Selecciona producto</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.sku ? `(${p.sku})` : ''} — stock: {p.stock ?? 0}
              </option>
            ))}
          </select>

          <select
            className="border p-2"
            value={mov.tipo}
            onChange={(e) => setMov({ ...mov, tipo: e.target.value })}
          >
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
          </select>

          <input
            className="border p-2"
            placeholder="Cantidad"
            type="number"
            min="0"
            step="0.01"
            value={mov.cantidad}
            onChange={(e) => setMov({ ...mov, cantidad: e.target.value })}
          />

          <button
            onClick={registrarMovimiento}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Registrar
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          * Este movimiento se guarda en <code>inventario_movimientos</code>
          {' '}como ajuste manual (sin <code>erogacion_detalle_id</code>).
        </p>
      </section>

      {/* Sección: listado */}
      <section className="border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">🗂️ Productos</h2>
          <input
            className="border p-2 w-64"
            placeholder="Buscar por nombre o SKU…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {cargando ? (
          <p className="text-gray-500">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-gray-500">No hay productos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-left">Unidad</th>
                  <th className="p-2 text-left">Ctrl Inv.</th>
                  <th className="p-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.id}</td>
                    <td className="p-2">{p.nombre}</td>
                    <td className="p-2">{p.sku || '-'}</td>
                    <td className="p-2">{p.unidad || '-'}</td>
                    <td className="p-2">{p.control_inventario ? 'Sí' : 'No'}</td>
                    <td className="p-2 text-right">{(p.stock ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
