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

type Cliente = {
  id: number
  nombre: string
  nit: string | null
}

type Venta = {
  id: number
  fecha: string
  cliente_id: number
  ubicacion_id: number
  lote_id: number | null
  cantidad: number
  peso_total_lb: number
  precio_por_libra: number
  total: number
  pagado: number
  deuda: number
  observaciones: string | null
  user_id: string | null
  created_at: string | null
  multi_id: string | null
  multi_folio: number | null
  clientes?: {
    nombre: string | null
    nit: string | null
  } | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
  granja_lotes?: {
    codigo: string | null
  } | null
}

type EditVenta = {
  fecha: string
  cliente_id: string
  ubicacion_id: string
  lote_id: string
  cantidad: string
  peso_total_lb: string
  precio_por_libra: string
  pagado: string
  observaciones: string
}

function toNum(v: any) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100
}

function q(n: any) {
  return `Q${toNum(n).toFixed(2)}`
}

function normalizarVenta(row: any): Venta {
  const rel = <T,>(r: T | T[] | null | undefined): T | null => {
    if (!r) return null
    return Array.isArray(r) ? r[0] ?? null : r
  }

  return {
    id: Number(row.id),
    fecha: row.fecha,
    cliente_id: Number(row.cliente_id),
    ubicacion_id: Number(row.ubicacion_id),
    lote_id: row.lote_id == null ? null : Number(row.lote_id),
    cantidad: Number(row.cantidad || 0),
    peso_total_lb: Number(row.peso_total_lb || 0),
    precio_por_libra: Number(row.precio_por_libra || 0),
    total: Number(row.total || 0),
    pagado: Number(row.pagado || 0),
    deuda: Number(row.deuda || 0),
    observaciones: row.observaciones || null,
    user_id: row.user_id || null,
    created_at: row.created_at || null,
    multi_id: row.multi_id || null,
    multi_folio: row.multi_folio == null ? null : Number(row.multi_folio),
    clientes: rel(row.clientes),
    granja_ubicaciones: rel(row.granja_ubicaciones),
    granja_lotes: rel(row.granja_lotes),
  }
}

function ventaToEdit(v: Venta): EditVenta {
  return {
    fecha: v.fecha || '',
    cliente_id: v.cliente_id ? String(v.cliente_id) : '',
    ubicacion_id: v.ubicacion_id ? String(v.ubicacion_id) : '',
    lote_id: v.lote_id ? String(v.lote_id) : '',
    cantidad: String(v.cantidad || ''),
    peso_total_lb: String(v.peso_total_lb || ''),
    precio_por_libra: String(v.precio_por_libra || ''),
    pagado: String(v.pagado || 0),
    observaciones: v.observaciones || '',
  }
}

function esMulti(v: Venta) {
  return Boolean(v.multi_id || v.multi_folio || (v.observaciones || '').includes('MULTI:'))
}

