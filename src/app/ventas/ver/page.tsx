'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

/* ─────────────────────── Tipos ─────────────────────── */
type Filtros = {
  empresa_id: string
  division_id: string
  desde: string
  hasta: string
  id: string
  cliente_nombre: string
  cliente_nit: string
}

type EmpresaRel = { nombre: string | null }
type DivisionRel = { nombre: string | null }
type ClienteRel = { nombre: string | null; nit: string | null }

type VentaCab = {
  id: number
  fecha: string
  cantidad: number | null
  observaciones: string | null
  empresa_id: number | null
  division_id: number | null
  cliente_id: number | null
  empresas?: EmpresaRel | null
  divisiones?: DivisionRel | null
  clientes?: ClienteRel | null
}

type Producto = {
  id: number
  nombre: string | null
  sku: string | null
  unidad: string | null
  control_inventario: boolean | null
}

type Detalle = {
  id: number
  venta_id: number
  producto_id: number | null
  concepto: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
  forma_pago_id: number | null
  documento: string | null
  productos?: Producto | null
}

/* ─────────────────────── Página ─────────────────────── */
export default function VerVentas() {
  const [ventas, setVentas] = useState<VentaCab[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
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

  const [mostrarIncompletas, setMostrarIncompletas] = useState(false)

  /* catálogos */
  useEffect(() => {
    ;(async () => {
      const [emp, div, fp, prods] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('forma_pago').select('*'),
        supabase
          .from('productos')
          .select('id,nombre,sku,unidad,control_inventario')
          .order('nombre', { ascending: true }),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setFormasPago(fp.data || [])
      setProductos((prods.data as Producto[]) || [])

      const { data } = await supabase.auth.getUser()
      setUserEmail(data?.user?.email || '')
    })()
  }, [])

  /* datos */
  const cargarDatos = useCallback(async () => {
    const usaFiltroCliente =
      Boolean(filtros.cliente_nombre?.trim()) || Boolean(filtros.cliente_nit?.trim())

    const selectCamposBasicos = `
      id, fecha, cantidad, observaciones,
      empresa_id, division_id, cliente_id,
      empresas ( nombre ),
      divisiones ( nombre )
    `.trim()

    const selectClientes = usaFiltroCliente
      ? `, clientes!inner ( nombre, nit )`
      : `, clientes ( nombre, nit )`

    const selectString = `${selectCamposBasicos}${selectClientes}`

    let query = supabase
      .from('ventas')
      .select(selectString)
      .order('fecha', { ascending: false })

    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    if (filtros.cliente_nombre?.trim()) {
      query = query.ilike('clientes.nombre', `%${filtros.cliente_nombre.trim()}%`)
    }
    if (filtros.cliente_nit?.trim()) {
      query = query.ilike('clientes.nit', `%${filtros.cliente_nit.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error cargando ventas', error)
      setVentas([])
      setDetalles({})
      return
    }

    const cabList: VentaCab[] = ((data ?? []) as any[]).map((r: any) => ({
      id: r.id,
      fecha: r.fecha,
      cantidad: r.cantidad,
      observaciones: r.observaciones,
      empresa_id: r.empresa_id,
      division_id: r.division_id,
      cliente_id: r.cliente_id,
      empresas: r.empresas ?? null,
      divisiones: r.divisiones ?? null,
      clientes: r.clientes ?? null,
    }))

    const ids = cabList.map(v => v.id)
    if (ids.length === 0) {
      setVentas([])
      setDetalles({})
      return
    }

    const { data: detAll, error: detErr } = await supabase
      .from('detalle_venta')
      .select(
        `
        id, venta_id, producto_id, concepto, cantidad,
        precio_unitario, importe, forma_pago_id, documento,
        productos ( id, nombre, sku, unidad, control_inventario )
      `
      )
      .in('venta_id', ids)

    if (detErr) {
      console.error('Error cargando detalles', detErr)
      setDetalles({})
      setVentas(cabList)
      return
    }

    const grouped: Record<number, Detalle[]> = {}
    for (const row of (detAll ?? []) as any[]) {
      (grouped[row.venta_id] ||= []).push(row as Detalle)
    }
    setDetalles(grouped)

    const filtradas = cabList.filter(v =>
      mostrarIncompletas ? true : ((grouped[v.id] ?? []).length > 0)
    )
    setVentas(filtradas)
  }, [filtros, mostrarIncompletas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  /* edición cabecera */
  const handleInputChange = (id: number, field: string, val: any) => {
    setVentas(prev =>
      prev.map(v => (v.id === id ? { ...v, [field]: field === 'cantidad' ? parseFloat(val) : val } : v))
    )
  }

  const guardarCambios = async (venta: VentaCab) => {
    const { error } = await supabase
      .from('ventas')
      .update({
        fecha: venta.fecha,
        cantidad: venta.cantidad,
        observaciones: venta.observaciones,
        empresa_id: venta.empresa_id,
        division_id: venta.division_id,
        cliente_id: venta.cliente_id,
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

  /* edición detalle */
  const handleDetalleChange = (
    ventaId: number,
    index: number,
    field: keyof Detalle,
    value: any
  ) => {
    setDetalles(prev => {
      const list = [...(prev[ventaId] || [])]
      const row = { ...list[index] }
      let v: any = value
      if (field === 'cantidad' || field === 'precio_unitario' || field === 'forma_pago_id') {
        v = value === '' ? null : Number(value)
      }
      if (field === 'producto_id') {
        v = value === '' ? null : Number(value)
        // autocompletar concepto con el nombre del producto si está vacío
        if (!row.concepto || row.concepto.trim() === '') {
          const p = productos.find(pp => pp.id === v)
          if (p?.nombre) row.concepto = p.nombre
        }
      }
      ;(row as any)[field] = v
      // recalcular importe local
      const cant = Number(row.cantidad || 0)
      const pu = Number(row.precio_unitario || 0)
      row.importe = cant * pu
      list[index] = row
      return { ...prev, [ventaId]: list }
    })
  }

  const guardarDetalle = async (ventaId: number, index: number) => {
    const row = (detalles[ventaId] || [])[index]
    if (!row) return

    const payload = {
      venta_id: ventaId,
      producto_id: row.producto_id ?? null,
      concepto: row.concepto ?? null,
      cantidad: row.cantidad ?? 0,
      precio_unitario: row.precio_unitario ?? 0,
      forma_pago_id: row.forma_pago_id ?? null,
      documento: row.documento ?? null,
    }

    try {
      if (row.id) {
        const { error } = await supabase.from('detalle_venta').update(payload).eq('id', row.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('detalle_venta').insert(payload).select('*').single()
        if (error) throw error
        // asignar ID a la fila nueva
        setDetalles(prev => {
          const list = [...(prev[ventaId] || [])]
          list[index] = { ...(list[index] || row), id: (data as any).id }
          return { ...prev, [ventaId]: list }
        })
      }

      // Recalcular y actualizar TOTAL de la venta
      const total = (detalles[ventaId] || []).reduce((s, d, i) => {
        const r = i === index ? { ...d, ...payload } : d
        return s + Number(r.cantidad || 0) * Number(r.precio_unitario || 0)
      }, 0)

      await supabase
        .from('ventas')
        .update({
          cantidad: total,
          editado_por: userEmail,
          editado_en: new Date().toISOString(),
        })
        .eq('id', ventaId)

      // Refrescar cabecera en UI
      setVentas(prev => prev.map(v => (v.id === ventaId ? { ...v, cantidad: total } : v)))
      alert('Detalle guardado')
    } catch (e: any) {
      console.error(e)
      alert('No se pudo guardar el detalle')
    }
  }

  const eliminarDetalle = async (ventaId: number, detalleId: number, index: number) => {
    if (!confirm('¿Eliminar este detalle?')) return
    try {
      await supabase.from('inventario_movimientos').delete().eq('venta_detalle_id', detalleId)
      await supabase.from('detalle_venta').delete().eq('id', detalleId)

      setDetalles(prev => {
        const list = [...(prev[ventaId] || [])]
        list.splice(index, 1)
        return { ...prev, [ventaId]: list }
      })

      const total = (detalles[ventaId] || [])
        .filter((_, i) => i !== index)
        .reduce((s, d) => s + Number(d.cantidad || 0) * Number(d.precio_unitario || 0), 0)

      await supabase
        .from('ventas')
        .update({
          cantidad: total,
          editado_por: userEmail,
          editado_en: new Date().toISOString(),
        })
        .eq('id', ventaId)

      setVentas(prev => prev.map(v => (v.id === ventaId ? { ...v, cantidad: total } : v)))
      alert('Detalle eliminado')
    } catch (e: any) {
      console.error(e)
      alert('No se pudo eliminar el detalle')
    }
  }

  const agregarDetalle = (ventaId: number) => {
    setDetalles(prev => {
      const list = [...(prev[ventaId] || [])]
      list.push({
        id: 0,
        venta_id: ventaId,
        producto_id: null,
        concepto: '',
        cantidad: 0,
        precio_unitario: 0,
        importe: 0,
        forma_pago_id: null,
        documento: '',
        productos: null,
      })
      return { ...prev, [ventaId]: list }
    })
  }

  /* eliminación venta */
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar la venta y sus detalles?')) return

    const { data: det, error: detSelErr } = await supabase
      .from('detalle_venta')
      .select('id')
      .eq('venta_id', id)

    if (detSelErr) {
      alert('No se pudo preparar la eliminación (detalle)')
      console.error(detSelErr)
      return
    }

    const detalleIds = (det || []).map(d => d.id)

    if (detalleIds.length > 0) {
      const { error: invErr } = await supabase
        .from('inventario_movimientos')
        .delete()
        .in('venta_detalle_id', detalleIds)

      if (invErr) {
        alert('No se pudieron borrar movimientos de inventario')
        console.error(invErr)
        return
      }
    }

    const { error: delDetErr } = await supabase.from('detalle_venta').delete().eq('venta_id', id)
    if (delDetErr) {
      alert('No se pudieron borrar los detalles')
      console.error(delDetErr)
      return
    }

    const { error: delVenErr } = await supabase.from('ventas').delete().eq('id', id)
    if (delVenErr) {
      alert('No se pudo borrar la venta')
      console.error(delVenErr)
      return
    }

    alert('Venta eliminada')
    cargarDatos()
  }

  /* utils */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  /* UI */
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">🧾 Ventas Registradas</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-4">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input type="text" name="cliente_nombre" placeholder="Cliente" value={filtros.cliente_nombre} onChange={handleChange} className="border p-2" />
        <input type="text" name="cliente_nit" placeholder="NIT" value={filtros.cliente_nit} onChange={handleChange} className="border p-2" />

        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-6 flex items-center gap-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mostrarIncompletas} onChange={e => setMostrarIncompletas(e.target.checked)} />
          Mostrar ventas sin detalle
        </label>

        <a href="/menu" className="ml-auto inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </a>
      </div>

      {/* Tabla principal */}
      <table className="w-full border text-sm text-left mb-8">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2">ID</th>
            <th className="p-2">Fecha</th>
            <th className="p-2">Empresa</th>
            <th className="p-2">División</th>
            <th className="p-2">Cliente</th>
            <th className="p-2">NIT</th>
            <th className="p-2">Total</th>
            <th className="p-2">Observaciones</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map(v => (
            <tr key={v.id} className="border-t">
              <td className="p-2">{v.id}</td>

              <td className="p-2">
                <input type="date" className="border p-1" value={v.fecha} onChange={ev => handleInputChange(v.id, 'fecha', ev.target.value)} />
              </td>

              <td className="p-2">
                <select className="border p-1" value={v.empresa_id ?? ''} onChange={ev => handleInputChange(v.id, 'empresa_id', ev.target.value)}>
                  {empresas.map(opt => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                </select>
              </td>

              <td className="p-2">
                <select className="border p-1" value={v.division_id ?? ''} onChange={ev => handleInputChange(v.id, 'division_id', ev.target.value)}>
                  {divisiones.map(opt => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                </select>
              </td>

              <td className="p-2">{v.clientes?.nombre ?? '—'}</td>
              <td className="p-2">{v.clientes?.nit ?? '—'}</td>

              <td className="p-2">
                <input type="number" className="border p-1 w-24" value={v.cantidad ?? 0} onChange={ev => handleInputChange(v.id, 'cantidad', ev.target.value)} />
              </td>

              <td className="p-2">
                <input className="border p-1 w-56" value={v.observaciones ?? ''} onChange={ev => handleInputChange(v.id, 'observaciones', ev.target.value)} />
              </td>

              <td className="p-2 space-x-1">
                <button onClick={() => guardarCambios(v)} className="bg-green-600 text-white px-2 py-1 rounded text-xs">Guardar</button>
                <button onClick={() => handleDelete(v.id)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detalles */}
      {ventas.map(v => (
        <div key={`det-${v.id}`} className="mb-6 border p-3 rounded bg-gray-50">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">📦 Detalles de Venta #{v.id}</h3>
            <button
              className="rounded bg-emerald-600 px-3 py-1 text-white text-sm"
              onClick={() => agregarDetalle(v.id)}
            >
              + Agregar detalle
            </button>
          </div>

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
              {(detalles[v.id] || []).map((d, i) => {
                const prodSel = d.producto_id ? productos.find(p => p.id === d.producto_id) || d.productos : null
                const invBadge =
                  d.producto_id && (prodSel?.control_inventario ?? false)
                    ? <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">inv</span>
                    : null

                const importe = Number(d.cantidad || 0) * Number(d.precio_unitario || 0)

                return (
                  <tr key={`${d.id || 'new'}-${i}`} className="border-t align-top">
                    <td className="p-2">
                      <select
                        className="border p-1 w-full"
                        value={d.producto_id ?? ''}
                        onChange={e => handleDetalleChange(v.id, i, 'producto_id', e.target.value)}
                      >
                        <option value="">— Sin producto (no inventario) —</option>
                        {productos.map(p => (
                          <option key={p.id} value={p.id}>
                            {(p.sku ? `${p.sku} — ` : '') + (p.nombre || 'Producto')}
                          </option>
                        ))}
                      </select>
                      {d.producto_id ? (
                        <div className="mt-1 text-xs text-gray-600">
                          {(prodSel?.sku ? `SKU: ${prodSel.sku}` : '') +
                            (prodSel?.sku && prodSel?.unidad ? ' · ' : '') +
                            (prodSel?.unidad ? `Unidad: ${prodSel.unidad}` : '')}
                          {invBadge}
                        </div>
                      ) : null}
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-full"
                        value={d.concepto ?? ''}
                        onChange={e => handleDetalleChange(v.id, i, 'concepto', e.target.value)}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-24 text-right"
                        value={d.cantidad ?? 0}
                        onChange={e => handleDetalleChange(v.id, i, 'cantidad', e.target.value)}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        className="border p-1 w-28 text-right"
                        value={d.precio_unitario ?? 0}
                        onChange={e => handleDetalleChange(v.id, i, 'precio_unitario', e.target.value)}
                      />
                    </td>

                    <td className="p-2">Q{importe.toFixed(2)}</td>

                    <td className="p-2">
                      <select
                        className="border p-1 w-full"
                        value={d.forma_pago_id ?? ''}
                        onChange={e => handleDetalleChange(v.id, i, 'forma_pago_id', e.target.value)}
                      >
                        <option value="">Método de Pago</option>
                        {formasPago.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.metodo}</option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-full"
                        value={d.documento ?? ''}
                        onChange={e => handleDetalleChange(v.id, i, 'documento', e.target.value)}
                      />
                    </td>

                    <td className="p-2 space-x-1">
                      <button
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                        onClick={() => guardarDetalle(v.id, i)}
                      >
                        Guardar
                      </button>
                      {d.id ? (
                        <button
                          className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                          onClick={() => eliminarDetalle(v.id, d.id, i)}
                        >
                          Eliminar
                        </button>
                      ) : null}
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
