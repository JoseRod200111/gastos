'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Filtros = {
  empresa_id: string
  division_id: string
  desde: string
  hasta: string
  id: string
  cliente_nombre: string
  cliente_nit: string
}

export default function VerVentas() {
  /* ───────────────────────── state ───────────────────────── */
  const [ventas, setVentas] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [k: number]: any[] }>({})

  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])

  const [userEmail, setUserEmail] = useState('')

  const [filtros, setFiltros] = useState<Filtros>({
    empresa_id: '',
    division_id: '',
    desde: '',
    hasta: '',
    id: '',
    cliente_nombre: '',
    cliente_nit: '',
  })

  /* ─────────────────────── catálogos ─────────────────────── */
  useEffect(() => {
    ;(async () => {
      const [emp, div, fp] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('forma_pago').select('*'),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setFormasPago(fp.data || [])

      const { data } = await supabase.auth.getUser()
      setUserEmail(data?.user?.email || '')
    })()

    cargarDatos()
  }, [])

  /* ─────────────────────── datos ─────────────────────── */
  const cargarDatos = async () => {
    let query = supabase
      .from('ventas')
      .select(
        `
        id, fecha, total, observaciones,
        empresa_id, division_id, cliente_id,
        empresas ( nombre ),
        divisiones ( nombre ),
        clientes ( nombre, nit )
      `
      )
      .order('fecha', { ascending: false })

    // filtros básicos
    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    // filtros por cliente (si RLS lo permite en relaciones)
    if (filtros.cliente_nombre)
      query = query.ilike('clientes.nombre', `%${filtros.cliente_nombre.trim()}%`)
    if (filtros.cliente_nit)
      query = query.ilike('clientes.nit', `%${filtros.cliente_nit.trim()}%`)

    const { data, error } = await query
    if (error) {
      console.error('Error cargando ventas', error)
      return
    }

    setVentas(data || [])

    // ── Detalles para todas las ventas en un solo query ──
    const ids = (data || []).map((v: any) => v.id)
    if (ids.length === 0) {
      setDetalles({})
      return
    }

    const { data: detAll, error: detErr } = await supabase
      .from('venta_detalle')
      .select(
        `
        id,
        venta_id,
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
      .in('venta_id', ids)

    if (detErr) {
      console.error('Error cargando detalles', detErr)
      return
    }

    const grouped: { [k: number]: any[] } = {}
    for (const row of detAll || []) {
      const key = row.venta_id as number
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(row)
    }
    setDetalles(grouped)
  }

  /* ───────────── edición in-place cabecera ───────────── */
  const handleInputChange = (id: number, field: string, val: any) => {
    setVentas(prev =>
      prev.map(v => (v.id === id ? { ...v, [field]: field === 'total' ? parseFloat(val) : val } : v))
    )
  }

  const guardarCambios = async (venta: any) => {
    const { error } = await supabase
      .from('ventas')
      .update({
        fecha: venta.fecha,
        total: venta.total,
        observaciones: venta.observaciones,
        empresa_id: venta.empresa_id,
        division_id: venta.division_id,
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      })
      .eq('id', venta.id)

    if (error) {
      alert('Error al guardar')
      console.error(error)
    } else {
      alert('Guardado')
      cargarDatos()
    }
  }

  /* ───────────── eliminar con dependencias ─────────────
     Orden: inventario_movimientos -> venta_detalle -> ventas
     (requiere columna venta_detalle_id en inventario_movimientos si implementaste el trigger)
  */
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar la venta y sus detalles?')) return

    // 1) obtener ids de detalle de esa venta
    const { data: det, error: detSelErr } = await supabase
      .from('venta_detalle')
      .select('id')
      .eq('venta_id', id)

    if (detSelErr) {
      alert('No se pudo preparar la eliminación (detalle)')
      console.error(detSelErr)
      return
    }

    const detalleIds = (det || []).map(d => d.id)

    // 2) borrar movimientos de inventario ligados a esos detalles (si existe la columna)
    if (detalleIds.length > 0) {
      const { error: invErr } = await supabase
        .from('inventario_movimientos')
        .delete()
        .in('venta_detalle_id', detalleIds)

      // si tu esquema aún no tiene venta_detalle_id, invErr marcará error; lo ignoramos
      if (invErr && invErr.code !== 'PGRST116') {
        console.warn('Aviso al borrar inventario_movimientos (quizá no existe venta_detalle_id):', invErr.message)
      }
    }

    // 3) borrar detalle
    const { error: delDetErr } = await supabase
      .from('venta_detalle')
      .delete()
      .eq('venta_id', id)

    if (delDetErr) {
      alert('No se pudieron borrar los detalles')
      console.error(delDetErr)
      return
    }

    // 4) borrar la venta
    const { error: delVentaErr } = await supabase
      .from('ventas')
      .delete()
      .eq('id', id)

    if (delVentaErr) {
      alert('No se pudo borrar la venta')
      console.error(delVentaErr)
      return
    }

    alert('Venta eliminada')
    cargarDatos()
  }

  /* ───────────── util ───────────── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  const getMetodoPago = (id: number) => formasPago.find(f => f.id === id)?.metodo || id

  /* ─────────────────────── UI ─────────────────────── */
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">🧾 Ventas Registradas</h1>

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

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input
          type="text"
          name="cliente_nombre"
          placeholder="Cliente"
          value={filtros.cliente_nombre}
          onChange={handleChange}
          className="border p-2"
        />
        <input
          type="text"
          name="cliente_nit"
          placeholder="NIT"
          value={filtros.cliente_nit}
          onChange={handleChange}
          className="border p-2"
        />

        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>
        <button
          onClick={() => (window.location.href = '/ventas')}
          className="ml-4 bg-gray-700 text-white px-4 py-2 rounded"
        >
          ⬅ Volver al Menú de Ventas
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
            <th>Cliente</th>
            <th>NIT</th>
            <th>Total</th>
            <th>Observaciones</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map(v => (
            <tr key={v.id} className="border-t">
              <td className="p-2">{v.id}</td>

              <td className="p-2">
                <input
                  type="date"
                  className="border p-1"
                  value={v.fecha}
                  onChange={ev => handleInputChange(v.id, 'fecha', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <select
                  className="border p-1"
                  value={v.empresa_id}
                  onChange={ev => handleInputChange(v.id, 'empresa_id', ev.target.value)}
                >
                  {empresas.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">
                <select
                  className="border p-1"
                  value={v.division_id}
                  onChange={ev => handleInputChange(v.id, 'division_id', ev.target.value)}
                >
                  {divisiones.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">{v.clientes?.nombre || '—'}</td>
              <td className="p-2">{v.clientes?.nit || '—'}</td>

              <td className="p-2">
                <input
                  type="number"
                  className="border p-1 w-24"
                  value={v.total}
                  onChange={ev => handleInputChange(v.id, 'total', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <input
                  className="border p-1"
                  value={v.observaciones || ''}
                  onChange={ev => handleInputChange(v.id, 'observaciones', ev.target.value)}
                />
              </td>

              <td className="p-2 space-x-1">
                <button onClick={() => guardarCambios(v)} className="bg-green-600 text-white px-2 py-1 rounded text-xs">
                  Guardar
                </button>
                <button onClick={() => handleDelete(v.id)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detalles */}
      {ventas.map(v => (
        <div key={`det-${v.id}`} className="mb-6 border p-3 rounded bg-gray-50">
          <h3 className="font-semibold mb-2">📦 Detalles de Venta #{v.id}</h3>
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
              </tr>
            </thead>
            <tbody>
              {(detalles[v.id] || []).map((d: any, i: number) => {
                const prod = d.productos
                const invBadge =
                  d.producto_id && prod?.control_inventario ? (
                    <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">inv</span>
                  ) : null

                return (
                  <tr key={i} className="border-t">
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
                    <td className="p-2">{d.cantidad}</td>
                    <td className="p-2">Q{Number(d.precio_unitario || 0).toFixed(2)}</td>
                    <td className="p-2">Q{Number(d.importe || 0).toFixed(2)}</td>
                    <td className="p-2">{getMetodoPago(d.forma_pago_id)}</td>
                    <td className="p-2">{d.documento || '—'}</td>
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
