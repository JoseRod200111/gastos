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

function qNum(n: any) {
  return Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function MovimientosManualesInventarioPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [movimientos, setMovimientos] = useState<MovimientoManual[]>([movimientoVacio()])
  const [observacionesGrupo, setObservacionesGrupo] = useState('')

  const productosControlados = useMemo(
    () => productos.filter((p) => p.control_inventario),
    [productos]
  )

  const productosOpciones = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return productosControlados

    return productosControlados.filter(
      (p) =>
        p.nombre.toLowerCase().includes(texto) ||
        (p.sku ?? '').toLowerCase().includes(texto) ||
        (p.unidad ?? '').toLowerCase().includes(texto)
    )
  }, [busqueda, productosControlados])

  const resumen = useMemo(() => {
    const filasValidas = movimientos
      .map((m) => ({ ...m, cantidadNumero: Number(m.cantidad) }))
      .filter((m) => m.producto_id && m.cantidadNumero > 0)

    const entradas = filasValidas
      .filter((m) => m.tipo === 'ENTRADA')
      .reduce((sum, m) => sum + Number(m.cantidadNumero || 0), 0)

    const salidas = filasValidas
      .filter((m) => m.tipo === 'SALIDA')
      .reduce((sum, m) => sum + Number(m.cantidadNumero || 0), 0)

    return {
      filasValidas: filasValidas.length,
      entradas,
      salidas,
      neto: entradas - salidas,
    }
  }, [movimientos])

  async function cargarProductos() {
    setLoading(true)
    setMsg('')

    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id,nombre,sku,unidad,control_inventario')
        .order('nombre', { ascending: true })

      if (error) throw error
      setProductos(data ?? [])
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al cargar productos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarProductos()
  }, [])

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
    setBusqueda('')
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
        setMsg(`El producto "${prod.nombre}" no tiene control de inventario activado.`)
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

      const ids = (insertados || []).map((m: any) => m.id).join(', ')
      setMsg(`Movimientos registrados correctamente. Grupo manual #${grupoId}. IDs: ${ids || '—'}.`)
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al registrar los movimientos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-10" />
          <div>
            <h1 className="text-2xl font-bold">Movimientos manuales de inventario</h1>
            <p className="text-sm text-gray-500">
              Registra entradas o salidas manuales de productos con control de inventario.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventario/reportes/manuales"
            className="bg-emerald-700 text-white px-4 py-2 rounded"
          >
            Reporte movimientos manuales
          </Link>

          <Link
            href="/inventario"
            className="bg-gray-700 text-white px-4 py-2 rounded"
          >
            Volver a Inventario
          </Link>

          <Link
            href="/menu"
            className="bg-gray-800 text-white px-4 py-2 rounded"
          >
            Menú Principal
          </Link>
        </div>
      </div>

      {msg && (
        <div className="mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded">
          {msg}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Filas válidas</div>
          <div className="text-lg font-semibold">{resumen.filasValidas}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Entradas</div>
          <div className="text-lg font-semibold text-green-700">{qNum(resumen.entradas)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Salidas</div>
          <div className="text-lg font-semibold text-red-700">{qNum(resumen.salidas)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Neto</div>
          <div className="text-lg font-semibold">{qNum(resumen.neto)}</div>
        </div>
      </section>

      <section className="border rounded p-4 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">Registro de movimientos</h2>
            <p className="text-xs text-gray-500 mt-1">
              Puedes registrar varios movimientos al mismo tiempo. Cada fila tendrá su propio ID y quedará asociada al mismo grupo manual.
            </p>
          </div>

          <button
            onClick={agregarFilaMovimiento}
            type="button"
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm"
          >
            Agregar fila
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <textarea
            value={observacionesGrupo}
            onChange={(e) => setObservacionesGrupo(e.target.value)}
            placeholder="Observaciones generales del grupo de movimientos manuales"
            className="border p-2 rounded w-full"
            rows={2}
          />

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar productos por nombre, SKU o unidad"
            className="border p-2 rounded h-10"
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
                onChange={(e) => actualizarMovimiento(index, 'producto_id', e.target.value)}
                className="border p-2 rounded md:col-span-4 bg-white"
              >
                <option value="">Selecciona producto</option>
                {productosOpciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.sku ? `(${p.sku})` : ''}
                  </option>
                ))}
              </select>

              <select
                value={mov.tipo}
                onChange={(e) =>
                  actualizarMovimiento(index, 'tipo', e.target.value as 'ENTRADA' | 'SALIDA')
                }
                className="border p-2 rounded md:col-span-2 bg-white"
              >
                <option value="ENTRADA">ENTRADA</option>
                <option value="SALIDA">SALIDA</option>
              </select>

              <input
                value={mov.cantidad}
                onChange={(e) => actualizarMovimiento(index, 'cantidad', e.target.value)}
                placeholder="Cantidad"
                className="border p-2 rounded md:col-span-2 bg-white"
                inputMode="decimal"
              />

              <input
                value={mov.observaciones}
                onChange={(e) => actualizarMovimiento(index, 'observaciones', e.target.value)}
                placeholder="Observación de la fila"
                className="border p-2 rounded md:col-span-3 bg-white"
              />

              <button
                onClick={() => eliminarFilaMovimiento(index)}
                type="button"
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded md:col-span-1 disabled:opacity-60"
              >
                Quitar
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

          <button
            onClick={cargarProductos}
            disabled={loading}
            className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Actualizar productos
          </button>
        </div>
      </section>
    </div>
  )
}
