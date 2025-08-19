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

export default function VerErogaciones() {
  /* ────────────────────────────── state ────────────────────────────── */
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [k: number]: any[] }>({})

  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])

  const [userEmail, setUserEmail] = useState('')

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

  /* ─────────────────────────── cargar catálogos ─────────────────────────── */
  useEffect(() => {
    cargarOpciones()
    cargarDatos()
  }, [])

  const cargarOpciones = async () => {
    const [empresas, divisiones, categorias, formasPago] = await Promise.all([
      supabase.from('empresas').select('*'),
      supabase.from('divisiones').select('*'),
      supabase.from('categorias').select('*'),
      supabase.from('forma_pago').select('*'),
    ])
    setEmpresas(empresas.data || [])
    setDivisiones(divisiones.data || [])
    setCategorias(categorias.data || [])
    setFormasPago(formasPago.data || [])

    const { data } = await supabase.auth.getUser()
    setUserEmail(data?.user?.email || '')
  }

  /* ────────────────────────────── cargar datos ───────────────────────────── */
  const cargarDatos = async () => {
    let query = supabase
      .from('erogaciones')
      .select(`
        id, fecha, cantidad, observaciones,
        empresa_id, division_id, categoria_id, proveedor_id,
        empresas(nombre), divisiones(nombre), categorias(nombre),
        proveedores(nombre, nit)
      `)
      .order('fecha', { ascending: false })

    // filtros básicos
    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    // filtros por proveedor
    if (filtros.proveedor_nombre)
      query = query.ilike('proveedores.nombre', `%${filtros.proveedor_nombre.trim()}%`)
    if (filtros.proveedor_nit)
      query = query.ilike('proveedores.nit', `%${filtros.proveedor_nit.trim()}%`)

    const { data, error } = await query
    if (error) {
      console.error(error)
      return
    }

    setErogaciones(data || [])

    // ── Detalles: un solo query para todas las erogaciones ──
    const ids = (data || []).map((e: any) => e.id)
    if (ids.length === 0) {
      setDetalles({})
      return
    }

    // Trae el producto (si lo hay) para cada línea
    const { data: detAll, error: detErr } = await supabase
      .from('detalle_compra')
      .select(
        `
        erogacion_id,
        producto_id,
        concepto,
        cantidad,
        precio_unitario,
        importe,
        forma_pago_id,
        documento,
        productos(id, nombre, sku, unidad, control_inventario)
      `
      )
      .in('erogacion_id', ids)

    if (detErr) {
      console.error(detErr)
      return
    }

    // Agrupar por erogacion_id
    const grouped: { [k: number]: any[] } = {}
    for (const row of detAll || []) {
      const key = row.erogacion_id as number
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(row)
    }
    setDetalles(grouped)
  }

  /* ──────────────────────────── edición in-place ─────────────────────────── */
  const handleInputChange = (id: number, field: string, val: any) => {
    setErogaciones((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: field === 'cantidad' ? parseFloat(val) : val } : e))
    )
  }

  const guardarCambios = async (erog: any) => {
    const { error } = await supabase
      .from('erogaciones')
      .update({
        fecha: erog.fecha,
        cantidad: erog.cantidad,
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
    } else {
      alert('Guardado')
      cargarDatos()
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar la erogación?')) return
    await supabase.from('erogaciones').delete().eq('id', id)
    cargarDatos()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  const getMetodoPago = (id: number) => formasPago.find((f) => f.id === id)?.metodo || id

  /* ─────────────────────────────── render ─────────────────────────────── */
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
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
        <select name="categoria_id" value={filtros.categoria_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Categorías</option>
          {categorias.map((c) => (
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
        <button
          onClick={() => (window.location.href = '/menu')}
          className="ml-4 bg-gray-700 text-white px-4 py-2 rounded"
        >
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
          {erogaciones.map((e) => (
            <tr key={e.id} className="border-t">
              <td className="p-2">{e.id}</td>

              {/* Fecha editable */}
              <td className="p-2">
                <input
                  type="date"
                  className="border p-1"
                  value={e.fecha}
                  onChange={(ev) => handleInputChange(e.id, 'fecha', ev.target.value)}
                />
              </td>

              {/* Empresa editable */}
              <td className="p-2">
                <select
                  className="border p-1"
                  value={e.empresa_id}
                  onChange={(ev) => handleInputChange(e.id, 'empresa_id', ev.target.value)}
                >
                  {empresas.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              {/* División editable */}
              <td className="p-2">
                <select
                  className="border p-1"
                  value={e.division_id}
                  onChange={(ev) => handleInputChange(e.id, 'division_id', ev.target.value)}
                >
                  {divisiones.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              {/* Categoría editable */}
              <td className="p-2">
                <select
                  className="border p-1"
                  value={e.categoria_id}
                  onChange={(ev) => handleInputChange(e.id, 'categoria_id', ev.target.value)}
                >
                  {categorias.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              {/* Proveedor: sólo lectura */}
              <td className="p-2">{e.proveedores?.nombre || '–'}</td>
              <td className="p-2">{e.proveedores?.nit || '–'}</td>

              {/* Total editable */}
              <td className="p-2">
                <input
                  type="number"
                  className="border p-1 w-24"
                  value={e.cantidad}
                  onChange={(ev) => handleInputChange(e.id, 'cantidad', ev.target.value)}
                />
              </td>

              {/* Observaciones editable */}
              <td className="p-2">
                <input
                  className="border p-1"
                  value={e.observaciones}
                  onChange={(ev) => handleInputChange(e.id, 'observaciones', ev.target.value)}
                />
              </td>

              {/* Botones */}
              <td className="p-2 space-x-1">
                <button
                  onClick={() => guardarCambios(e)}
                  className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                >
                  Guardar
                </button>
                <button
                  onClick={() => handleDelete(e.id)}
                  className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detalle de cada erogación (ahora mostrando producto si aplica) */}
      {erogaciones.map((e) => (
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
              </tr>
            </thead>
            <tbody>
              {(detalles[e.id] || []).map((d: any, i: number) => {
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
