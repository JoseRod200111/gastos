'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
}

type Proveedor = {
  id: number
  nombre: string
  nit: string | null
}

type Compra = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  proveedor_id: number | null
  cantidad: number
  hembras: number
  machos: number
  peso_total_kg: number | null
  precio_total: number | null
  observaciones: string | null
  user_id: string | null
  created_at: string | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
  granja_lotes?: {
    codigo: string | null
  } | null
  proveedores?: {
    nombre: string | null
    nit: string | null
  } | null
}

type EditCompra = {
  fecha: string
  ubicacion_id: string
  lote_id: string
  proveedor_id: string
  cantidad: string
  hembras: string
  machos: string
  peso_total_kg: string
  precio_total: string
  observaciones: string
}

function toNum(v: any) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function q(n: any) {
  return `Q${toNum(n).toFixed(2)}`
}

function normalizarCompra(row: any): Compra {
  const rel = <T,>(r: T | T[] | null | undefined): T | null => {
    if (!r) return null
    return Array.isArray(r) ? r[0] ?? null : r
  }

  return {
    id: Number(row.id),
    fecha: row.fecha,
    ubicacion_id: Number(row.ubicacion_id),
    lote_id: row.lote_id == null ? null : Number(row.lote_id),
    proveedor_id: row.proveedor_id == null ? null : Number(row.proveedor_id),
    cantidad: Number(row.cantidad || 0),
    hembras: Number(row.hembras || 0),
    machos: Number(row.machos || 0),
    peso_total_kg: row.peso_total_kg == null ? null : Number(row.peso_total_kg),
    precio_total: row.precio_total == null ? null : Number(row.precio_total),
    observaciones: row.observaciones || null,
    user_id: row.user_id || null,
    created_at: row.created_at || null,
    granja_ubicaciones: rel(row.granja_ubicaciones),
    granja_lotes: rel(row.granja_lotes),
    proveedores: rel(row.proveedores),
  }
}

function compraToEdit(c: Compra): EditCompra {
  return {
    fecha: c.fecha || '',
    ubicacion_id: c.ubicacion_id ? String(c.ubicacion_id) : '',
    lote_id: c.lote_id ? String(c.lote_id) : '',
    proveedor_id: c.proveedor_id ? String(c.proveedor_id) : '',
    cantidad: String(c.cantidad || ''),
    hembras: String(c.hembras || 0),
    machos: String(c.machos || 0),
    peso_total_kg: c.peso_total_kg == null ? '' : String(c.peso_total_kg),
    precio_total: c.precio_total == null ? '' : String(c.precio_total),
    observaciones: c.observaciones || '',
  }
}

