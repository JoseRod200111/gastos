'use client'

import { useEffect, useState } from 'react'
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

type Catalogo = {
  id: number
  nombre: string
}

type FormaPago = {
  id: number
  metodo: string
}

type Producto = {
  id: number
  nombre: string
  sku: string | null
  unidad: string | null
  control_inventario: boolean | null
}

type DetalleCompra = {
  id: number
  erogacion_id: number
  producto_id: number | null
  concepto: string
  cantidad: number
  precio_unitario: number
  forma_pago_id: number | null
  documento: string | null
  productos?: Producto | null
}

export default function VerErogaciones() {
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [k: number]: DetalleCompra[] }>({})

  const [empresas, setEmpresas] = useState<Catalogo[]>([])
  const [divisiones, setDivisiones] = useState<Catalogo[]>([])
  const [categorias, setCategorias] = useState<Catalogo[]>([])
  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  const [userEmail, setUserEmail] = useState('')
  const [savingDetalleId, setSavingDetalleId] = useState<number | null>(null)
  const [deletingDetalleId, setDeletingDetalleId] = useState<number | null>(null)

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

  const toNum = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const calcImporte = (cantidad: unknown, precio: unknown) => {
    return toNum(cantidad) * toNum(precio)
  }

  const calcTotalFromRows = (rows: DetalleCompra[]) => {
    return rows.reduce(
      (acc, r) => acc + calcImporte(r.cantidad, r.precio_unitario),
      0
    )
  }

  const productoSeleccionado = (productoId: number | null) => {
    if (!productoId) return null
    return productos.find((p) => Number(p.id) === Number(productoId)) || null
  }

  const showSupabaseError = (title: string, err: any) => {
    const msg = err?.message || err?.error_description || 'Error desconocido'
    const details = err?.details ? `\n${err.details}` : ''
    const hint = err?.hint ? `\n${err.hint}` : ''
    alert(`${title}\n${msg}${details}${hint}`)
    console.error(title, err)
  }

  useEffect(() => {
    ;(async () => {
      const [emp, div, cat, fp, prod] = await Promise.all([
        supabase.from('empresas').select('id,nombre').order('nombre', { ascending: true }),
        supabase.from('divisiones').select('id,nombre').order('nombre', { ascending: true }),
        supabase.from('categorias').select('id,nombre').order('nombre', { ascending: true }),
        supabase.from('forma_pago').select('id,metodo').order('metodo', { ascending: true }),
        supabase
          .from('productos')
          .select('id,nombre,sku,unidad,control_inventario')
          .order('nombre', { ascending: true }),
      ])

      if (emp.error) showSupabaseError('Error cargando empresas', emp.error)
      if (div.error) showSupabaseError('Error cargando divisiones', div.error)
      if (cat.error) showSupabaseError('Error cargando categorías', cat.error)
      if (fp.error) showSupabaseError('Error cargando formas de pago', fp.error)
      if (prod.error) showSupabaseError('Error cargando productos', prod.error)

      setEmpresas((emp.data || []) as Catalogo[])
      setDivisiones((div.data || []) as Catalogo[])
      setCategorias((cat.data || []) as Catalogo[])
      setFormasPago((fp.data || []) as FormaPago[])
      setProductos((prod.data || []) as Producto[])

      const { data } = await supabase.auth.getUser()
      setUserEmail(data?.user?.email || '')
    })()

    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      .order('id', { ascending: false })

    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    if (filtros.proveedor_nombre) {
      query = query.ilike('proveedores.nombre', `%${filtros.proveedor_nombre.trim()}%`)
    }

    if (filtros.proveedor_nit) {
      query = query.ilike('proveedores.nit', `%${filtros.proveedor_nit.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      showSupabaseError('Error cargando erogaciones', error)
      return
    }

    setErogaciones(data || [])

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
        forma_pago_id,
        documento,
        productos ( id, nombre, sku, unidad, control_inventario )
      `
      )
      .in('erogacion_id', ids)
      .order('id', { ascending: true })

    if (detErr) {
      showSupabaseError('Error cargando detalles', detErr)
      return
    }

    const grouped: { [k: number]: DetalleCompra[] } = {}

    for (const row of detAll || []) {
      const key = Number(row.erogacion_id)

      if (!grouped[key]) grouped[key] = []

      grouped[key].push({
        ...(row as unknown as DetalleCompra),
        erogacion_id: key,
        producto_id: row.producto_id === null ? null : Number(row.producto_id),
        cantidad: toNum(row.cantidad),
        precio_unitario: toNum(row.precio_unitario),
        forma_pago_id: row.forma_pago_id === null ? null : Number(row.forma_pago_id),
      })
    }

    setDetalles(grouped)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  const handleInputChange = (id: number, field: string, val: unknown) => {
    setErogaciones((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: val } : e))
    )
  }

  const guardarCambiosCabecera = async (erog: any) => {
    const { error } = await supabase
      .from('erogaciones')
      .update({
        fecha: erog.fecha,
        observaciones: erog.observaciones || null,
        empresa_id: erog.empresa_id ? Number(erog.empresa_id) : null,
        division_id: erog.division_id ? Number(erog.division_id) : null,
        categoria_id: erog.categoria_id ? Number(erog.categoria_id) : null,
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      })
      .eq('id', erog.id)

    if (error) {
      showSupabaseError('Error al guardar cabecera', error)
      return
    }

    alert('Cabecera guardada')
    cargarDatos()
  }

  const recalcularTotalErogacion = async (erogId: number, rows?: DetalleCompra[]) => {
    const filas = rows ?? detalles[erogId] ?? []
    const nextTotal = calcTotalFromRows(filas)

    const { error } = await supabase
      .from('erogaciones')
      .update({
        cantidad: nextTotal,
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      })
      .eq('id', erogId)

    if (error) {
      showSupabaseError('Falló actualizar el total de la erogación', error)
      return null
    }

    setErogaciones((prev) =>
      prev.map((e) => (Number(e.id) === Number(erogId) ? { ...e, cantidad: nextTotal } : e))
    )

    return nextTotal
  }

  const sincronizarMovimientoInventario = async (detalle: DetalleCompra) => {
    const producto = productoSeleccionado(detalle.producto_id)
    const usaInventario = Boolean(detalle.producto_id && producto?.control_inventario)

    if (!usaInventario) {
      const { error } = await supabase
        .from('inventario_movimientos')
        .delete()
        .eq('erogacion_detalle_id', detalle.id)

      if (error) {
        showSupabaseError('Detalle guardado, pero falló limpiar inventario', error)
      }

      return
    }

    const { data: existentes, error: selErr } = await supabase
      .from('inventario_movimientos')
      .select('id')
      .eq('erogacion_detalle_id', detalle.id)
      .limit(1)

    if (selErr) {
      showSupabaseError('Detalle guardado, pero falló revisar inventario', selErr)
      return
    }

    const payload = {
      producto_id: Number(detalle.producto_id),
      tipo: 'ENTRADA',
      cantidad: toNum(detalle.cantidad),
      erogacion_detalle_id: detalle.id,
      observaciones: `Erogación #${detalle.erogacion_id} - ${detalle.concepto || 'Sin concepto'}`,
    }

    if (existentes && existentes.length > 0) {
      const { error: updErr } = await supabase
        .from('inventario_movimientos')
        .update(payload)
        .eq('id', existentes[0].id)

      if (updErr) {
        showSupabaseError('Detalle guardado, pero falló actualizar inventario', updErr)
      }

      return
    }

    const { error: insErr } = await supabase
      .from('inventario_movimientos')
      .insert(payload)

    if (insErr) {
      showSupabaseError('Detalle guardado, pero falló crear movimiento de inventario', insErr)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar la erogación y sus detalles?')) return

    const { data: det, error: detSelErr } = await supabase
      .from('detalle_compra')
      .select('id')
      .eq('erogacion_id', id)

    if (detSelErr) {
      showSupabaseError('No se pudo preparar la eliminación de detalles', detSelErr)
      return
    }

    const detalleIds = (det || []).map((d) => d.id)

    if (detalleIds.length > 0) {
      const { error: invErr } = await supabase
        .from('inventario_movimientos')
        .delete()
        .in('erogacion_detalle_id', detalleIds)

      if (invErr) {
        showSupabaseError('No se pudieron borrar movimientos de inventario', invErr)
        return
      }
    }

    const { error: delDetErr } = await supabase
      .from('detalle_compra')
      .delete()
      .eq('erogacion_id', id)

    if (delDetErr) {
      showSupabaseError('No se pudieron borrar los detalles', delDetErr)
      return
    }

    const { error: delEroErr } = await supabase
      .from('erogaciones')
      .delete()
      .eq('id', id)

    if (delEroErr) {
      showSupabaseError('No se pudo borrar la erogación', delEroErr)
      return
    }

    alert('Erogación eliminada')
    cargarDatos()
  }

  const handleDetalleChange = (
    erogId: number,
    detalleId: number,
    field: keyof DetalleCompra,
    value: string
  ) => {
    setDetalles((prev) => {
      const copy = { ...prev }
      const rows = [...(copy[erogId] || [])]
      const idx = rows.findIndex((r) => r.id === detalleId)

      if (idx === -1) return prev

      const row = { ...rows[idx] }

      if (field === 'cantidad') row.cantidad = toNum(value)
      else if (field === 'precio_unitario') row.precio_unitario = toNum(value)
      else if (field === 'forma_pago_id') row.forma_pago_id = value === '' ? null : toNum(value)
      else if (field === 'producto_id') {
        const productoId = value === '' ? null : toNum(value)
        const producto = productoSeleccionado(productoId)

        row.producto_id = productoId
        row.productos = producto
      } else if (field === 'documento') row.documento = value || null
      else if (field === 'concepto') row.concepto = value

      rows[idx] = row
      copy[erogId] = rows

      return copy
    })
  }

  const guardarDetalle = async (erogId: number, detalle: DetalleCompra) => {
    if (!detalle.concepto || !detalle.concepto.trim()) {
      alert('El concepto no puede quedar vacío.')
      return
    }

    if (toNum(detalle.cantidad) <= 0) {
      alert('La cantidad debe ser mayor que 0.')
      return
    }

    if (toNum(detalle.precio_unitario) < 0) {
      alert('El precio unitario no puede ser negativo.')
      return
    }

    setSavingDetalleId(detalle.id)

    try {
      const limpio: DetalleCompra = {
        ...detalle,
        producto_id: detalle.producto_id ? Number(detalle.producto_id) : null,
        concepto: detalle.concepto.trim(),
        cantidad: toNum(detalle.cantidad),
        precio_unitario: toNum(detalle.precio_unitario),
        forma_pago_id: detalle.forma_pago_id ? Number(detalle.forma_pago_id) : null,
        documento: detalle.documento?.trim() ? detalle.documento.trim() : null,
      }

      const { error: updErr } = await supabase
        .from('detalle_compra')
        .update({
          producto_id: limpio.producto_id,
          concepto: limpio.concepto,
          cantidad: limpio.cantidad,
          precio_unitario: limpio.precio_unitario,
          forma_pago_id: limpio.forma_pago_id,
          documento: limpio.documento,
        })
        .eq('id', limpio.id)

      if (updErr) {
        showSupabaseError('Error guardando detalle', updErr)
        return
      }

      let rowsActualizadas: DetalleCompra[] = []

      setDetalles((prev) => {
        const copy = { ...prev }
        const rows = [...(copy[erogId] || [])]
        const idx = rows.findIndex((r) => r.id === limpio.id)

        if (idx !== -1) {
          rows[idx] = {
            ...rows[idx],
            ...limpio,
            productos: productoSeleccionado(limpio.producto_id),
          }
        }

        rowsActualizadas = rows
        copy[erogId] = rows

        return copy
      })

      await recalcularTotalErogacion(erogId, rowsActualizadas)
      await sincronizarMovimientoInventario(limpio)

      alert('Detalle guardado')
    } finally {
      setSavingDetalleId(null)
    }
  }

  const eliminarDetalle = async (erogId: number, detalle: DetalleCompra) => {
    if (!confirm(`¿Eliminar este detalle?\n\n${detalle.concepto}\nQ${calcImporte(detalle.cantidad, detalle.precio_unitario).toFixed(2)}`)) {
      return
    }

    setDeletingDetalleId(detalle.id)

    try {
      const { error: invErr } = await supabase
        .from('inventario_movimientos')
        .delete()
        .eq('erogacion_detalle_id', detalle.id)

      if (invErr) {
        showSupabaseError('No se pudo borrar el movimiento de inventario del detalle', invErr)
        return
      }

      const { error: delErr } = await supabase
        .from('detalle_compra')
        .delete()
        .eq('id', detalle.id)

      if (delErr) {
        showSupabaseError('No se pudo eliminar el detalle', delErr)
        return
      }

      const rowsActualizadas = (detalles[erogId] || []).filter(
        (d) => Number(d.id) !== Number(detalle.id)
      )

      setDetalles((prev) => ({
        ...prev,
        [erogId]: rowsActualizadas,
      }))

      await recalcularTotalErogacion(erogId, rowsActualizadas)

      alert('Detalle eliminado')
    } finally {
      setDeletingDetalleId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">📋 Erogaciones Registradas</h1>

      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-6">
        <select
          name="empresa_id"
          value={filtros.empresa_id}
          onChange={handleChange}
          className="border p-2"
        >
          <option value="">Todas las Empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>

        <select
          name="division_id"
          value={filtros.division_id}
          onChange={handleChange}
          className="border p-2"
        >
          <option value="">Todas las Divisiones</option>
          {divisiones.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>

        <select
          name="categoria_id"
          value={filtros.categoria_id}
          onChange={handleChange}
          className="border p-2"
        >
          <option value="">Todas las Categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="desde"
          value={filtros.desde}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="date"
          name="hasta"
          value={filtros.hasta}
          onChange={handleChange}
          className="border p-2"
        />

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

        <input
          type="text"
          name="id"
          placeholder="ID"
          value={filtros.id}
          onChange={handleChange}
          className="border p-2"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={cargarDatos}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          🔍 Aplicar Filtros
        </button>

        <button
          type="button"
          onClick={() => (window.location.href = '/menu')}
          className="bg-gray-700 text-white px-4 py-2 rounded"
        >
          ⬅ Volver al Menú Principal
        </button>
      </div>

      <table className="w-full border text-sm text-left mb-8">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2">ID</th>
            <th className="p-2">Fecha</th>
            <th className="p-2">Empresa</th>
            <th className="p-2">División</th>
            <th className="p-2">Categoría</th>
            <th className="p-2">Proveedor</th>
            <th className="p-2">NIT</th>
            <th className="p-2">Total</th>
            <th className="p-2">Observaciones</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {erogaciones.map((e) => (
            <tr key={e.id} className="border-t align-top">
              <td className="p-2">{e.id}</td>

              <td className="p-2">
                <input
                  type="date"
                  className="border p-1"
                  value={e.fecha || ''}
                  onChange={(ev) => handleInputChange(e.id, 'fecha', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <select
                  className="border p-1 max-w-[220px]"
                  value={e.empresa_id || ''}
                  onChange={(ev) => handleInputChange(e.id, 'empresa_id', ev.target.value)}
                >
                  <option value="">—</option>
                  {empresas.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">
                <select
                  className="border p-1 max-w-[180px]"
                  value={e.division_id || ''}
                  onChange={(ev) => handleInputChange(e.id, 'division_id', ev.target.value)}
                >
                  <option value="">—</option>
                  {divisiones.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">
                <select
                  className="border p-1 max-w-[180px]"
                  value={e.categoria_id || ''}
                  onChange={(ev) => handleInputChange(e.id, 'categoria_id', ev.target.value)}
                >
                  <option value="">—</option>
                  {categorias.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">{e.proveedores?.nombre || '—'}</td>
              <td className="p-2">{e.proveedores?.nit || '—'}</td>

              <td className="p-2">
                <input
                  type="number"
                  className="border p-1 w-24 bg-gray-100"
                  value={toNum(e.cantidad)}
                  readOnly
                />
              </td>

              <td className="p-2">
                <input
                  className="border p-1 w-full min-w-[180px]"
                  value={e.observaciones || ''}
                  onChange={(ev) => handleInputChange(e.id, 'observaciones', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => guardarCambiosCabecera(e)}
                    className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                  >
                    Guardar
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {erogaciones.map((e) => (
        <div key={`det-${e.id}`} className="mb-6 border p-3 rounded bg-gray-50">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold">🧾 Detalles de Erogación #{e.id}</h3>
            <span className="text-sm text-gray-600">
              Total detalle: Q{calcTotalFromRows(detalles[e.id] || []).toFixed(2)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border min-w-[1120px]">
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
                {(detalles[e.id] || []).map((d) => {
                  const prod = productoSeleccionado(d.producto_id) || d.productos
                  const invBadge =
                    d.producto_id && prod?.control_inventario ? (
                      <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                        inv
                      </span>
                    ) : null

                  const importeUI = calcImporte(d.cantidad, d.precio_unitario)

                  return (
                    <tr key={d.id} className="border-t align-top">
                      <td className="p-2 min-w-[260px]">
                        <select
                          className="border p-1 w-full"
                          value={d.producto_id || ''}
                          onChange={(ev) =>
                            handleDetalleChange(e.id, d.id, 'producto_id', ev.target.value)
                          }
                        >
                          <option value="">— Sin producto —</option>
                          {productos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>

                        <div className="mt-1 text-xs text-gray-600">
                          {prod ? (
                            <>
                              {(prod.sku ? `SKU: ${prod.sku}` : 'SKU: —') +
                                ' · ' +
                                (prod.unidad ? `Unidad: ${prod.unidad}` : 'Unidad: —')}
                              {invBadge}
                            </>
                          ) : (
                            'Sin producto relacionado'
                          )}
                        </div>
                      </td>

                      <td className="p-2 min-w-[260px]">
                        <textarea
                          className="border p-1 w-full min-h-[44px]"
                          value={d.concepto || ''}
                          onChange={(ev) =>
                            handleDetalleChange(e.id, d.id, 'concepto', ev.target.value)
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          className="border p-1 w-24"
                          value={toNum(d.cantidad)}
                          onChange={(ev) =>
                            handleDetalleChange(e.id, d.id, 'cantidad', ev.target.value)
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          className="border p-1 w-28"
                          value={toNum(d.precio_unitario)}
                          onChange={(ev) =>
                            handleDetalleChange(e.id, d.id, 'precio_unitario', ev.target.value)
                          }
                        />
                      </td>

                      <td className="p-2 whitespace-nowrap">Q{importeUI.toFixed(2)}</td>

                      <td className="p-2 min-w-[180px]">
                        <select
                          className="border p-1 w-full"
                          value={d.forma_pago_id ?? ''}
                          onChange={(ev) =>
                            handleDetalleChange(e.id, d.id, 'forma_pago_id', ev.target.value)
                          }
                        >
                          <option value="">—</option>
                          {formasPago.map((fp) => (
                            <option key={fp.id} value={fp.id}>
                              {fp.metodo}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2 min-w-[160px]">
                        <input
                          className="border p-1 w-full"
                          value={d.documento || ''}
                          placeholder="Documento"
                          onChange={(ev) =>
                            handleDetalleChange(e.id, d.id, 'documento', ev.target.value)
                          }
                        />
                      </td>

                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => guardarDetalle(e.id, d)}
                            disabled={savingDetalleId === d.id || deletingDetalleId === d.id}
                            className={`px-2 py-1 rounded text-xs text-white ${
                              savingDetalleId === d.id ? 'bg-gray-500' : 'bg-green-600'
                            }`}
                          >
                            {savingDetalleId === d.id ? 'Guardando...' : 'Guardar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => eliminarDetalle(e.id, d)}
                            disabled={savingDetalleId === d.id || deletingDetalleId === d.id}
                            className={`px-2 py-1 rounded text-xs text-white ${
                              deletingDetalleId === d.id ? 'bg-gray-500' : 'bg-red-600'
                            }`}
                          >
                            {deletingDetalleId === d.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {(detalles[e.id] || []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-3 text-gray-500">
                      Esta erogación no tiene detalles.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
