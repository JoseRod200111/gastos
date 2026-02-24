'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Filtros = {
  empresa_id: string
  division_id: string
  categoria_id: string
  desde: string
  hasta: string
  id: string
  proveedor_nombre: string
  proveedor_nit: string
}

export default function VerErogaciones() {
  /* ───────────────────────── state ───────────────────────── */
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [k: number]: any[] }>({})

  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])

  const [userEmail, setUserEmail] = useState('')

  const [savingDetalleId, setSavingDetalleId] = useState<number | null>(null)

  const [filtros, setFiltros] = useState<Filtros>({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: '',
    id: '',
    proveedor_nombre: '',
    proveedor_nit: '',
  })

  /* ─────────────────────── catálogos ─────────────────────── */
  useEffect(() => {
    ;(async () => {
      const [emp, div, cat, fp] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('categorias').select('*'),
        supabase.from('forma_pago').select('*'),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setCategorias(cat.data || [])
      setFormasPago(fp.data || [])

      const { data } = await supabase.auth.getUser()
      setUserEmail(data?.user?.email || '')
    })()

    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─────────────────────── datos ─────────────────────── */
  const cargarDatos = async () => {
    let query = supabase
      .from('erogaciones')
      .select(
        `
        id, fecha, cantidad, observaciones,
        empresa_id, division_id, categoria_id, proveedor_id,
        empresas ( nombre ),
        divisiones ( nombre ),
        categorias ( nombre ),
        proveedores ( nombre, nit )
      `
      )
      .order('fecha', { ascending: false })

    // filtros básicos
    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    // filtros por proveedor (si tu política RLS lo permite sobre relaciones)
    if (filtros.proveedor_nombre)
      query = query.ilike('proveedores.nombre', `%${filtros.proveedor_nombre.trim()}%`)
    if (filtros.proveedor_nit)
      query = query.ilike('proveedores.nit', `%${filtros.proveedor_nit.trim()}%`)

    const { data, error } = await query
    if (error) {
      console.error('Error cargando erogaciones', error)
      return
    }

    setErogaciones(data || [])

    // ── Detalles para todas las erogaciones en un solo query ──
    const ids = (data || []).map((e: any) => e.id)
    if (ids.length === 0) {
      setDetalles({})
      return
    }

    const { data: detAll, error: detErr } = await supabase
      .from('detalle_compra')
      .select(
        `
        id,
        erogacion_id,
        producto_id,
        concepto,
        cantidad,
        precio_unitario,
        importe,
        forma_pago_id,
        documento,
        productos ( id, nombre, sku, unidad, control_inventario )
      `
      )
      .in('erogacion_id', ids)
      .order('id', { ascending: true })

    if (detErr) {
      console.error('Error cargando detalles', detErr)
      return
    }

    const grouped: { [k: number]: any[] } = {}
    for (const row of detAll || []) {
      const key = row.erogacion_id as number
      if (!grouped[key]) grouped[key] = []
      // normaliza números para evitar strings raros
      grouped[key].push({
        ...row,
        cantidad: row.cantidad ?? 0,
        precio_unitario: row.precio_unitario ?? 0,
        importe: row.importe ?? Number(row.cantidad || 0) * Number(row.precio_unitario || 0),
      })
    }
    setDetalles(grouped)
  }

  /* ────────── edición in-place cabecera ───────────── */
  const handleInputChange = (id: number, field: string, val: any) => {
    // NOTA: total (cantidad) ya no se edita manualmente, se recalcula por detalles
    setErogaciones(prev => prev.map(e => (e.id === id ? { ...e, [field]: val } : e)))
  }

  const guardarCambios = async (erog: any) => {
    const { error } = await supabase
      .from('erogaciones')
      .update({
        fecha: erog.fecha,
        observaciones: erog.observaciones,
        empresa_id: erog.empresa_id,
        division_id: erog.division_id,
        categoria_id: erog.categoria_id,
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      })
      .eq('id', erog.id)

    if (error) {
      alert('Error al guardar')
      console.error(error)
    } else {
      alert('Guardado')
      cargarDatos()
    }
  }

  /* ───────────── eliminar con dependencias ─────────────
     Orden: inventario_movimientos -> detalle_compra -> erogaciones
  */
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar la erogación y sus detalles?')) return

    // 1) obtener ids de detalle_compra de esa erogación
    const { data: det, error: detSelErr } = await supabase.from('detalle_compra').select('id').eq('erogacion_id', id)

    if (detSelErr) {
      alert('No se pudo preparar la eliminación (detalle)')
      console.error(detSelErr)
      return
    }

    const detalleIds = (det || []).map(d => d.id)

    // 2) borrar movimientos de inventario ligados a esos detalles
    if (detalleIds.length > 0) {
      const { error: invErr } = await supabase.from('inventario_movimientos').delete().in('erogacion_detalle_id', detalleIds)

      if (invErr) {
        alert('No se pudieron borrar movimientos de inventario')
        console.error(invErr)
        return
      }
    }

    // 3) borrar detalle_compra
    const { error: delDetErr } = await supabase.from('detalle_compra').delete().eq('erogacion_id', id)

    if (delDetErr) {
      alert('No se pudieron borrar los detalles')
      console.error(delDetErr)
      return
    }

    // 4) borrar la erogación
    const { error: delEroErr } = await supabase.from('erogaciones').delete().eq('id', id)

    if (delEroErr) {
      alert('No se pudo borrar la erogación')
      console.error(delEroErr)
      return
    }

    alert('Erogación eliminada')
    cargarDatos()
  }

  /* ───────────── util ───────────── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  const getMetodoPago = (id: number | null | undefined) => {
    if (!id) return '—'
    return formasPago.find(f => f.id === id)?.metodo || String(id)
  }

  const toNum = (v: any) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const calcTotalErogacion = (erogId: number, detMap: { [k: number]: any[] }) => {
    const rows = detMap[erogId] || []
    return rows.reduce((acc, r) => acc + toNum(r.importe), 0)
  }

  /* ───────────── edición detalle_compra ───────────── */
  const handleDetalleChange = (erogId: number, detalleId: number, field: string, value: any) => {
    setDetalles(prev => {
      const copy = { ...prev }
      const rows = [...(copy[erogId] || [])]
      const idx = rows.findIndex(r => r.id === detalleId)
      if (idx === -1) return prev

      const row = { ...rows[idx] }

      if (field === 'cantidad') row.cantidad = toNum(value)
      else if (field === 'precio_unitario') row.precio_unitario = toNum(value)
      else if (field === 'forma_pago_id') row.forma_pago_id = value === '' ? null : toNum(value)
      else row[field] = value

      // recalcular importe siempre que cambie cantidad/precio
      row.importe = toNum(row.cantidad) * toNum(row.precio_unitario)

      rows[idx] = row
      copy[erogId] = rows
      return copy
    })
  }

  const guardarDetalle = async (erogId: number, detalle: any) => {
    setSavingDetalleId(detalle.id)
    try {
      const cantidad = toNum(detalle.cantidad)
      const precio_unitario = toNum(detalle.precio_unitario)
      const importe = cantidad * precio_unitario
      const forma_pago_id = detalle.forma_pago_id === '' ? null : detalle.forma_pago_id

      const { error: updErr } = await supabase
        .from('detalle_compra')
        .update({
          cantidad,
          precio_unitario,
          importe,
          forma_pago_id,
        })
        .eq('id', detalle.id)

      if (updErr) {
        alert('Error guardando detalle')
        console.error(updErr)
        return
      }

      // recalcular total y actualizar erogaciones.cantidad
      setDetalles(prev => {
        const copy = { ...prev }
        const rows = [...(copy[erogId] || [])]
        const idx = rows.findIndex(r => r.id === detalle.id)
        if (idx !== -1) {
          rows[idx] = { ...rows[idx], cantidad, precio_unitario, importe, forma_pago_id }
          copy[erogId] = rows
        }
        return copy
      })

      // usa el estado más reciente (post-update) para el total
      const nextTotal = (() => {
        const rows = (detalles[erogId] || []).map(r =>
          r.id === detalle.id ? { ...r, cantidad, precio_unitario, importe, forma_pago_id } : r
        )
        return rows.reduce((acc, r) => acc + toNum(r.importe), 0)
      })()

      const { error: updEroErr } = await supabase
        .from('erogaciones')
        .update({
          cantidad: nextTotal,
          editado_por: userEmail,
          editado_en: new Date().toISOString(),
        })
        .eq('id', erogId)

      if (updEroErr) {
        alert('Detalle guardado, pero falló actualizar el total')
        console.error(updEroErr)
      }

      // actualizar total en UI
      setErogaciones(prev => prev.map(e => (e.id === erogId ? { ...e, cantidad: nextTotal } : e)))
    } finally {
      setSavingDetalleId(null)
    }
  }

  /* ─────────────────────── UI ─────────────────────── */
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">📋 Erogaciones Registradas</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-6">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>

        <select name="categoria_id" value={filtros.categoria_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input
          type="text"
          name="proveedor_nombre"
          placeholder="Proveedor"
          value={filtros.proveedor_nombre}
          onChange={handleChange}
          className="border p-2"
        />
        <input
          type="text"
          name="proveedor_nit"
          placeholder="NIT"
          value={filtros.proveedor_nit}
          onChange={handleChange}
          className="border p-2"
        />

        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>
        <button onClick={() => (window.location.href = '/menu')} className="ml-4 bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </button>
      </div>

      {/* Tabla principal */}
      <table className="w-full border text-sm text-left mb-8">
        <thead className="bg-gray-200">
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Empresa</th>
            <th>División</th>
            <th>Categoría</th>
            <th>Proveedor</th>
            <th>NIT</th>
            <th>Total</th>
            <th>Observaciones</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {erogaciones.map(e => (
            <tr key={e.id} className="border-t">
              <td className="p-2">{e.id}</td>

              <td className="p-2">
                <input
                  type="date"
                  className="border p-1"
                  value={e.fecha}
                  onChange={ev => handleInputChange(e.id, 'fecha', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <select className="border p-1" value={e.empresa_id} onChange={ev => handleInputChange(e.id, 'empresa_id', ev.target.value)}>
                  {empresas.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">
                <select className="border p-1" value={e.division_id} onChange={ev => handleInputChange(e.id, 'division_id', ev.target.value)}>
                  {divisiones.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">
                <select className="border p-1" value={e.categoria_id} onChange={ev => handleInputChange(e.id, 'categoria_id', ev.target.value)}>
                  {categorias.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">{e.proveedores?.nombre || '—'}</td>
              <td className="p-2">{e.proveedores?.nit || '—'}</td>

              {/* Total SOLO LECTURA: se recalcula por los detalles */}
              <td className="p-2">
                <input type="number" className="border p-1 w-24 bg-gray-100" value={toNum(e.cantidad)} readOnly />
              </td>

              <td className="p-2">
                <input className="border p-1 w-full" value={e.observaciones || ''} onChange={ev => handleInputChange(e.id, 'observaciones', ev.target.value)} />
              </td>

              <td className="p-2 space-x-1">
                <button onClick={() => guardarCambios(e)} className="bg-green-600 text-white px-2 py-1 rounded text-xs">
                  Guardar
                </button>
                <button onClick={() => handleDelete(e.id)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detalles */}
      {erogaciones.map(e => (
        <div key={`det-${e.id}`} className="mb-6 border p-3 rounded bg-gray-50">
          <h3 className="font-semibold mb-2">🧾 Detalles de Erogación #{e.id}</h3>

          <table className="w-full text-sm border">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-left">Concepto</th>
                <th className="p-2 text-left">Cantidad</th>
                <th className="p-2 text-left">Precio Unit.</th>
                <th className="p-2 text-left">Importe</th>
                <th className="p-2 text-left">Pago</th>
                <th className="p-2 text-left">Documento</th>
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {(detalles[e.id] || []).map((d: any) => {
                const prod = d.productos
                const invBadge =
                  d.producto_id && prod?.control_inventario ? (
                    <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">inv</span>
                  ) : null

                return (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">
                      {d.producto_id ? (
                        <div>
                          <div className="font-medium">
                            {prod?.nombre || 'Producto'}
                            {invBadge}
                          </div>
                          <div className="text-xs text-gray-600">
                            {(prod?.sku ? `SKU: ${prod.sku}` : '') +
                              (prod?.sku && prod?.unidad ? ' · ' : '') +
                              (prod?.unidad ? `Unidad: ${prod.unidad}` : '')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="p-2">{d.concepto}</td>

                    {/* EDITABLE: cantidad */}
                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-24"
                        value={toNum(d.cantidad)}
                        onChange={ev => handleDetalleChange(e.id, d.id, 'cantidad', ev.target.value)}
                      />
                    </td>

                    {/* EDITABLE: precio unitario */}
                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-28"
                        value={toNum(d.precio_unitario)}
                        onChange={ev => handleDetalleChange(e.id, d.id, 'precio_unitario', ev.target.value)}
                      />
                    </td>

                    {/* importe calculado */}
                    <td className="p-2">Q{toNum(d.importe).toFixed(2)}</td>

                    {/* EDITABLE: forma pago */}
                    <td className="p-2">
                      <select
                        className="border p-1"
                        value={d.forma_pago_id ?? ''}
                        onChange={ev => handleDetalleChange(e.id, d.id, 'forma_pago_id', ev.target.value)}
                      >
                        <option value="">—</option>
                        {formasPago.map((fp: any) => (
                          <option key={fp.id} value={fp.id}>
                            {fp.metodo}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">{d.documento || '—'}</td>

                    <td className="p-2">
                      <button
                        onClick={() => guardarDetalle(e.id, d)}
                        disabled={savingDetalleId === d.id}
                        className={`px-2 py-1 rounded text-xs text-white ${
                          savingDetalleId === d.id ? 'bg-gray-500' : 'bg-green-600'
                        }`}
                      >
                        {savingDetalleId === d.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