export default function VerComprasCerdosPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [compras, setCompras] = useState<Compra[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edit, setEdit] = useState<EditCompra | null>(null)

  const [filtros, setFiltros] = useState({
    id: '',
    desde: '',
    hasta: '',
    ubicacion_id: '',
    lote_id: '',
    proveedor_id: '',
    texto: '',
  })

  const resumen = useMemo(() => {
    const cantidad = compras.reduce((s, c) => s + toNum(c.cantidad), 0)
    const hembras = compras.reduce((s, c) => s + toNum(c.hembras), 0)
    const machos = compras.reduce((s, c) => s + toNum(c.machos), 0)
    const peso = compras.reduce((s, c) => s + toNum(c.peso_total_kg), 0)
    const total = compras.reduce((s, c) => s + toNum(c.precio_total), 0)

    return {
      registros: compras.length,
      cantidad,
      hembras,
      machos,
      peso,
      total,
    }
  }, [compras])

  const cargarCatalogos = useCallback(async () => {
    const [u, l, p] = await Promise.all([
      supabase
        .from('granja_ubicaciones')
        .select('id,codigo,nombre')
        .order('codigo', { ascending: true }),
      supabase
        .from('granja_lotes')
        .select('id,codigo')
        .order('codigo', { ascending: true }),
      supabase
        .from('proveedores')
        .select('id,nombre,nit')
        .order('nombre', { ascending: true }),
    ])

    if (!u.error) setUbicaciones((u.data || []) as Ubicacion[])
    if (!l.error) setLotes((l.data || []) as Lote[])
    if (!p.error) setProveedores((p.data || []) as Proveedor[])
  }, [])

  const cargarCompras = useCallback(async () => {
    setLoading(true)
    setMsg('')

    try {
      let query = supabase
        .from('granja_compras_cerdos')
        .select(`
          id,
          fecha,
          ubicacion_id,
          lote_id,
          proveedor_id,
          cantidad,
          hembras,
          machos,
          peso_total_kg,
          precio_total,
          observaciones,
          user_id,
          created_at,
          granja_ubicaciones (
            codigo,
            nombre
          ),
          granja_lotes (
            codigo
          ),
          proveedores (
            nombre,
            nit
          )
        `)
        .eq('es_compra', true)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (filtros.id.trim()) {
        query = query.eq('id', Number(filtros.id))
      }

      if (filtros.desde) {
        query = query.gte('fecha', filtros.desde)
      }

      if (filtros.hasta) {
        query = query.lte('fecha', filtros.hasta)
      }

      if (filtros.ubicacion_id) {
        query = query.eq('ubicacion_id', Number(filtros.ubicacion_id))
      }

      if (filtros.lote_id) {
        query = query.eq('lote_id', Number(filtros.lote_id))
      }

      if (filtros.proveedor_id) {
        query = query.eq('proveedor_id', Number(filtros.proveedor_id))
      }

      const { data, error } = await query

      if (error) throw error

      let normalizadas = (data || []).map(normalizarCompra)

      if (filtros.texto.trim()) {
        const t = filtros.texto.trim().toLowerCase()

        normalizadas = normalizadas.filter((c) => {
          const combinado = [
            c.id,
            c.fecha,
            c.granja_ubicaciones?.codigo,
            c.granja_ubicaciones?.nombre,
            c.granja_lotes?.codigo,
            c.proveedores?.nombre,
            c.proveedores?.nit,
            c.cantidad,
            c.hembras,
            c.machos,
            c.peso_total_kg,
            c.precio_total,
            c.observaciones,
          ]
            .join(' ')
            .toLowerCase()

          return combinado.includes(t)
        })
      }

      setCompras(normalizadas)
    } catch (err: any) {
      console.error(err)
      setMsg(err.message || 'Error al cargar compras.')
      setCompras([])
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    cargarCompras()
  }, [cargarCompras])

  function handleFiltro(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setFiltros((prev) => ({ ...prev, [name]: value }))
  }

  function limpiarFiltros() {
    setFiltros({
      id: '',
      desde: '',
      hasta: '',
      ubicacion_id: '',
      lote_id: '',
      proveedor_id: '',
      texto: '',
    })
  }

  function iniciarEdicion(c: Compra) {
    setEditandoId(c.id)
    setEdit(compraToEdit(c))
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setEdit(null)
  }

  function setEditField(field: keyof EditCompra, value: string) {
    setEdit((prev) => {
      if (!prev) return prev
      return { ...prev, [field]: value }
    })
  }

  async function guardarEdicion(compraId: number) {
    if (!edit) return

    const cantidad = toNum(edit.cantidad)
    const hembras = toNum(edit.hembras)
    const machos = toNum(edit.machos)

    if (!edit.fecha) {
      alert('La fecha es obligatoria.')
      return
    }

    if (!edit.ubicacion_id) {
      alert('Selecciona una ubicación.')
      return
    }

    if (cantidad <= 0) {
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

    setLoading(true)
    setMsg('')

    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth?.user?.id || null

      const payloadCompra = {
        fecha: edit.fecha,
        ubicacion_id: Number(edit.ubicacion_id),
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        proveedor_id: edit.proveedor_id ? Number(edit.proveedor_id) : null,
        cantidad,
        hembras,
        machos,
        peso_total_kg: edit.peso_total_kg.trim() ? toNum(edit.peso_total_kg) : null,
        precio_total: edit.precio_total.trim() ? toNum(edit.precio_total) : null,
        observaciones: edit.observaciones.trim() || null,
      }

      const { error: compraErr } = await supabase
        .from('granja_compras_cerdos')
        .update(payloadCompra)
        .eq('id', compraId)

      if (compraErr) throw compraErr

      const { data: movExistente, error: movBuscarErr } = await supabase
        .from('granja_movimientos')
        .select('id')
        .eq('referencia_tabla', 'granja_compras_cerdos')
        .eq('referencia_id', compraId)
        .eq('tipo', 'ENTRADA_COMPRA')
        .maybeSingle()

      if (movBuscarErr) throw movBuscarErr

      const payloadMovimiento = {
        fecha: new Date(`${edit.fecha}T12:00:00`).toISOString(),
        ubicacion_id: Number(edit.ubicacion_id),
        tipo: 'ENTRADA_COMPRA',
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        cantidad,
        hembras,
        machos,
        peso_total_kg: edit.peso_total_kg.trim() ? toNum(edit.peso_total_kg) : null,
        referencia_tabla: 'granja_compras_cerdos',
        referencia_id: compraId,
        user_id: userId,
        observaciones: edit.observaciones.trim() || null,
      }

      if (movExistente?.id) {
        const { error: movUpdateErr } = await supabase
          .from('granja_movimientos')
          .update(payloadMovimiento)
          .eq('id', movExistente.id)

        if (movUpdateErr) throw movUpdateErr
      } else {
        const { error: movInsertErr } = await supabase
          .from('granja_movimientos')
          .insert(payloadMovimiento)

        if (movInsertErr) throw movInsertErr
      }

      setMsg(`Compra #${compraId} actualizada correctamente. Inventario actualizado.`)
      cancelarEdicion()
      await cargarCompras()
    } catch (err: any) {
      console.error(err)
      setMsg(err.message || 'Error al guardar cambios.')
    } finally {
      setLoading(false)
    }
  }

  async function eliminarCompra(c: Compra) {
    const ok = confirm(
      `¿Eliminar la compra #${c.id}?\n\nEsto también eliminará el movimiento de inventario asociado.`
    )

    if (!ok) return

    setLoading(true)
    setMsg('')

    try {
      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_compras_cerdos')
        .eq('referencia_id', c.id)
        .eq('tipo', 'ENTRADA_COMPRA')

      if (movErr) throw movErr

      const { error: compraErr } = await supabase
        .from('granja_compras_cerdos')
        .delete()
        .eq('id', c.id)

      if (compraErr) throw compraErr

      setMsg(`Compra #${c.id} eliminada correctamente. Inventario revertido.`)
      await cargarCompras()
    } catch (err: any) {
      console.error(err)
      setMsg(err.message || 'Error al eliminar compra.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-14" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Compras de cerdos</h1>
          <p className="text-sm text-gray-600">
            Buscar, editar y eliminar compras registradas. Los cambios actualizan el inventario.
          </p>
        </div>

        <div className="md:ml-auto flex gap-2">
          <Link
            href="/granja/entrada-compra"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm"
          >
            + Nueva compra
          </Link>

          <Link
            href="/granja"
            className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
          >
            ⬅ Volver a Granja
          </Link>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 text-yellow-800 px-4 py-2 text-sm">
          {msg}
        </div>
      )}

      <section className="border rounded p-4 bg-white mb-5">
        <h2 className="font-semibold mb-3">Filtros de búsqueda</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            name="id"
            value={filtros.id}
            onChange={handleFiltro}
            placeholder="ID compra"
            className="border p-2 rounded"
            inputMode="numeric"
          />

          <input
            type="date"
            name="desde"
            value={filtros.desde}
            onChange={handleFiltro}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="hasta"
            value={filtros.hasta}
            onChange={handleFiltro}
            className="border p-2 rounded"
          />

          <select
            name="ubicacion_id"
            value={filtros.ubicacion_id}
            onChange={handleFiltro}
            className="border p-2 rounded"
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo} — {u.nombre || ''}
              </option>
            ))}
          </select>

          <select
            name="lote_id"
            value={filtros.lote_id}
            onChange={handleFiltro}
            className="border p-2 rounded"
          >
            <option value="">Todos los lotes</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo}
              </option>
            ))}
          </select>

          <select
            name="proveedor_id"
            value={filtros.proveedor_id}
            onChange={handleFiltro}
            className="border p-2 rounded"
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.nit ? ` — ${p.nit}` : ''}
              </option>
            ))}
          </select>

          <input
            name="texto"
            value={filtros.texto}
            onChange={handleFiltro}
            placeholder="Buscar texto general"
            className="border p-2 rounded md:col-span-2"
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={cargarCompras}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Buscar
          </button>

          <button
            onClick={limpiarFiltros}
            disabled={loading}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Limpiar
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Registros</div>
          <div className="text-lg font-semibold">{resumen.registros}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Cantidad total</div>
          <div className="text-lg font-semibold">{resumen.cantidad}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Hembras / Machos</div>
          <div className="text-lg font-semibold">
            {resumen.hembras} / {resumen.machos}
          </div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Peso total kg</div>
          <div className="text-lg font-semibold">{resumen.peso.toFixed(2)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total compra</div>
          <div className="text-lg font-semibold">{q(resumen.total)}</div>
        </div>
      </section>

      <section className="border rounded bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Compras registradas</h2>
          <span className="text-xs text-gray-500">
            {loading ? 'Cargando...' : `${compras.length} resultado(s)`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">ID</th>
                <th className="border p-2 text-left">Fecha</th>
                <th className="border p-2 text-left">Ubicación</th>
                <th className="border p-2 text-left">Lote</th>
                <th className="border p-2 text-left">Proveedor</th>
                <th className="border p-2 text-right">Cantidad</th>
                <th className="border p-2 text-right">Hembras</th>
                <th className="border p-2 text-right">Machos</th>
                <th className="border p-2 text-right">Peso kg</th>
                <th className="border p-2 text-right">Total Q</th>
                <th className="border p-2 text-left">Observaciones</th>
                <th className="border p-2 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {compras.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-gray-500">
                    No hay compras con esos filtros.
                  </td>
                </tr>
              ) : (
                compras.map((c) => {
                  const enEdicion = editandoId === c.id && edit

                  return (
                    <tr key={c.id} className="border-t align-top">
                      <td className="border p-2 font-semibold">#{c.id}</td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <input
                            type="date"
                            className="border p-1 w-full"
                            value={edit.fecha}
                            onChange={(e) => setEditField('fecha', e.target.value)}
                          />
                        ) : (
                          c.fecha
                        )}
                      </td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <select
                            className="border p-1 w-full"
                            value={edit.ubicacion_id}
                            onChange={(e) => setEditField('ubicacion_id', e.target.value)}
                          >
                            <option value="">Selecciona</option>
                            {ubicaciones.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.codigo} — {u.nombre || ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <div>{c.granja_ubicaciones?.codigo || '—'}</div>
                            <div className="text-xs text-gray-500">
                              {c.granja_ubicaciones?.nombre || ''}
                            </div>
                          </>
                        )}
                      </td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <select
                            className="border p-1 w-full"
                            value={edit.lote_id}
                            onChange={(e) => setEditField('lote_id', e.target.value)}
                          >
                            <option value="">Sin lote</option>
                            {lotes.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.codigo}
                              </option>
                            ))}
                          </select>
                        ) : (
                          c.granja_lotes?.codigo || '—'
                        )}
                      </td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <select
                            className="border p-1 w-full"
                            value={edit.proveedor_id}
                            onChange={(e) => setEditField('proveedor_id', e.target.value)}
                          >
                            <option value="">Sin proveedor</option>
                            {proveedores.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                                {p.nit ? ` — ${p.nit}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <div>{c.proveedores?.nombre || '—'}</div>
                            <div className="text-xs text-gray-500">
                              {c.proveedores?.nit || ''}
                            </div>
                          </>
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-24 text-right"
                            value={edit.cantidad}
                            onChange={(e) => setEditField('cantidad', e.target.value)}
                            inputMode="numeric"
                          />
                        ) : (
                          c.cantidad
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-24 text-right"
                            value={edit.hembras}
                            onChange={(e) => setEditField('hembras', e.target.value)}
                            inputMode="numeric"
                          />
                        ) : (
                          c.hembras
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-24 text-right"
                            value={edit.machos}
                            onChange={(e) => setEditField('machos', e.target.value)}
                            inputMode="numeric"
                          />
                        ) : (
                          c.machos
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-28 text-right"
                            value={edit.peso_total_kg}
                            onChange={(e) => setEditField('peso_total_kg', e.target.value)}
                            inputMode="decimal"
                          />
                        ) : (
                          c.peso_total_kg ?? '—'
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-28 text-right"
                            value={edit.precio_total}
                            onChange={(e) => setEditField('precio_total', e.target.value)}
                            inputMode="decimal"
                          />
                        ) : c.precio_total == null ? (
                          '—'
                        ) : (
                          q(c.precio_total)
                        )}
                      </td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <textarea
                            className="border p-1 w-full"
                            value={edit.observaciones}
                            onChange={(e) => setEditField('observaciones', e.target.value)}
                            rows={2}
                          />
                        ) : (
                          c.observaciones || '—'
                        )}
                      </td>

                      <td className="border p-2 whitespace-nowrap">
                        {enEdicion ? (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => guardarEdicion(c.id)}
                              disabled={loading}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
                            >
                              Guardar
                            </button>

                            <button
                              onClick={cancelarEdicion}
                              disabled={loading}
                              className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => iniciarEdicion(c)}
                              disabled={loading}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => eliminarCompra(c)}
                              disabled={loading}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}