export default function VerVentasCerdosPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [ventas, setVentas] = useState<Venta[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [edit, setEdit] = useState<EditVenta | null>(null)

  const [filtros, setFiltros] = useState({
    id: '',
    desde: '',
    hasta: '',
    cliente_id: '',
    ubicacion_id: '',
    lote_id: '',
    texto: '',
    solo_multi: false,
  })

  const resumen = useMemo(() => {
    const cantidad = ventas.reduce((s, v) => s + toNum(v.cantidad), 0)
    const peso = ventas.reduce((s, v) => s + toNum(v.peso_total_lb), 0)
    const total = ventas.reduce((s, v) => s + toNum(v.total), 0)
    const pagado = ventas.reduce((s, v) => s + toNum(v.pagado), 0)
    const deuda = ventas.reduce((s, v) => s + toNum(v.deuda), 0)

    return {
      registros: ventas.length,
      cantidad,
      peso,
      total,
      pagado,
      deuda,
    }
  }, [ventas])

  const cargarCatalogos = useCallback(async () => {
    const [u, l, c] = await Promise.all([
      supabase
        .from('granja_ubicaciones')
        .select('id,codigo,nombre')
        .order('codigo', { ascending: true }),
      supabase
        .from('granja_lotes')
        .select('id,codigo')
        .order('codigo', { ascending: true }),
      supabase
        .from('clientes')
        .select('id,nombre,nit')
        .order('nombre', { ascending: true }),
    ])

    if (!u.error) setUbicaciones((u.data || []) as Ubicacion[])
    if (!l.error) setLotes((l.data || []) as Lote[])
    if (!c.error) setClientes((c.data || []) as Cliente[])
  }, [])

  const cargarVentas = useCallback(async () => {
    setLoading(true)
    setMsg('')

    try {
      let query = supabase
        .from('granja_ventas_cerdos')
        .select(`
          id,
          fecha,
          cliente_id,
          ubicacion_id,
          lote_id,
          cantidad,
          peso_total_lb,
          precio_por_libra,
          total,
          pagado,
          deuda,
          observaciones,
          user_id,
          created_at,
          multi_id,
          multi_folio,
          clientes (
            nombre,
            nit
          ),
          granja_ubicaciones (
            codigo,
            nombre
          ),
          granja_lotes (
            codigo
          )
        `)
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

      if (filtros.cliente_id) {
        query = query.eq('cliente_id', Number(filtros.cliente_id))
      }

      if (filtros.ubicacion_id) {
        query = query.eq('ubicacion_id', Number(filtros.ubicacion_id))
      }

      if (filtros.lote_id) {
        query = query.eq('lote_id', Number(filtros.lote_id))
      }

      const { data, error } = await query

      if (error) throw error

      let normalizadas = (data || []).map(normalizarVenta)

      if (filtros.solo_multi) {
        normalizadas = normalizadas.filter(esMulti)
      }

      if (filtros.texto.trim()) {
        const t = filtros.texto.trim().toLowerCase()

        normalizadas = normalizadas.filter((v) => {
          const combinado = [
            v.id,
            v.fecha,
            v.clientes?.nombre,
            v.clientes?.nit,
            v.granja_ubicaciones?.codigo,
            v.granja_ubicaciones?.nombre,
            v.granja_lotes?.codigo,
            v.cantidad,
            v.peso_total_lb,
            v.precio_por_libra,
            v.total,
            v.pagado,
            v.deuda,
            v.observaciones,
            v.multi_id,
            v.multi_folio,
          ]
            .join(' ')
            .toLowerCase()

          return combinado.includes(t)
        })
      }

      setVentas(normalizadas)
    } catch (err: any) {
      console.error(err)
      setMsg(err.message || 'Error al cargar ventas.')
      setVentas([])
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    cargarVentas()
  }, [cargarVentas])

  function handleFiltro(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFiltros((prev) => ({ ...prev, [name]: checked }))
      return
    }

    setFiltros((prev) => ({ ...prev, [name]: value }))
  }

  function limpiarFiltros() {
    setFiltros({
      id: '',
      desde: '',
      hasta: '',
      cliente_id: '',
      ubicacion_id: '',
      lote_id: '',
      texto: '',
      solo_multi: false,
    })
  }

  function iniciarEdicion(v: Venta) {
    setEditandoId(v.id)
    setEdit(ventaToEdit(v))
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setEdit(null)
  }

  function setEditField(field: keyof EditVenta, value: string) {
    setEdit((prev) => {
      if (!prev) return prev
      return { ...prev, [field]: value }
    })
  }

  function calcularTotalEdit() {
    if (!edit) return 0
    return round2(toNum(edit.peso_total_lb) * toNum(edit.precio_por_libra))
  }

  function calcularDeudaEdit() {
    if (!edit) return 0
    return round2(Math.max(0, calcularTotalEdit() - toNum(edit.pagado)))
  }

  async function guardarEdicion(ventaId: number) {
    if (!edit) return

    const cantidad = toNum(edit.cantidad)
    const pesoTotalLb = toNum(edit.peso_total_lb)
    const precioPorLibra = toNum(edit.precio_por_libra)
    const total = round2(pesoTotalLb * precioPorLibra)
    const pagado = round2(toNum(edit.pagado))
    const deuda = round2(Math.max(0, total - pagado))

    if (!edit.fecha) {
      alert('La fecha es obligatoria.')
      return
    }

    if (!edit.cliente_id) {
      alert('Selecciona un cliente.')
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

    if (pesoTotalLb <= 0) {
      alert('El peso total debe ser mayor que 0.')
      return
    }

    if (precioPorLibra <= 0) {
      alert('El precio por libra debe ser mayor que 0.')
      return
    }

    if (pagado < 0) {
      alert('El monto pagado no puede ser negativo.')
      return
    }

    if (pagado > total) {
      alert('El monto pagado no puede ser mayor que el total.')
      return
    }

    setLoading(true)
    setMsg('')

    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth?.user?.id || null

      const payloadVenta = {
        fecha: edit.fecha,
        cliente_id: Number(edit.cliente_id),
        ubicacion_id: Number(edit.ubicacion_id),
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        cantidad,
        peso_total_lb: pesoTotalLb,
        precio_por_libra: precioPorLibra,
        total,
        pagado,
        deuda,
        observaciones: edit.observaciones.trim() || null,
      }

      const { error: ventaErr } = await supabase
        .from('granja_ventas_cerdos')
        .update(payloadVenta)
        .eq('id', ventaId)

      if (ventaErr) throw ventaErr

      const { data: movExistente, error: movBuscarErr } = await supabase
        .from('granja_movimientos')
        .select('id')
        .eq('referencia_tabla', 'granja_ventas_cerdos')
        .eq('referencia_id', ventaId)
        .eq('tipo', 'SALIDA_VENTA')
        .maybeSingle()

      if (movBuscarErr) throw movBuscarErr

      const payloadMovimiento = {
        fecha: new Date(`${edit.fecha}T12:00:00`).toISOString(),
        ubicacion_id: Number(edit.ubicacion_id),
        tipo: 'SALIDA_VENTA',
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        cantidad,
        peso_total_kg: round2(pesoTotalLb * 0.45359237),
        referencia_tabla: 'granja_ventas_cerdos',
        referencia_id: ventaId,
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

      setMsg(`Venta #${ventaId} actualizada correctamente. Inventario actualizado.`)
      cancelarEdicion()
      await cargarVentas()
    } catch (err: any) {
      console.error(err)
      setMsg(err.message || 'Error al guardar cambios.')
    } finally {
      setLoading(false)
    }
  }

  async function eliminarVenta(v: Venta) {
    const ok = confirm(
      `¿Eliminar la venta #${v.id}?\n\nEsto también eliminará el movimiento de inventario asociado y revertirá la salida.`
    )

    if (!ok) return

    setLoading(true)
    setMsg('')

    try {
      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_ventas_cerdos')
        .eq('referencia_id', v.id)
        .eq('tipo', 'SALIDA_VENTA')

      if (movErr) throw movErr

      const { error: ventaErr } = await supabase
        .from('granja_ventas_cerdos')
        .delete()
        .eq('id', v.id)

      if (ventaErr) throw ventaErr

      setMsg(`Venta #${v.id} eliminada correctamente. Inventario revertido.`)
      await cargarVentas()
    } catch (err: any) {
      console.error(err)
      setMsg(err.message || 'Error al eliminar venta.')
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
          <h1 className="text-2xl font-bold">Ventas de cerdos</h1>
          <p className="text-sm text-gray-600">
            Buscar, editar y eliminar ventas registradas. Los cambios actualizan el inventario.
          </p>
        </div>

        <div className="md:ml-auto flex gap-2">
          <Link
            href="/granja/salida-venta"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm"
          >
            + Nueva venta
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
            placeholder="ID venta"
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
            name="cliente_id"
            value={filtros.cliente_id}
            onChange={handleFiltro}
            className="border p-2 rounded"
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.nit ? ` — ${c.nit}` : ''}
              </option>
            ))}
          </select>

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

          <input
            name="texto"
            value={filtros.texto}
            onChange={handleFiltro}
            placeholder="Buscar texto general"
            className="border p-2 rounded"
          />

          <label className="border rounded p-2 flex items-center gap-2">
            <input
              type="checkbox"
              name="solo_multi"
              checked={filtros.solo_multi}
              onChange={handleFiltro}
            />
            Solo multi-tramo
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={cargarVentas}
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

      <section className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-5">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Registros</div>
          <div className="text-lg font-semibold">{resumen.registros}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Cantidad</div>
          <div className="text-lg font-semibold">{resumen.cantidad}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Peso lb</div>
          <div className="text-lg font-semibold">{resumen.peso.toFixed(2)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total venta</div>
          <div className="text-lg font-semibold">{q(resumen.total)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Pagado</div>
          <div className="text-lg font-semibold text-green-700">{q(resumen.pagado)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Deuda</div>
          <div className="text-lg font-semibold text-red-700">{q(resumen.deuda)}</div>
        </div>
      </section>

      <section className="border rounded bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Ventas registradas</h2>
          <span className="text-xs text-gray-500">
            {loading ? 'Cargando...' : `${ventas.length} resultado(s)`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1650px] w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">ID</th>
                <th className="border p-2 text-left">Fecha</th>
                <th className="border p-2 text-left">Cliente</th>
                <th className="border p-2 text-left">Ubicación</th>
                <th className="border p-2 text-left">Lote</th>
                <th className="border p-2 text-right">Cantidad</th>
                <th className="border p-2 text-right">Peso lb</th>
                <th className="border p-2 text-right">Precio/lb</th>
                <th className="border p-2 text-right">Total</th>
                <th className="border p-2 text-right">Pagado</th>
                <th className="border p-2 text-right">Deuda</th>
                <th className="border p-2 text-left">Observaciones</th>
                <th className="border p-2 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-4 text-center text-gray-500">
                    No hay ventas con esos filtros.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => {
                  const enEdicion = editandoId === v.id && edit
                  const totalEdit = enEdicion ? calcularTotalEdit() : 0
                  const deudaEdit = enEdicion ? calcularDeudaEdit() : 0

                  return (
                    <tr key={v.id} className="border-t align-top">
                      <td className="border p-2 font-semibold">
                        #{v.id}
                        {esMulti(v) && (
                          <div className="text-[10px] text-violet-700 font-semibold">
                            Multi
                          </div>
                        )}
                      </td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <input
                            type="date"
                            className="border p-1 w-full"
                            value={edit.fecha}
                            onChange={(e) => setEditField('fecha', e.target.value)}
                          />
                        ) : (
                          v.fecha
                        )}
                      </td>

                      <td className="border p-2">
                        {enEdicion ? (
                          <select
                            className="border p-1 w-full"
                            value={edit.cliente_id}
                            onChange={(e) => setEditField('cliente_id', e.target.value)}
                          >
                            <option value="">Selecciona</option>
                            {clientes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                                {c.nit ? ` — ${c.nit}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <div>{v.clientes?.nombre || '—'}</div>
                            <div className="text-xs text-gray-500">
                              {v.clientes?.nit || ''}
                            </div>
                          </>
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
                            <div>{v.granja_ubicaciones?.codigo || '—'}</div>
                            <div className="text-xs text-gray-500">
                              {v.granja_ubicaciones?.nombre || ''}
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
                          v.granja_lotes?.codigo || '—'
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
                          v.cantidad
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-28 text-right"
                            value={edit.peso_total_lb}
                            onChange={(e) => setEditField('peso_total_lb', e.target.value)}
                            inputMode="decimal"
                          />
                        ) : (
                          v.peso_total_lb
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-28 text-right"
                            value={edit.precio_por_libra}
                            onChange={(e) => setEditField('precio_por_libra', e.target.value)}
                            inputMode="decimal"
                          />
                        ) : (
                          q(v.precio_por_libra)
                        )}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? q(totalEdit) : q(v.total)}
                      </td>

                      <td className="border p-2 text-right">
                        {enEdicion ? (
                          <input
                            className="border p-1 w-28 text-right"
                            value={edit.pagado}
                            onChange={(e) => setEditField('pagado', e.target.value)}
                            inputMode="decimal"
                          />
                        ) : (
                          q(v.pagado)
                        )}
                      </td>

                      <td className="border p-2 text-right font-semibold">
                        {enEdicion ? q(deudaEdit) : q(v.deuda)}
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
                          v.observaciones || '—'
                        )}
                      </td>

                      <td className="border p-2 whitespace-nowrap">
                        {enEdicion ? (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => guardarEdicion(v.id)}
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
                              onClick={() => iniciarEdicion(v)}
                              disabled={loading}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs disabled:opacity-60"
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => eliminarVenta(v)}
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